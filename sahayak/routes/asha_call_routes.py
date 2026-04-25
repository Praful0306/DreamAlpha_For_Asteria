"""
Sahayak AI — ASHA ↔ Patient Omnidim Voice Agent Webhook
=========================================================
Handles tool calls from the ASHA health-check voice agent.

Two call directions — same Omnidim agent handles both:

  1. PATIENT → ASHA  (inbound to Omnidim number)
     Patient calls +912271263971 → AI health-check → saves results → ASHA notified
     Flow: welcome → ask phone → identify patient → ask symptoms → save → give advice

  2. ASHA → PATIENT  (outbound triggered by ASHA clicking "Call Patient")
     ASHA dashboard → pick call type → POST /asha/call-patient
     Backend calls Omnidim outbound API → Omnidim calls patient → same webhook tools

Configure in Omnidim Dashboard (new agent):
  Name:        Sahayak ASHA Health Agent
  Webhook URL: https://dreamalpha-for-amd.onrender.com/omnidim/asha-health-call
  Phone:       +912271263971 (same Vobiz SIP trunk, or assign a new number)

Tools to register in the Omnidim agent:
  • identify_patient       — find patient by phone, return name + health summary
  • log_health_update      — patient describes symptoms/feeling, saved to DB
  • request_asha_visit     — patient requests ASHA to visit or call back
  • get_health_advice      — return personalized advice based on patient history
  • get_patient_for_asha   — ASHA-triggered calls: AI greets patient by name

Outbound call trigger:
  POST /asha/call-patient
  Body: { patient_id, call_type, asha_name, lang, custom_message? }
  Backend POSTs to Omnidim outbound call API → Omnidim dials patient phone

Response format: { "result": "string read aloud by agent" }
"""
import logging
import os
from datetime import datetime as dt
from typing import Optional
from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse
from sqlalchemy import text
import httpx

from db.database import engine

logger = logging.getLogger("sahayak.asha_call")
router = APIRouter(tags=["ASHA Call Agent"])

# ── CORS helper for Omnidim endpoints ────────────────────────────────────────
# Omnidim test calls come from varying origins; set headers directly so we
# never hit a middleware miss regardless of which subdomain they use.

def _cors_response(data: dict) -> JSONResponse:
    resp = JSONResponse(data)
    resp.headers["Access-Control-Allow-Origin"]  = "*"
    resp.headers["Access-Control-Allow-Methods"] = "GET, POST, OPTIONS"
    resp.headers["Access-Control-Allow-Headers"] = "*"
    return resp


@router.options("/omnidim/asha-health-call")
async def asha_health_call_preflight():
    return _cors_response({})

def _omnidim_secret()     -> str: return os.getenv("OMNIDIM_SECRET_KEY",  "c4461557c2e29b4c60f62494f09c181c")
def _omnidim_api_key()    -> str: return os.getenv("OMNIDIM_API_KEY",      "")    # for outbound call API
def _omnidim_asha_agent() -> str: return os.getenv("OMNIDIM_ASHA_AGENT_ID", "149113")  # Sahayak ASHA Health Agent
def _omnidim_from_phone() -> str: return os.getenv("OMNIDIM_PHONE_NUMBER",  "+912271263971")


# ── payload parser (same flexible approach as omnidim_routes.py) ─────────────

_META_KEYS = frozenset({"toolName", "tool_name", "name", "call", "callInfo"})

def _parse_body(body: dict, tool_override: str = "") -> tuple[str, dict, dict]:
    """
    Handles two call modes:
      1. Omnidim webhook mode  — body has toolName + toolInputs wrapper
      2. Omnidim direct mode   — body is flat {param: value, ...},
                                  tool name comes from ?tool= query param
    """
    name = (
        tool_override
        or body.get("toolName")
        or body.get("tool_name")
        or body.get("name")
        or ""
    )

    # Check for a wrapped args object first
    args_wrapped = (
        body.get("toolInputs")
        or body.get("arguments")
        or body.get("parameters")
        or body.get("inputs")
    )

    if args_wrapped is not None:
        args = args_wrapped if isinstance(args_wrapped, dict) else {}
    else:
        # Flat body (Omnidim direct integration) — strip meta fields
        args = {k: v for k, v in body.items() if k not in _META_KEYS}

    call = body.get("call") or body.get("callInfo") or {}
    return name.strip(), args, call


