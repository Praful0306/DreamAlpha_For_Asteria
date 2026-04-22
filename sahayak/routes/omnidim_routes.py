"""
Sahayak AI — Omnidim Voice Agent Webhook
=========================================
Handles tool calls from the Omnidim appointment booking agent.

Configure in Omnidim Dashboard:
  Webhook URL: https://dreamalpha-for-amd.onrender.com/omnidim/tool-call
  Phone number: +912271263971 (Vobiz SIP trunk)

Agent conversation flow:
  1. Agent welcomes patient
  2. Asks for full name
  3. Asks for phone number
  4. Asks for age
  5. Calls register_patient tool → backend creates patient → returns patient_id
  6. Agent tells patient: "Your Sahayak Patient ID is <id>. Write it down."
  7. Optionally asks preferred date/time
  8. Calls get_available_slots → shows free times
  9. Calls book_appointment → confirms booking

Tools registered in Omnidim:
  • register_patient   — collect name/phone/age → create/find patient → return ID
  • get_available_slots — return free time slots for a doctor on a date
  • book_appointment   — create confirmed appointment in DB
  • lookup_patient_id  — find an existing patient by phone number

Response format: { "result": "string read aloud by agent" }
"""
import logging
from datetime import datetime as dt, timedelta
from typing import List
from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse
from sqlalchemy import text

from db.database import engine
from services.auth_service import generate_share_code

logger = logging.getLogger("sahayak.omnidim")
router = APIRouter(prefix="/omnidim", tags=["Omnidim Voice Agent"])

DOCTOR_ID_DEFAULT = 1   # fallback when doctor_id not specified


# ── CORS helper (same pattern as asha_call_routes) ────────────────────────────

def _cors_response(data: dict) -> JSONResponse:
    resp = JSONResponse(data)
    resp.headers["Access-Control-Allow-Origin"]  = "*"
    resp.headers["Access-Control-Allow-Methods"] = "GET, POST, OPTIONS"
    resp.headers["Access-Control-Allow-Headers"] = "*"
    return resp


@router.options("/tool-call")
async def tool_call_preflight():
    return _cors_response({})


# ── helpers ───────────────────────────────────────────────────────────────────

def _slot_str(minutes: int) -> str:
    return f"{minutes // 60:02d}:{minutes % 60:02d}"


# Morning 8:30–12:30, Lunch break, Afternoon 1:30–6:00, 15-min slots
_MORNING_START   = 8 * 60 + 30   # 510 = 8:30 AM
_MORNING_END     = 12 * 60 + 30  # 750 = 12:30 PM
_AFTERNOON_START = 13 * 60 + 30  # 810 = 1:30 PM
_AFTERNOON_END   = 18 * 60       # 1080 = 6:00 PM
_SLOT_MINS       = 15

WORKING_HOURS = (
    list(range(_MORNING_START,   _MORNING_END,   _SLOT_MINS)) +
    list(range(_AFTERNOON_START, _AFTERNOON_END, _SLOT_MINS))
)


def _get_free_slots(doctor_id: int, date: str) -> List[str]:
    try:
        with engine.connect() as conn:
            booked = {r[0] for r in conn.execute(
                text("SELECT time_slot FROM appointments "
                     "WHERE doctor_id=:did AND appt_date=:d AND status!='cancelled'"),
                {"did": doctor_id, "d": date},
            ).fetchall()}
        return [_slot_str(m) for m in WORKING_HOURS if _slot_str(m) not in booked]
    except Exception as exc:
        logger.error("_get_free_slots: %s", exc)
        return []


def _fmt_time(slot: str) -> str:
    """'13:20' → '1:20 PM'"""
    try:
        h, m = map(int, slot.split(":"))
        ap   = "AM" if h < 12 else "PM"
        h12  = h if 1 <= h <= 12 else (h - 12 if h > 12 else 12)
        return f"{h12}:{m:02d} {ap}"
    except Exception:
        return slot


# ── normalise different Omnidim payload shapes ────────────────────────────────

_APPT_META_KEYS = frozenset({"toolName", "tool_name", "name", "call", "callInfo"})

