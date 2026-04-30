"""
Sahayak AI — LLM Logic and RAG Service logic.
This version restricts LLM to extraction and uses CLINICAL_ENGINE
for all medical reasoning and correctness.
FAISS RAG context is injected into the LLM prompt for ICMR grounding.

LLM call order: Groq key-1 → Groq key-2 → Ollama (local) → hardcoded fallback
Groq is primary because it works on all environments (Render, cloud, local with internet).
Ollama is secondary — only available when running locally with the model installed.
Target latency: <5 seconds via Groq; Ollama as offline-only fallback.
"""
import asyncio
import logging
import json
import os
import re
from typing import Optional

# rag_service imported lazily to avoid sentence_transformers loading at startup

logger = logging.getLogger("sahayak.llm")

# ── Ollama local call (primary — no API key needed) ──────────────────────────

def _ollama_sync_fast(system_prompt: str, user_prompt: str) -> str:
    """
    Sync Ollama call — uses gemma4:e2b (thinking model) locally.
    num_predict=1200 lets the model finish its thinking phase AND produce content.
    """
    import urllib.request, json as _json, re as _re
    from config import OLLAMA_BASE_URL, OLLAMA_MODEL
    payload = {
        "model": OLLAMA_MODEL,
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user",   "content": user_prompt},
        ],
        "stream": False,
        "options": {"temperature": 0.0, "num_predict": 1200},
    }
    data = _json.dumps(payload).encode("utf-8")
    req  = urllib.request.Request(
        f"{OLLAMA_BASE_URL}/api/chat",
        data=data,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=35) as resp:
        result = _json.loads(resp.read())
    msg     = result.get("message", {})
    content = msg.get("content", "").strip()
    # thinking model: content has the final answer; fall back to extracting JSON from thinking
    if content:
        return content
    thinking = msg.get("thinking", "").strip()
    if thinking:
        # extract the last JSON block from the chain-of-thought
        matches = _re.findall(r"\{[\s\S]*?\}", thinking)
        if matches:
            return matches[-1]
        return thinking
    raise ValueError(f"Ollama ({OLLAMA_MODEL}) returned empty response")


async def _call_ollama_fast(system_prompt: str, user_prompt: str) -> str:
    """Async Ollama call — primary LLM, offline-capable, no rate limits."""
    try:
        result = await asyncio.wait_for(
            asyncio.to_thread(_ollama_sync_fast, system_prompt, user_prompt),
            timeout=38.0,
        )
        if result and result.strip():
            logger.info("Ollama (gemma4:e2b) diagnosis succeeded")
            return result
    except asyncio.TimeoutError:
        logger.warning("Ollama timed out — falling back to Groq")
    except Exception as e:
        logger.warning("Ollama unavailable: %s — falling back to Groq", e)
    raise RuntimeError("Ollama unavailable")


# ── Groq call (primary — works on Render and all cloud environments) ──────────

_GROQ_MODELS = ["llama-3.1-8b-instant", "llama-3.3-70b-versatile"]


def _groq_sync(api_key: str, system_prompt: str, user_prompt: str, model: str) -> str:
    """Sync Groq call — run via asyncio.to_thread.
    timeout=10.0 is critical on Render: without it the HTTP call blocks the thread
    indefinitely and asyncio.wait_for cannot cancel running threads."""
    from groq import Groq
    client = Groq(api_key=api_key, timeout=10.0)
    resp = client.chat.completions.create(
        model=model,
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user",   "content": user_prompt},
        ],
        temperature=0.0,
        max_tokens=600,
    )
    return resp.choices[0].message.content


def _collect_groq_keys() -> list[str]:
    """Return deduplicated list of all configured Groq API keys."""
    seen: set[str] = set()
    keys: list[str] = []
    for name in ("GROQ_DIAGNOSE_KEY_1", "GROQ_DIAGNOSE_KEY_2",
                 "GROQ_API_KEY_1", "GROQ_API_KEY_2"):
        k = os.getenv(name, "").strip()
        if k and not k.startswith("your_") and k not in seen:
            seen.add(k)
            keys.append(k)
    return keys


