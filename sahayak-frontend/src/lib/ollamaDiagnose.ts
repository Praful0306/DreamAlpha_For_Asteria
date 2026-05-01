/**
 * ollamaDiagnose — local AI diagnosis via Ollama (offline / backend-down mode)
 *
 * Uses the Ollama API at http://localhost:11434 to run a local LLM for
 * clinical diagnosis when the Render backend is sleeping or unavailable.
 *
 * Model priority (auto-detected from installed models):
 *   1. gemma4:e2b     — fast 5.1B Gemma 4 (AMD NPU-accelerated)
 *   2. gemma3:4b      — small Gemma 3
 *   3. deepseek-r1    — reasoning model
 *   4. any other installed model
 *
 * Falls back to localDiagnose() (rule-based) if Ollama is not running.
 */

import type { DiagnosisResult } from "@/lib/api"

const OLLAMA_BASE = "http://localhost:11434"

// Language code → full name for LLM prompt
const LANG_NAMES: Record<string, string> = {
  kn: "Kannada (ಕನ್ನಡ)",
  hi: "Hindi (हिंदी)",
  en: "English",
  te: "Telugu (తెలుగు)",
  ta: "Tamil (தமிழ்)",
  mr: "Marathi (मराठी)",
  bn: "Bengali (বাংলা)",
  gu: "Gujarati (ગુજરાતી)",
  pa: "Punjabi (ਪੰਜਾਬੀ)",
}

// Preference order for model selection (first match wins)
// Small models first so they work on limited-RAM systems
const MODEL_PRIORITY = [
  "deepseek-r1:1.5b",
  "deepseek-r1",
  "gemma3:1b",
  "gemma3:4b",
  "gemma2:2b",
  "qwen2.5-coder:7b",
  "qwen2.5",
  "gemma4:e2b",
  "gemma4",
  "gemma3:12b",
  "gemma3:27b",
  "gemma2:9b",
  "llama3.2",
  "mistral",
]

// In-memory cache so we don't re-ping Ollama on every call
let _cachedModel: string | null = null
let _ollamaChecked = false
let _ollamaAvailable = false
let _failedModels: Set<string> = new Set()   // models that returned OOM

/** Returns true if Ollama is running on this machine. Result is cached. */
export async function isOllamaAvailable(): Promise<boolean> {
  if (_ollamaChecked) return _ollamaAvailable
  try {
    const ctrl = new AbortController()
    const t = setTimeout(() => ctrl.abort(), 2500)
    const resp = await fetch(`${OLLAMA_BASE}/api/tags`, { signal: ctrl.signal })
    clearTimeout(t)
    _ollamaAvailable = resp.ok
  } catch {
    _ollamaAvailable = false
  }
  _ollamaChecked = true
  return _ollamaAvailable
}

/** Auto-detect the best installed model. Returns model name string. */
async function resolveModel(): Promise<string> {
  if (_cachedModel) return _cachedModel

  try {
    const ctrl = new AbortController()
    const t = setTimeout(() => ctrl.abort(), 2500)
    const resp = await fetch(`${OLLAMA_BASE}/api/tags`, { signal: ctrl.signal })
    clearTimeout(t)

    if (resp.ok) {
      const json = await resp.json()
      const installed: string[] = (json.models ?? []).map((m: { name: string }) => m.name)

      // Pick highest-priority model that is installed AND hasn't failed with OOM
      for (const prefix of MODEL_PRIORITY) {
        const match = installed.find(n => n === prefix || n.startsWith(prefix.split(":")[0] + ":"))
        if (match && !_failedModels.has(match)) {
          _cachedModel = match
          return _cachedModel
        }
      }
      // Fallback: use whatever is installed first (even if it failed before)
      if (installed.length > 0) {
        _cachedModel = installed[0]
        return _cachedModel
      }
    }
  } catch { /**/ }

  _cachedModel = "deepseek-r1:1.5b"   // small model that fits in RAM
  return _cachedModel
}