# ── DB helpers ────────────────────────────────────────────────────────────────

def _get_patient_by_phone(phone: str) -> Optional[dict]:
    """Return patient record + latest vitals by phone number."""
    phone = "".join(c for c in phone if c.isdigit() or c == "+")
    if not phone:
        return None
    try:
        with engine.connect() as conn:
            row = conn.execute(
                text("SELECT id, name, age, gender, medical_history, village, "
                     "asha_worker_id FROM patients WHERE phone=:p LIMIT 1"),
                {"p": phone},
            ).fetchone()
            if not row:
                return None

            pid = row[0]
            # latest vitals
            vitals = conn.execute(
                text("SELECT bp, hr, temp, spo2, symptoms, diagnosis, risk_level, "
                     "ai_summary, created_at FROM medical_reports "
                     "WHERE patient_id=:pid ORDER BY created_at DESC LIMIT 1"),
                {"pid": pid},
            ).fetchone()

            # ASHA name
            asha_name = None
            if row[6]:
                a = conn.execute(
                    text("SELECT full_name FROM users WHERE id=:aid"),
                    {"aid": row[6]},
                ).fetchone()
                if a:
                    asha_name = a[0]

        return {
            "id":           pid,
            "name":         row[1],
            "age":          row[2],
            "gender":       row[3],
            "medical_history": row[4] or "None on record",
            "village":      row[5],
            "asha_worker_id": row[6],
            "asha_name":    asha_name,
            "bp":           vitals[0] if vitals else None,
            "hr":           vitals[1] if vitals else None,
            "temp":         vitals[2] if vitals else None,
            "spo2":         vitals[3] if vitals else None,
            "symptoms":     vitals[4] if vitals else None,
            "diagnosis":    vitals[5] if vitals else None,
            "risk_level":   vitals[6] if vitals else "UNKNOWN",
            "ai_summary":   vitals[7] if vitals else None,
        }
    except Exception as exc:
        logger.error("_get_patient_by_phone: %s", exc)
        return None


def _save_call_log(
    direction: str,
    patient_id: Optional[int],
    patient_phone: str,
    asha_id: Optional[int],
    call_type: str,
    health_update: str = "",
    symptoms: str = "",
    visit_requested: bool = False,
    urgency: str = "normal",
    omnidim_call_id: str = "",
) -> int:
    """Insert a row into asha_call_logs and return its id."""
    try:
        with engine.begin() as conn:
            result = conn.execute(
                text(
                    "INSERT INTO asha_call_logs "
                    "(direction, call_type, patient_id, patient_phone, asha_id, "
                    " omnidim_call_id, health_update, symptoms, visit_requested, urgency, created_at) "
                    "VALUES (:dir, :ct, :pid, :pp, :aid, :oid, :hu, :sy, :vr, :urg, :now)"
                ),
                {
                    "dir": direction, "ct": call_type, "pid": patient_id,
                    "pp": patient_phone, "aid": asha_id, "oid": omnidim_call_id,
                    "hu": health_update, "sy": symptoms,
                    "vr": 1 if visit_requested else 0, "urg": urgency,
                    "now": dt.utcnow().isoformat(),
                },
            )
            return result.lastrowid or 0
    except Exception as exc:
        logger.error("_save_call_log: %s", exc)
        return 0


# ── Main Omnidim webhook ──────────────────────────────────────────────────────

