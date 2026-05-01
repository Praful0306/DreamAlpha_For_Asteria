import { useState, useEffect, useCallback, useRef } from "react"
import { motion } from "framer-motion"
import {
  Watch, Bluetooth, BluetoothOff, Heart, Activity, Footprints,
  BatteryMedium, Thermometer, Brain, Loader2, Wifi, WifiOff,
  TrendingUp, AlertTriangle, CheckCircle2, Sparkles, RefreshCw,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { useSmartWatch, type WatchVitals } from "@/hooks/useSmartWatch"
import { isOllamaAvailable, resolveOllamaModel } from "@/lib/ollamaDiagnose"
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts"
import { toast } from "sonner"

/* ── Constants ─────────────────────────────────────────────────────────────── */
const OLLAMA_BASE = "http://localhost:11434"
const GROQ_KEY    = import.meta.env.VITE_GROQ_API_KEY as string | undefined

const glass = "rounded-2xl bg-white/[0.04] backdrop-blur-xl border border-white/[0.07]"

/* ── AI analysis helper ────────────────────────────────────────────────────── */
async function analyzeVitals(vitals: WatchVitals, history: WatchVitals[]): Promise<string> {
  const prompt = `You are a rural health AI assistant (ICMR guidelines). Analyze these LIVE smartwatch vitals and give 3-4 short, actionable health suggestions in simple language.

Current readings:
- Heart Rate: ${vitals.heartRate ?? "N/A"} bpm
- SpO2: ${vitals.spo2 ?? "N/A"}%
- Steps: ${vitals.steps ?? "N/A"}
- Temperature: ${vitals.temperature ?? "N/A"}°C
- Battery: ${vitals.battery ?? "N/A"}%

Recent trend (last ${history.length} readings):
- Avg HR: ${avg(history.map(h => h.heartRate))} bpm
- Min HR: ${min(history.map(h => h.heartRate))} / Max HR: ${max(history.map(h => h.heartRate))}
- Avg SpO2: ${avg(history.map(h => h.spo2))}%

Respond in this JSON format:
{"status":"normal|warning|critical","suggestions":["suggestion1","suggestion2","suggestion3"],"summary":"One line summary"}`

  // Try Ollama first (offline / AMD NPU)
  const ollamaOk = await isOllamaAvailable()
  if (ollamaOk) {
    try {
      const model = await resolveOllamaModel()
      const r = await fetch(`${OLLAMA_BASE}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model,
          messages: [{ role: "user", content: prompt }],
          stream: false,
          options: { temperature: 0.3 },
        }),
        signal: AbortSignal.timeout(30000),
      })
      if (r.ok) {
        const d = await r.json()
        return d.message?.content ?? d.response ?? ""
      }
    } catch { /* fall through to Groq */ }
  }

  // Try Groq (online)
  if (GROQ_KEY) {
    try {
      const r = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${GROQ_KEY}` },
        body: JSON.stringify({
          model: "llama-3.3-70b-versatile",
          messages: [{ role: "user", content: prompt }],
          temperature: 0.3, max_tokens: 500,
        }),
        signal: AbortSignal.timeout(10000),
      })
      if (r.ok) {
        const d = await r.json()
        return d.choices?.[0]?.message?.content ?? ""
      }
    } catch { /* fall through to rule-based */ }
  }

  // Rule-based fallback
  return ruleBasedAnalysis(vitals)
}

function avg(arr: (number | null)[]): string {
  const nums = arr.filter((n): n is number => n != null)
  return nums.length ? (nums.reduce((a, b) => a + b, 0) / nums.length).toFixed(0) : "N/A"
}
function min(arr: (number | null)[]): string {
  const nums = arr.filter((n): n is number => n != null)
  return nums.length ? Math.min(...nums).toString() : "N/A"
}
function max(arr: (number | null)[]): string {
  const nums = arr.filter((n): n is number => n != null)
  return nums.length ? Math.max(...nums).toString() : "N/A"
}

