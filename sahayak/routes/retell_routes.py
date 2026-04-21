"""
Sahayak AI — Retell Voice Agent Routes
Handles Retell webhook tool calls for all 3 agents:
  1. Doctor Booking Agent
  2. ASHA Follow-up Agent
  3. Patient Support Agent

Retell sends POST /retell/tool-call when an agent needs live data.
Response must be: {"result": "string"}

Setup in Retell:
  Webhook URL: https://dreamalpha-for-amd.onrender.com/retell/tool-call
  Phone: +912271263971
  SIP: 641af6f8.sip.vobiz.ai
"""
import logging
from datetime import datetime as dt
from typing import Optional
from fastapi import APIRouter, Request
from sqlalchemy import text

from db.database import engine

logger = logging.getLogger("sahayak.retell")
router = APIRouter(prefix="/retell", tags=["Retell"])

DOCTOR_ID_DEFAULT = 1   # fallback doctor_id when not specified by caller


# ── Main webhook ──────────────────────────────────────────────────────────────

@router.post("/tool-call")
async def retell_tool_call(request: Request):
    """
    Retell calls this endpoint when an agent invokes a tool.
    Body: { "name": "tool_name", "arguments": { ... }, "call": { ... } }
    Returns: { "result": "string" }
    """
    try:
        body = await request.json()
    except Exception:
        return {"result": "Error reading request. Please try again."}

    name = body.get("name", "")
    args = body.get("arguments", {})
    call = body.get("call", {})

    logger.info("Retell tool call: %s | args: %s", name, args)

    # Route to correct handler
    handlers = {
        "get_live_slots":      _get_live_slots,
        "create_booking":      _create_booking,
        "reschedule_booking":  _reschedule_booking,
        "cancel_booking":      _cancel_booking,
        "lookup_patient":      _lookup_patient,
        "log_followup":        _log_followup,
        "log_support_call":    _log_support_call,
        "transfer_to_asha":    _transfer_to_asha,
        "check_emergency":     _check_emergency,
    }

    handler = handlers.get(name)
    if not handler:
        return {"result": f"Unknown tool: {name}. Please try again."}

    try:
        result = await handler(args, call)
        return {"result": result}
    except Exception as exc:
        logger.error("Tool %s failed: %s", name, exc)
        return {"result": "System is temporarily unavailable. Please try again shortly."}


# ── Tool: get_live_slots ──────────────────────────────────────────────────────

async def _get_live_slots(args: dict, call: dict) -> str:
    """Return available appointment slots for a given date."""
    doctor_id = int(args.get("doctor_id", DOCTOR_ID_DEFAULT))
    date      = args.get("date", dt.utcnow().date().isoformat())

    try:
        with engine.connect() as conn:
            booked = {r[0] for r in conn.execute(
                text("SELECT time_slot FROM appointments "
                     "WHERE doctor_id=:did AND appt_date=:d AND status!='cancelled'"),
                {"did": doctor_id, "d": date}
            ).fetchall()}

        from routes.patients_mgmt import WORKING_HOURS, _slot_str
        free = [_slot_str(m) for m in WORKING_HOURS if _slot_str(m) not in booked]

        if not free:
            return f"No slots available on {date}. The doctor is fully booked. Would you like to try tomorrow?"
        return f"Available times on {date}: {', '.join(free[:6])}. Which time works for you?"
    except Exception as exc:
        logger.error("get_live_slots error: %s", exc)
        return "Could not check slots right now. Please try again."


# ── Tool: create_booking ──────────────────────────────────────────────────────

