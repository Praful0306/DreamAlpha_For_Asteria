import { useState, useRef, useCallback } from "react"
import { transcribe } from "@/lib/api"
import { useStore } from "@/store/useStore"

export type VoiceState =
  | "idle"
  | "recording"
  | "processing"
  | "loading_model"   // Whisper model downloading on first use (~30 s)
  | "done"
  | "error"

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
type BrowserSpeechRecognition = {
  lang: string
  continuous: boolean
  interimResults: boolean
  maxAlternatives: number
  onresult: ((ev: SpeechRecognitionEvent) => void) | null
  onerror: ((ev: { error: string }) => void) | null
  onend: (() => void) | null
  start: () => void
  stop: () => void
}

type BrowserSpeechRecognitionCtor = new () => BrowserSpeechRecognition

declare global {
  interface Window {
    SpeechRecognition?: BrowserSpeechRecognitionCtor
    webkitSpeechRecognition?: BrowserSpeechRecognitionCtor
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

// Wraps a promise with a hard deadline. Throws Error("TIMEOUT") if exceeded.
function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  let id: ReturnType<typeof setTimeout>
  const guard = new Promise<never>((_, reject) => {
    id = setTimeout(() => reject(new Error("TIMEOUT")), ms)
  })
  return Promise.race([p, guard]).finally(() => clearTimeout(id))
}

function shouldTryLocalWhisper(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err ?? "")
  const lower = msg.toLowerCase()
  return (
    lower.includes("failed to fetch") ||
    lower.includes("networkerror") ||
    lower.includes("net::err") ||
    lower.includes("backend") ||
    lower.includes("transcription failed") ||
    lower.includes("timeout") ||
    lower.includes("timed out")
  )
}