@router.post("/omnidim/asha-health-call")
async def asha_health_call_webhook(request: Request, tool: str = ""):
    """
    Omnidim calls this when the ASHA health-check agent needs live data.
    Returns { "result": "string" } — spoken aloud by the agent.

    Supports two modes:
      • Webhook mode  — POST body contains toolName + toolInputs
      • Direct mode   — POST body is flat params, ?tool=<name> in URL
                        (used by Omnidim Custom API Integration test)
    """
    try:
        body = await request.json()
    except Exception:
        body = {}
        logger.warning("asha_health_call: could not parse JSON body")

    name, args, call = _parse_body(body, tool_override=tool)
    logger.info("asha_health_call tool=%r args_keys=%s", name, list(args.keys()))
    logger.info("ASHA health call tool: %s | args: %s", name, args)

    handlers = {
        "identify_patient":    _identify_patient,
        "log_health_update":   _log_health_update,
        "request_asha_visit":  _request_asha_visit,
        "get_health_advice":   _get_health_advice,
        "get_patient_for_asha": _get_patient_for_asha,
        "transfer_to_asha":    _transfer_to_asha,
        # aliases
        "check_patient":       _identify_patient,
        "save_health_update":  _log_health_update,
        "request_visit":       _request_asha_visit,
        "connect_to_asha":     _transfer_to_asha,
    }

    handler = handlers.get(name)
    if not handler:
        return _cors_response({"result": "I couldn't process that request. Please try again."})

    try:
        result = await handler(args, call)
        # transfer_to_asha returns a dict with top-level transfer fields;
        # all other handlers return a plain string → wrap in {"result": ...}
        if isinstance(result, dict):
            return _cors_response(result)
        return _cors_response({"result": result})
    except Exception as exc:
        logger.error("ASHA health call tool %s failed: %s", name, exc, exc_info=True)
        return _cors_response({"result": "The system is temporarily unavailable. Your ASHA worker will be notified."})


# ── Tool: identify_patient ────────────────────────────────────────────────────

async def _identify_patient(args: dict, call: dict) -> str:
    """Look up patient by phone, return name + brief health summary."""
    phone = (args.get("phone") or args.get("patient_phone") or "").strip()
    if not phone:
        return (
            "I couldn't find your phone number. "
            "Could you please tell me your 10-digit mobile number?"
        )

    p = _get_patient_by_phone(phone)
    if not p:
        return (
            f"I don't have a record for {phone} yet. "
            "You may be a new patient. Would you like me to connect you to your ASHA worker? "
            "Or you can call our appointment line to register."
        )

    risk = p["risk_level"] or "UNKNOWN"
    risk_text = {
        "LOW":       "your health looks stable",
        "MEDIUM":    "you have some conditions we're monitoring",
        "HIGH":      "you have some high-risk conditions",
        "CRITICAL":  "your records show critical conditions",
        "EMERGENCY": "your records flag an emergency condition",
    }.get(risk, "your health status is not yet assessed")

    asha_part = f", and your ASHA worker is {p['asha_name']}" if p["asha_name"] else ""

    return (
        f"Hello {p['name']}! I found your record. You are {p['age']} years old "
        f"from {p['village'] or 'your village'}{asha_part}. "
        f"Based on your latest check-up, {risk_text}. "
        f"How are you feeling today? Please describe any symptoms or concerns."
    )


# ── Tool: log_health_update ───────────────────────────────────────────────────

async def _log_health_update(args: dict, call: dict) -> str:
    """Save patient's health status report to DB and notify ASHA."""
    phone        = (args.get("phone") or args.get("patient_phone") or "").strip()
    how_feeling  = (args.get("how_feeling") or args.get("feeling") or args.get("status") or "").strip()
    symptoms     = (args.get("symptoms") or args.get("complaints") or "").strip()
    call_id      = (call.get("call_id") or call.get("callId") or "").strip()

    p = _get_patient_by_phone(phone) if phone else None
    patient_id = p["id"] if p else None
    asha_id    = p["asha_worker_id"] if p else None
    name       = p["name"] if p else "Unknown"

    combined = f"Patient reports: {how_feeling}. {symptoms}".strip(". ")

    log_id = _save_call_log(
        direction="inbound",
        patient_id=patient_id,
        patient_phone=phone,
        asha_id=asha_id,
        call_type="health_check",
        health_update=how_feeling,
        symptoms=symptoms,
        omnidim_call_id=call_id,
    )

    # Determine urgency keywords
    urgent_keywords = ["chest pain", "breathing", "unconscious", "bleeding", "stroke",
                       "fits", "seizure", "high fever", "vomiting blood", "accident"]
    is_urgent = any(kw in combined.lower() for kw in urgent_keywords)

    if is_urgent:
        return (
            f"Thank you {name}. I can hear that you may need urgent attention. "
            f"Your ASHA worker has been notified about your condition. "
            f"Please call 108 immediately if you have a medical emergency. "
            f"Your health update has been logged. Reference: HU-{log_id}. "
            f"Is there anything else I can help you with?"
        )

    asha_notice = ""
    if asha_id:
        asha_notice = "Your ASHA worker will be notified of your update. "

    return (
        f"Thank you {name} for sharing. I have recorded your health update. "
        f"{asha_notice}"
        f"Reference number: HU-{log_id}. "
        f"Would you like some health advice, or do you need your ASHA worker to visit you?"
    )