async def _call_groq_fast(system_prompt: str, user_prompt: str) -> str:
    """
    Async Groq call — PRIMARY LLM on all cloud/Render deployments.
    Tries all configured keys × all models until one succeeds.
    15-second hard timeout per attempt.
    """
    keys = _collect_groq_keys()
    if not keys:
        raise RuntimeError("No Groq API keys configured")

    for key in keys:
        for model in _GROQ_MODELS:
            try:
                result = await asyncio.wait_for(
                    asyncio.to_thread(_groq_sync, key, system_prompt, user_prompt, model),
                    timeout=12.0,
                )
                if result and result.strip():
                    logger.info("Groq diagnosis succeeded (model=%s)", model)
                    return result
            except asyncio.TimeoutError:
                logger.warning("Groq timed out (model=%s) — trying next", model)
            except Exception as e:
                logger.warning("Groq failed (model=%s): %s — trying next", model, e)

    raise RuntimeError("All Groq diagnosis keys/models exhausted")


# ── PROMPTS ──────────────────────────────────────────────────────────────────

# NOTE: {rag_context} is filled at call time — not a static string
DIAGNOSIS_SYSTEM_TEMPLATE = """You are Sahayak AI, an expert medical transcriptionist for Indian clinics.
Your ONLY job: convert raw medical text (symptoms + patient context) into a structured JSON
containing extraction data. You MUST NOT invent a diagnosis or a risk level.
{rag_context}
Return ONLY raw JSON with this exact structure:
{{
  "extracted_symptoms": "...",
  "disease_name": "Possible [Condition Name]",
  "confidence_pct": 75,
  "refer_to_hospital": true/false,
  "medications_suggested": ["...", "..."],
  "warning_signs": ["...", "..."],
  "sources": ["ICMR", "WHO"]
}}
STRICT: Return raw JSON only. Zero explanation. Zero markdown."""

DIAGNOSIS_USER_TEMPLATE = """SYMPTOMS: {symptoms}
CONTEXT: {context}
ADDITIONAL: {additional}

Extract symptoms and provide a suggested condition name based on symptoms alone."""

# ─────────────────────────────────────────────────────────────────────────────

def _get_rag_context(symptoms: str) -> str:
    """
    Query FAISS RAG for ICMR guidelines relevant to the symptoms.
    Returns a formatted string to inject into the system prompt.
    Falls back silently to empty string if RAG is unavailable.
    """
    try:
        from services.rag_service import query_rag
        results = query_rag(symptoms, top_k=3)
        if not results:
            return ""
        # results is a list of dicts: [{text, source, score}, ...]
        chunks = "\n".join(
            f"- {r['text']}" if isinstance(r, dict) else f"- {r}"
            for r in results[:3]
        )
        if not chunks:
            return ""
        return f"\nICMR GUIDELINE CONTEXT (use to inform extraction):\n{chunks}\n"
    except Exception as exc:
        logger.debug("RAG unavailable for diagnosis: %s", exc)
        return ""


