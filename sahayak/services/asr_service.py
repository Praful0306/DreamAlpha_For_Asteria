"""
Sahayak AI — ASR (Automatic Speech Recognition) Service

Priority order:
  1. Sarvam AI  — online, PURPOSE-BUILT for Indian languages (kn, hi, en, te, ta, mr, bn, gu, pa)
  2. faster-whisper small — offline, multilingual (244MB, much better than tiny for Indian languages)
  3. Groq Whisper — online fallback if both above fail

Sarvam `saarika:v2` is specifically trained on Indian speech and handles
Kannada/Hindi/English/Telugu code-switching far better than general models.
"""

import asyncio
import os
import logging
import tempfile
import socket

logger = logging.getLogger("sahayak.asr")

# ── Language maps ─────────────────────────────────────────────────────────────

# App code → Sarvam BCP-47
_SARVAM_ASR_LANG_MAP: dict[str, str] = {
    "en": "en-IN",
    "hi": "hi-IN",
    "kn": "kn-IN",
    "mr": "mr-IN",
    "te": "te-IN",
    "ta": "ta-IN",
    "bn": "bn-IN",
    "gu": "gu-IN",
    "pa": "pa-IN",
}

# App code → faster-whisper / Whisper ISO-639-1 code
_WHISPER_LANG_MAP: dict[str, str] = {
    "en": "en",
    "hi": "hi",
    "kn": "kn",
    "mr": "mr",
    "te": "te",
    "ta": "ta",
    "bn": "bn",
    "gu": "gu",
    "pa": "pa",
}

# ── Connectivity check ────────────────────────────────────────────────────────

def _is_online(timeout: float = 2.0) -> bool:
    try:
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
            s.settimeout(timeout)
            s.connect(("8.8.8.8", 53))
        return True
    except OSError:
        return False


# ── Sarvam AI STT (online — best for Indian languages) ───────────────────────

async def _sarvam_asr(audio_bytes: bytes, content_type: str, sarvam_lang: str, api_key: str) -> dict:
    """
    Sarvam AI saarika:v2 — purpose-built for Indian speech.
    Supports: kn-IN, hi-IN, en-IN, te-IN, ta-IN, mr-IN, bn-IN, gu-IN, pa-IN
    Accepts: webm, mp4, ogg, wav, mp3, flac
    """
    import httpx

    # Map content-type → filename extension for the multipart upload
    _ext = {
        "audio/webm": "webm", "video/webm": "webm",
        "audio/mp4": "mp4",   "audio/mpeg": "mp3",
        "audio/ogg": "ogg",   "audio/wav": "wav",
        "audio/wave": "wav",  "audio/x-wav": "wav",
        "audio/flac": "flac", "application/octet-stream": "webm",
    }
    ct = (content_type or "audio/webm").lower().split(";")[0].strip()
    ext = _ext.get(ct, "webm")

    async with httpx.AsyncClient(timeout=20.0) as client:
        resp = await client.post(
            "https://api.sarvam.ai/speech-to-text",
            headers={"api-subscription-key": api_key},
            files={"file": (f"audio.{ext}", audio_bytes, ct)},
            data={
                "language_code": sarvam_lang,
                "model": "saarika:v2",
                "with_timestamps": "false",
                "debug_audio_url": "false",
            },
        )
        resp.raise_for_status()
        data = resp.json()

    text = data.get("transcript", "").strip()
    logger.info("Sarvam ASR OK: lang=%s text=%r", sarvam_lang, text[:60])
    return {
        "text":     text or "[no speech detected]",
        "language": sarvam_lang,
        "duration": None,
    }


# ── faster-whisper small (offline) ───────────────────────────────────────────

_whisper_model = None

def _load_whisper_model():
    """Blocking load of faster-whisper 'small' — much better than tiny for Indian languages.
    244MB download on first use; cached at ~/.cache/huggingface/hub/
    Called via asyncio.to_thread so event loop stays free.
    """
    global _whisper_model
    if _whisper_model is not None:
        return _whisper_model
    try:
        from faster_whisper import WhisperModel
        logger.info("Loading faster-whisper small (int8, CPU)…")
        _whisper_model = WhisperModel(
            "small",        # 244MB — significantly better multilingual vs tiny (39MB)
            device="cpu",
            compute_type="int8",
            num_workers=2,
            cpu_threads=4,
        )
        logger.info("faster-whisper small loaded OK")
    except Exception as e:
        logger.warning("faster-whisper failed to load: %s", e)
    return _whisper_model


async def _get_whisper_model_async():
    global _whisper_model
    if _whisper_model is not None:
        return _whisper_model
    return await asyncio.to_thread(_load_whisper_model)


def _ext_from_content_type(content_type: str) -> str:
    mapping = {
        "audio/webm": ".webm", "video/webm": ".webm",
        "audio/mp4":  ".mp4",  "audio/mpeg": ".mp3",
        "audio/ogg":  ".ogg",  "audio/wav":  ".wav",
        "audio/wave": ".wav",  "audio/x-wav": ".wav",
        "audio/flac": ".flac", "application/octet-stream": ".webm",
    }
    ct = (content_type or "").lower().split(";")[0].strip()
    return mapping.get(ct, ".webm")


