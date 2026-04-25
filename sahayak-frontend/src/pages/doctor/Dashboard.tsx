import { useEffect, useState, useCallback, useRef } from "react"
import { useNavigate } from "react-router-dom"
import { motion } from "framer-motion"
import {
  Users, Activity, Calendar, AlertTriangle, TrendingUp, Heart,
  FileText, ChevronRight, FolderOpen, RefreshCw, PhoneCall, Clock,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { RiskBadge } from "@/components/shared/RiskBadge"
import { useStore } from "@/store/useStore"
import { getDoctorPatients, getDoctorAppointments, type Patient, type AppointmentItem } from "@/lib/api"
import { formatDate } from "@/lib/utils"
import { isDemoMode, demoAppointments, demoGet, demoHealthRecords, onSync, type DemoHealthRecord } from "@/lib/demoStore"
import {
  PieChart, Pie, Cell, Tooltip, ResponsiveContainer,
  AreaChart, Area, XAxis, YAxis, RadarChart, Radar,
  PolarGrid, PolarAngleAxis, PolarRadiusAxis,
} from "recharts"
import gsap from "gsap"
import { useGSAP } from "@gsap/react"

/* ── Static chart data ────────────────────────────────────────────────────── */

const WEEKLY_ACTIVITY = [
  { day: "Mon", patients: 4, critical: 1 },
  { day: "Tue", patients: 7, critical: 2 },
  { day: "Wed", patients: 5, critical: 1 },
  { day: "Thu", patients: 9, critical: 3 },
  { day: "Fri", patients: 6, critical: 2 },
  { day: "Sat", patients: 3, critical: 1 },
  { day: "Sun", patients: 2, critical: 0 },
]

const RISK_COLORS: Record<string, string> = {
  EMERGENCY: "#ef4444",
  HIGH:      "#f97316",
  MEDIUM:    "#eab308",
  LOW:       "#22c55e",
}

const OUTCOME_DATA = [
  { metric: "Recovery",    value: 82 },
  { metric: "Referrals",  value: 65 },
  { metric: "Follow-ups", value: 78 },
  { metric: "ICMR Match", value: 94 },
  { metric: "Response",   value: 88 },
  { metric: "Accuracy",   value: 91 },
]

/* ── GSAP Animated Counter ────────────────────────────────────────────────── */

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

/* ── Custom recharts tooltip ──────────────────────────────────────────────── */

const CustomTooltip = ({
  active,
  payload,
}: {
  active?: boolean
  payload?: Array<{ name: string; value: number; color: string }>
}) => {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-[#0e0e1a]/95 border border-white/[0.08] rounded-xl px-3.5 py-2.5 text-xs backdrop-blur-xl shadow-xl">
      {payload.map(p => (
        <div key={p.name} className="flex items-center gap-2 py-0.5">
          <span className="w-2 h-2 rounded-full shrink-0" style={{ background: p.color }} />
          <span className="text-gray-400">{p.name}:</span>
          <span className="text-white font-semibold">{p.value}</span>
        </div>
      ))}
    </div>
  )
}

/* ── Risk avatar palette ──────────────────────────────────────────────────── */

function riskAvatarStyle(risk: string): { bg: string; text: string; ring: string; glow: string } {
  switch (risk) {
    case "EMERGENCY": return { bg: "bg-red-500/20",    text: "text-red-300",    ring: "ring-red-500/40",    glow: "shadow-red-500/20" }
    case "HIGH":      return { bg: "bg-orange-500/20", text: "text-orange-300", ring: "ring-orange-500/40", glow: "shadow-orange-500/20" }
    case "MEDIUM":    return { bg: "bg-yellow-500/20", text: "text-yellow-300", ring: "ring-yellow-500/40", glow: "shadow-yellow-500/20" }
    default:          return { bg: "bg-green-500/20",  text: "text-green-300",  ring: "ring-green-500/40",  glow: "shadow-green-500/20" }
  }
}

function riskBorderColor(risk: string): string {
  switch (risk) {
    case "EMERGENCY": return "border-l-red-500"
    case "HIGH":      return "border-l-orange-500"
    case "MEDIUM":    return "border-l-yellow-400"
    default:          return "border-l-green-500"
  }
}

/* ── PatientCard ──────────────────────────────────────────────────────────── */

function PatientCard({ p, index, onClick }: { p: Patient; index: number; onClick: () => void }) {
  const risk    = p.risk_level ?? p.last_risk_level ?? "LOW"
  const avatar  = riskAvatarStyle(risk)
  const border  = riskBorderColor(risk)
  const initials = p.name.split(" ").map(n => n[0]).join("").slice(0, 2).toUpperCase()

  return (
    <motion.button
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.055, duration: 0.35 }}
      whileHover={{ y: -2, scale: 1.012 }}
      onClick={onClick}
      className={`
        text-left w-full rounded-2xl border border-white/[0.07] border-l-2 ${border}
        bg-white/[0.028] backdrop-blur-xl p-4
        hover:bg-white/[0.05] hover:border-white/[0.12]
        transition-all duration-200 group
        hover:shadow-lg ${avatar.glow}
      `}
    >
      {/* Header row */}
      <div className="flex items-start justify-between gap-2 mb-3.5">
        <div className="flex items-center gap-3 min-w-0">
          {/* Avatar ring */}
          <div
            className={`
              w-11 h-11 rounded-xl ${avatar.bg} ${avatar.text}
              flex items-center justify-center font-bold text-sm
              ring-2 ${avatar.ring} shrink-0
            `}
          >
            {initials}
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-white truncate leading-tight">{p.name}</p>
            <p className="text-[11px] text-gray-500 mt-0.5">
              {p.age}y · {p.gender === "F" ? "Female" : p.gender === "M" ? "Male" : p.gender}
              {p.village ? ` · ${p.village}` : ""}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <RiskBadge level={risk} size="sm" />
          <ChevronRight className="w-3.5 h-3.5 text-gray-600 group-hover:text-gray-300 transition-colors ml-0.5" />
        </div>
      </div>

      {/* Stats mini-row */}
      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-xl bg-white/[0.04] border border-white/[0.06] px-3 py-2 text-center">
          <p className="text-base font-bold text-white leading-none">{p.total_reports ?? 0}</p>
          <p className="text-[10px] text-gray-500 mt-0.5 uppercase tracking-wide">Reports</p>
        </div>
        <div className="rounded-xl bg-white/[0.04] border border-white/[0.06] px-2 py-2 text-center">
          <p className="text-[11px] font-medium text-gray-300 truncate leading-none">
            {p.last_report_date ? formatDate(p.last_report_date).split(",")[0] : "—"}
          </p>
          <p className="text-[10px] text-gray-500 mt-0.5 uppercase tracking-wide">Last Report</p>
        </div>
      </div>

      {/* Diagnosis */}
      {p.diagnosis && (
        <p className="text-[11px] text-gray-600 mt-2.5 truncate">
          <span className="text-gray-500 font-medium">Dx: </span>{p.diagnosis}
        </p>
      )}
    </motion.button>
  )
}

