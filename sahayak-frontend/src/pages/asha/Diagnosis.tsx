import { useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { toast } from "sonner"
import { Send, Volume2, RotateCcw, UserSearch, Download } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Label } from "@/components/ui/label"
import { Separator } from "@/components/ui/separator"
import { RiskBadge } from "@/components/shared/RiskBadge"
import { DiagPipeline, type PipelineStep } from "@/components/shared/DiagPipeline"
import { VoiceButton } from "@/components/shared/VoiceButton"
import { diagnose, getMyPatients, generateReferral, saveReport, type Patient, type DiagnosisResult } from "@/lib/api"
import { speakText, stopSpeaking } from "@/lib/browserTts"
import { localDiagnose } from "@/lib/localDiagnose"
import { ollamaDiagnose } from "@/lib/ollamaDiagnose"
import { useStore } from "@/store/useStore"
import { useEffect } from "react"
import { AlertCircle, CheckCircle2, Pill, Clock, Users, FileOutput, Cpu } from "lucide-react"
import { isDemoMode, demoGet } from "@/lib/demoStore"

const LANG_OPTIONS = [
  { value: "kn", label: "ಕನ್ನಡ (Kannada)" },
  { value: "en", label: "English" },
  { value: "hi", label: "हिंदी (Hindi)" },
  { value: "te", label: "తెలుగు (Telugu)" },
  { value: "ta", label: "தமிழ் (Tamil)" },
  { value: "mr", label: "मराठी (Marathi)" },
  { value: "bn", label: "বাংলা (Bengali)" },
  { value: "gu", label: "ગુજરાતી (Gujarati)" },
  { value: "pa", label: "ਪੰਜਾਬੀ (Punjabi)" },
]

const RESULT_LABELS = {
  en: {
    summary: "Clinical Summary",
    actions: "Action Steps",
    medications: "Medications",
    redFlags: "Red Flags - Refer Immediately If Present",
    community: "Community Alert:",
    speak: "Speak",
    speaking: "Speaking...",
    saveReport: "Save Report",
  },
  kn: {
    summary: "ವೈದ್ಯಕೀಯ ಸಾರಾಂಶ",
    actions: "ಕ್ರಮಗಳು",
    medications: "ಔಷಧಿಗಳು",
    redFlags: "ಅಪಾಯದ ಲಕ್ಷಣಗಳು - ಕಂಡರೆ ತಕ್ಷಣ ರೆಫರ್ ಮಾಡಿ",
    community: "ಸಮುದಾಯ ಎಚ್ಚರಿಕೆ:",
    speak: "ಕೆಳಿ",
    speaking: "ಮಾತನಾಡುತ್ತಿದೆ...",
    saveReport: "ವರದಿ ಉಳಿಸಿ",
  },
} as const