def _parse_body(body: dict, tool_override: str = "") -> tuple[str, dict, dict]:
    """
    Supports two Omnidim call modes:
      1. Webhook mode  — body has toolName + toolInputs
      2. Direct mode   — body is flat {param: value}, tool name from ?tool= query param
    """
    name = (
        tool_override
        or body.get("toolName")
        or body.get("tool_name")
        or body.get("name")
        or ""
    )
    args_wrapped = (
        body.get("toolInputs")
        or body.get("arguments")
        or body.get("parameters")
        or body.get("inputs")
    )
    if args_wrapped is not None:
        args = args_wrapped if isinstance(args_wrapped, dict) else {}
    else:
        args = {k: v for k, v in body.items() if k not in _APPT_META_KEYS}
    call = body.get("call") or body.get("callInfo") or {}
    return name.strip(), args, call


# ── main webhook ──────────────────────────────────────────────────────────────

@router.post("/tool-call")
async def omnidim_tool_call(request: Request, tool: str = ""):
    """
    Omnidim calls this endpoint when the voice agent needs live data.
    Returns { "result": "string" } — the string is read aloud by the agent.
    Supports ?tool= query param for flat-body (Custom API Integration) mode.
    """
    try:
        body = await request.json()
    except Exception:
        body = {}

    name, args, call = _parse_body(body, tool_override=tool)
    logger.info("Omnidim appt tool=%r args_keys=%s", name, list(args.keys()))

    handlers = {
        "register_patient":    _register_patient,
        "lookup_patient_id":   _lookup_patient_id,
        "get_available_slots": _get_available_slots,
        "book_appointment":    _book_appointment,
        "get_live_slots":      _get_available_slots,   # alias
        "create_booking":      _book_appointment,      # alias
    }

    handler = handlers.get(name)
    if not handler:
        return _cors_response({"result": "I'm sorry, I couldn't process that request. Please say 'start over'."})

    try:
        result = await handler(args, call)
        return _cors_response({"result": result})
    except Exception as exc:
        logger.error("Omnidim tool %s failed: %s", name, exc, exc_info=True)
        return _cors_response({"result": "The system is temporarily unavailable. Please call back in a moment."})


# ── Tool: register_patient ────────────────────────────────────────────────────

async def _register_patient(args: dict, call: dict) -> str:
    """
    Create (or find) a patient record and return their Sahayak Patient ID.
    Called after the agent has collected: full_name, phone, age.
    """
    name  = (args.get("full_name") or args.get("name") or args.get("patient_name") or "").strip()
    phone = (args.get("phone") or args.get("patient_phone") or args.get("phone_number") or "").strip()
    age   = args.get("age") or args.get("patient_age") or 0

    try:
        age = int(str(age).strip())
    except (ValueError, TypeError):
        age = 0

    # Validate
    if not name:
        return "I couldn't catch your name. Could you please repeat your full name?"
    if not phone:
        return "I need your phone number to register you. Could you please say it again?"

    # Normalise phone — remove spaces, dashes
    phone = "".join(c for c in phone if c.isdigit() or c == "+")
    if len(phone) < 7:
        return "That doesn't sound like a valid phone number. Please say your 10-digit mobile number."

    try:
        # 1) Check if patient already exists by phone
        with engine.connect() as conn:
            row = conn.execute(
                text("SELECT id, name FROM patients WHERE phone=:p LIMIT 1"),
                {"p": phone},
            ).fetchone()

        if row:
            pid, existing_name = row[0], row[1]
            logger.info("Omnidim: existing patient id=%d phone=%s", pid, phone)
            return (
                f"Welcome back, {existing_name}! Your Sahayak Patient ID is {pid}. "
                f"I repeat: your Patient ID is {pid}. Please note it down. "
                f"When you visit the clinic, tell the reception your Patient ID is {pid}. "
                f"Would you also like to book an appointment today?"
            )

        # 2) Create new patient
        call_sid = call.get("call_id") or call.get("callId") or ""
        share    = generate_share_code()

        with engine.begin() as conn:
            # Ensure patients table has the columns we need
            result = conn.execute(
                text(
                    "INSERT INTO patients "
                    "(name, phone, age, gender, share_code, share_code_active, created_at) "
                    "VALUES (:n, :p, :a, 'Not specified', :sc, 1, :now)"
                ),
                {
                    "n":   name,
                    "p":   phone,
                    "a":   age,
                    "sc":  share,
                    "now": dt.utcnow().isoformat(),
                },
            )
            pid = result.lastrowid

        logger.info("Omnidim: new patient id=%d name=%s phone=%s", pid, name, phone)
        return (
            f"Registration successful! {name}, your Sahayak Patient ID is {pid}. "
            f"I repeat: Patient ID {pid}. "
            f"Please save this number. When you arrive at the clinic, "
            f"tell the reception: My Patient ID is {pid}. "
            f"Would you like to book an appointment now?"
        )

    except Exception as exc:
        logger.error("register_patient DB error: %s", exc)
        return (
            "I was unable to register you right now due to a system issue. "
            "Please visit the clinic directly and staff will register you there."
        )


