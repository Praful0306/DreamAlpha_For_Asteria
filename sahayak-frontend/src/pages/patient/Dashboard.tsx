import React, { useEffect, useState, useCallback, useRef } from "react"
import { useNavigate } from "react-router-dom"
import { motion } from "framer-motion"
import { gsap } from "gsap"
import { useGSAP } from "@gsap/react"
import {
  Mic, Upload, FileText, Share2, Activity, Heart,
  Thermometer, Droplets, TrendingUp, TrendingDown,
  Minus, ChevronRight, Zap, Shield, Clock, Phone,
  Calendar, PhoneCall, Volume2, UserCheck, MapPin,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { useStore } from "@/store/useStore"
import {
  getPatientProfile, getReports, resolvePatientId,
  getPatientAppointments, getAshaContact,
  type Patient, type MedicalReport, type PatientAppointment, type AshaContact,
} from "@/lib/api"
import { isDemoMode, demoAppointments, demoHealthRecords, onSync, type DemoHealthRecord } from "@/lib/demoStore"
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts"
import { formatDate } from "@/lib/utils"
import VoiceBookingSession from "./VoiceBookingSession"

/* ── Omnidim widget loader ────────────────────────────────────────────────────
   Set VITE_OMNIDIM_WIDGET_SRC in .env.local to the script src URL from your
   Omnidim dashboard → Agent → Deploy → Web Bot Widget → copy the `src="..."`
   value from the generated <script> tag.
   Example: VITE_OMNIDIM_WIDGET_SRC=https://app.omnidim.io/widget/loader.js?key=abc123
─────────────────────────────────────────────────────────────────────────────── */
function useOmnidimWidget() {
  // Just loads the small floating corner widget — buttons use VoiceBookingSession instead
  useEffect(() => {
    const widgetSrc = import.meta.env.VITE_OMNIDIM_WIDGET_SRC as string | undefined
    if (!widgetSrc) return
    if (document.getElementById("omnidim-widget-script")) return
    const script = document.createElement("script")
    script.id  = "omnidim-widget-script"
    script.src = widgetSrc
    // Agent 149053 = Sahayak Appointment Booking Agent (inbound patient widget)
    const apptAgentId = (import.meta.env.VITE_OMNIDIM_APPT_AGENT_ID as string) || "149053"
    script.setAttribute("data-agent-id", apptAgentId)
    script.async = true
    document.body.appendChild(script)
    return () => { try { document.body.removeChild(script) } catch { /**/ } }
  }, [])
}

/* ── GSAP animated counter ──────────────────────────────────────────────────── */
function AnimatedCounter({ to, suffix = "" }: { to: number; suffix?: string }) {
  const el = useRef<HTMLSpanElement>(null)
  const obj = useRef({ n: 0 })
  useGSAP(() => {
    gsap.to(obj.current, {
      n: to,
      duration: 1.6,
      ease: "power3.out",
      onUpdate: () => {
        if (el.current) el.current.textContent = Math.round(obj.current.n) + suffix
      },
    })
  }, [to])
  return <span ref={el}>0{suffix}</span>
}

/* ── helpers ──────────────────────────────────────────────────────────────── */
function greet() {
  const h = new Date().getHours()
  if (h < 12) return "Good morning"
  if (h < 17) return "Good afternoon"
  return "Good evening"
}

function Trend({ cur, prev }: { cur?: number | null; prev?: number | null }) {
  if (!cur || !prev || cur === prev) return <Minus className="w-3.5 h-3.5 text-gray-500" />
  return cur > prev
    ? <TrendingUp className="w-3.5 h-3.5 text-red-400" />
    : <TrendingDown className="w-3.5 h-3.5 text-emerald-400" />
}

/* Circular health-score gauge with glowing ring */
function HealthRing({ score }: { score: number }) {
  const r = 52, circ = 2 * Math.PI * r
  const fill = circ - (score / 100) * circ
  const color = score >= 75 ? "#22c55e" : score >= 50 ? "#f97316" : "#ef4444"
  const glowColor = score >= 75 ? "#22c55e55" : score >= 50 ? "#f9731655" : "#ef444455"
  return (
    <div className="relative">
      {/* Outer pulse glow ring */}
      <div
        className="absolute inset-0 rounded-full animate-pulse"
        style={{ boxShadow: `0 0 32px 8px ${glowColor}`, borderRadius: "50%" }}
      />
      <svg width={128} height={128} className="relative drop-shadow-lg">
        {/* Track */}
        <circle cx={64} cy={64} r={r} fill="none" stroke="#ffffff08" strokeWidth={10} />
        {/* Glow duplicate behind */}
        <circle cx={64} cy={64} r={r} fill="none" stroke={color} strokeWidth={14}
          strokeLinecap="round" strokeDasharray={circ} strokeDashoffset={fill}
          transform="rotate(-90 64 64)"
          style={{ filter: `blur(6px)`, opacity: 0.35, transition: "stroke-dashoffset 1s ease" }} />
        {/* Main arc */}
        <circle cx={64} cy={64} r={r} fill="none" stroke={color} strokeWidth={10}
          strokeLinecap="round" strokeDasharray={circ} strokeDashoffset={fill}
          transform="rotate(-90 64 64)"
          style={{ transition: "stroke-dashoffset 1s ease" }} />
        <text x={64} y={60} textAnchor="middle" fill="white" fontSize={26} fontWeight="700">{score}</text>
        <text x={64} y={78} textAnchor="middle" fill="#6b7280" fontSize={11}>/ 100</text>
      </svg>
    </div>
  )
}

/* Premium sparkline */
function Spark({ values, color }: { values: number[]; color: string }) {
  if (values.length < 2) return null
  const max = Math.max(...values), min = Math.min(...values)
  const h = 32, w = 70
  const pts = values.map((v, i) => {
    const x = (i / (values.length - 1)) * w
    const y = h - ((v - min) / (max - min + 0.001)) * h
    return `${x},${y}`
  }).join(" ")
  return (
    <svg width={w} height={h}>
      <defs>
        <linearGradient id={`spark-${color.replace("#","")}`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor={color} stopOpacity="0.3" />
          <stop offset="100%" stopColor={color} stopOpacity="0.9" />
        </linearGradient>
      </defs>
      <polyline points={pts} fill="none"
        stroke={`url(#spark-${color.replace("#","")})`}
        strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  )
}

/* ── Format time slot "HH:MM" → "H:MM AM/PM" ────────────────────────────── */
function fmtSlot(slot: string) {
  try {
    const [h, m] = slot.split(":").map(Number)
    const ap  = h >= 12 ? "PM" : "AM"
    const h12 = h > 12 ? h - 12 : h === 0 ? 12 : h
    return `${h12}:${m.toString().padStart(2, "0")} ${ap}`
  } catch { return slot }
}

/* ── Stagger animation variants ─────────────────────────────────────────── */
const fadeUp = {
  hidden: { opacity: 0, y: 28 },
  show: (i = 0) => ({
    opacity: 1, y: 0,
    transition: { duration: 0.5, delay: i * 0.07, ease: [0.22, 1, 0.36, 1] },
  }),
}

const staggerContainer = {
  hidden: {},
  show: { transition: { staggerChildren: 0.07 } },
}

/* ── Section header helper ──────────────────────────────────────────────── */
function SectionHeader({
  icon: Icon, title, subtitle, iconColor, iconBg,
  action, actionLabel,
}: {
  icon: React.ElementType
  title: string
  subtitle?: string
  iconColor: string
  iconBg: string
  action?: () => void
  actionLabel?: string
}) {
  return (
    <div className="flex items-center justify-between mb-5">
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
          style={{ background: iconBg }}>
          <Icon className="w-4.5 h-4.5" style={{ color: iconColor, width: 18, height: 18 }} />
        </div>
        <div>
          <h3 className="text-sm font-bold text-white tracking-tight">{title}</h3>
          {subtitle && <p className="text-[11px] text-gray-500 mt-0.5">{subtitle}</p>}
        </div>
      </div>
      {action && actionLabel && (
        <button onClick={action}
          className="flex items-center gap-1 text-xs text-sky-400 hover:text-sky-300 transition-colors font-medium">
          {actionLabel} <ChevronRight className="w-3 h-3" />
        </button>
      )}
    </div>
  )
}

/* ── Glass card base ────────────────────────────────────────────────────── */
const glassCard = "relative overflow-hidden rounded-2xl bg-white/[0.04] backdrop-blur-xl border border-white/[0.07] hover:border-white/[0.12] transition-all duration-300"

/* ── main ─────────────────────────────────────────────────────────────────── */
export default function PatientDashboard() {
  const navigate = useNavigate()
  const { user }  = useStore()
  const [profile,      setProfile]      = useState<Patient | null>(null)
  const [reports,      setReports]      = useState<MedicalReport[]>([])
  const [appts,        setAppts]        = useState<PatientAppointment[]>([])
  const [ashaContact,  setAshaContact]  = useState<AshaContact | null>(null)
  const [loading,      setLoading]      = useState(true)
  const [demoRecords,  setDemoRecords]  = useState<DemoHealthRecord[]>([])

  // Load small floating Omnidim corner widget
  useOmnidimWidget()

  // Voice booking modal — opened by all Doctor-call buttons on this page
  const [showVoiceModal, setShowVoiceModal] = useState(false)
  const openVoiceBooking = useCallback(() => setShowVoiceModal(true), [])

  const fetchAll = useCallback(() => {
    if (!user) { setLoading(false); return }
    setLoading(true)

    // ── Demo mode: load from localStorage ──────────────────────────
    if (isDemoMode()) {
      // Convert demoAppointments to PatientAppointment shape
      const demoAppts: PatientAppointment[] = demoAppointments.getAll().map(a => {
        const [date, time] = a.preferred_time.split(" ")
        const todayStr = new Date().toISOString().slice(0, 10)
        return {
          id:        parseInt(a.id),
          date:      date ?? todayStr,
          time:      time ?? "10:00",
          doctor_id: 1,
          reason:    a.reason || "General consultation",
          status:    a.status,
          is_today:  (date ?? todayStr) === todayStr,
        } as PatientAppointment
      })
      setAppts(demoAppts)
      setProfile(null)
      setReports([])
      setAshaContact(null)
      setLoading(false)
      return
    }

    // ── Real backend ────────────────────────────────────────────────
    resolvePatientId(user).then(pid =>
      Promise.all([
        getPatientProfile(pid).catch(() => null),
        getReports(pid).catch(() => []),
        getPatientAppointments(pid).catch(() => []),
        getAshaContact().catch(() => null),
      ])
    ).then(([p, r, a, asha]) => {
      setProfile(p)
      setReports(r as MedicalReport[])
      setAppts(a as PatientAppointment[])
      setAshaContact(asha as AshaContact | null)
    }).finally(() => setLoading(false))
  }, [user])

  useEffect(() => { fetchAll() }, [fetchAll])

  // Demo mode: load health records and subscribe to live updates
  useEffect(() => {
    if (!isDemoMode()) return
    const load = () => setDemoRecords(demoHealthRecords.getAll())
    load()
    return onSync(load)
  }, [])

  // Refetch whenever user navigates back after saving a report
  useEffect(() => {
    const onFocus = () => {
      const saved = sessionStorage.getItem("sahayak_report_saved")
      if (saved) {
        sessionStorage.removeItem("sahayak_report_saved")
        fetchAll()
      }
    }
    window.addEventListener("focus", onFocus)
    // Also check on mount (same-tab navigation)
    onFocus()
    return () => window.removeEventListener("focus", onFocus)
  }, [fetchAll])

  const latest  = reports[0]
  const prev    = reports[1]
  const score   = profile?.health_score ?? (reports.length ? 68 : 0)
  const risk    = latest?.risk_level ?? profile?.risk_level ?? "UNKNOWN"
  const isEmpty = !loading && reports.length === 0

  const riskColor: Record<string, string> = {
    LOW: "#22c55e", MEDIUM: "#f59e0b",
    HIGH: "#ef4444", CRITICAL: "#dc2626", UNKNOWN: "#6b7280",
  }
  const riskBg: Record<string, string> = {
    LOW: "bg-emerald-500/10 border-emerald-500/30",
    MEDIUM: "bg-amber-500/10 border-amber-500/30",
    HIGH: "bg-red-500/10 border-red-500/30",
    CRITICAL: "bg-red-600/20 border-red-600/40",
    UNKNOWN: "bg-gray-500/10 border-gray-500/20",
  }
  const riskText: Record<string, string> = {
    LOW: "text-emerald-400", MEDIUM: "text-amber-400",
    HIGH: "text-red-400", CRITICAL: "text-red-500", UNKNOWN: "text-gray-400",
  }

  // Chart data
  const chartData = [...reports].reverse().slice(-8).map((r) => ({
    date: r.created_at ? formatDate(r.created_at).slice(0, 6) : "",
    HR:   r.heart_rate ?? null,
    SpO2: r.spo2 ?? null,
    BP:   r.bp_systolic ?? null,
  }))

  /* ── VITALS ROW ── */
  const vitals = [
    {
      label: "Heart Rate", unit: "bpm", icon: Heart, color: "#f97316",
      bgGlow: "rgba(249,115,22,0.18)",
      val: latest?.heart_rate, prev: prev?.heart_rate,
      normal: [60, 100],
      spark: reports.slice(0,6).map(r=>r.heart_rate).filter(Boolean) as number[],
    },
    {
      label: "Blood Oxygen", unit: "%", icon: Activity, color: "#22c55e",
      bgGlow: "rgba(34,197,94,0.18)",
      val: latest?.spo2, prev: prev?.spo2,
      normal: [95, 100],
      spark: reports.slice(0,6).map(r=>r.spo2).filter(Boolean) as number[],
    },
    {
      label: "Temperature", unit: "°C", icon: Thermometer, color: "#3b82f6",
      bgGlow: "rgba(59,130,246,0.18)",
      val: latest?.temperature, prev: prev?.temperature,
      normal: [36.1, 37.2],
      spark: reports.slice(0,6).map(r=>r.temperature).filter(Boolean) as number[],
    },
    {
      label: "Blood Pressure", unit: "mmHg", icon: Droplets, color: "#a855f7",
      bgGlow: "rgba(168,85,247,0.18)",
      val: latest?.bp_systolic ? `${latest.bp_systolic}/${latest.bp_diastolic ?? "—"}` : null,
      prev: prev?.bp_systolic,
      normal: [90, 120],
      spark: reports.slice(0,6).map(r=>r.bp_systolic).filter(Boolean) as number[],
      isString: true,
    },
  ]

  const actions: {
    label: string; sub: string; icon: React.ElementType
    href?: string; action?: () => void
    grad: string; glowColor: string
  }[] = [
    { label: "AI Diagnosis",  sub: "Describe symptoms", icon: Mic,      href: "/patient/diagnose",  grad: "from-orange-600 via-orange-500 to-amber-500",    glowColor: "#f97316" },
    { label: "Upload Report", sub: "PDF / image scan",  icon: Upload,   href: "/patient/upload",    grad: "from-blue-700 via-blue-600 to-sky-500",          glowColor: "#3b82f6" },
    { label: "View Reports",  sub: "All your records",  icon: FileText, href: "/patient/reports",   grad: "from-violet-700 via-purple-600 to-purple-500",   glowColor: "#a855f7" },
    { label: "Share Access",  sub: "With your doctor",  icon: Share2,   href: "/patient/access",    grad: "from-emerald-700 via-emerald-600 to-teal-500",   glowColor: "#22c55e" },
    { label: "Call Doctor",   sub: "Book appointment",  icon: Phone,    action: openVoiceBooking,   grad: "from-sky-700 via-sky-600 to-cyan-500",           glowColor: "#0ea5e9" },
    { label: "Call ASHA",     sub: "Health guidance",   icon: Heart,    href: "/patient/call",      grad: "from-pink-700 via-pink-600 to-rose-500",         glowColor: "#ec4899" },
  ]

  return (
    <div
      className="min-h-screen px-4 py-6 max-w-6xl mx-auto space-y-5"
      style={{ background: "linear-gradient(135deg, #080810 0%, #0a0812 100%)" }}
    >

      {/* ── AMBIENT BACKGROUND BLOBS ── */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none -z-10">
        <div className="absolute top-[-20%] left-[-10%] w-[500px] h-[500px] rounded-full opacity-[0.07] blur-[120px] animate-pulse"
          style={{ background: "radial-gradient(circle, #7c3aed, transparent)" }} />
        <div className="absolute bottom-[-10%] right-[-10%] w-[400px] h-[400px] rounded-full opacity-[0.06] blur-[100px]"
          style={{ background: "radial-gradient(circle, #0ea5e9, transparent)", animation: "pulse 4s ease-in-out infinite 1s" }} />
        <div className="absolute top-[40%] left-[60%] w-[300px] h-[300px] rounded-full opacity-[0.04] blur-[80px]"
          style={{ background: "radial-gradient(circle, #22c55e, transparent)", animation: "pulse 6s ease-in-out infinite 2s" }} />
      </div>

      {/* ── HERO ── */}
      <motion.div variants={fadeUp} initial="hidden" animate="show" custom={0}
        className={glassCard + " p-6 sm:p-8"}>
        {/* Glow blobs */}
        <div className="absolute -top-16 -right-16 w-64 h-64 rounded-full blur-3xl pointer-events-none"
          style={{ background: `radial-gradient(circle, ${riskColor[risk] ?? "#7c3aed"}22, transparent)` }} />
        <div className="absolute -bottom-12 -left-8 w-48 h-48 rounded-full blur-3xl pointer-events-none"
          style={{ background: "radial-gradient(circle, #7c3aed18, transparent)" }} />

        <div className="relative flex flex-col sm:flex-row items-start sm:items-center gap-6">
          {/* Health ring */}
          <div className="shrink-0">
            {loading
              ? <Skeleton className="w-32 h-32 rounded-full" style={{ background: "rgba(255,255,255,0.05)" }} />
              : <HealthRing score={score} />
            }
          </div>

          {/* Welcome text */}
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium text-gray-500 uppercase tracking-widest">{greet()}</p>
            <h1 className="text-3xl sm:text-4xl font-black text-white mt-1 truncate tracking-tight">
              {user?.name?.split(" ")[0] ?? "Patient"}
            </h1>
            <p className="text-gray-500 text-sm mt-2">
              {isEmpty
                ? "Welcome! Upload your first report to start tracking your health."
                : `${reports.length} report${reports.length !== 1 ? "s" : ""} on file · Last checkup ${latest?.created_at ? formatDate(latest.created_at) : "—"}`}
            </p>
            {!isEmpty && (
              <div className={`inline-flex items-center gap-2 mt-3 px-3 py-1.5 rounded-full border text-xs font-semibold ${riskBg[risk] ?? riskBg.UNKNOWN}`}>
                <span className={`w-2 h-2 rounded-full animate-pulse`}
                  style={{ background: riskColor[risk] ?? "#6b7280" }} />
                <span className={riskText[risk] ?? "text-gray-400"}>{risk} Risk</span>
              </div>
            )}
          </div>

          {/* Health score GSAP counter */}
          {!loading && !isEmpty && (
            <div className="hidden sm:flex flex-col items-center shrink-0 px-6 py-4 rounded-2xl"
              style={{
                background: "rgba(255,255,255,0.03)",
                border: "1px solid rgba(255,255,255,0.07)",
              }}>
              <span className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-1">Health Score</span>
              <span className="text-5xl font-black text-white tabular-nums leading-none">
                <AnimatedCounter to={score} />
              </span>
              <span className="text-xs text-gray-600 mt-1">out of 100</span>
            </div>
          )}
        </div>
      </motion.div>

      {/* ── STATS STRIP (reports count + score) ── */}
      {!loading && !isEmpty && (
        <motion.div variants={fadeUp} initial="hidden" animate="show" custom={0.5}
          className="grid grid-cols-3 gap-2 sm:gap-3">
          {[
            { label: "Total Reports", value: reports.length, suffix: "", color: "#7c3aed", glow: "rgba(124,58,237,0.18)" },
            { label: "Health Score", value: score, suffix: "/100", color: riskColor[risk] ?? "#22c55e", glow: `${riskColor[risk] ?? "#22c55e"}30` },
            { label: "Appointments", value: appts.length, suffix: "", color: "#0ea5e9", glow: "rgba(14,165,233,0.18)" },
          ].map((s, i) => (
            <div key={s.label}
              className={glassCard + " p-4 text-center"}>
              <div className="absolute inset-0 rounded-2xl pointer-events-none"
                style={{ background: `radial-gradient(ellipse at 50% 0%, ${s.glow}, transparent 70%)` }} />
              <p className="text-[10px] font-bold uppercase tracking-widest text-gray-500 mb-1">{s.label}</p>
              <p className="text-2xl font-black text-white tabular-nums leading-none" style={{ color: i === 0 ? "white" : s.color }}>
                <AnimatedCounter to={s.value} suffix={s.suffix} />
              </p>
            </div>
          ))}
        </motion.div>
      )}

      {/* ── VITALS ROW ── */}
      {loading ? (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-40 rounded-2xl" style={{ background: "rgba(255,255,255,0.04)" }} />
          ))}
        </div>
      ) : isEmpty ? null : (
        <motion.div
          variants={staggerContainer}
          initial="hidden"
          animate="show"
          className="grid grid-cols-2 lg:grid-cols-4 gap-3"
        >
          {vitals.map((v, i) => {
            const Icon = v.icon
            const isAbnormal = !v.isString && v.val != null && typeof v.val === "number" &&
              (v.val < v.normal[0] || v.val > v.normal[1])
            return (
              <motion.div
                key={v.label}
                variants={fadeUp}
                custom={i + 1}
                whileHover={{ y: -3, scale: 1.02 }}
                transition={{ type: "spring", stiffness: 300, damping: 20 }}
                className={glassCard + " p-4 cursor-default"}
                style={{
                  boxShadow: isAbnormal
                    ? `0 0 24px ${v.color}40, inset 0 1px 0 rgba(255,255,255,0.05)`
                    : `0 0 0px transparent, inset 0 1px 0 rgba(255,255,255,0.05)`,
                }}
              >
                {/* Glow orb */}
                <div className="absolute -top-8 -right-8 w-32 h-32 rounded-full blur-3xl pointer-events-none"
                  style={{ background: v.color, opacity: 0.15 }} />

                <div className="relative">
                  <div className="flex items-center justify-between mb-4">
                    <div className="w-9 h-9 rounded-xl flex items-center justify-center"
                      style={{ background: `${v.color}20`, boxShadow: `0 0 12px ${v.color}30` }}>
                      <Icon className="w-4 h-4" style={{ color: v.color }} />
                    </div>
                    <Trend cur={typeof v.prev === "number" ? (v.val as number) : undefined} prev={v.prev} />
                  </div>

                  <div className="flex items-end gap-1 mb-0.5">
                    <span className="text-3xl font-black leading-none"
                      style={{ color: isAbnormal ? "#f87171" : "white" }}>
                      {v.val ?? "—"}
                    </span>
                    <span className="text-xs text-gray-500 mb-1">{v.unit}</span>
                  </div>
                  <p className="text-[11px] font-medium text-gray-500 mb-3">{v.label}</p>

                  {v.spark.length > 1 && (
                    <Spark values={[...v.spark].reverse()} color={v.color} />
                  )}

                  {isAbnormal && (
                    <>
                      <span className="absolute top-0 right-0 w-2 h-2 rounded-full animate-ping"
                        style={{ background: "#f87171" }} />
                      <span className="absolute top-0 right-0 w-2 h-2 rounded-full"
                        style={{ background: "#f87171" }} />
                    </>
                  )}
                </div>
              </motion.div>
            )
          })}
        </motion.div>
      )}

      {/* ── CHART + ACTIONS ── */}
      <div className="grid lg:grid-cols-3 gap-4">
        {/* Chart */}
        <motion.div variants={fadeUp} initial="hidden" animate="show" custom={5}
          className={glassCard + " lg:col-span-2 p-5"}>
          {/* Glow orb */}
          <div className="absolute -top-10 -left-10 w-48 h-48 rounded-full blur-3xl pointer-events-none"
            style={{ background: "rgba(124,58,237,0.12)" }} />

          <div className="relative">
            <SectionHeader
              icon={TrendingUp}
              title="Vitals Trend"
              subtitle="Heart Rate · SpO₂ · Blood Pressure"
              iconColor="#a855f7"
              iconBg="rgba(168,85,247,0.15)"
              action={reports.length > 0 ? () => navigate("/patient/reports") : undefined}
              actionLabel="Full report"
            />

            {loading
              ? <Skeleton className="h-48 rounded-xl" style={{ background: "rgba(255,255,255,0.04)" }} />
              : chartData.length >= 2
                ? (
                  <ResponsiveContainer width="100%" height={200}>
                    <AreaChart data={chartData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                      <defs>
                        {[["hr","#f97316"],["sp","#22c55e"],["bp","#a855f7"]].map(([id,c])=>(
                          <linearGradient key={id} id={`g_${id}`} x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor={c} stopOpacity={0.3} />
                            <stop offset="95%" stopColor={c} stopOpacity={0} />
                          </linearGradient>
                        ))}
                      </defs>
                      <XAxis dataKey="date" tick={{ fill:"#4b5563", fontSize:10 }} axisLine={false} tickLine={false} />
                      <YAxis tick={{ fill:"#4b5563", fontSize:10 }} axisLine={false} tickLine={false} />
                      <Tooltip
                        contentStyle={{
                          background: "rgba(10,8,20,0.9)",
                          backdropFilter: "blur(12px)",
                          border: "1px solid rgba(255,255,255,0.08)",
                          borderRadius: 12,
                          fontSize: 12,
                        }}
                        labelStyle={{ color:"#9ca3af" }}
                      />
                      <Area type="monotone" dataKey="HR"   stroke="#f97316" fill="url(#g_hr)" strokeWidth={2} dot={false} name="Heart Rate" />
                      <Area type="monotone" dataKey="SpO2" stroke="#22c55e" fill="url(#g_sp)" strokeWidth={2} dot={false} name="SpO₂" />
                      <Area type="monotone" dataKey="BP"   stroke="#a855f7" fill="url(#g_bp)" strokeWidth={2} dot={false} name="BP Sys" />
                    </AreaChart>
                  </ResponsiveContainer>
                )
                : (
                  <div className="h-48 flex flex-col items-center justify-center gap-3 text-center">
                    <TrendingUp className="w-10 h-10 text-gray-700" />
                    <p className="text-sm text-gray-500">Upload at least 2 reports to see trends</p>
                    <Button size="sm"
                      className="bg-violet-600 hover:bg-violet-700 text-white text-xs"
                      onClick={() => navigate("/patient/upload")}>
                      Upload Report
                    </Button>
                  </div>
                )
            }
          </div>
        </motion.div>

        {/* Quick actions */}
        <motion.div variants={fadeUp} initial="hidden" animate="show" custom={6}
          className={glassCard + " p-5"}>
          {/* Glow */}
          <div className="absolute -bottom-10 -right-10 w-40 h-40 rounded-full blur-3xl pointer-events-none"
            style={{ background: "rgba(14,165,233,0.1)" }} />

          <div className="relative">
            <SectionHeader
              icon={Zap}
              title="Quick Actions"
              subtitle="Tap to get started"
              iconColor="#f59e0b"
              iconBg="rgba(245,158,11,0.15)"
            />

            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-2 gap-2.5">
              {actions.map((a) => {
                const Icon = a.icon
                return (
                  <motion.button
                    key={a.label}
                    whileHover={{ scale: 1.03, brightness: 1.1 } as Record<string, unknown>}
                    whileTap={{ scale: 0.97 }}
                    onClick={() => a.action ? a.action() : navigate(a.href!)}
                    className={`group relative overflow-hidden rounded-xl p-3.5 text-left bg-gradient-to-br ${a.grad} transition-all duration-200`}
                    style={{ boxShadow: `0 4px 20px ${a.glowColor}30` }}
                  >
                    {/* Shine effect */}
                    <div
                      className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-500 pointer-events-none"
                    />
                    {/* Corner orb */}
                    <div className="absolute bottom-0 right-0 w-14 h-14 bg-white/10 rounded-full translate-x-4 translate-y-4 group-hover:scale-125 transition-transform duration-300 pointer-events-none" />

                    <div className="relative">
                      <Icon className="w-5 h-5 text-white mb-2.5 drop-shadow" />
                      <p className="text-white text-xs font-bold leading-tight">{a.label}</p>
                      <p className="text-white/60 text-[10px] mt-0.5 leading-tight">{a.sub}</p>
                    </div>
                  </motion.button>
                )
              })}
            </div>
          </div>
        </motion.div>
      </div>

      {/* ── AI VOICE APPOINTMENT BOOKING ── */}
      <motion.div variants={fadeUp} initial="hidden" animate="show" custom={6.5}
        className={glassCard}>
        {/* Glow */}
        <div className="absolute -top-12 -right-12 w-56 h-56 rounded-full blur-3xl pointer-events-none"
          style={{ background: "rgba(14,165,233,0.12)" }} />
        <div className="absolute -bottom-10 -left-10 w-40 h-40 rounded-full blur-3xl pointer-events-none"
          style={{ background: "rgba(14,165,233,0.07)" }} />

        <div className="relative p-5 sm:p-6">
          <SectionHeader
            icon={PhoneCall}
            title="AI Voice Appointment Booking"
            subtitle="Call our AI agent — get your Patient ID instantly"
            iconColor="#38bdf8"
            iconBg="rgba(14,165,233,0.15)"
          />

          {/* How it works */}
          <div className="grid grid-cols-3 gap-1.5 sm:gap-2.5 mb-5">
            {[
              { step: "1", label: "Call the number", desc: "AI agent answers 24/7", icon: Phone, color: "#38bdf8", bg: "rgba(14,165,233,0.1)" },
              { step: "2", label: "Share your details", desc: "Name, phone, age", icon: Volume2, color: "#a78bfa", bg: "rgba(167,139,250,0.1)" },
              { step: "3", label: "Get Patient ID", desc: "Show at reception", icon: Shield, color: "#34d399", bg: "rgba(52,211,153,0.1)" },
            ].map(({ step, label, desc, icon: Icon, color, bg }) => (
              <div key={step}
                className="rounded-xl border border-white/[0.06] p-3 text-center"
                style={{ background: bg }}>
                <div className="w-7 h-7 rounded-lg flex items-center justify-center mx-auto mb-1.5"
                  style={{ background: bg }}>
                  <Icon className="w-3.5 h-3.5" style={{ color }} />
                </div>
                <p className="text-[10px] font-bold uppercase tracking-wide mb-0.5" style={{ color }}>Step {step}</p>
                <p className="text-white text-xs font-semibold leading-tight">{label}</p>
                <p className="text-gray-500 text-[10px] mt-0.5">{desc}</p>
              </div>
            ))}
          </div>

          {/* CTA row */}
          <div className="flex flex-col sm:flex-row gap-2.5">
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={openVoiceBooking}
              className="group relative flex-1 flex items-center justify-center gap-2.5 py-3 rounded-xl font-semibold text-white text-sm overflow-hidden"
              style={{
                background: "linear-gradient(135deg, #0284c7, #0369a1)",
                boxShadow: "0 4px 24px rgba(2,132,199,0.35)",
              }}
            >
              <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-500 pointer-events-none" />
              <PhoneCall className="w-4 h-4 relative" />
              <span className="relative">Book Appointment (Voice)</span>
            </motion.button>

            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={openVoiceBooking}
              className="flex-1 flex items-center justify-center gap-2.5 py-3 rounded-xl font-semibold text-white text-sm border border-white/10 bg-white/[0.04] hover:bg-white/[0.08] transition-all"
            >
              <Mic className="w-4 h-4 text-sky-400" />
              Book via App (Voice)
            </motion.button>
          </div>

          <p className="text-[10px] text-gray-600 text-center mt-3">
            Available 24 × 7 · Supports English, Hindi &amp; Kannada
          </p>
        </div>
      </motion.div>

      {/* ── TALK TO YOUR ASHA WORKER ── */}
      <motion.div variants={fadeUp} initial="hidden" animate="show" custom={7}
        className={glassCard}>
        {/* Glow */}
        <div className="absolute -top-10 -right-10 w-48 h-48 rounded-full blur-3xl pointer-events-none"
          style={{ background: "rgba(34,197,94,0.1)" }} />
        <div className="absolute -bottom-8 -left-8 w-36 h-36 rounded-full blur-3xl pointer-events-none"
          style={{ background: "rgba(20,184,166,0.08)" }} />

        <div className="relative p-5 sm:p-6">
          <SectionHeader
            icon={UserCheck}
            title="Talk to Your ASHA Worker"
            subtitle={
              ashaContact?.found
                ? `Your ASHA: ${ashaContact.name}${ashaContact.village ? ` · ${ashaContact.village}` : ""}`
                : "AI health assistant — relays your update to your ASHA"
            }
            iconColor="#34d399"
            iconBg="rgba(52,211,153,0.15)"
          />

          {/* ASHA contact card */}
          {ashaContact?.found && (
            <motion.div
              initial={{ opacity: 0, scale: 0.97 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.4 }}
              className="flex items-center gap-3 mb-5 px-4 py-3 rounded-xl"
              style={{
                background: "rgba(34,197,94,0.07)",
                border: "1px solid rgba(34,197,94,0.2)",
              }}
            >
              <div className="w-10 h-10 rounded-full flex items-center justify-center shrink-0"
                style={{ background: "rgba(34,197,94,0.2)", boxShadow: "0 0 12px rgba(34,197,94,0.25)" }}>
                <UserCheck className="w-5 h-5 text-emerald-400" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-white truncate">{ashaContact.name}</p>
                <p className="text-xs text-emerald-400/70 flex items-center gap-1 mt-0.5">
                  <MapPin className="w-2.5 h-2.5" />
                  {[ashaContact.village, ashaContact.district].filter(Boolean).join(", ") || "Your area"}
                </p>
              </div>
              <span className="text-[10px] font-bold px-2.5 py-1 rounded-full shrink-0"
                style={{
                  background: "rgba(34,197,94,0.15)",
                  color: "#34d399",
                  border: "1px solid rgba(34,197,94,0.25)",
                }}>
                LINKED
              </span>
            </motion.div>
          )}

          {/* How it works */}
          <div className="grid grid-cols-3 gap-1.5 sm:gap-2.5 mb-5">
            {[
              { step: "1", label: "Call the line", desc: "AI answers instantly", icon: Phone, color: "#34d399", bg: "rgba(52,211,153,0.1)" },
              { step: "2", label: "Describe how you feel", desc: "Any language", icon: Volume2, color: "#2dd4bf", bg: "rgba(45,212,191,0.1)" },
              { step: "3", label: "ASHA gets notified", desc: "Update saved to record", icon: UserCheck, color: "#22d3ee", bg: "rgba(34,211,238,0.1)" },
            ].map(({ step, label, desc, icon: Icon, color, bg }) => (
              <div key={step}
                className="rounded-xl border border-white/[0.06] p-3 text-center"
                style={{ background: bg }}>
                <div className="w-7 h-7 rounded-lg flex items-center justify-center mx-auto mb-1.5"
                  style={{ background: bg }}>
                  <Icon className="w-3.5 h-3.5" style={{ color }} />
                </div>
                <p className="text-[10px] font-bold uppercase tracking-wide mb-0.5" style={{ color }}>Step {step}</p>
                <p className="text-white text-xs font-semibold leading-tight">{label}</p>
                <p className="text-gray-500 text-[10px] mt-0.5">{desc}</p>
              </div>
            ))}
          </div>

          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => navigate("/patient/call")}
            className="group relative flex items-center justify-center gap-2.5 py-3 rounded-xl font-semibold text-white text-sm w-full overflow-hidden"
            style={{
              background: "linear-gradient(135deg, #16a34a, #15803d)",
              boxShadow: "0 4px 24px rgba(22,163,74,0.3)",
            }}
          >
            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-500 pointer-events-none" />
            <Phone className="w-4 h-4 relative" />
            <span className="relative">Call ASHA Health Line</span>
          </motion.button>

          <p className="text-[10px] text-gray-600 text-center mt-3">
            Our AI health assistant will check on you and update your ASHA worker
          </p>
        </div>
      </motion.div>

      {/* ── UPCOMING APPOINTMENTS ── */}
      {appts.length > 0 && (
        <motion.div variants={fadeUp} initial="hidden" animate="show" custom={6.8}
          className={glassCard + " p-5"}>
          {/* Glow */}
          <div className="absolute -top-8 -right-8 w-40 h-40 rounded-full blur-3xl pointer-events-none"
            style={{ background: "rgba(34,197,94,0.1)" }} />

          <div className="relative">
            <SectionHeader
              icon={Calendar}
              title="Upcoming Appointments"
              subtitle={`${appts.length} scheduled`}
              iconColor="#34d399"
              iconBg="rgba(52,211,153,0.15)"
              action={openVoiceBooking}
              actionLabel="Book more"
            />

            <motion.div variants={staggerContainer} initial="hidden" animate="show" className="space-y-2.5">
              {appts.slice(0, 4).map((a, i) => (
                <motion.div
                  key={a.id}
                  variants={fadeUp}
                  custom={i}
                  whileHover={{ x: 3 }}
                  className="flex items-center gap-3 p-3.5 rounded-xl cursor-default"
                  style={{
                    background: "rgba(255,255,255,0.025)",
                    border: "1px solid rgba(255,255,255,0.05)",
                  }}
                >
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
                    style={{
                      background: a.is_today ? "rgba(34,197,94,0.2)" : "rgba(124,58,237,0.15)",
                      boxShadow: a.is_today ? "0 0 12px rgba(34,197,94,0.2)" : "0 0 12px rgba(124,58,237,0.15)",
                    }}>
                    <Calendar className="w-4 h-4" style={{ color: a.is_today ? "#34d399" : "#a78bfa" }} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-white truncate">{a.reason}</p>
                    <div className="flex items-center gap-1.5 mt-0.5 text-xs text-gray-500">
                      <Clock className="w-3 h-3" />
                      <span>{a.is_today ? "Today" : formatDate(a.date)}</span>
                      <span className="text-gray-700">·</span>
                      <span>{fmtSlot(a.time)}</span>
                    </div>
                  </div>
                  <span className="text-[10px] font-bold px-2.5 py-1 rounded-full shrink-0"
                    style={
                      a.is_today
                        ? { background: "rgba(34,197,94,0.12)", color: "#34d399", border: "1px solid rgba(34,197,94,0.2)" }
                        : { background: "rgba(124,58,237,0.1)", color: "#a78bfa", border: "1px solid rgba(124,58,237,0.2)" }
                    }>
                    {a.is_today ? "TODAY" : a.status.toUpperCase()}
                  </span>
                </motion.div>
              ))}
            </motion.div>
          </div>
        </motion.div>
      )}

      {/* ── HEALTH CALL RECORDS (demo mode) ── */}
      {isDemoMode() && demoRecords.length > 0 && (
        <motion.div variants={fadeUp} initial="hidden" animate="show" custom={7.5}
          className={glassCard + " p-5"}>
          {/* Glow */}
          <div className="absolute -top-8 -right-8 w-40 h-40 rounded-full blur-3xl pointer-events-none"
            style={{ background: "rgba(16,185,129,0.1)" }} />

          <div className="relative">
            <SectionHeader
              icon={PhoneCall}
              title="Health Call Records"
              subtitle={`${demoRecords.length} record${demoRecords.length !== 1 ? "s" : ""} from ASHA calls`}
              iconColor="#34d399"
              iconBg="rgba(52,211,153,0.15)"
            />

            <motion.div variants={staggerContainer} initial="hidden" animate="show" className="space-y-2">
              {demoRecords.slice(0, 5).map((rec, i) => {
                const riskColors: Record<string, { text: string; bg: string; border: string }> = {
                  LOW:       { text: "#34d399", bg: "rgba(52,211,153,0.1)",  border: "rgba(52,211,153,0.2)" },
                  MEDIUM:    { text: "#fbbf24", bg: "rgba(251,191,36,0.1)",  border: "rgba(251,191,36,0.2)" },
                  HIGH:      { text: "#f87171", bg: "rgba(248,113,113,0.1)", border: "rgba(248,113,113,0.2)" },
                  EMERGENCY: { text: "#ef4444", bg: "rgba(239,68,68,0.15)",  border: "rgba(239,68,68,0.3)" },
                }
                const lvl = rec.risk_level as keyof typeof riskColors
                const c   = riskColors[lvl] ?? riskColors.LOW
                return (
                  <motion.div
                    key={rec.id}
                    variants={fadeUp}
                    custom={i}
                    className="flex items-start gap-3 p-3.5 rounded-xl"
                    style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.05)" }}
                  >
                    <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 mt-0.5"
                      style={{ background: "rgba(16,185,129,0.15)", boxShadow: "0 0 10px rgba(16,185,129,0.15)" }}>
                      <PhoneCall className="w-4 h-4 text-emerald-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-white truncate">{rec.title}</p>
                      <p className="text-xs text-gray-400 mt-0.5 line-clamp-2">{rec.summary}</p>
                      <p className="text-[11px] text-gray-600 mt-1 flex items-center gap-1">
                        <Clock className="w-2.5 h-2.5" />
                        {rec.created_at ? formatDate(rec.created_at) : "—"}
                      </p>
                    </div>
                    <span className="text-[10px] font-bold px-2.5 py-1 rounded-full shrink-0 mt-0.5"
                      style={{ color: c.text, background: c.bg, border: `1px solid ${c.border}` }}>
                      {lvl}
                    </span>
                  </motion.div>
                )
              })}
            </motion.div>
          </div>
        </motion.div>
      )}

      {/* ── LAB VALUES ── */}
      {!isEmpty && !loading && (latest?.hemoglobin || latest?.blood_sugar_fasting || latest?.creatinine) && (
        <motion.div variants={fadeUp} initial="hidden" animate="show" custom={7}
          className={glassCard + " p-5"}>
          {/* Glow */}
          <div className="absolute -top-8 -left-8 w-40 h-40 rounded-full blur-3xl pointer-events-none"
            style={{ background: "rgba(236,72,153,0.08)" }} />

          <div className="relative">
            <SectionHeader
              icon={Activity}
              title="Latest Lab Values"
              subtitle="From most recent report"
              iconColor="#f472b6"
              iconBg="rgba(236,72,153,0.15)"
            />

            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
              {[
                { label:"Hemoglobin", val: latest.hemoglobin, unit:"g/dL", normal:[12,17], color:"#ec4899" },
                { label:"Fasting Sugar", val: latest.blood_sugar_fasting, unit:"mg/dL", normal:[70,99], color:"#f59e0b" },
                { label:"Creatinine", val: latest.creatinine, unit:"mg/dL", normal:[0.6,1.2], color:"#06b6d4" },
                { label:"Weight", val: latest.weight_kg, unit:"kg", normal:[40,100], color:"#84cc16" },
              ].filter(x => x.val != null).map(({ label, val, unit, normal, color }) => {
                const num = Number(val)
                const pct = Math.min(100, Math.max(0, ((num - normal[0]) / (normal[1] - normal[0])) * 100))
                const ok  = num >= normal[0] && num <= normal[1]
                return (
                  <div key={label}
                    className="rounded-xl p-4"
                    style={{
                      background: "rgba(255,255,255,0.03)",
                      border: "1px solid rgba(255,255,255,0.06)",
                      boxShadow: ok ? "none" : `0 0 16px ${color}20`,
                    }}>
                    <p className="text-[11px] font-medium text-gray-500 mb-1.5">{label}</p>
                    <p className="text-xl font-black" style={{ color: ok ? "white" : "#f87171" }}>
                      {val} <span className="text-xs font-normal text-gray-500">{unit}</span>
                    </p>
                    <div className="mt-2.5 h-1.5 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.06)" }}>
                      <div className="h-full rounded-full transition-all duration-700"
                        style={{ width: `${pct}%`, background: ok ? color : "#ef4444" }} />
                    </div>
                    <p className="text-[10px] text-gray-600 mt-1.5">Normal {normal[0]}–{normal[1]}</p>
                  </div>
                )
              })}
            </div>
          </div>
        </motion.div>
      )}

      {/* ── RECENT REPORTS ── */}
      {!loading && reports.length > 0 && (
        <motion.div variants={fadeUp} initial="hidden" animate="show" custom={8}
          className={glassCard + " p-5"}>
          {/* Glow */}
          <div className="absolute -top-8 -right-8 w-40 h-40 rounded-full blur-3xl pointer-events-none"
            style={{ background: "rgba(124,58,237,0.1)" }} />

          <div className="relative">
            <SectionHeader
              icon={FileText}
              title="Recent Reports"
              subtitle={`${reports.length} total`}
              iconColor="#a78bfa"
              iconBg="rgba(124,58,237,0.15)"
              action={() => navigate("/patient/reports")}
              actionLabel="View all"
            />

            <motion.div variants={staggerContainer} initial="hidden" animate="show" className="space-y-2">
              {reports.slice(0, 4).map((r, i) => {
                const rcColor: Record<string, { text: string; bg: string; border: string }> = {
                  LOW:    { text: "#34d399", bg: "rgba(52,211,153,0.1)",  border: "rgba(52,211,153,0.2)" },
                  MEDIUM: { text: "#fbbf24", bg: "rgba(251,191,36,0.1)",  border: "rgba(251,191,36,0.2)" },
                  HIGH:   { text: "#f87171", bg: "rgba(248,113,113,0.1)", border: "rgba(248,113,113,0.2)" },
                }
                const lvl = (r.risk_level ?? "LOW") as keyof typeof rcColor
                const c = rcColor[lvl] ?? { text: "#9ca3af", bg: "rgba(156,163,175,0.1)", border: "rgba(156,163,175,0.2)" }
                return (
                  <motion.div
                    key={r.id}
                    variants={fadeUp}
                    custom={i}
                    whileHover={{ x: 4, backgroundColor: "rgba(255,255,255,0.04)" }}
                    className="flex items-center gap-3 p-3.5 rounded-xl cursor-pointer transition-colors"
                    style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.04)" }}
                    onClick={() => navigate("/patient/reports")}
                  >
                    <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
                      style={{ background: "rgba(124,58,237,0.2)", boxShadow: "0 0 10px rgba(124,58,237,0.2)" }}>
                      <FileText className="w-4 h-4 text-violet-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-white truncate">{r.diagnosis ?? "Medical Report"}</p>
                      <p className="text-xs text-gray-500 mt-0.5">{r.created_at ? formatDate(r.created_at) : "—"}</p>
                    </div>
                    <span className="text-xs font-bold px-2.5 py-1 rounded-full shrink-0"
                      style={{ color: c.text, background: c.bg, border: `1px solid ${c.border}` }}>
                      {lvl}
                    </span>
                    <ChevronRight className="w-4 h-4 text-gray-600 shrink-0" />
                  </motion.div>
                )
              })}
            </motion.div>
          </div>
        </motion.div>
      )}

      {/* ── EMPTY STATE (new user) ── */}
      {isEmpty && (
        <motion.div
          variants={fadeUp}
          initial="hidden"
          animate="show"
          custom={2}
          className="relative overflow-hidden rounded-2xl p-10 text-center"
          style={{
            border: "1.5px dashed rgba(124,58,237,0.3)",
            background: "rgba(124,58,237,0.03)",
            backdropFilter: "blur(16px)",
          }}
        >
          {/* Animated dashed border glow */}
          <div className="absolute inset-0 rounded-2xl pointer-events-none animate-pulse"
            style={{ boxShadow: "inset 0 0 40px rgba(124,58,237,0.08)" }} />

          {/* Glow orbs */}
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-64 h-32 rounded-full blur-3xl pointer-events-none"
            style={{ background: "radial-gradient(circle, rgba(124,58,237,0.15), transparent)" }} />

          <div className="relative">
            <motion.div
              animate={{ scale: [1, 1.05, 1] }}
              transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
              className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-5"
              style={{
                background: "rgba(124,58,237,0.2)",
                boxShadow: "0 0 32px rgba(124,58,237,0.3)",
              }}
            >
              <Zap className="w-8 h-8 text-violet-400" />
            </motion.div>

            <h3 className="text-xl font-black text-white mb-2 tracking-tight">Start your health journey</h3>
            <p className="text-gray-500 text-sm max-w-sm mx-auto mb-7 leading-relaxed">
              Upload a lab report or describe your symptoms to get AI-powered insights and track your health over time.
            </p>

            <div className="flex flex-wrap gap-3 justify-center mb-8">
              <motion.div whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.97 }}>
                <Button
                  className="font-semibold gap-2 text-white"
                  style={{
                    background: "linear-gradient(135deg, #7c3aed, #6d28d9)",
                    boxShadow: "0 4px 20px rgba(124,58,237,0.35)",
                  }}
                  onClick={() => navigate("/patient/upload")}
                >
                  <Upload className="w-4 h-4" /> Upload Report
                </Button>
              </motion.div>
              <motion.div whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.97 }}>
                <Button
                  variant="outline"
                  className="gap-2 text-gray-300"
                  style={{
                    border: "1px solid rgba(255,255,255,0.1)",
                    background: "rgba(255,255,255,0.04)",
                  }}
                  onClick={() => navigate("/patient/diagnose")}
                >
                  <Mic className="w-4 h-4" /> AI Diagnosis
                </Button>
              </motion.div>
            </div>

            {/* Feature hints */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-left">
              {[
                { icon: Shield, title: "Private & Secure", desc: "Your data is encrypted and only visible to you", color: "#34d399", bg: "rgba(52,211,153,0.12)" },
                { icon: Activity, title: "Vital Tracking", desc: "Monitor BP, sugar, hemoglobin over time", color: "#60a5fa", bg: "rgba(96,165,250,0.12)" },
                { icon: Clock,  title: "Instant AI Analysis", desc: "Get risk assessment in under 3 seconds", color: "#f472b6", bg: "rgba(244,114,182,0.12)" },
              ].map(({ icon: Icon, title, desc, color, bg }) => (
                <div key={title}
                  className="rounded-xl p-4"
                  style={{ background: bg, border: "1px solid rgba(255,255,255,0.06)" }}>
                  <div className="w-8 h-8 rounded-xl flex items-center justify-center mb-3"
                    style={{ background: `${color}20` }}>
                    <Icon className="w-4 h-4" style={{ color }} />
                  </div>
                  <p className="text-xs font-bold text-white mb-1">{title}</p>
                  <p className="text-[11px] text-gray-500 leading-snug">{desc}</p>
                </div>
              ))}
            </div>
          </div>
        </motion.div>
      )}

      {/* ── VOICE BOOKING MODAL ── */}
      {showVoiceModal && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4"
          style={{ background: "rgba(0,0,0,0.75)", backdropFilter: "blur(12px)" }}
          onClick={e => { if (e.target === e.currentTarget) setShowVoiceModal(false) }}
        >
          <motion.div
            initial={{ opacity: 0, y: 40, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20 }}
            transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
            className="w-full max-w-lg max-h-[92vh] overflow-y-auto"
          >
            <VoiceBookingSession
              reason="appointment"
              reasonLabel="Doctor Appointment"
              onClose={() => setShowVoiceModal(false)}
            />
          </motion.div>
        </div>
      )}
    </div>
  )
}
