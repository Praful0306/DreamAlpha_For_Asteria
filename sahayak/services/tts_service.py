import asyncio
import base64
import logging
import os
import uuid

logger = logging.getLogger("sahayak.tts")

OUTPUT_DIR = "static/audio"
os.makedirs(OUTPUT_DIR, exist_ok=True)

_MAX_TTS_CHARS       = 500   # Sarvam TTS + gTTS limit
_MAX_TRANSLATE_CHARS = 1000  # Sarvam translate limit

# App lang code → Sarvam BCP-47 code
_SARVAM_LANG_MAP: dict[str, str] = {
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


# ── Sarvam helpers ────────────────────────────────────────────────────────────

async def _sarvam_translate(text: str, target_lang_code: str, api_key: str) -> str:
    """Translate English text → target Indian language via Sarvam AI."""
    import httpx
    safe = text[:_MAX_TRANSLATE_CHARS].strip()
    async with httpx.AsyncClient(timeout=15.0) as client:
        resp = await client.post(
            "https://api.sarvam.ai/translate",
            headers={
                "api-subscription-key": api_key,
                "Content-Type": "application/json",
            },
            json={
                "input": safe,
                "source_language_code": "en-IN",
                "target_language_code": target_lang_code,
                "speaker_gender": "Female",
                "mode": "formal",
                "model": "mayura:v1",
                "enable_preprocessing": True,
            },
        )
        resp.raise_for_status()
        translated = resp.json().get("translated_text", "")
    return translated or text  # fallback: original if empty


async def _sarvam_tts(text: str, lang_code: str, filepath: str, api_key: str) -> str:
    """Call Sarvam AI TTS → save WAV → return WAV path."""
    import httpx
    safe = text[:_MAX_TTS_CHARS].strip() or "Audio generation complete."
    async with httpx.AsyncClient(timeout=20.0) as client:
        resp = await client.post(
            "https://api.sarvam.ai/text-to-speech",
            headers={
                "api-subscription-key": api_key,
                "Content-Type": "application/json",
            },
            json={
                "inputs": [safe],
                "target_language_code": lang_code,
                "speaker": "anushka",
                "pitch": 0,
                "pace": 1.0,
                "loudness": 1.5,
                "speech_sample_rate": 22050,
                "enable_preprocessing": True,
                "model": "bulbul:v2",
            },
        )
        resp.raise_for_status()
        audios = resp.json().get("audios", [])
    if not audios:
        raise ValueError("Sarvam TTS returned no audio data")
    wav_path = filepath.replace(".mp3", ".wav")
    with open(wav_path, "wb") as f:
        f.write(base64.b64decode(audios[0]))
    return wav_path


# ── gTTS fallback ─────────────────────────────────────────────────────────────

def _gtts_sync(text: str, lang: str, filepath: str) -> str:
    """Blocking gTTS call — run in executor to keep event loop free."""
    from gtts import gTTS
    safe = text[:_MAX_TTS_CHARS].strip() or "Audio generation complete."
    gTTS(text=safe, lang=lang, slow=False).save(filepath)
    return filepath


# ── Public API ────────────────────────────────────────────────────────────────

async def text_to_speech(text: str, lang: str = "en") -> str:
    """Convert text to speech in the chosen language.

    Flow:
      1. If SARVAM_API_KEY is set:
         a. Translate English clinical text → target language (skip for "en").
         b. Call Sarvam TTS (bulbul:v1) — returns a WAV file.
      2. Fallback: gTTS (Google TTS) — returns an MP3 file.

    Returns the file path relative to the project root (e.g. static/audio/abc.wav).
    """
    filename   = uuid.uuid4().hex
    api_key    = os.getenv("SARVAM_API_KEY", "").strip()
    sarvam_lang = _SARVAM_LANG_MAP.get(lang)

    if api_key and sarvam_lang:
        try:
            # Step 1 — translate if not English
            speak_text = text
            if lang != "en":
                try:
                    speak_text = await _sarvam_translate(text, sarvam_lang, api_key)
                    logger.info("Sarvam translate OK: en-IN → %s (%d chars)", sarvam_lang, len(speak_text))
                except Exception as te:
                    logger.warning("Sarvam translate failed (%s) — using original English text", te)

            # Step 2 — TTS
            filepath = os.path.join(OUTPUT_DIR, f"{filename}.wav")
            result   = await _sarvam_tts(speak_text, sarvam_lang, filepath, api_key)
            logger.info("Sarvam TTS OK: lang=%s (%s)", lang, sarvam_lang)
            return result

        except Exception as e:
            logger.warning("Sarvam TTS pipeline failed (%s) — falling back to gTTS", e)

    # Fallback — gTTS
    filepath = os.path.join(OUTPUT_DIR, f"{filename}.mp3")
    loop = asyncio.get_event_loop()
    await loop.run_in_executor(None, _gtts_sync, text, lang, filepath)
    logger.info("gTTS OK: lang=%s", lang)
    return filepath