# ── Tool: lookup_patient_id ──────────────────────────────────────────────────

async def _lookup_patient_id(args: dict, call: dict) -> str:
    """Return existing patient ID by phone number — for returning patients."""
    phone = (args.get("phone") or args.get("patient_phone") or "").strip()
    phone = "".join(c for c in phone if c.isdigit() or c == "+")

    if not phone:
        return "Please provide your phone number so I can find your record."

    try:
        with engine.connect() as conn:
            row = conn.execute(
                text("SELECT id, name, age FROM patients WHERE phone=:p LIMIT 1"),
                {"p": phone},
            ).fetchone()

        if not row:
            return (
                "I couldn't find a record for that phone number. "
                "You may be a new patient. I can register you now — "
                "please tell me your full name."
            )
        pid, pname, page = row
        return (
            f"I found your record. {pname}, your Sahayak Patient ID is {pid}. "
            f"Would you like to book an appointment?"
        )
    except Exception as exc:
        logger.error("lookup_patient_id: %s", exc)
        return "Could not look up your record right now. Please try again."


# ── Tool: get_available_slots ─────────────────────────────────────────────────

async def _get_available_slots(args: dict, call: dict) -> str:
    """Return available appointment slots — called after patient asks for a time."""
    doctor_id = int(args.get("doctor_id") or DOCTOR_ID_DEFAULT)
    date      = (args.get("date") or args.get("appointment_date") or "").strip()

    if not date:
        # Default: today, or tomorrow if after 4 PM
        now  = dt.utcnow()
        date = str(now.date())
        # If it's after 4 PM IST (10:30 UTC), suggest tomorrow
        if now.hour >= 10 and now.minute >= 30:
            date = str((now + timedelta(days=1)).date())

    free = _get_free_slots(doctor_id, date)
    if not free:
        tomorrow = str(dt.strptime(date, "%Y-%m-%d").date() + timedelta(days=1))
        free_tmrw = _get_free_slots(doctor_id, tomorrow)
        if free_tmrw:
            sample = ", ".join(_fmt_time(s) for s in free_tmrw[:4])
            return (
                f"There are no slots left on {date}. "
                f"Tomorrow, {tomorrow}, has slots available: {sample}, and more. "
                f"Which time works for you tomorrow?"
            )
        return (
            f"Unfortunately there are no available slots on {date} or tomorrow. "
            f"Please call back in a day or two to check availability."
        )

    sample = ", ".join(_fmt_time(s) for s in free[:5])
    return (
        f"Available times on {date}: {sample}. "
        f"There are {len(free)} slots total. "
        f"Which time would you prefer?"
    )


# ── Tool: book_appointment ────────────────────────────────────────────────────