def _run_whisper(model, tmp_path: str, whisper_lang: str | None) -> dict:
    """Blocking faster-whisper transcription — run via asyncio.to_thread."""
    segments, info = model.transcribe(
        tmp_path,
        language=whisper_lang,      # language hint for better accuracy; None = auto-detect
        beam_size=5,                # higher beam = more accurate (was 1)
        vad_filter=True,
        vad_parameters={"min_silence_duration_ms": 300},
    )
    text = " ".join(s.text.strip() for s in segments).strip()
    logger.info(
        "faster-whisper: lang=%s prob=%.2f text=%r",
        info.language, info.language_probability, text[:60],
    )
    return {
        "text":     text or "[no speech detected]",
        "language": info.language,
        "duration": getattr(info, "duration", None),
    }


# ── Public API ────────────────────────────────────────────────────────────────

async def transcribe_audio(audio_file, language: str = "en") -> dict:
    """
    Transcribe uploaded audio to text with full Indian language support.

    Priority:
      1. Sarvam AI saarika:v2  — online, purpose-built for Indian languages (~0.5s)
      2. faster-whisper small  — offline, multilingual int8 (~1-3s on CPU)
      3. Groq Whisper           — online fallback

    Args:
        audio_file: FastAPI UploadFile object.
        language:   App language code ("kn", "hi", "en", "te", …)

    Returns:
        dict with 'text', 'language', and optional 'duration'.
    """
    content = await audio_file.read()
    ct      = getattr(audio_file, "content_type", "") or ""
    ext     = _ext_from_content_type(ct)

    sarvam_lang  = _SARVAM_ASR_LANG_MAP.get(language, "en-IN")
    whisper_lang = _WHISPER_LANG_MAP.get(language)       # None = auto-detect

    # Save to temp file with correct extension so av/ffmpeg decoders work
    with tempfile.NamedTemporaryFile(delete=False, suffix=ext) as tmp:
        tmp.write(content)
        tmp_path = tmp.name

    try:
        # ── 1. Sarvam AI STT (online, best for Indian languages) ─────────────
        api_key = os.getenv("SARVAM_API_KEY", "").strip()
        online  = await asyncio.to_thread(_is_online)

        if api_key and online:
            try:
                result = await asyncio.wait_for(
                    _sarvam_asr(content, ct, sarvam_lang, api_key),
                    timeout=20.0,
                )
                return result
            except asyncio.TimeoutError:
                logger.warning("Sarvam ASR timed out — falling back to faster-whisper")
            except Exception as e:
                logger.warning("Sarvam ASR failed (%s) — falling back to faster-whisper", e)

        # ── 2. faster-whisper small (offline, multilingual) ──────────────────
        try:
            # First load may take 30-60s (downloads 244MB small model once)
            model = await asyncio.wait_for(_get_whisper_model_async(), timeout=120.0)
            if model is not None:
                result = await asyncio.wait_for(
                    asyncio.to_thread(_run_whisper, model, tmp_path, whisper_lang),
                    timeout=30.0,
                )
                return result
        except asyncio.TimeoutError:
            logger.warning("faster-whisper timed out — trying Groq")
        except Exception as e:
            logger.warning("faster-whisper error: %s — trying Groq", e)

        # ── 3. Groq Whisper (online fallback) ─────────────────────────────────
        return await _groq_transcribe(tmp_path)

    finally:
        try:
            os.unlink(tmp_path)
        except OSError:
            pass


async def _groq_transcribe(tmp_path: str) -> dict:
    """Last-resort fallback: Groq Whisper API."""
    from config import OPENAI_API_KEY, OPENAI_BASE_URL, WHISPER_MODEL
    if not OPENAI_API_KEY or OPENAI_API_KEY.startswith("your_"):
        raise RuntimeError(
            "Voice transcription unavailable: Sarvam and faster-whisper both failed. "
            "Check backend logs for the error. If offline, ensure faster-whisper small model is cached."
        )
    from openai import OpenAI
    client = OpenAI(api_key=OPENAI_API_KEY, base_url=OPENAI_BASE_URL)
    with open(tmp_path, "rb") as f:
        transcript = client.audio.transcriptions.create(
            model=WHISPER_MODEL, file=f, response_format="json",
        )
    return {
        "text":     transcript.text,
        "language": None,
        "duration": getattr(transcript, "duration", None),
    }


# ── Background model pre-warm ─────────────────────────────────────────────────

def preload_whisper_in_background():
    """Call at app startup so the small model is ready before the first request."""
    import threading
    def _load():
        logger.info("Pre-loading faster-whisper small in background…")
        _load_whisper_model()
    threading.Thread(target=_load, daemon=True, name="whisper-preload").start()