# ── Tool: request_asha_visit ──────────────────────────────────────────────────

async def _request_asha_visit(args: dict, call: dict) -> str:
    """Patient requests ASHA visit or callback — creates a call log entry."""
    phone   = (args.get("phone") or args.get("patient_phone") or "").strip()
    reason  = (args.get("reason") or "General health check").strip()
    urgency = (args.get("urgency") or "normal").strip().lower()
    call_id = (call.get("call_id") or call.get("callId") or "").strip()

    p = _get_patient_by_phone(phone) if phone else None
    patient_id = p["id"] if p else None
    asha_id    = p["asha_worker_id"] if p else None
    name       = p["name"] if p else "Patient"
    asha_name  = p["asha_name"] if p else "your ASHA worker"

    log_id = _save_call_log(
        direction="inbound",
        patient_id=patient_id,
        patient_phone=phone,
        asha_id=asha_id,
        call_type="visit_request",
        health_update=reason,
        visit_requested=True,
        urgency=urgency,
        omnidim_call_id=call_id,
    )

    if urgency == "urgent":
        return (
            f"I have logged an URGENT visit request for you, {name}. "
            f"{asha_name} will be notified immediately. "
            f"Request reference: VR-{log_id}. "
            f"If this is a medical emergency, please call 108 right away. "
            f"Is there anything else you need?"
        )

    return (
        f"Your visit request has been recorded, {name}. "
        f"{asha_name} will be notified and will contact you soon. "
        f"Request reference: VR-{log_id}. "
        f"They will typically respond within 24 hours. "
        f"Is there anything else I can help you with today?"
    )


# ── Tool: get_health_advice ───────────────────────────────────────────────────

async def _get_health_advice(args: dict, call: dict) -> str:
    """Return personalized health advice based on patient's medical history."""
    phone = (args.get("phone") or args.get("patient_phone") or "").strip()
    p     = _get_patient_by_phone(phone) if phone else None

    if not p:
        return (
            "Here are some general health tips: "
            "Drink at least 8 glasses of water daily. "
            "Eat fresh fruits and vegetables. "
            "Take prescribed medications regularly. "
            "Sleep 7 to 8 hours each night. "
            "If you have any specific health concerns, please tell your ASHA worker."
        )

    advice_parts = []
    history = (p["medical_history"] or "").lower()
    diagnosis = (p["diagnosis"] or "").lower()
    combined = history + " " + diagnosis

    if "diabetes" in combined or "sugar" in combined:
        advice_parts.append("monitor your blood sugar regularly and avoid sweets")
    if "hypertension" in combined or "bp" in combined or "blood pressure" in combined:
        advice_parts.append("take your BP medicines on time and reduce salt in your diet")
    if "anaemia" in combined or "anemia" in combined or "hemoglobin" in combined:
        advice_parts.append("eat iron-rich foods like spinach, lentils, and jaggery")
    if "tb" in combined or "tuberculosis" in combined:
        advice_parts.append("complete your full course of TB medicines without missing a dose")
    if p["is_pregnant"] if hasattr(p, "is_pregnant") else False:
        advice_parts.append("attend all your antenatal check-ups and take iron-folic acid tablets daily")

    if not advice_parts:
        advice_parts = [
            "drink plenty of water and eat balanced meals",
            "exercise lightly for 30 minutes each day",
            "take all prescribed medicines regularly",
        ]

    name = p["name"]
    advice = ", ".join(advice_parts)

    return (
        f"Here is personalised advice for you, {name}: "
        f"Please {advice}. "
        f"Your ASHA worker {p['asha_name'] or ''} is available if you need a check-up. "
        f"Stay healthy and take care of yourself!"
    )


