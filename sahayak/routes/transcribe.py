from typing import Optional
from fastapi import APIRouter, UploadFile, File, Form, HTTPException
from models.schemas import TranscribeResponse
from services.asr_service import transcribe_audio

router = APIRouter(prefix="/transcribe", tags=["Transcription"])

_AUDIO_TYPES = {
    "audio/webm", "audio/mp4", "audio/mpeg", "audio/ogg",
    "audio/wav",  "audio/wave", "audio/x-wav", "audio/flac",
    "audio/aac",  "audio/opus", "video/webm",
    "application/octet-stream", "",
}


@router.post("/", response_model=TranscribeResponse)
async def transcribe(
    file:     UploadFile        = File(None),
    audio:    UploadFile        = File(None),
    language: Optional[str]    = Form(None),   # "kn", "hi", "en", "te", …
):
    """Transcribe audio to text with full Indian language support.

    Priority:
      1. Sarvam AI saarika:v2 (online) — purpose-built for Indian languages
      2. faster-whisper small (offline) — multilingual, much better than tiny
      3. Groq Whisper (online fallback)

    Fields:
      file / audio: audio blob (webm, mp4, wav, ogg, mp3)
      language:     app language code ("kn", "hi", "en", …)  — optional, defaults to "en"
    """
    upload = file or audio
    if upload is None:
        raise HTTPException(
            status_code=422,
            detail="Audio file required. Send a FormData field named 'file' or 'audio'.",
        )

    ct = (upload.content_type or "").lower().split(";")[0].strip()
    if ct not in _AUDIO_TYPES and not ct.startswith("audio/") and not ct.startswith("video/"):
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported file type: '{ct}'. Send an audio file (webm, mp4, wav, ogg, mp3).",
        )

    lang = (language or "en").strip().lower()[:5]   # normalise: "kn-IN" → keep as-is if already BCP-47

    try:
        result = await transcribe_audio(upload, language=lang)
        return TranscribeResponse(
            text=result.get("text", ""),
            duration=result.get("duration"),
            language=result.get("language"),
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Transcription failed: {str(e)}")
