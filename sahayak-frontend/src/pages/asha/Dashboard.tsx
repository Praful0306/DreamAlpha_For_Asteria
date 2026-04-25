import { useEffect, useState, useRef } from "react"
import { useNavigate } from "react-router-dom"
import { motion, AnimatePresence } from "framer-motion"
import {
  Users, Mic, Map, CheckSquare, Trophy, Star, Zap,
  AlertTriangle, Bell, Send, PhoneIncoming, PhoneOutgoing,
  Heart, ClipboardList, Clock, MapPin, UserCheck,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { Progress } from "@/components/ui/progress"
import { RiskBadge } from "@/components/shared/RiskBadge"
import { VAPICallButton } from "@/components/shared/VAPICallButton"
import { useStore } from "@/store/useStore"
import {
  getMyPatients, getAnalyticsStats, getDeepImpact,
  getAshaCallLogs,
  type Patient, type AshaCallLog,
} from "@/lib/api"
import { formatDate } from "@/lib/utils"
import { isDemoMode, demoGet, demoCallLogs, onSync } from "@/lib/demoStore"
import { triggerAlert, sendSMS } from "@/lib/makecom"
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from "recharts"
import gsap from "gsap"
import { useGSAP } from "@gsap/react"

// ─── Animated Counter ────────────────────────────────────────────────────────
function AnimatedCounter({ to, suffix = "" }: { to: number; suffix?: string }) {
  const el  = useRef<HTMLSpanElement>(null)
  const obj = useRef({ n: 0 })
  useGSAP(() => {
    gsap.to(obj.current, {
      n: to,
      duration: 1.8,
      ease: "power3.out",
      onUpdate: () => {
        if (el.current) el.current.textContent = Math.round(obj.current.n) + suffix
      },
    })
  }, [to])
  return <span ref={el}>0{suffix}</span>
}

// ─── Constants ───────────────────────────────────────────────────────────────
const COLORS = ["#f97316", "#3b82f6", "#22c55e", "#eab308", "#ef4444", "#8b5cf6"]

const MOCK_PATIENTS: Patient[] = [
  { id: 1, name: "Priya Devi",   age: 28, gender: "F", village: "Rampur",    risk_level: "HIGH",      diagnosis: "Suspected Dengue" },
  { id: 2, name: "Rajesh Kumar", age: 45, gender: "M", village: "Sitapur",   risk_level: "MEDIUM",    diagnosis: "Hypertension" },
  { id: 3, name: "Sunita Bai",   age: 32, gender: "F", village: "Rampur",    risk_level: "LOW",       diagnosis: "Anaemia" },
  { id: 4, name: "Arun Singh",   age: 8,  gender: "M", village: "Hardoi",    risk_level: "HIGH",      diagnosis: "Malaria Suspect" },
  { id: 5, name: "Meera Devi",   age: 25, gender: "F", village: "Rampur",    risk_level: "LOW",       diagnosis: "ANC 2nd Visit" },
  { id: 6, name: "Ravi Prasad",  age: 60, gender: "M", village: "Lakhimpur", risk_level: "EMERGENCY", diagnosis: "Chest Pain" },
  { id: 7, name: "Kavita Singh", age: 22, gender: "F", village: "Sitapur",   risk_level: "MEDIUM",    diagnosis: "Typhoid Suspect" },
  { id: 8, name: "Mohan Lal",    age: 38, gender: "M", village: "Rampur",    risk_level: "LOW",       diagnosis: "TB Screening" },
]

const MOCK_STATS = {
  disease_distribution: { "Malaria": 8, "Dengue": 5, "TB": 3, "Anaemia": 12, "Hypertension": 7, "Maternal": 6, "Dengue Fever": 4 },
  diagnoses_today: 4,
}

const MOCK_IMPACT = {
  impact_score: 847,
  badges: ["First Diagnosis 🎉", "10 Patients 👥", "ASHA Champion 🏆", "Disease Detective 🔍"],
  summary: "Outstanding community health work",
}

const QUICK = [
  { label: "Diagnose Patient", icon: Mic,         href: "/asha/diagnose", gradient: "from-brand-600 to-orange-500" },
  { label: "Add Patient",      icon: Users,        href: "/asha/patients", gradient: "from-blue-600 to-blue-400" },
  { label: "Disease Map",      icon: Map,          href: "/asha/heatmap",  gradient: "from-purple-600 to-purple-400" },
  { label: "My Tasks",         icon: CheckSquare,  href: "/asha/tasks",    gradient: "from-green-600 to-emerald-400" },
]

// ─── Animation variants ───────────────────────────────────────────────────────
const containerVariants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.08 } },
}