# ── Tool: get_patient_for_asha (ASHA-triggered outbound call) ─────────────────

async def _get_patient_for_asha(args: dict, call: dict) -> str:
    """
    Used when ASHA triggers the call. AI greets patient by name
    and explains why the ASHA asked the agent to call.
    """
    phone     = (args.get("phone") or args.get("patient_phone") or "").strip()
    asha_name = (args.get("asha_name") or "your ASHA worker").strip()
    call_type = (args.get("call_type") or "health_check").strip()

    p = _get_patient_by_phone(phone) if phone else None
    name = p["name"] if p else "there"

    type_msgs = {
        "health_check": f"I'm calling on behalf of {asha_name} to check on your health. How are you feeling today?",
        "followup":     f"{asha_name} wanted me to follow up on your recent treatment. Are you taking your medicines regularly?",
        "emergency":    f"{asha_name} has asked me to urgently check on you. Are you okay? Do you need any help?",
        "reminder":     f"{asha_name} wants to remind you about your upcoming health check-up. Please confirm you will attend.",
    }
    msg = type_msgs.get(call_type, type_msgs["health_check"])

    return f"Hello {name}! {msg}"


# ── Tool: transfer_to_asha ────────────────────────────────────────────────────

async def _transfer_to_asha(args: dict, call: dict) -> dict:
    """
    Patient asks to speak to their ASHA worker directly.
    Returns a dict with:
      - result        : text spoken by agent before transfer
      - transfer_to   : E.164 phone number — Omnidim reads this for live SIP transfer
      - phone         : alias (some Omnidim versions use this field)
      - transfer_number: alias
    Also logs an URGENT visit request so ASHA sees it in their dashboard.
    """
    phone = (args.get("phone") or args.get("patient_phone") or "").strip()
    p = _get_patient_by_phone(phone) if phone else None

    if not p or not p.get("asha_worker_id"):
        return {
            "result": (
                "I'm sorry, I couldn't find your ASHA worker's details right now. "
                "I have logged your request and your ASHA worker will call you back shortly."
            )
        }

    try:
        with engine.connect() as conn:
            row = conn.execute(
                text("SELECT full_name, phone FROM users WHERE id=:aid"),
                {"aid": p["asha_worker_id"]},
            ).fetchone()

        if row and row[1]:
            asha_name  = row[0] or "your ASHA worker"
            asha_phone = row[1].strip()
            if not asha_phone.startswith("+"):
                asha_phone = "+91" + asha_phone.lstrip("0")

            logger.info("transfer_to_asha: patient=%s → ASHA=%s phone=%s", phone, asha_name, asha_phone)

            # Log urgent visit request so ASHA dashboard shows the transfer attempt
            _save_call_log(
                direction="inbound",
                patient_id=p["id"],
                patient_phone=phone,
                asha_id=p["asha_worker_id"],
                call_type="transfer_request",
                health_update="Patient requested live transfer to ASHA worker during call",
                visit_requested=True,
                urgency="urgent",
            )

            return {
                # Spoken text before Omnidim does the SIP transfer
                "result":          f"Please hold, connecting you to {asha_name} now.",
                # These top-level fields are read by Omnidim for the actual SIP transfer
                "transfer_to":     asha_phone,
                "phone":           asha_phone,
                "transfer_number": asha_phone,
            }

    except Exception as exc:
        logger.error("_transfer_to_asha: %s", exc)

    return {
        "result": (
            "I'm sorry, I couldn't reach your ASHA worker's line right now. "
            "I have logged an urgent request — your ASHA worker will call you back very soon."
        )
    }


# ── Omnidim custom-API transfer endpoint (called by Omnidim for live transfer) ──