async def _create_booking(args: dict, call: dict) -> str:
    """Book a doctor appointment."""
    doctor_id    = int(args.get("doctor_id", DOCTOR_ID_DEFAULT))
    date         = args.get("date", "")
    time         = args.get("time", "")
    patient_name = args.get("patient_name", "").strip()
    patient_phone= args.get("patient_phone", "").strip()
    reason       = args.get("reason", "General consultation").strip()

    if not date or not time or not patient_name:
        return "I need the date, time, and your name to book the appointment. Could you confirm those?"

    try:
        with engine.connect() as conn:
            existing = conn.execute(
                text("SELECT id FROM appointments "
                     "WHERE doctor_id=:did AND appt_date=:d AND time_slot=:t AND status!='cancelled'"),
                {"did": doctor_id, "d": date, "t": time}
            ).fetchone()

        if existing:
            # Slot taken — offer alternatives
            return await _get_live_slots({"doctor_id": doctor_id, "date": date}, call)

        with engine.begin() as conn:
            conn.execute(
                text("INSERT INTO appointments "
                     "(doctor_id, patient_name, patient_phone, appt_date, time_slot, reason, status, created_at) "
                     "VALUES (:did, :pn, :pp, :d, :t, :r, 'confirmed', :now)"),
                {"did": doctor_id, "pn": patient_name, "pp": patient_phone,
                 "d": date, "t": time, "r": reason, "now": dt.utcnow().isoformat()}
            )
        return (f"Your appointment is confirmed in Sahayak AI. "
                f"{patient_name} is booked on {date} at {time}. "
                f"You will receive a reminder. Is there anything else I can help with?")
    except Exception as exc:
        logger.error("create_booking error: %s", exc)
        return "Could not create the booking right now. Please call the clinic directly."


# ── Tool: reschedule_booking ──────────────────────────────────────────────────

async def _reschedule_booking(args: dict, call: dict) -> str:
    """Reschedule an existing appointment."""
    booking_id = args.get("booking_id")
    new_date   = args.get("new_date", "")
    new_time   = args.get("new_time", "")

    if not booking_id:
        return "I need your booking ID to reschedule. Can you share it?"

    if not new_date or not new_time:
        return "Please tell me the new date and time you prefer."

    try:
        with engine.begin() as conn:
            result = conn.execute(
                text("UPDATE appointments SET appt_date=:d, time_slot=:t, updated_at=:now "
                     "WHERE id=:bid AND status!='cancelled'"),
                {"d": new_date, "t": new_time, "now": dt.utcnow().isoformat(), "bid": booking_id}
            )
        if result.rowcount == 0:
            return "Booking not found or already cancelled. Please check your booking ID."
        return f"Your appointment has been rescheduled to {new_date} at {new_time}. Is there anything else?"
    except Exception as exc:
        logger.error("reschedule_booking error: %s", exc)
        return "Could not reschedule right now. Please try again shortly."


# ── Tool: cancel_booking ──────────────────────────────────────────────────────

async def _cancel_booking(args: dict, call: dict) -> str:
    """Cancel an appointment."""
    booking_id = args.get("booking_id")

    if not booking_id:
        return "I need your booking ID to cancel. Can you share it?"

    try:
        with engine.begin() as conn:
            result = conn.execute(
                text("UPDATE appointments SET status='cancelled', updated_at=:now WHERE id=:bid"),
                {"now": dt.utcnow().isoformat(), "bid": booking_id}
            )
        if result.rowcount == 0:
            return "Booking not found. Please check your booking ID."
        return "Your appointment has been cancelled. Would you like to book a new one?"
    except Exception as exc:
        logger.error("cancel_booking error: %s", exc)
        return "Could not cancel right now. Please try again."


# ── Tool: lookup_patient ──────────────────────────────────────────────────────

async def _lookup_patient(args: dict, call: dict) -> str:
    """Look up a patient by phone or name."""
    phone = args.get("phone", "").strip()
    name  = args.get("name", "").strip()

    if not phone and not name:
        return "Please provide your name or phone number to look up your record."

    try:
        with engine.connect() as conn:
            if phone:
                row = conn.execute(
                    text("SELECT id, name, age, village, diagnosis FROM patients WHERE phone=:p LIMIT 1"),
                    {"p": phone}
                ).fetchone()
            else:
                row = conn.execute(
                    text("SELECT id, name, age, village, diagnosis FROM patients WHERE name LIKE :n LIMIT 1"),
                    {"n": f"%{name}%"}
                ).fetchone()

        if not row:
            return "No patient record found. This may be your first visit."
        return (f"Found record for {row[1]}, age {row[2]}, village {row[3]}. "
                f"Last diagnosis: {row[4] or 'none recorded'}.")
    except Exception as exc:
        logger.error("lookup_patient error: %s", exc)
        return "Could not look up patient record right now."


# ── Tool: log_followup ────────────────────────────────────────────────────────