/** Mark a model as failed (OOM) and clear cache so next call picks a smaller model */
function markModelFailed(model: string) {
  _failedModels.add(model)
  _cachedModel = null   // force re-resolve next call
}

/** Call Ollama to diagnose symptoms. Throws if Ollama is unavailable or times out. */
export async function ollamaDiagnose(
  symptoms: string,
  vitals = "",
  lang   = "en",
): Promise<DiagnosisResult & { _model?: string }> {
  const model    = await resolveModel()
  const langName = LANG_NAMES[lang] ?? "English"

  const systemPrompt =
    "You are Sahayak AI, a clinical decision support assistant for ASHA health workers in rural India. " +
    "You follow ICMR, WHO, and NVBDCP clinical guidelines. " +
    `IMPORTANT: Write the clinical_summary, recommendations, medications_suggested, warning_signs, community_alert, and action_items fields entirely in ${langName}. ` +
    "Disease names and medication names may remain in English for medical clarity. " +
    "Always respond with valid JSON only — no markdown, no explanation, no extra text."

  const userPrompt =
    `Patient symptoms: ${symptoms}` +
    (vitals ? `\nVitals: ${vitals}` : "") +
    `\n\nProvide a clinical diagnosis as valid JSON using EXACTLY this structure:
{
  "disease_name": "Primary suspected condition",
  "diagnosis": "Clinical diagnosis description",
  "risk_level": "LOW",
  "confidence_pct": 72,
  "clinical_summary": "2-3 sentence clinical assessment for the ASHA worker",
  "recommendations": ["Specific action 1", "Specific action 2", "Specific action 3"],
  "medications_suggested": ["Medicine name dose frequency"],
  "warning_signs": ["Red flag symptom 1", "Red flag symptom 2"],
  "followup_days": 3,
  "sources": ["ICMR Clinical Guidelines"],
  "community_alert": null,
  "action_items": ["Immediate action 1", "Immediate action 2"]
}
Use risk_level: LOW, MEDIUM, HIGH, or EMERGENCY only.`

  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), 50_000)   // 50s max — Gemma 4 5B is fast on NPU

  try {
    const resp = await fetch(`${OLLAMA_BASE}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user",   content: userPrompt   },
        ],
        stream:  false,
        format:  "json",                               // forces JSON output
        options: { temperature: 0.1, num_predict: 1200 },
      }),
      signal: ctrl.signal,
    })

    if (!resp.ok) {
      const body = await resp.text().catch(() => "")
      // If OOM error, mark this model as failed and retry with a smaller one
      if (resp.status === 500 && body.includes("requires more")) {
        markModelFailed(model)
        return ollamaDiagnose(symptoms, vitals, lang)
      }
      throw new Error(`Ollama HTTP ${resp.status}: ${body.slice(0, 120)}`)
    }

    const data = await resp.json()
    const raw: string = data.message?.content ?? data.response ?? ""

    // Strip accidental markdown code fences
    const jsonStr = raw.replace(/^```(?:json)?\n?|\n?```$/gm, "").trim()
    const parsed  = JSON.parse(jsonStr) as Record<string, unknown>

    const arr = (v: unknown): string[] =>
      Array.isArray(v) ? (v as string[]) : []
    const num = (v: unknown, fb: number): number =>
      typeof v === "number" ? v : fb

    const result: DiagnosisResult & { _model?: string } = {
      disease_name:          String(parsed.disease_name          ?? "Diagnosis"),
      diagnosis:             String(parsed.diagnosis             ?? parsed.disease_name ?? "See summary"),
      risk_level:            String(parsed.risk_level            ?? "MEDIUM"),
      confidence_pct:        num(parsed.confidence_pct, 70),
      clinical_summary:      String(parsed.clinical_summary      ?? ""),
      recommendations:       arr(parsed.recommendations),
      medications_suggested: arr(parsed.medications_suggested),
      warning_signs:         arr(parsed.warning_signs),
      followup_days:         num(parsed.followup_days, 3),
      sources:               arr(parsed.sources),
      community_alert:       (parsed.community_alert as string | null) ?? null,
      action_items:          arr(parsed.action_items),
      _model:                model,    // surface model name in UI
    }

    if (lang !== "en") {
      return await translateDiagnosisResult(result, model, langName)
    }

    return result
  } finally {
    clearTimeout(timer)
  }
}

async function translateDiagnosisResult(
  result: DiagnosisResult & { _model?: string },
  model: string,
  langName: string,
): Promise<DiagnosisResult & { _model?: string }> {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), 45_000)

  try {
    const resp = await fetch(`${OLLAMA_BASE}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        messages: [
          {
            role: "system",
            content:
              `Translate this clinical JSON into ${langName}. ` +
              "Keep JSON keys unchanged. Keep risk_level, confidence_pct, followup_days, and _model unchanged. " +
              "Translate disease_name, diagnosis, clinical_summary, recommendations, medications_suggested, warning_signs, community_alert, and action_items. " +
              "Medication names such as Paracetamol, ORS, Dolor, and numeric doses may stay as-is. Return valid JSON only.",
          },
          { role: "user", content: JSON.stringify(result) },
        ],
        stream: false,
        format: "json",
        options: { temperature: 0, num_predict: 1600 },
      }),
      signal: ctrl.signal,
    })

    if (!resp.ok) return result
    const data = await resp.json()
    const raw: string = data.message?.content ?? data.response ?? ""
    const parsed = JSON.parse(raw.replace(/^```(?:json)?\n?|\n?```$/gm, "").trim()) as Partial<DiagnosisResult> & { _model?: string }

    return {
      ...result,
      ...parsed,
      risk_level:     result.risk_level,
      confidence_pct: result.confidence_pct,
      followup_days:  result.followup_days,
      _model:         result._model,
    }
  } catch {
    return result
  } finally {
    clearTimeout(timer)
  }
}