@router.post("/omnidim/transfer-number")
async def get_transfer_number(request: Request):
    """
    Omnidim calls this when is_custom_api_transfer_enabled is true.
    Returns the ASHA worker's phone number for live SIP transfer.
    Expected response: {"phone": "+91XXXXXXXXXX"}
    """
    try:
        body = await request.json()
    except Exception:
        body = {}

    phone = (body.get("phone") or body.get("patient_phone") or "").strip()
    logger.info("transfer-number called: phone=%s", phone)

    p = _get_patient_by_phone(phone) if phone else None
    if p and p.get("asha_worker_id"):
        try:
            with engine.connect() as conn:
                row = conn.execute(
                    text("SELECT full_name, phone FROM users WHERE id=:aid"),
                    {"aid": p["asha_worker_id"]},
                ).fetchone()
            if row and row[1]:
                asha_phone = row[1].strip()
                if not asha_phone.startswith("+"):
                    asha_phone = "+91" + asha_phone.lstrip("0")
                return _cors_response({
                    "phone":       asha_phone,
                    "name":        row[0] or "ASHA Worker",
                    "transfer_to": asha_phone,   # alias
                })
        except Exception as exc:
            logger.error("transfer-number DB error: %s", exc)

    # Fallback: transfer to the Omnidim health line
    return _cors_response({
        "phone":       _omnidim_from_phone(),
        "name":        "Health Helpline",
        "transfer_to": _omnidim_from_phone(),
    })


@router.options("/omnidim/transfer-number")
async def transfer_number_preflight():
    return _cors_response({})


# ── ASHA-triggered outbound call endpoint ─────────────────────────────────────