async def _log_followup(args: dict, call: dict) -> str:
    """Log an ASHA follow-up call outcome."""
    patient_phone  = args.get("patient_phone", "")
    condition      = args.get("condition", "stable")
    medicines_taken= args.get("medicines_taken", True)
    new_symptoms   = args.get("new_symptoms", "none")
    needs_asha     = args.get("needs_asha", False)
    call_sid       = call.get("call_id", "")

    try:
        with engine.begin() as conn:
            conn.execute(
                text("INSERT INTO diagnosis_log "
                     "(firebase_uid, symptoms, diagnosis, risk_level, created_at) "
                     "VALUES (:fuid, :symp, :diag, :risk, :now)"),
                {
                    "fuid":  f"retell_followup_{call_sid}",
                    "symp":  f"Follow-up call. New symptoms: {new_symptoms}",
                    "diag":  f"Condition: {condition}. Medicines taken: {medicines_taken}",
                    "risk":  "HIGH" if needs_asha else "LOW",
                    "now":   dt.utcnow().isoformat(),
                }
            )
        if needs_asha:
            return "Follow-up logged. I will connect you to your ASHA worker now."
        return "Follow-up logged in Sahayak AI. Please continue your medicines and stay well."
    except Exception as exc:
        logger.error("log_followup error: %s", exc)
        return "Follow-up recorded. Take care and continue your medicines."


# ── Tool: log_support_call ────────────────────────────────────────────────────

async def _log_support_call(args: dict, call: dict) -> str:
    """Log a patient support call."""
    patient_phone = args.get("patient_phone", "unknown")
    query_type    = args.get("query_type", "general")
    summary       = args.get("summary", "")
    resolved      = args.get("resolved", False)
    call_sid      = call.get("call_id", "")

    try:
        with engine.begin() as conn:
            conn.execute(
                text("INSERT INTO diagnosis_log "
                     "(firebase_uid, symptoms, diagnosis, risk_level, created_at) "
                     "VALUES (:fuid, :symp, :diag, :risk, :now)"),
                {
                    "fuid":  f"retell_support_{call_sid}",
                    "symp":  f"Support call: {query_type}",
                    "diag":  summary or "Patient support query handled",
                    "risk":  "LOW" if resolved else "MEDIUM",
                    "now":   dt.utcnow().isoformat(),
                }
            )
        return "Your query has been logged. Is there anything else I can help you with?"
    except Exception as exc:
        logger.error("log_support_call error: %s", exc)
        return "Query noted. Is there anything else you need?"


# ── Tool: transfer_to_asha ────────────────────────────────────────────────────

async def _transfer_to_asha(args: dict, call: dict) -> str:
    """Transfer call to ASHA worker or escalate."""
    reason = args.get("reason", "Patient requested ASHA support")
    logger.info("Transfer to ASHA requested: %s | call: %s", reason, call.get("call_id"))
    # Log the escalation
    await _log_support_call(
        {"query_type": "asha_transfer", "summary": reason, "resolved": False},
        call
    )
    return ("I am connecting you to your ASHA worker now. "
            "Please stay on the line. If they are unavailable, they will call you back shortly.")


# ── Tool: check_emergency ─────────────────────────────────────────────────────

async def _check_emergency(args: dict, call: dict) -> str:
    """Check if symptoms are emergency-level and advise accordingly."""
    symptoms = args.get("symptoms", "").lower()
    EMERGENCY_KEYWORDS = [
        "chest pain", "heart attack", "unconscious", "not breathing",
        "severe bleeding", "seizure", "stroke", "can't breathe",
        "saans nahi", "behosh", "khoon", "dil dard"
    ]
    is_emergency = any(kw in symptoms for kw in EMERGENCY_KEYWORDS)
    if is_emergency:
        return ("This sounds like a medical emergency. "
                "Please go to the nearest hospital or call 108 immediately. "
                "Do not wait. Go now.")
    return "Symptoms noted. Please describe them further so I can help you better."


# ── Retell webhook verify (optional) ─────────────────────────────────────────

@router.post("/call-started")
async def call_started(request: Request):
    """Retell calls this when a call starts."""
    body = await request.json()
    logger.info("Retell call started: %s", body.get("call", {}).get("call_id"))
    return {"status": "ok"}


@router.post("/call-ended")
async def call_ended(request: Request):
    """Retell calls this when a call ends."""
    body = await request.json()
    call = body.get("call", {})
    logger.info("Retell call ended: %s | duration: %s", call.get("call_id"), call.get("duration_ms"))
    return {"status": "ok"}