function ruleBasedAnalysis(v: WatchVitals): string {
  const suggestions: string[] = []
  let status = "normal"
  if (v.heartRate && v.heartRate > 100) { suggestions.push("Heart rate is elevated. Rest and take deep breaths."); status = "warning" }
  else if (v.heartRate && v.heartRate < 55) { suggestions.push("Heart rate is low. If you feel dizzy, consult a doctor."); status = "warning" }
  else if (v.heartRate) suggestions.push("Heart rate is normal. Keep up your routine.")
  if (v.spo2 && v.spo2 < 94) { suggestions.push("Blood oxygen is low! Sit upright and breathe deeply. Seek medical help if it persists."); status = "critical" }
  else if (v.spo2) suggestions.push("Blood oxygen level is healthy.")
  if (v.steps != null && v.steps < 3000) suggestions.push("You haven't walked much today. Aim for at least 5000 steps.")
  else if (v.steps != null) suggestions.push(`Great activity! ${v.steps} steps so far today.`)
  suggestions.push("Stay hydrated — drink at least 8 glasses of water today.")
  const summary = status === "critical" ? "Needs attention — low SpO2 detected" : status === "warning" ? "Minor concern detected" : "All vitals look healthy"
  return JSON.stringify({ status, suggestions, summary })
}

/* ── Parse AI response ─────────────────────────────────────────────────────── */
interface AiResult { status: string; suggestions: string[]; summary: string }
function parseAi(raw: string): AiResult {
  try {
    const match = raw.match(/\{[\s\S]*\}/)
    if (match) return JSON.parse(match[0])
  } catch { /* */ }
  return { status: "normal", suggestions: [raw.slice(0, 200)], summary: "Analysis complete" }
}

/* ── Vital card ────────────────────────────────────────────────────────────── */
function VitalCard({ label, value, unit, icon: Icon, color, glow, isAbnormal }: {
  label: string; value: string | number | null; unit: string
  icon: React.ElementType; color: string; glow: string; isAbnormal?: boolean
}) {
  return (
    <motion.div whileHover={{ y: -2, scale: 1.02 }}
      className={`${glass} p-5 relative overflow-hidden ${isAbnormal ? "ring-1 ring-red-500/40" : ""}`}
      style={{ boxShadow: isAbnormal ? `0 0 20px ${color}40` : undefined }}>
      <div className="absolute -top-8 -right-8 w-28 h-28 rounded-full blur-3xl pointer-events-none" style={{ background: color, opacity: 0.12 }} />
      <div className="relative">
        <div className="flex items-center justify-between mb-3">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: glow }}>
            <Icon className="w-5 h-5" style={{ color }} />
          </div>
          {isAbnormal && <span className="w-2.5 h-2.5 rounded-full bg-red-500 animate-ping" />}
        </div>
        <p className="text-3xl font-black text-white leading-none">{value ?? "—"}</p>
        <p className="text-xs text-gray-500 mt-0.5">{unit}</p>
        <p className="text-xs font-semibold text-gray-400 mt-2">{label}</p>
      </div>
    </motion.div>
  )
}