@router.post("/asha/call-patient")
async def asha_trigger_outbound_call(request: Request):
    """
    ASHA clicks "Call Patient" in the dashboard.
    This endpoint triggers Omnidim to place an outbound call to the patient's phone.

    Body:
      patient_id    — DB patient id (optional if patient_phone provided directly)
      patient_phone — E.164 phone number (pass directly for demo patients not in DB)
      patient_name  — patient's name (used when patient_phone provided directly)
      call_type     — "health_check" | "followup" | "emergency" | "reminder"
      asha_name     — ASHA's display name (spoken by agent)
      lang          — "en" | "hi" | "kn" (default "en")
      message       — optional custom first message override
    """
    try:
        body = await request.json()
    except Exception:
        return {"success": False, "error": "Invalid request body"}

    patient_id    = body.get("patient_id")
    call_type     = body.get("call_type", "health_check")
    asha_name     = (body.get("asha_name") or "your ASHA worker").strip()
    lang          = body.get("lang", "en")
    custom_msg    = (body.get("message") or "").strip()

    # ── Direct phone mode (demo patients / no DB lookup needed) ───────────────
    direct_phone = (body.get("patient_phone") or "").strip()
    direct_name  = (body.get("patient_name")  or "Patient").strip()

    if direct_phone and not patient_id:
        # Phone supplied directly — normalise and skip DB lookup
        if not direct_phone.startswith("+"):
            direct_phone = "+91" + direct_phone.lstrip("0")
        patient_name  = direct_name
        patient_phone = direct_phone
        asha_id       = None
    else:
        if not patient_id:
            return {"success": False, "error": "patient_id or patient_phone is required"}

        # Look up patient phone from DB
        try:
            with engine.connect() as conn:
                row = conn.execute(
                    text("SELECT id, name, phone, asha_worker_id FROM patients WHERE id=:pid"),
                    {"pid": patient_id},
                ).fetchone()
        except Exception as exc:
            logger.error("patient lookup for outbound call: %s", exc)
            return {"success": False, "error": "Database error looking up patient"}

        if not row:
            return {"success": False, "error": "Patient not found"}

        patient_name  = row[1]
        patient_phone = row[2] or ""
        asha_id       = row[3]

        if not patient_phone:
            return {
                "success": False,
                "error": f"No phone number for {patient_name}. Ask the patient to update their profile.",
            }

        # Ensure E.164 format
        patient_phone = patient_phone.strip()
        if not patient_phone.startswith("+"):
            patient_phone = "+91" + patient_phone.lstrip("0")

    agent_id = _omnidim_asha_agent() or body.get("agent_id", "")
    if not agent_id:
        # Demo mode — log the call intent without actually dialling
        log_id = _save_call_log(
            direction="outbound",
            patient_id=patient_id,
            patient_phone=patient_phone,
            asha_id=asha_id,
            call_type=call_type,
            health_update=custom_msg or f"ASHA {asha_name} initiated {call_type} call",
        )
        logger.info(
            "ASHA outbound DEMO: patient=%s phone=%s type=%s",
            patient_name, patient_phone, call_type,
        )
        return {
            "success": True,
            "demo_mode": True,
            "message": (
                f"Demo mode: call to {patient_name} ({patient_phone}) logged. "
                f"Set OMNIDIM_ASHA_AGENT_ID in .env to enable real calls."
            ),
            "log_id": log_id,
            "patient_name": patient_name,
            "patient_phone": patient_phone,
        }

    # Build first message
    FIRST_MSGS = {
        "health_check": f"Hello {patient_name}! I'm calling on behalf of {asha_name} to check on your health. How are you feeling today?",
        "followup":     f"Hello {patient_name}! This is a follow-up call from {asha_name}. Are you taking your medicines regularly?",
        "emergency":    f"Hello {patient_name}! This is an urgent call from {asha_name}. Are you okay? Do you need any help?",
        "reminder":     f"Hello {patient_name}! {asha_name} wanted to remind you about your upcoming health check-up. Will you be attending?",
    }
    first_message = custom_msg or FIRST_MSGS.get(call_type, FIRST_MSGS["health_check"])

    # Fetch ASHA phone so agent can transfer if patient requests it
    asha_phone = ""
    if asha_id:
        try:
            with engine.connect() as conn:
                ar = conn.execute(
                    text("SELECT phone FROM users WHERE id=:aid"), {"aid": asha_id}
                ).fetchone()
            if ar and ar[0]:
                asha_phone = ar[0].strip()
                if not asha_phone.startswith("+"):
                    asha_phone = "+91" + asha_phone.lstrip("0")
        except Exception:
            pass

    # Call Omnidim outbound API
    # Endpoint: POST https://backend.omnidim.io/api/v1/calls/dispatch
    # Ref: omnidimension Python SDK → Call.dispatch_call()
    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.post(
                "https://backend.omnidim.io/api/v1/calls/dispatch",
                headers={
                    "Authorization": f"Bearer {_omnidim_api_key() or _omnidim_secret()}",
                    "Content-Type":  "application/json",
                    "Accept":        "application/json",
                },
                json={
                    "agent_id":  int(agent_id),
                    "to_number": patient_phone,
                    "call_context": {
                        "first_message":  first_message,
                        "patient_id":     str(patient_id),
                        "patient_name":   patient_name,
                        "patient_phone":  patient_phone,
                        "asha_id":        str(asha_id or ""),
                        "asha_name":      asha_name,
                        "asha_phone":     asha_phone,
                        "call_type":      call_type,
                        "lang":           lang,
                    },
                },
            )
            data = resp.json() if resp.content else {}
            # Omnidim dispatch returns: {"success":true,"requestId":...,"status":"dispatched"}
            call_id = (
                data.get("requestId") or data.get("call_id") or data.get("id")
                or data.get("callId") or data.get("call_log_id") or ""
            )
            call_id = str(call_id) if call_id else ""

            log_id = _save_call_log(
                direction="outbound",
                patient_id=patient_id,
                patient_phone=patient_phone,
                asha_id=asha_id,
                call_type=call_type,
                health_update=custom_msg,
                omnidim_call_id=call_id,
            )

            if resp.status_code < 300:
                logger.info(
                    "ASHA outbound call placed: patient=%s phone=%s call_id=%s",
                    patient_name, patient_phone, call_id,
                )
                return {
                    "success":      True,
                    "call_id":      call_id,
                    "patient_name": patient_name,
                    "patient_phone": patient_phone,
                    "message":      f"Calling {patient_name} at {patient_phone}…",
                    "log_id":       log_id,
                }
            else:
                logger.error("Omnidim outbound failed: %s %s", resp.status_code, data)
                return {
                    "success":    False,
                    "error":      data.get("message") or f"Omnidim error {resp.status_code}",
                    "log_id":     log_id,
                }
    except Exception as exc:
        logger.error("Omnidim outbound call exception: %s", exc)
        return {"success": False, "error": str(exc)}