/** Local AI chat via Ollama (offline / demo mode) */
export async function ollamaChat(
  messages: { role: "user" | "assistant" | "system"; content: string }[],
  role: string,
  lang = "en",
): Promise<{ response: string; _model: string }> {
  const model = await resolveModel()
  const langName = LANG_NAMES[lang] ?? "English"

  let systemPrompt = ""
  if (role === "patient") {
    systemPrompt = `You are Sahayak AI, a helpful health assistant for a patient in rural India. You answer health-related questions accurately but simply. Always respond in ${langName}. Keep answers concise and strictly avoid diagnosing. Advise them to see a doctor or ASHA worker if symptoms are serious.`
  } else if (role === "asha") {
    systemPrompt = `You are Sahayak AI, a clinical decision support assistant for ASHA health workers. You follow ICMR, WHO, and NVBDCP guidelines. Always respond in ${langName}. Keep answers concise, actionable, and structured.`
  } else {
    systemPrompt = `You are Sahayak AI, a medical assistant for doctors. Provide technical, evidence-based medical information. Always respond in ${langName}.`
  }

  const payloadMessages = [
    { role: "system", content: systemPrompt },
    ...messages,
  ]

  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), 60_000)

  try {
    const resp = await fetch(`${OLLAMA_BASE}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        messages: payloadMessages,
        stream: false,
        options: { temperature: 0.3, num_predict: 800 },
      }),
      signal: ctrl.signal,
    })

    if (!resp.ok) {
      const body = await resp.text().catch(() => "")
      // If OOM error, mark this model as failed and retry with a smaller one
      if (resp.status === 500 && body.includes("requires more")) {
        markModelFailed(model)
        return ollamaChat(messages, role, lang)
      }
      throw new Error(`Ollama HTTP ${resp.status}: ${body.slice(0, 120)}`)
    }

    const data = await resp.json()
    const raw: string = data.message?.content ?? data.response ?? "No response"
    return { response: raw.trim(), _model: model }
  } finally {
    clearTimeout(timer)
  }
}

/** Public alias for resolveModel — used by WatchSync and other components */
export const resolveOllamaModel = resolveModel