/* ── Glassmorphism card wrapper ───────────────────────────────────────────── */

function GlassCard({
  children,
  className = "",
  accentColor = "",
}: {
  children: React.ReactNode
  className?: string
  accentColor?: string
}) {
  return (
    <div
      className={`
        rounded-2xl border border-white/[0.07] bg-white/[0.028] backdrop-blur-xl
        ${accentColor}
        ${className}
      `}
    >
      {children}
    </div>
  )
}

/* ── Stat card ────────────────────────────────────────────────────────────── */

interface StatDef {
  label: string
  value: number
  icon: React.ElementType
  iconBg: string
  iconColor: string
  glow: string
  border: string
}

function StatCard({ stat, index }: { stat: StatDef; index: number }) {
  const Icon = stat.icon
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.08, duration: 0.4 }}
      whileHover={{ y: -3, scale: 1.02 }}
    >
      <GlassCard accentColor={`border-t ${stat.border}`} className="p-5 h-full">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[11px] uppercase tracking-widest text-gray-500 font-medium mb-2">{stat.label}</p>
            <p className={`text-4xl font-extrabold text-white leading-none`}>
              <AnimatedCounter to={stat.value} />
            </p>
          </div>
          <div
            className={`
              w-11 h-11 rounded-xl ${stat.iconBg} flex items-center justify-center shrink-0
              shadow-lg ${stat.glow}
            `}
          >
            <Icon className={`w-5 h-5 ${stat.iconColor}`} />
          </div>
        </div>
      </GlassCard>
    </motion.div>
  )
}

/* ══════════════════════════════════════════════════════════════════════════ */
/*  Main dashboard                                                            */
/* ══════════════════════════════════════════════════════════════════════════ */