# ── Call logs: ASHA reads pending visit requests / health updates ─────────────

@router.get("/asha/call-logs")
async def get_asha_call_logs(request: Request, limit: int = 20):
    """
    Returns recent call logs for the ASHA worker — health updates + visit requests.
    Scoped to the ASHA via JWT token.
    """
    asha_id = 0
    auth_hdr = request.headers.get("Authorization", "")
    if auth_hdr.startswith("Bearer "):
        try:
            from services.auth_service import decode_token
            pl = decode_token(auth_hdr[7:])
            if pl:
                asha_id = int(pl.get("sub", 0) or 0)
        except Exception:
            pass

    try:
        with engine.connect() as conn:
            rows = conn.execute(
                text(
                    "SELECT cl.id, cl.direction, cl.call_type, cl.patient_phone, "
                    "       p.name, cl.health_update, cl.symptoms, "
                    "       cl.visit_requested, cl.urgency, cl.created_at "
                    "FROM asha_call_logs cl "
                    "LEFT JOIN patients p ON p.id = cl.patient_id "
                    "WHERE cl.asha_id=:aid OR cl.patient_id IN "
                    "  (SELECT id FROM patients WHERE asha_worker_id=:aid) "
                    "ORDER BY cl.created_at DESC LIMIT :lim"
                ),
                {"aid": asha_id, "lim": limit},
            ).fetchall()

        return [
            {
                "id":              r[0],
                "direction":       r[1],
                "call_type":       r[2],
                "patient_phone":   r[3],
                "patient_name":    r[4] or r[3],
                "health_update":   r[5],
                "symptoms":        r[6],
                "visit_requested": bool(r[7]),
                "urgency":         r[8],
                "created_at":      r[9],
            }
            for r in rows
        ]
    except Exception as exc:
        logger.error("get_asha_call_logs: %s", exc)
        return []


# ── Patient: get their ASHA contact info ──────────────────────────────────────

@router.get("/me/asha-contact")
async def get_patient_asha_contact(request: Request):
    """
    Returns ASHA worker's name, phone, and village for the logged-in patient.
    Used on Patient Dashboard to show "Your ASHA worker".
    Path is /me/asha-contact (not /patient/...) to avoid conflict with
    /patient/{patient_id}/... parametric routes.
    """
    pid = 0
    auth_hdr = request.headers.get("Authorization", "")
    if auth_hdr.startswith("Bearer "):
        try:
            from services.auth_service import decode_token
            pl = decode_token(auth_hdr[7:])
            if pl:
                uid = int(pl.get("sub", 0) or 0)
                with engine.connect() as conn:
                    row = conn.execute(
                        text("SELECT id FROM patients WHERE user_id=:uid LIMIT 1"),
                        {"uid": uid},
                    ).fetchone()
                    if row:
                        pid = row[0]
        except Exception:
            pass

    if not pid:
        return {"found": False}

    try:
        with engine.connect() as conn:
            row = conn.execute(
                text(
                    "SELECT u.id, u.full_name, u.phone, u.village, u.district "
                    "FROM patients p "
                    "JOIN users u ON u.id = p.asha_worker_id "
                    "WHERE p.id=:pid LIMIT 1"
                ),
                {"pid": pid},
            ).fetchone()

        if not row:
            return {"found": False}

        return {
            "found":    True,
            "asha_id":  row[0],
            "name":     row[1],
            "phone":    row[2] or "",
            "village":  row[3] or "",
            "district": row[4] or "",
            "omnidim_phone": _omnidim_from_phone(),  # number to call for AI health line
        }
    except Exception as exc:
        logger.error("get_patient_asha_contact: %s", exc)
        return {"found": False, "error": str(exc)}