async def _book_appointment(args: dict, call: dict) -> str:
    """
    Create a confirmed appointment. The agent calls this after confirming
    name, phone, preferred date and time with the patient.
    """
    doctor_id    = int(args.get("doctor_id") or DOCTOR_ID_DEFAULT)
    date         = (args.get("date") or args.get("appointment_date") or "").strip()
    time_slot    = (args.get("time") or args.get("time_slot") or args.get("appointment_time") or "").strip()
    patient_name = (args.get("patient_name") or args.get("full_name") or args.get("name") or "").strip()
    patient_phone= (args.get("phone") or args.get("patient_phone") or "").strip()
    patient_id   = args.get("patient_id") or args.get("id")
    reason       = (args.get("reason") or "Doctor consultation via Sahayak AI").strip()

    if not date or not time_slot:
        return "I need the date and time to book your appointment. Could you please confirm those?"
    if not patient_name:
        return "I need your name to confirm the booking. Could you please repeat it?"

    # Normalise phone
    patient_phone = "".join(c for c in patient_phone if c.isdigit() or c == "+")

    # Resolve patient_id if not provided
    if not patient_id and patient_phone:
        try:
            with engine.connect() as conn:
                row = conn.execute(
                    text("SELECT id FROM patients WHERE phone=:p LIMIT 1"),
                    {"p": patient_phone},
                ).fetchone()
            if row:
                patient_id = row[0]
        except Exception:
            pass

    try:
        # Check if slot already taken
        with engine.begin() as conn:
            existing = conn.execute(
                text("SELECT id FROM appointments "
                     "WHERE doctor_id=:did AND appt_date=:d AND time_slot=:t "
                     "AND status!='cancelled'"),
                {"did": doctor_id, "d": date, "t": time_slot},
            ).fetchone()

            if existing:
                free = _get_free_slots(doctor_id, date)
                if free:
                    sample = ", ".join(_fmt_time(s) for s in free[:3])
                    return (
                        f"I'm sorry, {_fmt_time(time_slot)} on {date} is already booked. "
                        f"Other available times are: {sample}. Which one would you prefer?"
                    )
                return (
                    f"{_fmt_time(time_slot)} on {date} is fully booked. "
                    f"Shall I check tomorrow's slots instead?"
                )

            result = conn.execute(
                text(
                    "INSERT INTO appointments "
                    "(doctor_id, patient_id, patient_name, patient_phone, "
                    " appt_date, time_slot, reason, status, created_at) "
                    "VALUES (:did, :pid, :pn, :pp, :d, :t, :r, 'confirmed', :now)"
                ),
                {
                    "did": doctor_id,
                    "pid": patient_id,
                    "pn":  patient_name,
                    "pp":  patient_phone,
                    "d":   date,
                    "t":   time_slot,
                    "r":   reason,
                    "now": dt.utcnow().isoformat(),
                },
            )
            appt_id = result.lastrowid

        logger.info(
            "Omnidim booked: appt_id=%d doctor=%d date=%s time=%s patient=%s",
            appt_id, doctor_id, date, time_slot, patient_name,
        )
        return (
            f"Your appointment is confirmed! {patient_name}, you are booked "
            f"on {date} at {_fmt_time(time_slot)}. "
            f"Appointment reference number: {appt_id}. "
            f"Please arrive 10 minutes early and tell the reception your Patient ID. "
            f"Is there anything else I can help you with?"
        )

    except Exception as exc:
        logger.error("book_appointment DB error: %s", exc)
        return (
            "I was unable to complete the booking due to a system error. "
            "Please visit the clinic directly or call back shortly."
        )


# ── Omnidim call lifecycle webhooks (optional) ────────────────────────────────

@router.post("/call-started")
async def call_started(request: Request):
    """Omnidim calls this when a call begins."""
    try:
        body = await request.json()
        call_id = (body.get("call") or {}).get("call_id") or body.get("callId", "")
        logger.info("Omnidim call started: %s", call_id)
    except Exception:
        pass
    return {"status": "ok"}


@router.post("/call-ended")
async def call_ended(request: Request):
    """Omnidim calls this when a call ends."""
    try:
        body    = await request.json()
        call    = body.get("call") or {}
        call_id = call.get("call_id") or body.get("callId", "")
        dur     = call.get("duration_ms") or call.get("duration", "")
        logger.info("Omnidim call ended: %s | duration: %s", call_id, dur)
    except Exception:
        pass
    return {"status": "ok"}