export function useVoice(onResult?: (text: string) => void) {
  const [state,         setState]         = useState<VoiceState>("idle")
  const [transcript,    setTranscript]    = useState("")
  const [error,         setError]         = useState<string | null>(null)
  const [modelProgress, setModelProgress] = useState(0)

  const mediaRecorder     = useRef<MediaRecorder | null>(null)
  const speechRec         = useRef<BrowserSpeechRecognition | null>(null)
  const chunks            = useRef<Blob[]>([])
  const actualMime        = useRef<string>("")
  const usingLocalWhisper = useRef(false)   // true when Web Speech fell offline → Whisper path

  const { lang } = useStore()

  // ── Shared: transcribe a blob with local Whisper ──────────────────────────
  const runWhisper = useCallback(async (blob: Blob) => {
    // Show "Loading Whisper AI…" right away — progress bar appears if downloading
    setState("loading_model")
    setModelProgress(0)

    try {
      // Dynamic import so a module-load failure surfaces as a catchable error
      const { transcribeLocally } = await import("@/lib/whisperLocal").catch(() => {
        throw new Error("LOAD_FAIL")
      })

      // Outer timeout: 15 s offline (fast-fail if model not cached),
      // 120 s online (allow initial model download ~40 MB).
      const timeoutMs = navigator.onLine ? 120_000 : 15_000

      const text = await withTimeout(
        transcribeLocally(blob, lang, (pct) => {
          setModelProgress(pct)
        }),
        timeoutMs,
      )

      const trimmed = text.trim()
      setTranscript(trimmed)
      if (trimmed) {
        setState("done")
        onResult?.(trimmed)
      } else {
        setError("No speech detected — please speak clearly and try again")
        setState("error")
      }
    } catch (err) {
      const msg = (err instanceof Error ? err.message : "") || ""

      if (msg === "TIMEOUT") {
        setError(
          navigator.onLine
            ? "Transcription timed out — please try again"
            : "Voice AI not ready offline — connect to internet once to download it, then it works offline forever",
        )
      } else if (msg === "LOAD_FAIL") {
        setError("Voice AI module failed to load — please type symptoms below")
      } else if (
        msg.toLowerCase().includes("fetch") ||
        msg.toLowerCase().includes("network") ||
        msg.toLowerCase().includes("failed to fetch")
      ) {
        setError("Voice AI needs internet for first-time download — please type symptoms below")
      } else {
        setError("Offline transcription failed — please type symptoms below")
      }
      setState("error")
    }
  }, [lang, onResult])

  // ── MediaRecorder + local Whisper (offline — no internet needed once cached) ─
  const startMediaRecorderWithWhisper = useCallback(async () => {
    try {
      const stream   = await navigator.mediaDevices.getUserMedia({ audio: true })
      const mimeType = getSupportedMimeType()
      const mr       = new MediaRecorder(stream, mimeType ? { mimeType } : undefined)
      mediaRecorder.current = mr
      actualMime.current    = mr.mimeType || mimeType || "audio/webm"
      chunks.current        = []

      mr.ondataavailable = (e) => { if (e.data.size > 0) chunks.current.push(e.data) }

      mr.onstop = async () => {
        stream.getTracks().forEach(t => t.stop())
        mediaRecorder.current = null

        const blobType = actualMime.current || "audio/webm"
        const blob     = new Blob(chunks.current, { type: blobType })

        if (blob.size < 100) {
          setError("Recording too short — please speak for at least 1 second")
          setState("error")
          return
        }

        try {
          const res = await transcribe(blob, lang)
          const text = res.text?.trim() ?? ""
          setTranscript(text)
          if (text && text !== "[no speech detected]") {
            setState("done")
            onResult?.(text)
          } else {
            setError("No speech detected - please speak clearly and try again")
            setState("error")
          }
        } catch (err) {
          if (navigator.onLine && shouldTryLocalWhisper(err)) {
            await runWhisper(blob)
          } else {
            const msg = err instanceof Error ? err.message : "Transcription failed"
            setError(
              msg === "Failed to fetch" || msg.toLowerCase().includes("network")
                ? "Local voice backend is not reachable - keep the backend running, then try again"
                : msg,
            )
            setState("error")
          }
        }
      }

      mr.start(250)
      // State stays "recording" — user sees "Recording… tap to stop" with no interruption
    } catch (err) {
      const msg =
        err instanceof Error &&
        (err.message.includes("Permission denied") || err.message.includes("NotAllowed"))
          ? "Microphone access denied — please allow it in browser settings"
          : "Microphone unavailable — please type your symptoms below"
      setError(msg)
      setState("error")
    }
  }, [lang, onResult, runWhisper])

  // ── Web Speech API path (primary — fast, works online) ───────────────────────
  const startWebSpeech = useCallback(() => {
    const SR  = window.SpeechRecognition ?? window.webkitSpeechRecognition
    if (!SR) {
      setError("Voice recognition unavailable — please type your symptoms below")
      setState("error")
      return
    }
    const rec = new SR()
    speechRec.current = rec

    rec.lang            = LANG_BCP47[lang] ?? "en-IN"
    rec.continuous      = false
    rec.interimResults  = false
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
      speechRec.current = null

      if (ev.error === "aborted") return   // Manual stop — onend will handle state

      // Offline / no-network errors → silently fall through to MediaRecorder + Whisper
      if (ev.error === "network" || ev.error === "service-not-allowed") {
        usingLocalWhisper.current = true
        // State stays "recording" — seamless handoff to MediaRecorder
        startMediaRecorderWithWhisper()
        return
      }

      const ERR_MSGS: Partial<Record<string, string>> = {
        "no-speech":              "No speech detected — please tap and speak clearly",
        "not-allowed":            "Microphone access denied — please allow it in browser settings",
        "language-not-supported": "This language isn't supported offline — switch to English or type below",
        "audio-capture":          "No microphone found — please type your symptoms below",
      }
      setError(ERR_MSGS[ev.error] ?? "Voice recognition failed — please type your symptoms below")
      setState("error")
    }

    rec.onend = () => {
      // If we switched to Whisper path, MediaRecorder owns state from here
      if (usingLocalWhisper.current) return
      setState((cur) => (cur === "recording" ? "processing" : cur))
    }

    rec.start()
  }, [lang, onResult, startMediaRecorderWithWhisper])

  // ── MediaRecorder + backend transcribe (fallback when no Web Speech API) ─────
  const startMediaRecorder = useCallback(async () => {
    try {
      const stream   = await navigator.mediaDevices.getUserMedia({ audio: true })
      const mimeType = getSupportedMimeType()
      const mr       = new MediaRecorder(stream, mimeType ? { mimeType } : undefined)
      mediaRecorder.current = mr
      actualMime.current    = mr.mimeType || mimeType || "audio/webm"

      mr.ondataavailable = (e) => { if (e.data.size > 0) chunks.current.push(e.data) }

      mr.onstop = async () => {
        stream.getTracks().forEach(t => t.stop())
        mediaRecorder.current = null
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
          // Backend unavailable or local ASR errored: try browser Whisper as last resort.
          if (navigator.onLine && shouldTryLocalWhisper(err)) {
            const localBlob = new Blob(chunks.current, { type: blobType })
            await runWhisper(localBlob)
          } else {
            const msg = err instanceof Error ? err.message : "Transcription failed"
            setError(
              msg === "Failed to fetch" || msg.toLowerCase().includes("network")
                ? "Local voice backend is not reachable — keep the backend running, then try again"
                : msg,
            )
            setState("error")
          }
        }
      }

      mr.start(250)
    } catch (err) {
      const msg =
        err instanceof Error &&
        (err.message.includes("Permission denied") || err.message.includes("NotAllowed"))
          ? "Microphone access denied — please allow microphone in browser settings"
          : "Mic access denied"
      setError(msg)
      setState("error")
    }
  }, [lang, onResult, runWhisper])

  // ── Public start ─────────────────────────────────────────────────────────────
  const start = useCallback(async () => {
    setError(null)
    setModelProgress(0)
    setState("recording")
    chunks.current            = []
    mediaRecorder.current     = null
    usingLocalWhisper.current = false

    if (!navigator.onLine) {
      await startMediaRecorder()
    } else if (hasWebSpeech()) {
      startWebSpeech()
    } else {
      await startMediaRecorder()
    }
  }, [startWebSpeech, startMediaRecorder])

  const stop = useCallback(() => {
    if (speechRec.current) {
      try { speechRec.current.stop() } catch { /**/ }
      speechRec.current = null
      if (!usingLocalWhisper.current) setState("processing")
      return
    }
    if (mediaRecorder.current?.state === "recording") {
      mediaRecorder.current.stop()
    }
  }, [])

  const reset = useCallback(() => {
    setState("idle")
    setTranscript("")
    setError(null)
    setModelProgress(0)
    usingLocalWhisper.current = false
    mediaRecorder.current     = null
  }, [])

  return { state, transcript, error, modelProgress, start, stop, reset }
}
