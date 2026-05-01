/**
 * whisperLocal — offline voice-to-text using Whisper running in the browser
 *
 * Uses @huggingface/transformers (v4) to run onnx-community/whisper-tiny
 * entirely in-browser via WebGPU (AMD NPU) or WASM fallback.
 *
 * First call downloads ~40 MB and caches it in browser IndexedDB.
 * All subsequent calls (including offline) are instant from cache.
 *
 * Supports all Indian languages: kn, hi, te, ta, mr, bn, gu, pa, en
 */

import { pipeline, env } from "@huggingface/transformers"

// Store model in browser cache (IndexedDB) so it works offline after first load
env.allowLocalModels  = false
env.useBrowserCache   = true
env.allowRemoteModels = true   // needed on first load to download the model

const MODEL_ID   = "onnx-community/whisper-tiny"
const MODEL_OPTS = { dtype: "q8" }   // 8-bit quantised — smaller & faster

// Per-device timeouts: WebGPU init on AMD NPU can be slow; WASM also needs time
const WEBGPU_TIMEOUT_MS = 20_000   // 20 s to initialise WebGPU pipeline
const WASM_TIMEOUT_MS   = 40_000   // 40 s for WASM (model may still be downloading)

// Singleton promise so concurrent calls don't double-download
let _pipelinePromise: Promise<Awaited<ReturnType<typeof pipeline>>> | null = null

function raceTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    p,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`${label} timed out after ${ms / 1000}s`)), ms),
    ),
  ])
}

export async function getWhisperPipeline(
  onProgress?: (pct: number) => void,
): Promise<Awaited<ReturnType<typeof pipeline>>> {
  if (_pipelinePromise) return _pipelinePromise

  _pipelinePromise = (async () => {
    const progress_callback = (info: unknown) => {
      const i = info as { status?: string; loaded?: number; total?: number }
      if (i.status === "progress" && i.total && onProgress) {
        onProgress(Math.round(((i.loaded ?? 0) / i.total) * 100))
      }
    }

    // Try WebGPU first (AMD NPU / dGPU — fast), with a hard timeout
    try {
      return await raceTimeout(
        pipeline("automatic-speech-recognition", MODEL_ID, {
          ...(MODEL_OPTS as object),
          device: "webgpu",
          progress_callback,
        }),
        WEBGPU_TIMEOUT_MS,
        "WebGPU pipeline",
      )
    } catch {
      /* WebGPU unavailable or timed out — fall back to WASM CPU */
    }

    // Reset progress for WASM attempt
    onProgress?.(0)

    return await raceTimeout(
      pipeline("automatic-speech-recognition", MODEL_ID, {
        ...(MODEL_OPTS as object),
        device: "wasm",
        progress_callback,
      }),
      WASM_TIMEOUT_MS,
      "WASM pipeline",
    )
  })()

  // Don't cache a failed promise — next call should retry
  _pipelinePromise.catch(() => { _pipelinePromise = null })

  return _pipelinePromise
}

// BCP-47 language code → Whisper language name
const LANG_WHISPER: Record<string, string> = {
  kn: "kannada",
  hi: "hindi",
  en: "english",
  te: "telugu",
  ta: "tamil",
  mr: "marathi",
  bn: "bengali",
  gu: "gujarati",
  pa: "punjabi",
}

/**
 * Transcribe an audio Blob using local Whisper.
 * Accepts any format that the browser's AudioContext can decode (webm, mp4, ogg…).
 *
 * @param audioBlob  - Recorded audio blob from MediaRecorder
 * @param lang       - BCP-47 language code (kn, hi, en, …)
 * @param onProgress - Called with 0-100 during model download (first use only)
 */
export async function transcribeLocally(
  audioBlob: Blob,
  lang      = "en",
  onProgress?: (pct: number) => void,
): Promise<string> {
  // ── 1. Decode audio → Float32Array at 16 kHz (Whisper's expected sample rate)
  const arrayBuffer = await audioBlob.arrayBuffer()
  const audioCtx    = new AudioContext({ sampleRate: 16_000 })
  let decoded: AudioBuffer
  try {
    decoded = await audioCtx.decodeAudioData(arrayBuffer)
  } finally {
    await audioCtx.close()
  }

  // Mix down to mono
  const mono = new Float32Array(decoded.length)
  for (let c = 0; c < decoded.numberOfChannels; c++) {
    const ch = decoded.getChannelData(c)
    for (let i = 0; i < mono.length; i++) mono[i] += ch[i]
  }
  if (decoded.numberOfChannels > 1) {
    for (let i = 0; i < mono.length; i++) mono[i] /= decoded.numberOfChannels
  }

  // ── 2. Load model (cached after first download) and transcribe
  const pipe   = await getWhisperPipeline(onProgress)
  const result = await (pipe as (audio: Float32Array, opts: object) => Promise<unknown>)(mono, {
    language: LANG_WHISPER[lang] ?? "english",
    task:     "transcribe",
  })

  const text = Array.isArray(result)
    ? ((result[0] as { text?: string })?.text ?? "")
    : ((result as { text?: string })?.text ?? "")

  return text.trim()
}
