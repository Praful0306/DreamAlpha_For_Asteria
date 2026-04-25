import { NavLink, useNavigate } from "react-router-dom"
import { motion, AnimatePresence } from "framer-motion"
import {
  LayoutDashboard, Mic, Upload, FileText, Share2,
  Users, Activity, Map, CheckSquare, Bell, Baby,
  Syringe, ClipboardList, MessageSquare,
  HeartPulse, LogOut, ChevronLeft, ChevronRight, Phone,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { useStore } from "@/store/useStore"
import { clearSession } from "@/lib/auth"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"

const NAV: Record<string, { label: string; icon: React.ElementType; href: string }[]> = {
  patient: [
    { label: "Dashboard",    icon: LayoutDashboard, href: "/patient" },
    { label: "Diagnosis",    icon: Mic,             href: "/patient/diagnose" },
    { label: "Upload Report",icon: Upload,          href: "/patient/upload" },
    { label: "Reports",      icon: FileText,        href: "/patient/reports" },
    { label: "Vitals",       icon: HeartPulse,      href: "/patient/vitals" },
    { label: "Share",        icon: Share2,          href: "/patient/access" },
    { label: "Call Centre",  icon: Phone,           href: "/patient/call" },
    { label: "Chat",         icon: MessageSquare,   href: "/patient/chat" },
  ],
  doctor: [
    { label: "Dashboard",    icon: LayoutDashboard, href: "/doctor" },
    { label: "Access Patient",icon: Share2,         href: "/doctor/access" },
    { label: "Appointments", icon: Bell,            href: "/doctor/appointments" },
    { label: "Chat",         icon: MessageSquare,   href: "/doctor/chat" },
  ],
  asha: [
    { label: "Dashboard",    icon: LayoutDashboard, href: "/asha" },
    { label: "My Patients",  icon: Users,           href: "/asha/patients" },
    { label: "Diagnosis",    icon: Mic,             href: "/asha/diagnose" },
    { label: "Disease Map",  icon: Map,             href: "/asha/heatmap" },
    { label: "Tasks",        icon: CheckSquare,     href: "/asha/tasks" },
    { label: "Reminders",    icon: Bell,            href: "/asha/reminders" },
    { label: "Maternal",     icon: Baby,            href: "/asha/maternal" },
    { label: "Immunization", icon: Syringe,         href: "/asha/immunization" },
    { label: "Surveillance", icon: Activity,        href: "/asha/surveillance" },
    { label: "Gov Report",   icon: ClipboardList,   href: "/asha/report" },
    { label: "Chat",         icon: MessageSquare,   href: "/asha/chat" },
  ],
}

const ROLE_THEME: Record<string, { gradFrom: string; gradTo: string; glow: string; accent: string }> = {
  patient: { gradFrom: "#f97316", gradTo: "#fbbf24", glow: "rgba(249,115,22,0.45)", accent: "#f97316" },
  doctor:  { gradFrom: "#3b82f6", gradTo: "#818cf8", glow: "rgba(59,130,246,0.45)",  accent: "#3b82f6" },
  asha:    { gradFrom: "#f97316", gradTo: "#fbbf24", glow: "rgba(249,115,22,0.45)", accent: "#f97316" },
}

interface SidebarProps {
  role: string
  collapsed: boolean
  onToggle: () => void
}

export function Sidebar({ role, collapsed, onToggle }: SidebarProps) {
  const { user, clearAuth } = useStore()
  const navigate = useNavigate()
  const items = NAV[role] ?? []
  const theme = ROLE_THEME[role] ?? ROLE_THEME.patient

  function handleLogout() {
    clearSession()
    clearAuth()
    navigate("/auth", { replace: true })
  }

  return (
    <motion.aside
      animate={{ width: collapsed ? 64 : 256 }}
      transition={{ type: "spring", stiffness: 300, damping: 30 }}
      className="relative flex flex-col h-screen shrink-0 overflow-hidden z-20"
      style={{
        background: "linear-gradient(180deg, rgba(10,8,20,0.99) 0%, rgba(7,7,14,1) 100%)",
        borderRight: "1px solid rgba(255,255,255,0.05)",
      }}
    >
      {/* ── Ambient top glow ─────────────────────────────────────────────────── */}
      <div
        className="absolute top-0 left-0 w-full h-56 pointer-events-none"
        style={{
          background: `radial-gradient(ellipse at top left, ${theme.glow.replace("0.45", "0.10")} 0%, transparent 65%)`,
        }}
      />

      {/* ── Left edge gradient accent line ───────────────────────────────────── */}
      <div
        className="absolute left-0 top-12 bottom-12 w-[2px] pointer-events-none rounded-full"
        style={{
          background: `linear-gradient(180deg, transparent 0%, ${theme.gradFrom} 25%, ${theme.gradTo} 75%, transparent 100%)`,
          opacity: 0.5,
        }}
      />

      {/* ── Header ───────────────────────────────────────────────────────────── */}
      <div
        className="relative flex items-center h-16 px-4 shrink-0"
        style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }}
      >
        <AnimatePresence mode="wait">
          {!collapsed ? (
            <motion.div
              key="full"
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -10 }}
              transition={{ duration: 0.18 }}
              className="flex items-center gap-3 flex-1 min-w-0"
            >
              {/* Logo icon */}
              <div
                className="relative w-8 h-8 rounded-xl flex items-center justify-center shrink-0"
                style={{
                  background: `linear-gradient(135deg, ${theme.gradFrom} 0%, ${theme.gradTo} 100%)`,
                  boxShadow: `0 0 22px ${theme.glow}`,
                }}
              >
                <HeartPulse className="w-4 h-4 text-white relative z-10" />
                {/* Shine overlay */}
                <div
                  className="absolute inset-0 rounded-xl"
                  style={{ background: "linear-gradient(135deg, rgba(255,255,255,0.22) 0%, transparent 55%)" }}
                />
              </div>
              {/* Brand name */}
              <div className="flex items-baseline gap-[2px] min-w-0">
                <span
                  className="font-extrabold text-[15px] tracking-tight leading-none"
                  style={{
                    background: `linear-gradient(135deg, ${theme.gradFrom} 0%, ${theme.gradTo} 100%)`,
                    WebkitBackgroundClip: "text",
                    WebkitTextFillColor: "transparent",
                    backgroundClip: "text",
                  }}
                >
                  Sahayak
                </span>
                <span className="text-[15px] font-light text-white/35 tracking-tight leading-none"> AI</span>
              </div>
            </motion.div>
          ) : (
            <motion.div
              key="icon"
              initial={{ opacity: 0, scale: 0.75 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.75 }}
              transition={{ duration: 0.18 }}
              className="relative w-8 h-8 rounded-xl flex items-center justify-center mx-auto"
              style={{
                background: `linear-gradient(135deg, ${theme.gradFrom} 0%, ${theme.gradTo} 100%)`,
                boxShadow: `0 0 22px ${theme.glow}`,
              }}
            >
              <HeartPulse className="w-4 h-4 text-white relative z-10" />
              <div
                className="absolute inset-0 rounded-xl"
                style={{ background: "linear-gradient(135deg, rgba(255,255,255,0.22) 0%, transparent 55%)" }}
              />
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* ── Collapse toggle ──────────────────────────────────────────────────── */}
      <button
        onClick={onToggle}
        className="absolute top-[18px] -right-3 z-30 w-6 h-6 rounded-full flex items-center justify-center text-gray-400 hover:text-white transition-all duration-200 hover:scale-110"
        style={{
          background: "rgba(16,12,28,0.99)",
          border: "1px solid rgba(255,255,255,0.09)",
          boxShadow: "0 2px 14px rgba(0,0,0,0.5)",
        }}
      >
        {collapsed ? <ChevronRight className="w-3 h-3" /> : <ChevronLeft className="w-3 h-3" />}
      </button>

      {/* ── Nav items ────────────────────────────────────────────────────────── */}
      <nav className="relative flex-1 overflow-y-auto py-3 px-2 space-y-0.5 scrollbar-none">
        {items.map((item) => {
          const Icon = item.icon
          return (
            <NavLink
              key={item.href}
              to={item.href}
              end={item.href.split("/").length <= 2}
              className={({ isActive }) =>
                cn(
                  "relative flex items-center gap-3 px-3 py-2.5 rounded-xl transition-colors duration-150 group overflow-hidden cursor-pointer",
                  isActive ? "text-white" : "text-gray-500 hover:text-gray-200"
                )
              }
            >
              {({ isActive }) => (
                <>
                  {/* Active background (shared layout animation) */}
                  {isActive && (
                    <motion.div
                      layoutId="sidebarActiveItem"
                      className="absolute inset-0 rounded-xl"
                      style={{
                        background: `linear-gradient(135deg, ${theme.gradFrom}18 0%, ${theme.gradTo}0c 100%)`,
                        border: `1px solid ${theme.gradFrom}22`,
                      }}
                      transition={{ type: "spring", stiffness: 400, damping: 30 }}
                    />
                  )}

                  {/* Hover tint */}
                  <div className="absolute inset-0 rounded-xl bg-white/[0.035] opacity-0 group-hover:opacity-100 transition-opacity duration-150" />

                  {/* Left accent bar */}
                  {isActive && (
                    <motion.div
                      layoutId="sidebarAccentBar"
                      className="absolute left-0 top-[6px] bottom-[6px] w-[3px] rounded-full"
                      style={{
                        background: `linear-gradient(180deg, ${theme.gradFrom} 0%, ${theme.gradTo} 100%)`,
                        boxShadow: `0 0 10px ${theme.glow}`,
                      }}
                      transition={{ type: "spring", stiffness: 400, damping: 30 }}
                    />
                  )}

                  {/* Icon */}
                  <span
                    className="relative w-4 h-4 shrink-0 transition-all duration-150"
                    style={
                      isActive
                        ? { color: theme.gradFrom, filter: `drop-shadow(0 0 5px ${theme.glow})` }
                        : undefined
                    }
                  >
                    <Icon className="w-4 h-4" />
                  </span>

                  {/* Label */}
                  <AnimatePresence>
                    {!collapsed && (
                      <motion.span
                        initial={{ opacity: 0, x: -8 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: -8 }}
                        transition={{ duration: 0.13 }}
                        className={cn(
                          "relative text-[13px] font-medium whitespace-nowrap tracking-tight",
                          isActive ? "text-white" : ""
                        )}
                      >
                        {item.label}
                      </motion.span>
                    )}
                  </AnimatePresence>

                  {/* Collapsed tooltip */}
                  {collapsed && (
                    <div
                      className="absolute left-full ml-3 px-2.5 py-1.5 text-white text-xs rounded-xl opacity-0 group-hover:opacity-100 pointer-events-none whitespace-nowrap z-50 transition-opacity duration-150"
                      style={{
                        background: "rgba(12,10,22,0.97)",
                        border: "1px solid rgba(255,255,255,0.09)",
                        boxShadow: "0 4px 20px rgba(0,0,0,0.5)",
                      }}
                    >
                      {item.label}
                    </div>
                  )}
                </>
              )}
            </NavLink>
          )
        })}
      </nav>

      {/* ── User section ─────────────────────────────────────────────────────── */}
      <div
        className="relative shrink-0 p-3"
        style={{ borderTop: "1px solid rgba(255,255,255,0.04)" }}
      >
        <div className={cn("flex items-center gap-2.5", collapsed && "justify-center")}>
          {/* Avatar */}
          <button
            onClick={() => navigate(`/${user?.role ?? "patient"}/profile`)}
            className="relative shrink-0 rounded-full transition-all duration-200 hover:scale-105 focus:outline-none"
            title="View Profile"
          >
            <Avatar className="w-8 h-8">
              <AvatarFallback
                className="text-[11px] font-bold"
                style={{
                  background: `linear-gradient(135deg, ${theme.gradFrom}35 0%, ${theme.gradTo}25 100%)`,
                  color: theme.gradFrom,
                  border: `1px solid ${theme.gradFrom}28`,
                }}
              >
                {((user?.full_name || user?.name) ?? "U").charAt(0).toUpperCase()}
              </AvatarFallback>
            </Avatar>
            {/* Online indicator */}
            <span
              className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-[1.5px]"
              style={{
                background: "#22c55e",
                borderColor: "rgba(7,7,14,1)",
                boxShadow: "0 0 7px rgba(34,197,94,0.7)",
              }}
            />
          </button>

          <AnimatePresence>
            {!collapsed && (
              <motion.button
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.14 }}
                onClick={() => navigate(`/${user?.role ?? "patient"}/profile`)}
                className="flex-1 min-w-0 text-left hover:opacity-80 transition-opacity"
              >
                <p className="text-[13px] font-semibold text-white truncate leading-tight">
                  {user?.full_name || user?.name}
                </p>
                <p className="text-[11px] text-gray-600 capitalize mt-0.5">{user?.role}</p>
              </motion.button>
            )}
          </AnimatePresence>

          <AnimatePresence>
            {!collapsed && (
              <motion.button
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.14 }}
                onClick={handleLogout}
                className="p-1.5 rounded-lg text-gray-600 hover:text-red-400 hover:bg-red-500/[0.08] transition-all duration-200"
                title="Logout"
              >
                <LogOut className="w-3.5 h-3.5" />
              </motion.button>
            )}
          </AnimatePresence>
        </div>
      </div>
    </motion.aside>
  )
}