export default function DoctorDashboard() {
  const navigate                = useNavigate()
  const { user }                = useStore()
  const [patients,      setPatients]      = useState<Patient[]>([])
  const [todayAppts,    setTodayAppts]    = useState<AppointmentItem[]>([])
  const [loading,       setLoading]       = useState(true)
  const [fetchErr,      setFetchErr]      = useState("")
  const [healthRecords, setHealthRecords] = useState<DemoHealthRecord[]>([])

  const doctorId = (user as any)?.id as number | undefined

  const fetchData = useCallback(() => {
    setFetchErr("")

    // ── Demo mode: load from localStorage ──────────────────────────
    if (isDemoMode()) {
      const todayStr = new Date().toISOString().slice(0, 10)
      const allAppts = demoAppointments.getAll()
      const todayItems: AppointmentItem[] = allAppts
        .filter(a => a.preferred_time.startsWith(todayStr))
        .map(a => {
          const [date, time] = a.preferred_time.split(" ")
          return {
            id:           parseInt(a.id),
            patient_name: a.patient_name,
            date:         date ?? todayStr,
            time:         time ?? "10:00",
            status:       a.status === "pending" ? "booked" : a.status,
            reason:       a.reason,
            is_today:     true,
            is_manual:    false,
          } as AppointmentItem
        })
      setTodayAppts(todayItems)
      // Show demo patients from ASHA patients store if any, otherwise empty
      const demoPatients = demoGet<Patient[]>("asha_patients", [])
      setPatients(demoPatients)
      setLoading(false)
      return
    }

    // ── Real backend ────────────────────────────────────────────────
    const prom1 = getDoctorPatients()
      .then(p => setPatients(p))
      .catch(err => {
        setFetchErr(err instanceof Error ? err.message : "Failed to load patients")
        setPatients([])
      })
    const prom2 = doctorId
      ? getDoctorAppointments(doctorId, 1)
          .then(a => setTodayAppts(a.filter(x => x.is_today)))
          .catch(() => {})
      : Promise.resolve()
    Promise.all([prom1, prom2]).finally(() => setLoading(false))
  }, [doctorId])

  useEffect(() => {
    fetchData()
    const onFocus = () => fetchData()
    window.addEventListener("focus", onFocus)
    const interval = setInterval(fetchData, 30_000)
    return () => { window.removeEventListener("focus", onFocus); clearInterval(interval) }
  }, [fetchData])

  // Demo mode: load health records and subscribe to live updates from ASHA calls
  useEffect(() => {
    if (!isDemoMode()) return
    const load = () => setHealthRecords(demoHealthRecords.getAll())
    load()
    return onSync(load)
  }, [])

  /* Derived data */
  const riskDist = Object.entries(
    patients.reduce<Record<string, number>>((acc, p) => {
      const r = p.risk_level ?? p.last_risk_level ?? "LOW"
      acc[r] = (acc[r] ?? 0) + 1
      return acc
    }, {})
  ).map(([name, value]) => ({ name, value }))

  const highRiskCount = patients.filter(p =>
    ["HIGH", "EMERGENCY"].includes(p.risk_level ?? p.last_risk_level ?? "")
  ).length

  const stats: StatDef[] = [
    {
      label: "Total Patients",
      value: patients.length,
      icon: Users,
      iconBg: "bg-blue-500/20",
      iconColor: "text-blue-400",
      glow: "shadow-blue-500/30",
      border: "border-blue-500/30",
    },
    {
      label: "High Risk",
      value: highRiskCount,
      icon: AlertTriangle,
      iconBg: "bg-red-500/20",
      iconColor: "text-red-400",
      glow: "shadow-red-500/30",
      border: "border-red-500/30",
    },
    {
      label: "Active Today",
      value: Math.ceil(patients.length * 0.3),
      icon: Activity,
      iconBg: "bg-green-500/20",
      iconColor: "text-green-400",
      glow: "shadow-green-500/30",
      border: "border-green-500/30",
    },
    {
      label: "Today's Appts",
      value: todayAppts.length,
      icon: Calendar,
      iconBg: "bg-purple-500/20",
      iconColor: "text-purple-400",
      glow: "shadow-purple-500/30",
      border: "border-purple-500/30",
    },
  ]

  const lastName = user?.name?.split(" ").slice(-1)[0] ?? "Doctor"
  const today    = formatDate(new Date())

  /* ── Render ─────────────────────────────────────────────────────────────── */

  return (
    <div
      className="min-h-screen p-6 max-w-7xl mx-auto space-y-6"
      style={{ background: "#080810" }}
    >

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="flex items-start justify-between gap-4 flex-wrap"
      >
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight">
            <span className="text-gray-300">Welcome, </span>
            <span
              className="bg-gradient-to-r from-blue-400 via-cyan-300 to-purple-400 bg-clip-text text-transparent"
            >
              Dr. {lastName}
            </span>
          </h1>
          <p className="text-sm text-gray-500 mt-1.5 flex items-center gap-2">
            <span
              className="inline-block w-1.5 h-1.5 rounded-full bg-green-400 shadow shadow-green-400/50"
            />
            {today} · Clinical Dashboard
          </p>
        </div>

        {/* Refresh indicator */}
        <div className="flex items-center gap-2">
          <motion.button
            whileHover={{ rotate: 180 }}
            transition={{ duration: 0.35 }}
            onClick={fetchData}
            className="p-2 rounded-xl bg-white/[0.04] border border-white/[0.07] text-gray-400 hover:text-white hover:bg-white/[0.08] transition-all"
            title="Refresh"
          >
            <RefreshCw className="w-4 h-4" />
          </motion.button>
        </div>
      </motion.div>

      {/* ── Stats ──────────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {loading
          ? Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-28 rounded-2xl" style={{ background: "rgba(255,255,255,0.04)" }} />
            ))
          : stats.map((s, i) => <StatCard key={s.label} stat={s} index={i} />)
        }
      </div>

      {/* ── Charts row ─────────────────────────────────────────────────────── */}
      <div className="grid lg:grid-cols-3 gap-4">

        {/* Risk Distribution — Donut */}
        <motion.div
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.32, duration: 0.4 }}
        >
          <GlassCard className="h-full p-5">
            <div className="flex items-center gap-2 mb-4">
              <div className="w-8 h-8 rounded-lg bg-red-500/15 flex items-center justify-center">
                <Heart className="w-4 h-4 text-red-400" />
              </div>
              <span className="text-sm font-semibold text-white">Risk Distribution</span>
            </div>

            {riskDist.length === 0 ? (
              <div className="flex items-center justify-center h-[180px] text-gray-600 text-sm">
                No patient data
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={190}>
                <PieChart>
                  <defs>
                    {riskDist.map(r => (
                      <filter key={r.name} id={`glow-${r.name}`} x="-20%" y="-20%" width="140%" height="140%">
                        <feGaussianBlur stdDeviation="3" result="blur" />
                        <feMerge>
                          <feMergeNode in="blur" />
                          <feMergeNode in="SourceGraphic" />
                        </feMerge>
                      </filter>
                    ))}
                  </defs>
                  <Pie
                    data={riskDist}
                    cx="50%" cy="50%"
                    innerRadius={52} outerRadius={76}
                    paddingAngle={3}
                    dataKey="value"
                    strokeWidth={0}
                  >
                    {riskDist.map((entry, i) => (
                      <Cell
                        key={i}
                        fill={RISK_COLORS[entry.name] ?? "#6b7280"}
                        style={{ filter: `drop-shadow(0 0 6px ${RISK_COLORS[entry.name] ?? "#6b7280"}66)` }}
                      />
                    ))}
                  </Pie>
                  <Tooltip
                    content={({ active, payload }) => {
                      if (!active || !payload?.length) return null
                      const d = payload[0]
                      return (
                        <div className="bg-[#0e0e1a]/95 border border-white/[0.08] rounded-xl px-3.5 py-2 text-xs backdrop-blur-xl">
                          <span style={{ color: RISK_COLORS[d.name as string] ?? "#fff" }} className="font-semibold">
                            {d.name}
                          </span>
                          <span className="text-gray-400 ml-2">{d.value} patients</span>
                        </div>
                      )
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>
            )}

            {/* Legend */}
            <div className="flex flex-wrap gap-x-4 gap-y-2 mt-2 justify-center">
              {riskDist.map(r => (
                <span key={r.name} className="flex items-center gap-1.5 text-[11px] text-gray-400">
                  <span
                    className="w-2.5 h-2.5 rounded-full"
                    style={{
                      background: RISK_COLORS[r.name] ?? "#6b7280",
                      boxShadow: `0 0 6px ${RISK_COLORS[r.name] ?? "#6b7280"}80`,
                    }}
                  />
                  {r.name}
                  <span className="text-gray-600">({r.value})</span>
                </span>
              ))}
            </div>
          </GlassCard>
        </motion.div>

        {/* Weekly Activity — Area Chart */}
        <motion.div
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.38, duration: 0.4 }}
          className="lg:col-span-2"
        >
          <GlassCard className="h-full p-5">
            <div className="flex items-center gap-2 mb-4">
              <div className="w-8 h-8 rounded-lg bg-blue-500/15 flex items-center justify-center">
                <TrendingUp className="w-4 h-4 text-blue-400" />
              </div>
              <span className="text-sm font-semibold text-white">Weekly Patient Activity</span>
            </div>
            <ResponsiveContainer width="100%" height={195}>
              <AreaChart data={WEEKLY_ACTIVITY} margin={{ top: 4, right: 4, left: -22, bottom: 0 }}>
                <defs>
                  <linearGradient id="patG" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor="#3b82f6" stopOpacity={0.4} />
                    <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="critG" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor="#ef4444" stopOpacity={0.4} />
                    <stop offset="95%" stopColor="#ef4444" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="day" tick={{ fill: "#4b5563", fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: "#4b5563", fontSize: 11 }} axisLine={false} tickLine={false} />
                <Tooltip content={<CustomTooltip />} />
                <Area
                  type="monotone" dataKey="patients"
                  stroke="#3b82f6" fill="url(#patG)" strokeWidth={2}
                  dot={{ fill: "#3b82f6", r: 3, strokeWidth: 0 }}
                  name="Patients" color="#3b82f6"
                />
                <Area
                  type="monotone" dataKey="critical"
                  stroke="#ef4444" fill="url(#critG)" strokeWidth={2}
                  dot={{ fill: "#ef4444", r: 3, strokeWidth: 0 }}
                  name="Critical" color="#ef4444"
                />
              </AreaChart>
            </ResponsiveContainer>
          </GlassCard>
        </motion.div>
      </div>

      {/* ── Radar + Recent Patients ─────────────────────────────────────────── */}
      <div className="grid lg:grid-cols-3 gap-4">

        {/* Clinical Outcomes Radar */}
        <motion.div
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.44, duration: 0.4 }}
        >
          <GlassCard className="h-full p-5">
            <div className="flex items-center gap-2 mb-4">
              <div className="w-8 h-8 rounded-lg bg-cyan-500/15 flex items-center justify-center">
                <Activity className="w-4 h-4 text-cyan-400" />
              </div>
              <span className="text-sm font-semibold text-white">Clinical Outcomes</span>
            </div>
            <ResponsiveContainer width="100%" height={220}>
              <RadarChart data={OUTCOME_DATA} margin={{ top: 10, right: 20, bottom: 10, left: 20 }}>
                <PolarGrid stroke="rgba(255,255,255,0.06)" />
                <PolarAngleAxis dataKey="metric" tick={{ fill: "#6b7280", fontSize: 10 }} />
                <PolarRadiusAxis angle={30} domain={[0, 100]} tick={false} axisLine={false} />
                <Radar
                  name="Score"
                  dataKey="value"
                  stroke="#06b6d4"
                  fill="#06b6d4"
                  fillOpacity={0.18}
                  strokeWidth={2}
                  dot={{ fill: "#06b6d4", r: 3, strokeWidth: 0 }}
                />
                <Tooltip
                  contentStyle={{
                    background: "rgba(14,14,26,0.95)",
                    border: "1px solid rgba(255,255,255,0.08)",
                    borderRadius: 12,
                    fontSize: 12,
                    backdropFilter: "blur(12px)",
                  }}
                  formatter={(v: number) => [`${v}%`, "Score"]}
                />
              </RadarChart>
            </ResponsiveContainer>
          </GlassCard>
        </motion.div>

        {/* Recent patients */}
        <motion.div
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5, duration: 0.4 }}
          className="lg:col-span-2"
        >
          <GlassCard className="h-full p-5">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-blue-500/15 flex items-center justify-center">
                  <Users className="w-4 h-4 text-blue-400" />
                </div>
                <span className="text-sm font-semibold text-white">Recent Patients</span>
              </div>
              <Button
                variant="ghost" size="sm"
                className="text-[11px] text-gray-400 hover:text-white h-7 px-3 rounded-lg border border-white/[0.06] hover:border-white/[0.12] hover:bg-white/[0.05]"
                onClick={() => navigate("/doctor/access")}
              >
                Access by code
              </Button>
            </div>

            {loading ? (
              <div className="space-y-2.5">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Skeleton key={i} className="h-14 rounded-xl" style={{ background: "rgba(255,255,255,0.04)" }} />
                ))}
              </div>
            ) : patients.length === 0 ? (
              <p className="text-sm text-gray-600 py-8 text-center">No patients linked yet</p>
            ) : (
              <div className="space-y-2">
                {patients.slice(0, 6).map((p, i) => {
                  const risk    = p.risk_level ?? p.last_risk_level ?? "LOW"
                  const avatar  = riskAvatarStyle(risk)
                  const initials = p.name.split(" ").map(n => n[0]).join("").slice(0, 2).toUpperCase()
                  return (
                    <motion.button
                      key={p.id}
                      initial={{ opacity: 0, x: -14 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: i * 0.055 }}
                      whileHover={{ x: 3 }}
                      onClick={() => navigate(`/doctor/patient/${p.id}`)}
                      className="w-full flex items-center justify-between p-3 rounded-xl border border-white/[0.05] bg-white/[0.02] hover:bg-white/[0.05] hover:border-white/[0.1] transition-all text-left group"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className={`w-9 h-9 rounded-xl ${avatar.bg} ${avatar.text} flex items-center justify-center text-xs font-bold shrink-0 ring-1 ${avatar.ring}`}>
                          {initials}
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-white truncate">{p.name}</p>
                          <p className="text-[11px] text-gray-500 mt-0.5 truncate">
                            {p.age}y · {p.gender} · {p.village ?? "—"}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0 flex-shrink-0">
                        {(p.total_reports ?? 0) > 0 && (
                          <span className="text-[11px] text-gray-600 hidden sm:flex items-center gap-1">
                            <FileText className="w-3 h-3" /> {p.total_reports}
                          </span>
                        )}
                        <RiskBadge level={risk} size="sm" />
                        <ChevronRight className="w-3.5 h-3.5 text-gray-600 group-hover:text-gray-300 transition-colors" />
                      </div>
                    </motion.button>
                  )
                })}
              </div>
            )}
          </GlassCard>
        </motion.div>
      </div>

      {/* ── Today's Appointments ────────────────────────────────────────────── */}
      <motion.div
        initial={{ opacity: 0, y: 18 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.56, duration: 0.4 }}
      >
        <GlassCard className="p-5" accentColor="border-purple-500/[0.15]">
          {/* Header */}
          <div className="flex items-center justify-between mb-5">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-purple-500/20 flex items-center justify-center shadow-lg shadow-purple-500/20">
                <Calendar className="w-4.5 h-4.5 text-purple-400 w-[18px] h-[18px]" />
              </div>
              <div>
                <p className="text-sm font-bold text-white flex items-center gap-2">
                  Today's Appointments
                  {todayAppts.length > 0 && (
                    <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-purple-500/15 text-purple-300 border border-purple-500/25">
                      {todayAppts.length} booked
                    </span>
                  )}
                </p>
                <p className="text-[11px] text-gray-600 mt-0.5">Real-time via AI voice agent</p>
              </div>
            </div>
            <Button
              variant="ghost" size="sm"
              className="text-[11px] text-gray-400 hover:text-purple-300 h-7 px-3 rounded-lg border border-white/[0.06] hover:border-purple-500/30 hover:bg-purple-500/[0.07]"
              onClick={() => navigate("/doctor/appointments")}
            >
              View all →
            </Button>
          </div>

          {/* Body */}
          {loading ? (
            <div className="space-y-2.5">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-14 rounded-xl" style={{ background: "rgba(255,255,255,0.04)" }} />
              ))}
            </div>
          ) : todayAppts.length === 0 ? (
            <div className="py-10 text-center">
              <div className="w-12 h-12 rounded-2xl bg-purple-500/10 border border-purple-500/15 flex items-center justify-center mx-auto mb-3">
                <Calendar className="w-6 h-6 text-purple-400/50" />
              </div>
              <p className="text-sm text-gray-500 font-medium">No appointments booked yet</p>
              <p className="text-xs text-gray-600 mt-1 max-w-xs mx-auto">
                Patients booking via the AI voice agent will appear here in real-time
              </p>
            </div>
          ) : (
            <div className="space-y-2.5">
              {todayAppts.slice(0, 6).map((a, i) => (
                <motion.div
                  key={a.id}
                  initial={{ opacity: 0, x: -12 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.055 }}
                  className="flex items-center gap-3.5 p-3.5 rounded-xl border border-white/[0.05] bg-white/[0.025] hover:bg-white/[0.04] transition-colors"
                >
                  {/* Time pill */}
                  <div className="px-2.5 py-1.5 rounded-lg bg-purple-500/15 border border-purple-500/25 shrink-0 text-center min-w-[3rem]">
                    <span className="text-xs font-bold text-purple-300 block leading-none">
                      {a.time?.slice(0, 5) || "--"}
                    </span>
                  </div>

                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-white truncate">{a.patient_name || "Unknown"}</p>
                    <p className="text-[11px] text-gray-500 truncate mt-0.5">{a.reason || "Doctor consultation"}</p>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    {a.is_manual && (
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-300 border border-amber-500/20">
                        PRIORITY
                      </span>
                    )}
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-green-500/10 text-green-400 border border-green-500/20">
                      Confirmed
                    </span>
                  </div>
                </motion.div>
              ))}
              {todayAppts.length > 6 && (
                <p className="text-xs text-gray-600 text-center pt-1">
                  +{todayAppts.length - 6} more —{" "}
                  <button onClick={() => navigate("/doctor/appointments")} className="text-purple-400 hover:underline">
                    View all
                  </button>
                </p>
              )}
            </div>
          )}
        </GlassCard>
      </motion.div>

      {/* ── Health Call Records (demo mode) ─────────────────────────────────── */}
      {isDemoMode() && healthRecords.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.59, duration: 0.4 }}
        >
          <GlassCard className="p-5" accentColor="border-emerald-500/[0.15]">
            {/* Header */}
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-emerald-500/20 flex items-center justify-center shadow-lg shadow-emerald-500/20">
                  <PhoneCall className="w-[18px] h-[18px] text-emerald-400" />
                </div>
                <div>
                  <p className="text-sm font-bold text-white">Health Call Records</p>
                  <p className="text-[11px] text-gray-600 mt-0.5">
                    From ASHA outbound calls · {healthRecords.length} record{healthRecords.length !== 1 ? "s" : ""}
                  </p>
                </div>
              </div>
            </div>

            <div className="space-y-2.5">
              {healthRecords.slice(0, 6).map((rec, i) => {
                const RISK_MAP: Record<string, { text: string; bg: string; border: string }> = {
                  LOW:       { text: "#34d399", bg: "rgba(52,211,153,0.1)",  border: "rgba(52,211,153,0.2)" },
                  MEDIUM:    { text: "#fbbf24", bg: "rgba(251,191,36,0.1)",  border: "rgba(251,191,36,0.2)" },
                  HIGH:      { text: "#f87171", bg: "rgba(248,113,113,0.1)", border: "rgba(248,113,113,0.2)" },
                  EMERGENCY: { text: "#ef4444", bg: "rgba(239,68,68,0.15)",  border: "rgba(239,68,68,0.3)"  },
                }
                const rc = RISK_MAP[rec.risk_level] ?? RISK_MAP.LOW
                return (
                  <motion.div
                    key={rec.id}
                    initial={{ opacity: 0, x: -12 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.055 }}
                    className="flex items-start gap-3 p-3.5 rounded-xl border border-white/[0.05] bg-white/[0.025] hover:bg-white/[0.04] transition-colors"
                  >
                    <div className="w-9 h-9 rounded-xl bg-emerald-500/15 flex items-center justify-center shrink-0 mt-0.5">
                      <PhoneCall className="w-4 h-4 text-emerald-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm font-semibold text-white truncate">{rec.patient_name}</p>
                        <span className="text-[10px] font-medium text-gray-500 bg-white/[0.06] px-1.5 py-0.5 rounded-full">
                          {rec.title}
                        </span>
                      </div>
                      <p className="text-xs text-gray-400 mt-0.5 line-clamp-2">{rec.summary}</p>
                      <p className="text-[10px] text-gray-600 mt-1 flex items-center gap-1">
                        <Clock className="w-2.5 h-2.5" />
                        {rec.created_at ? formatDate(rec.created_at) : "—"}
                      </p>
                    </div>
                    <span
                      className="text-[10px] font-bold px-2.5 py-1 rounded-full shrink-0 mt-0.5"
                      style={{ color: rc.text, background: rc.bg, border: `1px solid ${rc.border}` }}
                    >
                      {rec.risk_level}
                    </span>
                  </motion.div>
                )
              })}
              {healthRecords.length > 6 && (
                <p className="text-xs text-gray-600 text-center pt-1">
                  +{healthRecords.length - 6} more call records
                </p>
              )}
            </div>
          </GlassCard>
        </motion.div>
      )}

      {/* ── My Patients ────────────────────────────────────────────────────── */}
      <motion.div
        initial={{ opacity: 0, y: 18 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.62, duration: 0.4 }}
      >
        <GlassCard className="p-5" accentColor="border-blue-500/[0.12]">
          {/* Header */}
          <div className="flex items-center justify-between mb-5">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-blue-500/20 flex items-center justify-center shadow-lg shadow-blue-500/20">
                <Users className="w-[18px] h-[18px] text-blue-400" />
              </div>
              <div>
                <p className="text-sm font-bold text-white">
                  My Patients
                  {!loading && patients.length > 0 && (
                    <span className="text-xs font-normal text-gray-500 ml-1.5">({patients.length})</span>
                  )}
                </p>
                <p className="text-[11px] text-gray-600 mt-0.5">Full patient registry</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <motion.button
                whileHover={{ rotate: 180 }}
                transition={{ duration: 0.35 }}
                onClick={fetchData}
                className="p-1.5 rounded-lg text-gray-500 hover:text-gray-300 hover:bg-white/[0.05] border border-white/[0.05] hover:border-white/[0.1] transition-all"
                title="Refresh patient list"
              >
                <RefreshCw className="w-3.5 h-3.5" />
              </motion.button>
              <Button
                size="sm"
                className="h-8 text-[11px] bg-blue-600/80 hover:bg-blue-600 text-white border-0 rounded-xl px-3 shadow-lg shadow-blue-500/20"
                onClick={() => navigate("/doctor/access")}
              >
                + Access Patient
              </Button>
            </div>
          </div>

          {/* Body */}
          {loading ? (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-36 rounded-2xl" style={{ background: "rgba(255,255,255,0.04)" }} />
              ))}
            </div>
          ) : fetchErr ? (
            <div className="flex flex-col items-center justify-center py-12 gap-4 text-center">
              <div className="w-12 h-12 rounded-2xl bg-red-500/10 border border-red-500/20 flex items-center justify-center">
                <AlertTriangle className="w-6 h-6 text-red-400/70" />
              </div>
              <div>
                <p className="text-red-300 font-semibold text-sm">Could not load patients</p>
                <p className="text-gray-600 text-xs mt-1 max-w-xs">{fetchErr}</p>
              </div>
              <button
                onClick={fetchData}
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-white/[0.05] hover:bg-white/[0.09] border border-white/[0.07] text-gray-400 hover:text-white text-sm transition-all"
              >
                <RefreshCw className="w-3.5 h-3.5" /> Retry
              </button>
            </div>
          ) : patients.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 gap-5">
              <div className="w-16 h-16 rounded-2xl bg-blue-500/10 border border-blue-500/15 flex items-center justify-center">
                <FolderOpen className="w-8 h-8 text-blue-400/50" />
              </div>
              <div className="text-center">
                <p className="text-white font-semibold">No patients linked yet</p>
                <p className="text-gray-500 text-sm mt-1 max-w-xs">
                  Ask your patient to share their access code, then enter it below
                </p>
              </div>
              <Button
                size="sm"
                className="bg-blue-600 hover:bg-blue-700 text-white rounded-xl shadow-lg shadow-blue-500/25"
                onClick={() => navigate("/doctor/access")}
              >
                Access First Patient
              </Button>
            </div>
          ) : (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {patients.map((p, i) => (
                <PatientCard
                  key={p.id}
                  p={p}
                  index={i}
                  onClick={() => navigate(`/doctor/patient/${p.id}`)}
                />
              ))}
            </div>
          )}
        </GlassCard>
      </motion.div>

      {/* ── High-Risk Alerts ────────────────────────────────────────────────── */}
      {patients.filter(p =>
        ["HIGH", "EMERGENCY"].includes(p.risk_level ?? p.last_risk_level ?? "")
      ).length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.68, duration: 0.4 }}
        >
          <GlassCard accentColor="border-red-500/20" className="p-5">
            {/* Header */}
            <div className="flex items-center gap-3 mb-5">
              <div className="w-9 h-9 rounded-xl bg-red-500/20 flex items-center justify-center shadow-lg shadow-red-500/25">
                <AlertTriangle className="w-[18px] h-[18px] text-red-400" />
              </div>
              <div>
                <p className="text-sm font-bold text-red-300">High-Risk Alerts</p>
                <p className="text-[11px] text-gray-600 mt-0.5">Patients requiring immediate attention</p>
              </div>
            </div>

            {/* Alert rows */}
            <div className="space-y-2.5">
              {patients
                .filter(p => ["HIGH", "EMERGENCY"].includes(p.risk_level ?? p.last_risk_level ?? ""))
                .slice(0, 4)
                .map((p, i) => {
                  const risk     = p.risk_level ?? p.last_risk_level ?? "HIGH"
                  const initials = p.name.split(" ").map(n => n[0]).join("").slice(0, 2).toUpperCase()
                  return (
                    <motion.div
                      key={p.id}
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: i * 0.06 }}
                      className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 p-3.5 rounded-xl bg-red-500/[0.05] border border-red-500/15 border-l-2 border-l-red-500 hover:bg-red-500/[0.08] transition-colors"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-9 h-9 rounded-xl bg-red-500/20 text-red-300 flex items-center justify-center text-xs font-bold shrink-0 ring-1 ring-red-500/35">
                          {initials}
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-white truncate">{p.name}</p>
                          <p className="text-[11px] text-gray-500 truncate mt-0.5">
                            {p.age}y · {p.village ?? "—"} · {p.diagnosis ?? "—"}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <RiskBadge level={risk} size="sm" />
                        <Button
                          size="sm"
                          className="h-7 text-[11px] px-3 bg-red-600/80 hover:bg-red-600 text-white rounded-lg border-0 shadow shadow-red-500/20"
                          onClick={() => navigate(`/doctor/patient/${p.id}`)}
                        >
                          View
                        </Button>
                      </div>
                    </motion.div>
                  )
                })}
            </div>
          </GlassCard>
        </motion.div>
      )}
    </div>
  )
}
