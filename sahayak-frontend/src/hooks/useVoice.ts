import { useState, useRef, useCallback } from "react"
import { transcribe } from "@/lib/api"
import { useStore } from "@/store/useStore"

export type VoiceState = "idle" | "recording" | "processing" | "done" | "error"

// ── Language code → BCP-47 for Web Speech API ────────────────────────────────
const LANG_BCP47: Record<string, string> = {
  kn: "kn-IN",
  hi: "hi-IN",
  en: "en-IN",
  te: "te-IN",
  ta: "ta-IN",
  mr: "mr-IN",
  bn: "bn-IN",
  gu: "gu-IN",
  pa: "pa-IN",
}

// ── Web Speech API types ──────────────────────────────────────────────────────
declare global {
  interface Window {
    SpeechRecognition: typeof SpeechRecognition
    webkitSpeechRecognition: typeof SpeechRecognition
  }
}

function hasWebSpeech(): boolean {
  return typeof window !== "undefined" &&
    ("SpeechRecognition" in window || "webkitSpeechRecognition" in window)
}

function getSupportedMimeType(): string {
  const candidates = [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/mp4;codecs=mp4a",
    "audio/mp4",
    "audio/ogg;codecs=opus",
  ]
  for (const mt of candidates) {
    try { if (MediaRecorder.isTypeSupported(mt)) return mt } catch { /**/ }
  }
  return ""
}

export function useVoice(onResult?: (text: string) => void) {
  const [state,      setState]      = useState<VoiceState>("idle")
  const [transcript, setTranscript] = useState("")
  const [error,      setError]      = useState<string | null>(null)
  const mediaRecorder = useRef<MediaRecorder | null>(null)
  const speechRec     = useRef<SpeechRecognition | null>(null)
  const chunks        = useRef<Blob[]>([])
  const actualMime    = useRef<string>("")
  const { lang }      = useStore()

  // ── Web Speech API path (primary — no backend needed) ───────────────────────
  const startWebSpeech = useCallback(() => {
    const SR = window.SpeechRecognition ?? window.webkitSpeechRecognition
    const rec = new SR()
    speechRec.current = rec

    rec.lang = LANG_BCP47[lang] ?? "en-IN"
    rec.continuous = false
    rec.interimResults = false
    rec.maxAlternatives = 1

    rec.onresult = (ev) => {
      const text = ev.results[0]?.[0]?.transcript?.trim() ?? ""
      setTranscript(text)
      if (text) {
        setState("done")
        onResult?.(text)
      } else {
        setError("No speech detected — please speak clearly and try again")
        setState("error")
      }
    }

    rec.onerror = (ev) => {
      // Clear the ref immediately so stop() / onend don't race against us
      speechRec.current = null

      if (ev.error === "aborted") {
        // Triggered by rec.stop() being called manually — not a real error.
        // onend will fire right after; let it handle the state transition.
        return
      }

      const ERR_MSGS: Partial<Record<string, string>> = {
        "no-speech":              "No speech detected — please tap and speak clearly",
        "not-allowed":            "Microphone access denied — please allow it in browser settings",
        "network":                "Voice needs internet — please type your symptoms below instead",
        "language-not-supported": "This language isn't supported offline — switch to English or type below",
        "service-not-allowed":    "Voice service unavailable — please type your symptoms below",
        "audio-capture":          "No microphone found — please type your symptoms below",
      }
      setError(ERR_MSGS[ev.error] ?? "Voice recognition failed — please type your symptoms below")
      setState("error")
    }

    rec.onend = () => {
      // Only advance to "processing" if we're still in "recording" state —
      // i.e. recognition ended naturally without an error result yet.
      // onerror already transitions to "error" or "done", so this is a no-op
      // in those cases, which is exactly what we want.
      setState((cur) => cur === "recording" ? "processing" : cur)
    }

    rec.start()
  }, [lang, onResult])

  // ── MediaRecorder + backend path (fallback) ──────────────────────────────────
  const startMediaRecorder = useCallback(async () => {
    try {
      const stream   = await navigator.mediaDevices.getUserMedia({ audio: true })
      const mimeType = getSupportedMimeType()
      const mr       = new MediaRecorder(stream, mimeType ? { mimeType } : undefined)
      mediaRecorder.current = mr
      actualMime.current    = mr.mimeType || mimeType || "audio/webm"

      mr.ondataavailable = (e) => { if (e.data.size > 0) chunks.current.push(e.data) }

      mr.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop())
        setState("processing")

        const blobType = actualMime.current || "audio/webm"
        const blob     = new Blob(chunks.current, { type: blobType })

        if (blob.size < 100) {
          setError("Recording too short — please speak for at least 1 second")
          setState("error")
          return
        }

        try {
          const res  = await transcribe(blob, lang)
          const text = res.text?.trim() ?? ""
          setTranscript(text)
          if (text && text !== "[no speech detected]") {
            setState("done")
            onResult?.(text)
          } else {
            setError("No speech detected — please speak clearly and try again")
            setState("error")
          }
        } catch (err) {
          const msg = err instanceof Error ? err.message : "Transcription failed"
          // Network errors → friendlier message
          const friendly = (msg === "Failed to fetch" || msg.toLowerCase().includes("network"))
            ? "Backend is starting up — please wait a moment and try again, or type symptoms below"
            : msg
          setError(friendly)
          setState("error")
        }
      }

      mr.start(250)
    } catch (err) {
      const msg = err instanceof Error
        ? err.message.includes("Permission denied") || err.message.includes("NotAllowed")
          ? "Microphone access denied — please allow microphone in browser settings"
          : err.message
        : "Mic access denied"
      setError(msg)
      setState("error")
    }
  }, [lang, onResult])

  // ── Public start: Web Speech first, MediaRecorder fallback ──────────────────
  const start = useCallback(async () => {
    setError(null)
    setState("recording")
    chunks.current = []

    if (hasWebSpeech()) {
      startWebSpeech()
    } else {
      await startMediaRecorder()
    }
  }, [startWebSpeech, startMediaRecorder])

  const stop = useCallback(() => {
    // Stop Web Speech API recognition
    if (speechRec.current) {
      try { speechRec.current.stop() } catch { /**/ }
      speechRec.current = null
      setState("processing")
      return
    }
    // Stop MediaRecorder
    if (mediaRecorder.current?.state === "recording") {
      mediaRecorder.current.stop()
    }
  }, [])

  const reset = useCallback(() => {
    setState("idle")
    setTranscript("")
    setError(null)
  }, [])

  return { state, transcript, error, start, stop, reset }
}