/* ── Main page ─────────────────────────────────────────────────────────────── */
export default function WatchSync() {
  const watch = useSmartWatch()
  const [aiResult, setAiResult]     = useState<AiResult | null>(null)
  const [analyzing, setAnalyzing]   = useState(false)
  const [aiSource, setAiSource]     = useState<string>("")
  const [autoAnalyze, setAutoAnalyze] = useState(true)
  const lastAnalysis = useRef(0)

  // Auto-analyze every 30s when connected
  useEffect(() => {
    if (watch.status !== "connected" || !autoAnalyze) return
    const run = async () => {
      if (Date.now() - lastAnalysis.current < 25000) return
      if (!watch.vitals.heartRate) return
      lastAnalysis.current = Date.now()
      setAnalyzing(true)
      try {
        const ollamaOk = await isOllamaAvailable()
        setAiSource(ollamaOk ? "Ollama (AMD NPU)" : GROQ_KEY ? "Groq Cloud AI" : "Rule Engine")
        const raw = await analyzeVitals(watch.vitals, watch.history)
        setAiResult(parseAi(raw))
      } catch { /* ignore */ }
      setAnalyzing(false)
    }
    run()
    const iv = setInterval(run, 30_000)
    return () => clearInterval(iv)
  }, [watch.status, watch.vitals.heartRate, autoAnalyze, watch.vitals, watch.history])

  const manualAnalyze = useCallback(async () => {
    setAnalyzing(true)
    lastAnalysis.current = Date.now()
    try {
      const ollamaOk = await isOllamaAvailable()
      setAiSource(ollamaOk ? "Ollama (AMD NPU)" : GROQ_KEY ? "Groq Cloud AI" : "Rule Engine")
      const raw = await analyzeVitals(watch.vitals, watch.history)
      setAiResult(parseAi(raw))
      toast.success("AI analysis updated")
    } catch (e) {
      toast.error("Analysis failed")
    }
    setAnalyzing(false)
  }, [watch.vitals, watch.history])

  // Chart data from history
  const chartData = watch.history.slice(-60).map((v, i) => ({
    t: i,
    HR: v.heartRate,
    SpO2: v.spo2,
  }))

  const v = watch.vitals
  const hrAbnormal   = v.heartRate != null && (v.heartRate > 100 || v.heartRate < 55)
  const spo2Abnormal = v.spo2 != null && v.spo2 < 94

  return (
    <div className="p-4 sm:p-6 max-w-5xl mx-auto space-y-5" style={{ background: "#080810" }}>
      {/* Ambient blobs */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none -z-10">
        <div className="absolute top-[-15%] right-[-5%] w-[400px] h-[400px] rounded-full opacity-[0.06] blur-[100px]"
          style={{ background: "radial-gradient(circle, #3b82f6, transparent)" }} />
        <div className="absolute bottom-[-10%] left-[-5%] w-[350px] h-[350px] rounded-full opacity-[0.05] blur-[90px]"
          style={{ background: "radial-gradient(circle, #8b5cf6, transparent)" }} />
      </div>

      {/* Header */}
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}>
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-white flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-blue-500/20 flex items-center justify-center">
                <Watch className="w-5 h-5 text-blue-400" />
              </div>
              Watch Sync
            </h1>
            <p className="text-sm text-gray-500 mt-1">
              GoBolt Smartwatch · Live health monitoring
              {watch.deviceName && <span className="text-blue-400 ml-2">· {watch.deviceName}</span>}
            </p>
          </div>

          {/* Connection button */}
          {watch.status === "disconnected" || watch.status === "error" ? (
            <Button onClick={watch.connect}
              className="bg-blue-600 hover:bg-blue-700 text-white gap-2 rounded-xl h-11 px-6">
              <Bluetooth className="w-4 h-4" /> Connect Watch
            </Button>
          ) : watch.status === "connecting" ? (
            <Button disabled className="gap-2 rounded-xl h-11 px-6 bg-blue-600/50 text-white">
              <Loader2 className="w-4 h-4 animate-spin" /> Connecting…
            </Button>
          ) : (
            <Button onClick={watch.disconnect} variant="outline"
              className="border-red-500/30 text-red-400 hover:bg-red-500/10 gap-2 rounded-xl h-11 px-6">
              <BluetoothOff className="w-4 h-4" /> Disconnect
            </Button>
          )}
        </div>
      </motion.div>

      {/* Connection status bar */}
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.1 }}
        className={`${glass} px-4 py-3 flex items-center justify-between flex-wrap gap-2`}>
        <div className="flex items-center gap-3">
          <span className={`w-2.5 h-2.5 rounded-full ${
            watch.status === "connected" ? "bg-green-400 shadow-green-400/50 shadow-lg animate-pulse"
            : watch.status === "connecting" ? "bg-yellow-400 animate-pulse"
            : "bg-gray-600"
          }`} />
          <span className="text-sm font-medium text-gray-300">
            {watch.status === "connected" ? "Connected & Streaming" : watch.status === "connecting" ? "Reconnecting…" : "Disconnected"}
          </span>
          {watch.status === "connected" && (
            <>
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-green-500/15 text-green-400 border border-green-500/25 font-bold">LIVE</span>
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-500/15 text-blue-400 border border-blue-500/25 font-bold">PERSISTENT</span>
            </>
          )}
          {watch.status === "connecting" && watch.reconnects > 0 && (
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-yellow-500/15 text-yellow-400 border border-yellow-500/25 font-bold">
              Retry #{watch.reconnects}
            </span>
          )}
        </div>
        <div className="flex items-center gap-3 text-xs text-gray-500">
          {watch.status === "connected" && <span className="text-green-500 font-semibold">Keep-alive: 5s</span>}
          <span className="flex items-center gap-1"><Wifi className="w-3 h-3" /> BLE 5.0</span>
          <span>MAC: 5F:9E:47:1F:8C:9E</span>
        </div>
      </motion.div>

      {/* Error */}
      {watch.error && (
        <div className="px-4 py-3 rounded-xl bg-red-500/10 border border-red-500/25 text-red-300 text-sm flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0" /> {watch.error}
        </div>
      )}

      {/* Not connected placeholder */}
      {watch.status !== "connected" && watch.status !== "connecting" && (
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
          className={`${glass} p-10 text-center`}>
          <Watch className="w-16 h-16 text-gray-700 mx-auto mb-4" />
          <h3 className="text-xl font-bold text-white mb-2">Connect Your GoBolt Watch</h3>
          <p className="text-gray-500 text-sm max-w-md mx-auto mb-6">
            Pair your smartwatch via Bluetooth to start live health monitoring.
            Heart rate, SpO₂, steps, and temperature will be captured and analyzed by AI in real-time.
          </p>
          <Button onClick={watch.connect} className="bg-blue-600 hover:bg-blue-700 text-white gap-2 rounded-xl h-12 px-8 text-base">
            <Bluetooth className="w-5 h-5" /> Pair GoBolt Watch
          </Button>
        </motion.div>
      )}

      {/* Live vitals grid */}
      {(watch.status === "connected" || watch.status === "connecting") && (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
            <VitalCard label="Heart Rate" value={v.heartRate} unit="bpm" icon={Heart}
              color="#ef4444" glow="rgba(239,68,68,0.15)" isAbnormal={hrAbnormal} />
            <VitalCard label="Blood Oxygen" value={v.spo2} unit="%" icon={Activity}
              color="#22c55e" glow="rgba(34,197,94,0.15)" isAbnormal={spo2Abnormal} />
            <VitalCard label="Steps" value={v.steps} unit="steps" icon={Footprints}
              color="#3b82f6" glow="rgba(59,130,246,0.15)" />
            <VitalCard label="Temperature" value={v.temperature} unit="°C" icon={Thermometer}
              color="#f97316" glow="rgba(249,115,22,0.15)" />
            <VitalCard label="Battery" value={v.battery} unit="%" icon={BatteryMedium}
              color="#a855f7" glow="rgba(168,85,247,0.15)" />
          </div>

          {/* Live chart */}
          {chartData.length > 2 && (
            <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}
              className={`${glass} p-5`}>
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <TrendingUp className="w-4 h-4 text-blue-400" />
                  <span className="text-sm font-bold text-white">Live Vitals Stream</span>
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-red-500/20 text-red-400 border border-red-500/25 animate-pulse">● LIVE</span>
                </div>
                <div className="flex items-center gap-4 text-xs text-gray-500">
                  <span className="flex items-center gap-1"><span className="w-3 h-0.5 bg-[#ef4444] inline-block" />HR</span>
                  <span className="flex items-center gap-1"><span className="w-3 h-0.5 bg-[#22c55e] inline-block" />SpO₂</span>
                </div>
              </div>
              <ResponsiveContainer width="100%" height={200}>
                <AreaChart data={chartData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="wHR" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#ef4444" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#ef4444" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="wSp" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#22c55e" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#22c55e" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="t" tick={false} axisLine={false} />
                  <YAxis tick={{ fill: "#4b5563", fontSize: 10 }} axisLine={false} tickLine={false} />
                  <Tooltip contentStyle={{ background: "rgba(10,8,20,0.9)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 12, fontSize: 12 }} />
                  <Area type="monotone" dataKey="HR" stroke="#ef4444" fill="url(#wHR)" strokeWidth={2} dot={false} name="Heart Rate" />
                  <Area type="monotone" dataKey="SpO2" stroke="#22c55e" fill="url(#wSp)" strokeWidth={2} dot={false} name="SpO₂" />
                </AreaChart>
              </ResponsiveContainer>
            </motion.div>
          )}

          {/* AI Analysis panel */}
          <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}
            className={`${glass} p-5`}>
            <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
              <div className="flex items-center gap-2">
                <div className="w-9 h-9 rounded-xl bg-purple-500/20 flex items-center justify-center">
                  <Brain className="w-5 h-5 text-purple-400" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white">AI Health Analysis</h3>
                  <p className="text-[10px] text-gray-500">
                    {aiSource ? `Powered by ${aiSource}` : "Ollama (AMD NPU) → Groq → Rule Engine"}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={() => setAutoAnalyze(!autoAnalyze)}
                  className={`text-[10px] px-2.5 py-1 rounded-full border font-bold transition-colors ${
                    autoAnalyze ? "bg-green-500/15 text-green-400 border-green-500/25" : "bg-gray-500/10 text-gray-500 border-gray-500/20"
                  }`}>
                  {autoAnalyze ? "AUTO ON" : "AUTO OFF"}
                </button>
                <Button size="sm" onClick={manualAnalyze} disabled={analyzing || !v.heartRate}
                  className="bg-purple-600 hover:bg-purple-700 text-white gap-1.5 rounded-lg h-8 text-xs">
                  {analyzing ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
                  Analyze Now
                </Button>
              </div>
            </div>

            {analyzing && !aiResult && (
              <div className="flex items-center justify-center py-8 gap-3 text-gray-400">
                <Loader2 className="w-5 h-5 animate-spin" /> Analyzing vitals with AI…
              </div>
            )}

            {aiResult && (
              <div className="space-y-3">
                {/* Status banner */}
                <div className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium border ${
                  aiResult.status === "critical" ? "bg-red-500/10 border-red-500/25 text-red-300"
                  : aiResult.status === "warning" ? "bg-amber-500/10 border-amber-500/25 text-amber-300"
                  : "bg-green-500/10 border-green-500/25 text-green-300"
                }`}>
                  {aiResult.status === "critical" ? <AlertTriangle className="w-4 h-4" />
                    : aiResult.status === "warning" ? <AlertTriangle className="w-4 h-4" />
                    : <CheckCircle2 className="w-4 h-4" />}
                  {aiResult.summary}
                </div>

                {/* Suggestions */}
                <div className="space-y-2">
                  {aiResult.suggestions.map((s, i) => (
                    <div key={i} className="flex items-start gap-3 px-4 py-3 rounded-xl bg-white/[0.03] border border-white/[0.06]">
                      <span className="w-6 h-6 rounded-full bg-purple-500/20 text-purple-400 flex items-center justify-center text-xs font-bold shrink-0 mt-0.5">
                        {i + 1}
                      </span>
                      <p className="text-sm text-gray-300 leading-relaxed">{s}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {!aiResult && !analyzing && (
              <div className="text-center py-6 text-gray-600 text-sm">
                {v.heartRate ? "Click 'Analyze Now' or enable auto-analysis" : "Waiting for watch data…"}
              </div>
            )}
          </motion.div>
        </>
      )}
    </div>
  )
}