async def generate_diagnosis(
    symptoms: str,
    patient_context: Optional[str] = None,
    vitals_context:  Optional[str] = None,
    additional_context: Optional[str] = None
) -> dict:
    """
    Main triage pipeline:
    1. Query FAISS RAG for ICMR context relevant to symptoms.
    2. Call LLaMA 70B (with RAG context) for text extraction and name suggestion.
    3. Call CLINICAL_ENGINE for grounded safety and risk assessment.
    4. Merge results for final response.
    """
    # Step 1: FAISS RAG — get ICMR guideline context for these symptoms.
    # Run in a thread so the blocking SentenceTransformer encode() never freezes
    # the event loop. 5s timeout: skip gracefully if the model is still loading.
    try:
        rag_context = await asyncio.wait_for(
            asyncio.to_thread(_get_rag_context, symptoms),
            timeout=5.0,
        )
        if rag_context:
            logger.info("RAG context injected (%d chars)", len(rag_context))
        else:
            logger.debug("No RAG context — proceeding without ICMR guidelines")
    except (asyncio.TimeoutError, Exception) as _rag_err:
        rag_context = ""
        logger.debug("RAG skipped (%s) — continuing without ICMR context", _rag_err)

    # Step 2: LLM Extraction (with RAG context injected into system prompt)
    system_prompt = DIAGNOSIS_SYSTEM_TEMPLATE.format(rag_context=rag_context)
    user_prompt = DIAGNOSIS_USER_TEMPLATE.format(
        symptoms=symptoms,
        context=patient_context or "No context provided",
        additional=additional_context or "None"
    )

    llm_raw = ""
    try:
        # Primary: Groq cloud — works on Render and all internet-connected environments
        llm_raw = await _call_groq_fast(system_prompt, user_prompt)
    except Exception:
        try:
            # Secondary: Ollama local — offline-capable, only available when running locally
            llm_raw = await _call_ollama_fast(system_prompt, user_prompt)
        except Exception as e:
            logger.error("All LLM backends failed: %s", e)
            llm_raw = (
                '{"extracted_symptoms": "' + symptoms.replace('"', "'") + '",'
                '"disease_name": "Clinical Evaluation Required", "confidence_pct": 50}'
            )

    # Parse LLM JSON
    llm_data = _parse_json(llm_raw)

    # Step 3: Clinical Grounding (The Reliability Layer)
    from .clinical_engine import full_clinical_analysis

    vitals_form = _parse_vitals_string(vitals_context)

    gender = "male"
    if patient_context and ("female" in patient_context.lower() or "woman" in patient_context.lower()):
        gender = "female"

    clinical = full_clinical_analysis(
        form=vitals_form,
        gender=gender,
        llm_diagnosis=llm_data.get("disease_name")
    )

    # Step 4: Final Merge — clinical engine overrides risk and summary completely
    result = {
        "risk_level"           : clinical["risk_level"],
        "disease_name"         : clinical["safe_diagnosis"],
        "confidence_pct"       : clinical["confidence_pct"],
        "clinical_summary"     : clinical["clinical_summary"],
        "recommendations"      : clinical["recommendations"],
        "red_flags"            : clinical["red_flags"],
        "interpreted_vitals"   : clinical["interpreted"],
        "refer_to_hospital"    : (clinical["risk_level"] in ("HIGH", "EMERGENCY")),
        "medications_suggested": llm_data.get("medications_suggested", []),
        "warning_signs"        : clinical["red_flags"] + llm_data.get("warning_signs", []),
        "followup_days"        : 1 if clinical["risk_level"] == "HIGH" else 7,
        "sources"              : [
            "ICMR Standard Treatment Guidelines 2022",
            "WHO Clinical Protocols 2023",
            *(["FAISS RAG (local)"] if rag_context else []),
        ],
    }

    return result


def _parse_json(raw: str) -> dict:
    """Robust JSON parsing for LLM outputs."""
    if not raw:
        return {}
    clean = re.sub(r"```(?:json)?\s*", "", raw).strip().rstrip("`")
    try:
        return json.loads(clean)
    except Exception:
        match = re.search(r"\{[\s\S]*\}", clean)
        if match:
            try:
                return json.loads(match.group())
            except Exception:
                pass
    return {}


def _parse_vitals_string(vitals_str: str) -> dict:
    """
    Parses "BP: 148/92, Sugar: 186 mg/dL" into a form dict.
    Handles None input safely.
    """
    form = {}
    if not vitals_str:
        return form

    vitals_str = vitals_str.lower()

    patterns = {
        "bp":     r"bp[:\s]*(\d{2,3}/\d{2,3})",
        "sugar":  r"sugar[:\s]*(\d{2,3})",
        "hb":     r"hb[:\s]*(\d{1,2}(?:\.\d)?)",
        "temp":   r"temp[:\s]*(\d{2,3}(?:\.\d)?)",
        "hr":     r"(?:hr|heart rate)[:\s]*(\d{2,3})",
        "spo2":   r"spo2[:\s]*(\d{2,3})",
        "weight": r"weight[:\s]*(\d{2,3}(?:\.\d)?)",
    }

    for k, p in patterns.items():
        m = re.search(p, vitals_str)
        if m:
            form[k] = m.group(1).strip()

    return form


def format_vitals_string(form: dict) -> str:
    """Converts a form dict back for LLM readability if needed."""
    parts = []
    if form.get("bp"):    parts.append(f"BP: {form['bp']}")
    if form.get("sugar"): parts.append(f"Sugar: {form['sugar']} mg/dL")
    if form.get("hb"):    parts.append(f"Hb: {form['hb']} g/dL")
    if form.get("spo2"):  parts.append(f"SpO2: {form['spo2']}%")
    if form.get("hr"):    parts.append(f"HR: {form['hr']} BPM")
    return ", ".join(parts)
