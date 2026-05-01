/**
 * browserTts — speak text using the browser's built-in SpeechSynthesis API.
 *
 * Works completely offline (no backend or network needed).
 * Automatically selects the best matching voice for the chosen language.
 */

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

function pickVoice(lang: string): SpeechSynthesisVoice | null {
  const voices = window.speechSynthesis.getVoices()
  const bcp47  = LANG_BCP47[lang] ?? "en-IN"
  return (
    voices.find(v => v.lang === bcp47)                   ||   // exact match
    voices.find(v => v.lang.startsWith(lang))            ||   // language prefix
    voices.find(v => v.lang.startsWith("en"))            ||   // English fallback
    null
  )
}

let currentAudio: HTMLAudioElement | null = null

function backendBase(): string {
  const configured = (import.meta.env.VITE_API_URL as string | undefined)?.trim()
  return configured && configured !== "/" ? configured.replace(/\/$/, "") : ""
}

function audioUrl(filePath: string): string {
  const normalized = filePath.replace(/\\/g, "/").replace(/^\/+/, "")
  const base = backendBase()
  return base ? `${base}/${normalized}` : `/${normalized}`
}

function backendTtsUrl(): string {
  const base = backendBase()
  return base ? `${base}/diagnose/tts` : "/api/diagnose/tts"
}


function speakWithBrowser(
  text: string,
  lang = "en",
  onEnd?: () => void,
): () => void {
  const synth = window.speechSynthesis
  if (!synth) { onEnd?.(); return () => {} }

  synth.cancel()

  const utter = new SpeechSynthesisUtterance(text)
  utter.lang  = LANG_BCP47[lang] ?? "en-IN"
  utter.rate  = 0.88
  utter.pitch = 1.0

  const assignVoice = () => {
    const v = pickVoice(lang)
    if (v) utter.voice = v
  }

  if (synth.getVoices().length > 0) {
    assignVoice()
  } else {
    synth.onvoiceschanged = () => { assignVoice(); synth.onvoiceschanged = null }
  }

  utter.onend   = () => onEnd?.()
  utter.onerror = () => onEnd?.()

  synth.speak(utter)

  return () => synth.cancel()
}

/**
 * Speak `text` aloud in the given language.
 * Uses backend TTS first so non-English output is translated before speech.
 * Falls back to the browser's offline SpeechSynthesis engine if unavailable.
 * Calls `onEnd` when done (or on error).
 * Returns a cancel function.
 */
export function speakText(
  text: string,
  lang     = "en",
  onEnd?: () => void,
): () => void {
  const controller = new AbortController()
  let cancelled = false
  let browserCancel: (() => void) | null = null

  currentAudio?.pause()
  currentAudio = null
  window.speechSynthesis?.cancel()

  // Check demo/offline mode synchronously to preserve user gesture context
  const isDemo = (() => {
    try {
      const raw = localStorage.getItem("sahayak-store")
      if (raw) {
        const store = JSON.parse(raw)
        return (store?.state?.token ?? store?.token) === "demo_token"
      }
    } catch {}
    return false
  })()

  if (isDemo || !backendBase()) {
    browserCancel = speakWithBrowser(text, lang, onEnd)
    return () => {
      cancelled = true
      browserCancel?.()
    }
  }

  ;(async () => {
    try {
      const res = await fetch(backendTtsUrl(), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, lang }),
        signal: controller.signal,
      })
      if (!res.ok) throw new Error(`TTS ${res.status}`)

      const data = await res.json() as { file_path?: string }
      if (!data.file_path) throw new Error("TTS response missing file path")

      if (cancelled) return
      const audio = new Audio(audioUrl(data.file_path))
      currentAudio = audio
      audio.onended = () => { if (currentAudio === audio) currentAudio = null; onEnd?.() }
      audio.onerror = () => {
        if (currentAudio === audio) currentAudio = null
        if (!cancelled) browserCancel = speakWithBrowser(text, lang, onEnd)
      }
      await audio.play()
    } catch {
      if (!cancelled) browserCancel = speakWithBrowser(text, lang, onEnd)
    }
  })()

  return () => {
    cancelled = true
    controller.abort()
    currentAudio?.pause()
    currentAudio = null
    browserCancel?.()
    window.speechSynthesis?.cancel()
  }
}

export function stopSpeaking() {
  currentAudio?.pause()
  currentAudio = null
  window.speechSynthesis?.cancel()
}