export default function AshaDiagnosis() {
  const { user, lang, setLang } = useStore()
  const [patients,  setPatients]  = useState<Patient[]>([])
  const [patientId, setPatientId] = useState<string>("")
  const [symptoms,  setSymptoms]  = useState("")
  const [vitals,    setVitals]    = useState("")
  const [step,       setStep]       = useState<PipelineStep>("idle")
  const [result,     setResult]     = useState<DiagnosisResult | null>(null)
  const [speaking,   setSpeaking]   = useState(false)
  const [referring,  setReferring]  = useState(false)
  const [localModel, setLocalModel] = useState<string | null>(null)   // set when Ollama is used

  useEffect(() => {
    if (isDemoMode()) {
      // Demo mode: load patients from localStorage (seeded by seedDemoData)
      setPatients(demoGet<Patient[]>("asha_patients", []))
    } else {
      getMyPatients().then(setPatients).catch(() => {})
    }
  }, [])

  const selectedPatient = patients.find(p => p.id.toString() === patientId)
  const labels = RESULT_LABELS[lang as keyof typeof RESULT_LABELS] ?? RESULT_LABELS.en

  async function handleDiagnose() {
    if (!symptoms.trim()) { toast.error("Describe the patient's symptoms"); return }
    setStep("listen")
    setResult(null)
    try {
      setStep("transcribe"); await new Promise(r => setTimeout(r, 300))
      setStep("rag");        await new Promise(r => setTimeout(r, 300))
      setStep("analyze")

      let res: DiagnosisResult
      setLocalModel(null)

      if (isDemoMode()) {
        // Demo mode: Ollama (local NPU) → rule-based fallback
        res = await _runLocalAI(symptoms, vitals, lang, setLocalModel)
      } else {
        try {
          res = await diagnose({
            symptoms,
            patient_id: patientId ? parseInt(patientId) : undefined,
            patient_name: selectedPatient?.name ?? user?.name,
            vitals: vitals || undefined,
            lang,
          })
        } catch (err) {
          // Backend offline / Render sleeping → Ollama → rule-based
          const msg = err instanceof Error ? err.message : ""
          const isOffline = msg.includes("Failed to fetch") || msg.includes("NetworkError") ||
            msg.includes("net::ERR") || msg.includes("timed out") || msg.includes("Backend is starting")
          if (isOffline) {
            toast.warning("Backend offline — switching to local AI (AMD NPU)", { duration: 4000 })
            res = await _runLocalAI(symptoms, vitals, lang, setLocalModel)
          } else {
            throw err
          }
        }
      }

      setStep("clinical"); await new Promise(r => setTimeout(r, 200))
      setStep("result")
      setResult(res)
      if (res.risk_level === "EMERGENCY" || res.risk_level === "HIGH") {
        toast.error(`⚠️ ${res.risk_level} RISK — Consider immediate referral`, { duration: 6000 })
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Diagnosis failed")
      setStep("idle")
    }
  }

  function handleSpeak() {
    if (!result?.clinical_summary) return
    if (speaking) { stopSpeaking(); setSpeaking(false); return }
    setSpeaking(true)
    speakText(result.clinical_summary, lang, () => setSpeaking(false))
  }

  async function handleReferral() {
    if (!result?.diagnosis || !patientId) { toast.error("Select a patient first"); return }
    setReferring(true)
    try {
      const ref = await generateReferral({
        patient_id: parseInt(patientId),
        diagnosis:  result.diagnosis ?? result.disease_name ?? "Unknown",
        urgency:    result.risk_level,
        notes:      result.clinical_summary ?? "",
      })
      toast.success(`Referral generated! ID: ${ref.referral_id}`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Referral failed")
    } finally {
      setReferring(false)
    }
  }

  async function handleSaveReport() {
    if (!result) { toast.error("Run diagnosis first"); return }

    let saved = false
    if (patientId) {
      try {
        await saveReport({
          patient_id: parseInt(patientId),
          symptoms,
          notes: vitals || undefined,
          diagnosis: result.diagnosis ?? result.disease_name ?? "Diagnosis",
          medications: result.medications_suggested?.join("; ") ?? undefined,
          risk_level: result.risk_level,
          report_title: result.disease_name ?? result.diagnosis ?? "AI Diagnosis",
          report_type: "AI Diagnosis",
          is_ai_extracted: 1,
        })
        saved = true
      } catch (err) {
        toast.warning(err instanceof Error ? `Database save failed: ${err.message}` : "Database save failed")
      }
    }

    downloadDiagnosisReport({
      result,
      symptoms,
      vitals,
      lang,
      patientName: selectedPatient?.name ?? user?.name ?? "Patient",
      model: localModel,
    })
    toast.success(saved ? "Report saved and downloaded" : "Report downloaded")
  }

  const isLoading = step !== "idle" && step !== "result"

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-white">AI Diagnosis</h2>
        <p className="text-gray-500 mt-0.5">Voice-first diagnosis with ICMR clinical validation</p>
      </div>

      <Card className="bg-[#1a1a22] border-[#2a2a35]">
        <CardContent className="p-6 space-y-5">
          {/* Patient + language selectors */}
          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <Label className="text-gray-400 text-xs mb-1.5 block">Patient (optional)</Label>
              <Select value={patientId} onValueChange={setPatientId}>
                <SelectTrigger className="bg-white/5 border-white/10 text-white h-10">
                  <SelectValue placeholder="Select patient…" />
                </SelectTrigger>
                <SelectContent className="bg-[#1a1a22] border-[#2a2a35]">
                  {patients.map(p => (
                    <SelectItem key={p.id} value={p.id.toString()} className="text-white focus:bg-white/10">
                      {p.name} · {p.age}y
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-gray-400 text-xs mb-1.5 block">Language / ಭಾಷೆ / भाषा</Label>
              <Select value={lang} onValueChange={setLang}>
                <SelectTrigger className="bg-white/5 border-white/10 text-white h-10">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-[#1a1a22] border-[#2a2a35]">
                  {LANG_OPTIONS.map(l => <SelectItem key={l.value} value={l.value} className="text-white focus:bg-white/10">{l.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Voice button */}
          <div className="flex justify-center">
            <VoiceButton onResult={(text) => setSymptoms(s => s ? s + " " + text : text)} />
          </div>

          <Textarea
            value={symptoms}
            onChange={(e) => setSymptoms(e.target.value)}
            placeholder="Describe symptoms… e.g. 'Bukhar 3 din se hai, sir dard, body pain, haath pair mein dard'"
            className="bg-white/5 border-white/10 text-white placeholder:text-gray-600 min-h-[100px] resize-none"
            disabled={isLoading}
          />

          <Textarea
            value={vitals}
            onChange={(e) => setVitals(e.target.value)}
            placeholder="Vitals (optional): BP 130/85, Temp 38.5°C, SpO2 96%, HR 88…"
            className="bg-white/5 border-white/10 text-white placeholder:text-gray-600 min-h-[60px] resize-none text-sm"
            disabled={isLoading}
          />

          <div className="flex gap-3">
            <Button
              className="flex-1 h-11 bg-brand-600 hover:bg-brand-700 text-white font-semibold gap-2"
              onClick={handleDiagnose}
              disabled={isLoading || !symptoms.trim()}
            >
              <Send className="w-4 h-4" />
              {isLoading ? "Analysing…" : "Diagnose"}
            </Button>
            {result && (
              <Button variant="outline" className="border-white/10 text-gray-400 hover:text-white" onClick={() => { setResult(null); setStep("idle") }}>
                <RotateCcw className="w-4 h-4" />
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {step !== "idle" && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
          <DiagPipeline currentStep={step} />
        </motion.div>
      )}

      <AnimatePresence>
        {result && (
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
            <Card className={`bg-[#1a1a22] border-[#2a2a35] ${result.risk_level === "EMERGENCY" ? "border-red-500/40" : result.risk_level === "HIGH" ? "border-orange-500/30" : ""}`}>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between flex-wrap gap-3">
                  <CardTitle className="text-lg font-bold text-white">
                    {result.disease_name ?? result.diagnosis ?? "Diagnosis"}
                  </CardTitle>
                  <div className="flex items-center gap-2 flex-wrap">
                    <RiskBadge level={result.risk_level} />
                    {result.confidence_pct != null && (
                      <span className="text-xs text-gray-500 bg-white/5 px-2 py-0.5 rounded-full border border-white/10">
                        {result.confidence_pct}% confidence
                      </span>
                    )}
                    {localModel && (
                      <span className="text-xs text-purple-300 bg-purple-500/10 border border-purple-500/25 px-2 py-0.5 rounded-full flex items-center gap-1">
                        <Cpu className="w-3 h-3" /> AMD NPU · {localModel}
                      </span>
                    )}
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-5">
                {result.clinical_summary && (
                  <div className="bg-white/[0.03] rounded-xl p-4 border border-white/8">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">{labels.summary}</span>
                      <Button variant="ghost" size="sm" className="h-7 text-xs gap-1.5 text-gray-500 hover:text-white" onClick={handleSpeak} disabled={speaking}>
                        <Volume2 className={`w-3 h-3 ${speaking ? "text-brand-400 animate-pulse" : ""}`} />
                        {speaking ? labels.speaking : labels.speak}
                      </Button>
                    </div>
                    <p className="text-sm text-gray-300 leading-relaxed">{result.clinical_summary}</p>
                  </div>
                )}

                <div className="grid sm:grid-cols-2 gap-4">
                  {result.recommendations?.length ? (
                    <div>
                      <div className="flex items-center gap-1.5 mb-2">
                        <CheckCircle2 className="w-4 h-4 text-green-500" />
                        <span className="text-sm font-semibold text-white">{labels.actions}</span>
                      </div>
                      <ul className="space-y-1.5">
                        {result.recommendations.map((r, i) => (
                          <li key={i} className="text-sm text-gray-400 flex gap-2">
                            <span className="text-green-500 shrink-0">•</span>{r}
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}

                  {result.medications_suggested?.length ? (
                    <div>
                      <div className="flex items-center gap-1.5 mb-2">
                        <Pill className="w-4 h-4 text-blue-400" />
                        <span className="text-sm font-semibold text-white">{labels.medications}</span>
                      </div>
                      <ul className="space-y-1.5">
                        {result.medications_suggested.map((m, i) => (
                          <li key={i} className="text-sm text-gray-400 flex gap-2">
                            <span className="text-blue-400 shrink-0">•</span>{m}
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                </div>

                {result.warning_signs?.length ? (
                  <div className="bg-red-500/10 rounded-xl p-4 border border-red-500/20">
                    <div className="flex items-center gap-1.5 mb-2">
                      <AlertCircle className="w-4 h-4 text-red-400" />
                      <span className="text-sm font-semibold text-red-300">{labels.redFlags}</span>
                    </div>
                    <ul className="space-y-1">
                      {result.warning_signs.map((w, i) => (
                        <li key={i} className="text-sm text-red-300/80 flex gap-2">
                          <span className="shrink-0">⚠</span>{w}
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}

                {result.community_alert && (
                  <div className="bg-orange-500/10 rounded-xl p-3 border border-orange-500/20">
                    <div className="flex items-center gap-2 text-sm text-orange-300">
                      <Users className="w-4 h-4 shrink-0" />
                      <strong>{labels.community}</strong> {result.community_alert}
                    </div>
                  </div>
                )}

                <Separator className="bg-white/5" />

                <div className="flex flex-wrap gap-3">
                  {patientId && (
                    <Button
                      variant="outline"
                      className="gap-2 border-red-500/30 text-red-400 hover:bg-red-500/10"
                      onClick={handleReferral}
                      disabled={referring}
                    >
                      <FileOutput className="w-4 h-4" />
                      {referring ? "Generating…" : "Create Referral"}
                    </Button>
                  )}
                  <Button variant="outline" className="gap-2 border-white/10 text-gray-400 hover:text-white" onClick={handleSaveReport}>
                    <Download className="w-4 h-4" /> {labels.saveReport}
                  </Button>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

// ── Shared local-AI helper (Ollama → rule-based fallback) ─────────────────────

async function _runLocalAI(
  symptoms: string,
  vitals: string,
  lang: string,
  setModel: (m: string | null) => void,
): Promise<import("@/lib/api").DiagnosisResult> {
  try {
    const res   = await ollamaDiagnose(symptoms, vitals, lang)
    const model = (res as { _model?: string })._model ?? null
    setModel(model)
    const { _model: _m, ...clean } = res as typeof res & { _model?: string }
    return clean
  } catch {
    // Ollama unavailable / timeout → rule-based engine always works
    setModel(null)
    return localDiagnose(symptoms, vitals)
  }
}

function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;")
}

function listHtml(items?: string[] | null): string {
  if (!items?.length) return "<p>None</p>"
  return `<ul>${items.map(item => `<li>${escapeHtml(item)}</li>`).join("")}</ul>`
}

function downloadDiagnosisReport(args: {
  result: DiagnosisResult
  symptoms: string
  vitals: string
  lang: string
  patientName: string
  model: string | null
}) {
  const { result, symptoms, vitals, lang, patientName, model } = args
  const title = result.disease_name ?? result.diagnosis ?? "AI Diagnosis"
  const labels = RESULT_LABELS[lang as keyof typeof RESULT_LABELS] ?? RESULT_LABELS.en
  const html = `<!doctype html>
<html lang="${escapeHtml(lang)}">
<head>
  <meta charset="utf-8" />
  <title>Sahayak AI Report - ${escapeHtml(title)}</title>
  <style>
    body { font-family: system-ui, -apple-system, "Nirmala UI", "Segoe UI", sans-serif; margin: 32px; color: #172033; line-height: 1.5; }
    .header { border-bottom: 3px solid #f97316; padding-bottom: 12px; margin-bottom: 20px; }
    h1 { margin: 0 0 6px; font-size: 24px; }
    h2 { margin-top: 22px; font-size: 16px; color: #334155; }
    .meta { color: #64748b; font-size: 13px; }
    .badge { display: inline-block; padding: 4px 10px; border-radius: 999px; background: #fff7ed; color: #c2410c; font-weight: 700; }
    .section { border: 1px solid #e2e8f0; border-radius: 10px; padding: 14px 16px; margin: 12px 0; }
    ul { margin-top: 8px; padding-left: 22px; }
    li { margin: 6px 0; }
    @media print { body { margin: 18mm; } }
  </style>
</head>
<body>
  <div class="header">
    <h1>Sahayak AI Diagnosis Report</h1>
    <div class="meta">Generated: ${escapeHtml(new Date().toLocaleString("en-IN"))}</div>
    <div class="meta">Patient: ${escapeHtml(patientName)} | Language: ${escapeHtml(lang)}${model ? ` | Model: ${escapeHtml(model)}` : ""}</div>
  </div>

  <h2>${escapeHtml(title)}</h2>
  <p><span class="badge">${escapeHtml(result.risk_level)}</span> ${result.confidence_pct != null ? `${escapeHtml(result.confidence_pct)}% confidence` : ""}</p>

  <div class="section">
    <h2>Symptoms</h2>
    <p>${escapeHtml(symptoms)}</p>
    ${vitals ? `<h2>Vitals</h2><p>${escapeHtml(vitals)}</p>` : ""}
  </div>

  <div class="section">
    <h2>${escapeHtml(labels.summary)}</h2>
    <p>${escapeHtml(result.clinical_summary)}</p>
  </div>

  <div class="section">
    <h2>${escapeHtml(labels.actions)}</h2>
    ${listHtml(result.recommendations ?? result.action_items)}
  </div>

  <div class="section">
    <h2>${escapeHtml(labels.medications)}</h2>
    ${listHtml(result.medications_suggested)}
  </div>

  <div class="section">
    <h2>${escapeHtml(labels.redFlags)}</h2>
    ${listHtml(result.warning_signs)}
  </div>

  ${result.community_alert ? `<div class="section"><h2>${escapeHtml(labels.community)}</h2><p>${escapeHtml(result.community_alert)}</p></div>` : ""}
</body>
</html>`

  const blob = new Blob([html], { type: "text/html;charset=utf-8" })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = `sahayak_report_${new Date().toISOString().slice(0, 10)}.html`
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}