const fadeUp = {
  hidden:  { opacity: 0, y: 22 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.5, ease: [0.22, 1, 0.36, 1] } },
}

// ─── Glass card primitive ─────────────────────────────────────────────────────
function GlassCard({
  children,
  className = "",
  glow,
}: {
  children: React.ReactNode
  className?: string
  glow?: "red" | "yellow" | "emerald" | "blue"
}) {
  const glowMap = {
    red:     "shadow-[0_0_40px_-12px_rgba(239,68,68,0.35)] border-red-500/20",
    yellow:  "shadow-[0_0_40px_-12px_rgba(234,179,8,0.3)]  border-yellow-500/20",
    emerald: "shadow-[0_0_40px_-12px_rgba(16,185,129,0.25)] border-emerald-500/20",
    blue:    "shadow-[0_0_40px_-12px_rgba(59,130,246,0.25)] border-blue-500/20",
  }
  return (
    <div
      className={`rounded-2xl bg-white/[0.04] backdrop-blur-xl border border-white/[0.07] ${
        glow ? glowMap[glow] : ""
      } ${className}`}
    >
      {children}
    </div>
  )
}

// ─── Impact ring ──────────────────────────────────────────────────────────────
function ImpactRing({ score, max = 1000 }: { score: number; max?: number }) {
  const radius  = 54
  const circ    = 2 * Math.PI * radius
  const pct     = Math.min(score / max, 1)
  const dashArr = circ
  const dashOff = circ * (1 - pct)

  return (
    <svg width={140} height={140} className="block mx-auto -rotate-90">
      {/* Track */}
      <circle cx={70} cy={70} r={radius} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth={10} />
      {/* Progress */}
      <circle
        cx={70} cy={70} r={radius}
        fill="none"
        stroke="url(#ringGrad)"
        strokeWidth={10}
        strokeLinecap="round"
        strokeDasharray={dashArr}
        strokeDashoffset={dashOff}
        style={{ transition: "stroke-dashoffset 1.6s cubic-bezier(0.22,1,0.36,1)" }}
      />
      <defs>
        <linearGradient id="ringGrad" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%"   stopColor="#f97316" />
          <stop offset="100%" stopColor="#eab308" />
        </linearGradient>
      </defs>
    </svg>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────
export default function AshaDashboard() {
  const navigate             = useNavigate()
  const { user }             = useStore()
  const [patients, setPatients] = useState<Patient[]>([])
  const [stats,    setStats]    = useState<Record<string, unknown> | null>(null)
  const [impact,   setImpact]   = useState<{ impact_score: number; badges: string[]; summary: string } | null>(null)
  const [loading,  setLoading]  = useState(true)
  const [callLogs, setCallLogs] = useState<AshaCallLog[]>([])
  const [alerting, setAlerting] = useState<Record<number, boolean>>({})
  const [toast,    setToast]    = useState<string | null>(null)

  useEffect(() => {
    // ── Demo mode: use registered patients from localStorage ─────────
    if (isDemoMode()) {
      const demoPatients = demoGet<Patient[]>("asha_patients", [])
      setPatients(demoPatients.length > 0 ? demoPatients : MOCK_PATIENTS)
      setStats(MOCK_STATS as Record<string, unknown>)
      setImpact(MOCK_IMPACT)
      setLoading(false)
      return
    }

    // ── Real backend ─────────────────────────────────────────────────
    const uid = user?.id?.toString() ?? ""
    Promise.all([
      getMyPatients().catch(() => []),
      getAnalyticsStats(uid).catch(() => null),
      getDeepImpact(uid).catch(() => null),
    ]).then(([p, s, imp]) => {
      setPatients((p as Patient[]).length > 0 ? (p as Patient[]) : MOCK_PATIENTS)
      setStats((s ?? MOCK_STATS) as Record<string, unknown>)
      setImpact((imp ?? MOCK_IMPACT) as { impact_score: number; badges: string[]; summary: string })
    }).finally(() => setLoading(false))
  }, [user?.id])

  useEffect(() => {
    if (isDemoMode()) {
      // Demo mode: read from localStorage call log store
      const load = () => setCallLogs(demoCallLogs.getAll() as unknown as AshaCallLog[])
      load()
      return onSync(load)   // re-render whenever a new call is logged
    }
    getAshaCallLogs().catch(() => []).then(logs => setCallLogs(logs as AshaCallLog[]))
  }, [])

  const diseaseDistrib = stats?.disease_distribution
    ? Object.entries(stats.disease_distribution as Record<string, number>).map(([name, value]) => ({ name, value }))
    : []

  const highRisk    = patients.filter(p => ["HIGH", "EMERGENCY"].includes(p.risk_level ?? ""))
  const impactScore = impact?.impact_score ?? 0

  const showToast = (msg: string) => {
    setToast(msg)
    setTimeout(() => setToast(null), 3000)
  }

  const handleSendAlert = async (p: Patient) => {
    setAlerting(prev => ({ ...prev, [p.id]: true }))
    await triggerAlert({ name: p.name ?? "Patient", risk_level: p.risk_level ?? "HIGH", diagnosis: p.diagnosis, village: p.village })
    setAlerting(prev => ({ ...prev, [p.id]: false }))
    showToast(`Alert sent for ${p.name}`)
  }

  const handleSendSMS = async (p: Patient) => {
    if (!p.phone) { showToast("No phone number for this patient"); return }
    await sendSMS(p.phone, `Sahayak AI: ${p.name}, please see Dr. immediately for ${p.diagnosis ?? "health issue"}.`)
    showToast(`SMS sent to ${p.name}`)
  }

  const statCards = [
    { label: "My Patients",     value: patients.length,                          icon: Users,        color: "text-blue-400",   glow: "rgba(59,130,246,0.25)",   iconBg: "bg-blue-500/15" },
    { label: "High Risk",       value: highRisk.length,                          icon: AlertTriangle,color: "text-red-400",    glow: "rgba(239,68,68,0.25)",    iconBg: "bg-red-500/15" },
    { label: "Diagnoses Today", value: (stats?.diagnoses_today as number) ?? 0,  icon: Mic,          color: "text-brand-400",  glow: "rgba(249,115,22,0.25)",   iconBg: "bg-brand-500/15" },
    { label: "Impact Score",    value: Math.round(impactScore),                  icon: Trophy,       color: "text-yellow-400", glow: "rgba(234,179,8,0.25)",    iconBg: "bg-yellow-500/15" },
  ]

  return (
    <div
      className="min-h-screen relative"
      style={{ background: "#080810" }}
    >
      {/* Orange glow blob top-right */}
      <div
        className="pointer-events-none fixed top-0 right-0 w-[520px] h-[420px] opacity-30"
        style={{
          background: "radial-gradient(ellipse at top right, rgba(249,115,22,0.45) 0%, transparent 70%)",
          filter: "blur(60px)",
        }}
      />

      <div className="relative z-10 p-6 max-w-6xl mx-auto space-y-6">

        {/* Toast */}
        <AnimatePresence>
          {toast && (
            <motion.div
              key="toast"
              initial={{ opacity: 0, y: -16, scale: 0.96 }}
              animate={{ opacity: 1, y: 0,   scale: 1 }}
              exit={{   opacity: 0, y: -8,   scale: 0.96 }}
              className="fixed top-5 right-5 z-50 flex items-center gap-2.5 bg-emerald-950/80 backdrop-blur-xl border border-emerald-500/30 text-emerald-300 text-sm px-5 py-3 rounded-2xl shadow-[0_8px_32px_rgba(0,0,0,0.5)]"
            >
              <span className="w-5 h-5 rounded-full bg-emerald-500/20 flex items-center justify-center text-emerald-400 text-xs font-bold">✓</span>
              {toast}
            </motion.div>
          )}
        </AnimatePresence>

        <motion.div variants={containerVariants} initial="hidden" animate="visible" className="space-y-6">

          {/* ── Header ──────────────────────────────────────────────────────── */}
          <motion.div variants={fadeUp}>
            <GlassCard className="p-6">
              <div className="flex items-start justify-between gap-4 flex-wrap">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="inline-flex items-center gap-1.5 text-xs font-medium text-brand-400 bg-brand-500/10 border border-brand-500/20 px-2.5 py-1 rounded-full">
                      <Heart className="w-3 h-3" /> Community Health Worker
                    </span>
                  </div>
                  <h1 className="text-3xl font-extrabold text-white mt-2">
                    Namaste,{" "}
                    <span
                      style={{
                        background: "linear-gradient(135deg, #f97316 0%, #eab308 50%, #fb923c 100%)",
                        WebkitBackgroundClip: "text",
                        WebkitTextFillColor: "transparent",
                        backgroundClip: "text",
                      }}
                    >
                      {user?.name?.split(" ")[0] ?? "ASHA"}
                    </span>
                  </h1>
                  <p className="text-sm text-white/40 mt-1.5 flex items-center gap-1.5">
                    <Clock className="w-3.5 h-3.5" />
                    {formatDate(new Date())}
                    <span className="text-white/20">·</span>
                    Serving with care today
                  </p>
                </div>
                <div className="shrink-0">
                  <VAPICallButton
                    patientName={user?.name ?? "ASHA Worker"}
                    context="Provide clinical decision support for rural ASHA workers in India"
                    language="hi-IN"
                  />
                </div>
              </div>
            </GlassCard>
          </motion.div>

          {/* ── Stats ───────────────────────────────────────────────────────── */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {loading
              ? Array.from({ length: 4 }).map((_, i) => (
                  <Skeleton key={i} className="h-32 rounded-2xl bg-white/[0.04]" />
                ))
              : statCards.map((s, i) => {
                  const Icon = s.icon
                  return (
                    <motion.div key={s.label} variants={fadeUp} custom={i}>
                      <div
                        className="rounded-2xl bg-white/[0.04] backdrop-blur-xl border border-white/[0.07] p-5 transition-all duration-300 hover:bg-white/[0.07] hover:-translate-y-0.5 cursor-default"
                        style={{ boxShadow: `0 0 32px -10px ${s.glow}` }}
                      >
                        <div className={`w-10 h-10 rounded-xl ${s.iconBg} flex items-center justify-center mb-4`}>
                          <Icon className={`w-5 h-5 ${s.color}`} />
                        </div>
                        <p className={`text-3xl font-extrabold ${s.color}`}>
                          <AnimatedCounter to={s.value} />
                        </p>
                        <p className="text-xs text-white/40 mt-1.5 font-medium">{s.label}</p>
                      </div>
                    </motion.div>
                  )
                })}
          </div>

          {/* ── Quick Actions ────────────────────────────────────────────────── */}
          <motion.div variants={fadeUp}>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {QUICK.map((q) => {
                const Icon = q.icon
                return (
                  <motion.button
                    key={q.href}
                    whileHover={{ scale: 1.03, y: -2 }}
                    whileTap={{ scale: 0.97 }}
                    transition={{ type: "spring", stiffness: 400, damping: 20 }}
                    onClick={() => navigate(q.href)}
                    className={`h-24 flex flex-col items-center justify-center gap-2.5 rounded-2xl text-white font-semibold text-sm
                      bg-gradient-to-br ${q.gradient}
                      shadow-[0_4px_24px_rgba(0,0,0,0.4)]
                      hover:shadow-[0_8px_32px_rgba(0,0,0,0.5)]
                      transition-shadow duration-300 cursor-pointer border-0 outline-none`}
                  >
                    <Icon className="w-7 h-7 opacity-90" />
                    {q.label}
                  </motion.button>
                )
              })}
            </div>
          </motion.div>

          {/* ── Charts + Impact ──────────────────────────────────────────────── */}
          <div className="grid lg:grid-cols-3 gap-4">

            {/* Disease distribution */}
            <motion.div variants={fadeUp} className="lg:col-span-2">
              <GlassCard className="p-6 h-full">
                <p className="text-sm font-semibold text-white mb-5 flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-brand-500 animate-pulse" />
                  Disease Distribution
                </p>
                {diseaseDistrib.length > 0 ? (
                  <div className="flex flex-col sm:flex-row items-center gap-4">
                    <div className="shrink-0">
                      <ResponsiveContainer width={170} height={170}>
                        <PieChart>
                          <Pie
                            data={diseaseDistrib}
                            cx="50%" cy="50%"
                            innerRadius={48} outerRadius={74}
                            dataKey="value"
                            paddingAngle={4}
                            strokeWidth={0}
                          >
                            {diseaseDistrib.map((_, i) => (
                              <Cell
                                key={i}
                                fill={COLORS[i % COLORS.length]}
                                opacity={0.9}
                              />
                            ))}
                          </Pie>
                          <Tooltip
                            contentStyle={{
                              background: "rgba(15,15,20,0.92)",
                              backdropFilter: "blur(12px)",
                              border: "1px solid rgba(255,255,255,0.08)",
                              borderRadius: 12,
                              fontSize: 12,
                              color: "#fff",
                            }}
                          />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                    <div className="flex-1 w-full space-y-2.5">
                      {diseaseDistrib.slice(0, 6).map((d, i) => {
                        const total = diseaseDistrib.reduce((s, x) => s + x.value, 0)
                        const pct   = total > 0 ? Math.round((d.value / total) * 100) : 0
                        return (
                          <div key={d.name} className="space-y-1">
                            <div className="flex items-center justify-between text-xs">
                              <span className="flex items-center gap-2 text-white/60">
                                <span
                                  className="w-2 h-2 rounded-full shrink-0"
                                  style={{ background: COLORS[i % COLORS.length] }}
                                />
                                {d.name}
                              </span>
                              <span className="font-semibold text-white/80">{d.value}</span>
                            </div>
                            <div className="h-1 rounded-full bg-white/[0.05] overflow-hidden">
                              <div
                                className="h-full rounded-full transition-all duration-700"
                                style={{ width: `${pct}%`, background: COLORS[i % COLORS.length], opacity: 0.7 }}
                              />
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                ) : (
                  <div className="h-44 flex flex-col items-center justify-center gap-2 text-white/25">
                    <ClipboardList className="w-8 h-8" />
                    <p className="text-sm">No diagnosis data yet</p>
                  </div>
                )}
              </GlassCard>
            </motion.div>

            {/* Impact Score */}
            <motion.div variants={fadeUp}>
              <GlassCard className="p-6 h-full" glow="yellow">
                <p className="text-sm font-semibold text-white mb-1 flex items-center gap-2">
                  <Star className="w-4 h-4 text-yellow-400" />
                  Impact Score
                </p>
                <p className="text-xs text-white/35 mb-4">Community Health Points</p>

                {/* SVG ring */}
                <div className="relative flex items-center justify-center mb-2">
                  <ImpactRing score={impactScore} />
                  <div className="absolute inset-0 flex flex-col items-center justify-center">
                    <p className="text-3xl font-extrabold text-yellow-400 leading-none">
                      <AnimatedCounter to={Math.round(impactScore)} />
                    </p>
                    <p className="text-[10px] text-white/30 mt-1">/ 1000</p>
                  </div>
                </div>

                {/* Level progress */}
                <div className="mt-3 mb-4">
                  <div className="flex justify-between text-[10px] text-white/35 mb-1.5">
                    <span>Next level</span>
                    <span>{Math.round(impactScore % 100)}/100 pts</span>
                  </div>
                  <div className="h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
                    <motion.div
                      className="h-full rounded-full"
                      style={{ background: "linear-gradient(90deg, #f97316, #eab308)" }}
                      initial={{ width: 0 }}
                      animate={{ width: `${impactScore % 100}%` }}
                      transition={{ duration: 1.4, ease: [0.22, 1, 0.36, 1] }}
                    />
                  </div>
                </div>

                {/* Badges */}
                <div>
                  <p className="text-[10px] text-white/30 mb-2 uppercase tracking-wide">Badges</p>
                  <div className="flex flex-wrap gap-1.5">
                    {(impact?.badges?.length
                      ? impact.badges
                      : ["First Diagnosis 🎉", "10 Patients 👥", "ASHA Champion 🏆"]
                    ).map((b) => (
                      <span
                        key={b}
                        className="text-[10px] font-medium bg-yellow-500/10 text-yellow-400 border border-yellow-500/20 px-2 py-0.5 rounded-full whitespace-nowrap"
                      >
                        {b}
                      </span>
                    ))}
                  </div>
                </div>
              </GlassCard>
            </motion.div>
          </div>

          {/* ── High-Risk Patients ───────────────────────────────────────────── */}
          {highRisk.length > 0 && (
            <motion.div variants={fadeUp}>
              <GlassCard glow="red" className="overflow-hidden">
                {/* Card header */}
                <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-red-500/10">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-xl bg-red-500/15 flex items-center justify-center">
                      <Zap className="w-4 h-4 text-red-400" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-white">Immediate Attention Required</p>
                      <p className="text-xs text-red-400/70">{highRisk.length} patients at high risk</p>
                    </div>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    className="border-red-500/25 text-red-400 hover:bg-red-500/10 hover:border-red-500/40 gap-1.5 text-xs h-8 rounded-xl"
                    onClick={() => highRisk.forEach(p => handleSendAlert(p))}
                  >
                    <Bell className="w-3 h-3" /> Alert All
                  </Button>
                </div>

                {/* Patient rows */}
                <div className="p-4 space-y-2.5">
                  {highRisk.slice(0, 4).map((p, idx) => (
                    <motion.div
                      key={p.id}
                      initial={{ opacity: 0, x: -12 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: idx * 0.07, duration: 0.4 }}
                      className="flex flex-col sm:flex-row sm:items-center gap-2 p-3.5 rounded-xl bg-red-500/[0.05] border border-red-500/[0.12] hover:bg-red-500/[0.09] transition-colors"
                      style={{
                        borderLeft: "3px solid rgba(239,68,68,0.5)",
                      }}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        {/* Avatar */}
                        <div className="w-9 h-9 rounded-full bg-gradient-to-br from-red-500/30 to-orange-500/20 flex items-center justify-center shrink-0 text-sm font-bold text-white/70">
                          {p.name?.charAt(0) ?? "?"}
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-white truncate">{p.name}</p>
                          <p className="text-xs text-white/40 flex items-center gap-1 mt-0.5">
                            <MapPin className="w-2.5 h-2.5 shrink-0" />
                            {p.age}y · {p.village ?? "—"} · {p.diagnosis ?? "—"}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5 flex-wrap">
                        <RiskBadge level={p.risk_level ?? "HIGH"} size="sm" />
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 px-2 text-xs text-blue-400 hover:bg-blue-500/10 gap-1 rounded-lg"
                          onClick={() => handleSendSMS(p)}
                        >
                          <Send className="w-3 h-3" /> SMS
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 px-2 text-xs text-red-400 hover:bg-red-500/10 gap-1 rounded-lg disabled:opacity-40"
                          onClick={() => handleSendAlert(p)}
                          disabled={alerting[p.id]}
                        >
                          <Bell className="w-3 h-3" />
                          {alerting[p.id] ? "..." : "Alert"}
                        </Button>
                        <Button
                          size="sm"
                          className="h-7 text-xs rounded-lg"
                          style={{ background: "linear-gradient(135deg,#ea580c,#f97316)" }}
                          onClick={() => navigate("/asha/diagnose")}
                        >
                          Diagnose
                        </Button>
                      </div>
                    </motion.div>
                  ))}
                </div>
              </GlassCard>
            </motion.div>
          )}

          {/* ── Health Call Logs ─────────────────────────────────────────────── */}
          <motion.div variants={fadeUp}>
            <GlassCard glow="emerald">
              {/* Header */}
              <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-white/[0.05]">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-xl bg-emerald-500/15 flex items-center justify-center">
                    <UserCheck className="w-4 h-4 text-emerald-400" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-white">Health Call Activity</p>
                    <p className="text-xs text-white/35">{callLogs.length} call{callLogs.length !== 1 ? "s" : ""} logged</p>
                  </div>
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-8 px-3 text-xs text-white/40 hover:text-white gap-1.5 rounded-xl"
                  onClick={() => navigate("/asha/patients")}
                >
                  Call a patient
                </Button>
              </div>

              <div className="p-4">
                {callLogs.length === 0 ? (
                  <div className="py-12 flex flex-col items-center gap-3 text-center">
                    <div className="w-14 h-14 rounded-2xl bg-emerald-500/10 border border-emerald-500/15 flex items-center justify-center">
                      <Heart className="w-7 h-7 text-emerald-500/40" />
                    </div>
                    <p className="text-sm font-medium text-white/50">No health calls yet</p>
                    <p className="text-xs text-white/25 max-w-xs leading-relaxed">
                      When you call a patient via AI, or a patient calls the health line, their updates appear here.
                    </p>
                    <Button
                      size="sm"
                      className="mt-2 gap-1.5 text-xs rounded-xl"
                      style={{ background: "rgba(16,185,129,0.7)" }}
                      onClick={() => navigate("/asha/patients")}
                    >
                      <UserCheck className="w-3.5 h-3.5" /> Go to Patients
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {callLogs.slice(0, 8).map((log, idx) => {
                      const isInbound = log.direction === "inbound"
                      const isUrgent  = log.urgency === "urgent" || log.visit_requested

                      const typeIcons: Record<string, typeof Heart> = {
                        health_check:  Heart,
                        followup:      ClipboardList,
                        reminder:      Clock,
                        visit_request: MapPin,
                      }
                      const TypeIcon  = typeIcons[log.call_type] ?? Heart
                      const typeLabel: Record<string, string> = {
                        health_check:  "Health Check",
                        followup:      "Follow-up",
                        reminder:      "Reminder",
                        visit_request: "Visit Request",
                        emergency:     "Emergency",
                      }

                      return (
                        <motion.div
                          key={log.id}
                          initial={{ opacity: 0, y: 8 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: idx * 0.05 }}
                          className={`flex items-start gap-3 p-3.5 rounded-xl border transition-colors ${
                            isUrgent
                              ? "bg-amber-500/[0.07] border-amber-500/20"
                              : "bg-white/[0.025] border-white/[0.04] hover:bg-white/[0.05]"
                          }`}
                        >
                          {/* Direction icon */}
                          <div
                            className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 mt-0.5 ${
                              isInbound
                                ? "bg-blue-500/15 text-blue-400"
                                : "bg-emerald-500/15 text-emerald-400"
                            }`}
                          >
                            {isInbound
                              ? <PhoneIncoming  className="w-4 h-4" />
                              : <PhoneOutgoing  className="w-4 h-4" />
                            }
                          </div>

                          {/* Content */}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <p className="text-sm font-semibold text-white truncate">
                                {log.patient_name || log.patient_phone}
                              </p>
                              <span
                                className={`inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${
                                  log.call_type === "emergency"
                                    ? "bg-red-500/15 text-red-400"
                                    : "bg-white/[0.07] text-white/40"
                                }`}
                              >
                                <TypeIcon className="w-2.5 h-2.5" />
                                {typeLabel[log.call_type] ?? log.call_type}
                              </span>
                              {log.visit_requested && (
                                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-amber-500/15 text-amber-400 border border-amber-500/20">
                                  VISIT REQUEST
                                </span>
                              )}
                            </div>

                            {(log.health_update || log.symptoms) && (
                              <p className="text-xs text-white/40 mt-0.5 line-clamp-2">
                                {log.health_update || log.symptoms}
                              </p>
                            )}

                            <p className="text-[10px] text-white/25 mt-1 flex items-center gap-1">
                              <Clock className="w-2.5 h-2.5" />
                              {log.created_at ? formatDate(log.created_at) : "—"}
                              <span className="text-white/15">·</span>
                              {isInbound ? "Patient called in" : "You called out"}
                            </p>
                          </div>
                        </motion.div>
                      )
                    })}

                    {callLogs.length > 8 && (
                      <p className="text-xs text-white/25 text-center pt-2">
                        + {callLogs.length - 8} more entries
                      </p>
                    )}
                  </div>
                )}
              </div>
            </GlassCard>
          </motion.div>

        </motion.div>
      </div>
    </div>
  )
}
