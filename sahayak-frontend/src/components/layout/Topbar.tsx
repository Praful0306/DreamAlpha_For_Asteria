import { motion, AnimatePresence } from "framer-motion"
import { Wifi, WifiOff, Cpu, Bell, Sun, Moon, Menu, Zap, ChevronRight } from "lucide-react"
import { useStore } from "@/store/useStore"
import { useOffline } from "@/hooks/useOffline"
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Button } from "@/components/ui/button"
import { useLocation } from "react-router-dom"

const PAGE_TITLES: Record<string, string> = {
  "/patient":              "Dashboard",
  "/patient/diagnose":     "AI Diagnosis",
  "/patient/upload":       "Upload Report",
  "/patient/reports":      "Medical Reports",
  "/patient/vitals":       "Vitals Analysis",
  "/patient/access":       "Doctor Access",
  "/patient/call":         "Call Centre",
  "/patient/chat":         "Health Chat",
  "/doctor":               "Dashboard",
  "/doctor/access":        "Access Patient",
  "/doctor/appointments":  "Appointments",
  "/doctor/chat":          "Medical Chat",
  "/asha":                 "Dashboard",
  "/asha/patients":        "My Patients",
  "/asha/diagnose":        "AI Diagnosis",
  "/asha/heatmap":         "Disease Map",
  "/asha/tasks":           "Tasks",
  "/asha/reminders":       "Reminders",
  "/asha/maternal":        "Maternal Health",
  "/asha/immunization":    "Immunization",
  "/asha/surveillance":    "Surveillance",
  "/asha/report":          "Gov Report",
  "/asha/chat":            "Health Chat",
}

interface TopbarProps {
  onMobileMenu?: () => void
}

export function Topbar({ onMobileMenu }: TopbarProps) {
  const { theme, toggleTheme, npuActive } = useStore()
  const { isOnline } = useOffline()
  const location = useLocation()
  const title = PAGE_TITLES[location.pathname] ?? "Sahayak AI"

  const pathParts = location.pathname.split("/").filter(Boolean)
  const section = pathParts[0]
    ? pathParts[0].charAt(0).toUpperCase() + pathParts[0].slice(1)
    : ""
  const isSubPage = pathParts.length > 1

  return (
    <header
      className="h-16 flex items-center px-5 gap-4 shrink-0 relative"
      style={{
        background: "rgba(8,6,18,0.88)",
        backdropFilter: "blur(24px)",
        WebkitBackdropFilter: "blur(24px)",
        borderBottom: "1px solid rgba(255,255,255,0.045)",
      }}
    >
      {/* ── Gradient shimmer line at bottom ──────────────────────────────────── */}
      <div
        className="absolute bottom-0 left-0 right-0 h-px pointer-events-none"
        style={{
          background: "linear-gradient(90deg, transparent 0%, rgba(249,115,22,0.25) 25%, rgba(234,179,8,0.18) 55%, rgba(99,102,241,0.12) 80%, transparent 100%)",
        }}
      />

      {/* ── Mobile menu ──────────────────────────────────────────────────────── */}
      <button
        onClick={onMobileMenu}
        className="lg:hidden p-2 rounded-xl hover:bg-white/[0.06] text-gray-400 hover:text-white transition-all duration-200"
      >
        <Menu className="w-5 h-5" />
      </button>

      {/* ── Breadcrumb + Page title ───────────────────────────────────────────── */}
      <div className="flex items-center gap-2 flex-1 min-w-0">
        {isSubPage && section && (
          <div className="hidden sm:flex items-center gap-1.5">
            <span className="text-xs text-gray-600 capitalize font-medium">{section}</span>
            <ChevronRight className="w-3 h-3 text-gray-700" />
          </div>
        )}
        <AnimatePresence mode="wait">
          <motion.h1
            key={title}
            initial={{ opacity: 0, y: -7 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 7 }}
            transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
            className="text-[15px] font-bold text-white truncate"
          >
            {title}
          </motion.h1>
        </AnimatePresence>
      </div>

      {/* ── Status pills ─────────────────────────────────────────────────────── */}
      <div className="hidden sm:flex items-center gap-2">

        {/* NPU status */}
        <div
          className={`flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-full border transition-all duration-300 ${
            npuActive
              ? "text-brand-400"
              : "text-gray-600"
          }`}
          style={{
            background: npuActive ? "rgba(249,115,22,0.08)" : "rgba(255,255,255,0.025)",
            border: npuActive ? "1px solid rgba(249,115,22,0.25)" : "1px solid rgba(255,255,255,0.06)",
          }}
        >
          <Cpu className="w-3 h-3" />
          <span className="hidden md:inline font-medium">AMD NPU</span>
          {npuActive && (
            <span
              className="w-1.5 h-1.5 rounded-full animate-pulse"
              style={{ background: "#f97316", boxShadow: "0 0 6px rgba(249,115,22,0.9)" }}
            />
          )}
        </div>

        {/* Groq AI status */}
        <div
          className="hidden lg:flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-full"
          style={{
            background: "rgba(168,85,247,0.07)",
            border: "1px solid rgba(168,85,247,0.18)",
            color: "#c084fc",
          }}
        >
          <Zap className="w-3 h-3" />
          <span className="font-medium">Groq AI</span>
          <span
            className="w-1.5 h-1.5 rounded-full"
            style={{ background: "#a855f7", boxShadow: "0 0 6px rgba(168,85,247,0.8)" }}
          />
        </div>

        {/* Online status */}
        <div
          className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-full"
          style={{
            background: isOnline ? "rgba(34,197,94,0.07)" : "rgba(249,115,22,0.07)",
            border: isOnline ? "1px solid rgba(34,197,94,0.22)" : "1px solid rgba(249,115,22,0.22)",
            color: isOnline ? "#4ade80" : "#fb923c",
          }}
        >
          {isOnline ? <Wifi className="w-3 h-3" /> : <WifiOff className="w-3 h-3" />}
          <span className="hidden md:inline font-medium">{isOnline ? "Online" : "Offline"}</span>
        </div>
      </div>

      {/* ── Action buttons ────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-1">

        {/* Theme toggle */}
        <Button
          variant="ghost"
          size="icon"
          onClick={toggleTheme}
          className="w-8 h-8 rounded-xl text-gray-500 hover:text-white hover:bg-white/[0.06] transition-all duration-200"
        >
          {theme === "dark"
            ? <Sun className="w-4 h-4" />
            : <Moon className="w-4 h-4" />
          }
        </Button>

        {/* Notifications */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="relative w-8 h-8 rounded-xl text-gray-500 hover:text-white hover:bg-white/[0.06] transition-all duration-200"
            >
              <Bell className="w-4 h-4" />
              {/* Notification dot */}
              <span
                className="absolute top-1.5 right-1.5 w-1.5 h-1.5 rounded-full"
                style={{ background: "#f97316", boxShadow: "0 0 6px rgba(249,115,22,0.85)" }}
              />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="end"
            className="w-80 p-0 overflow-hidden"
            style={{
              background: "rgba(9,7,20,0.97)",
              backdropFilter: "blur(24px)",
              border: "1px solid rgba(255,255,255,0.08)",
              borderRadius: 16,
              boxShadow: "0 20px 60px rgba(0,0,0,0.6)",
            }}
          >
            {/* Header */}
            <div
              className="flex items-center justify-between px-4 py-3"
              style={{ borderBottom: "1px solid rgba(255,255,255,0.05)" }}
            >
              <span className="text-xs font-bold text-white uppercase tracking-wider">
                Notifications
              </span>
              <span
                className="text-[10px] font-bold px-2 py-0.5 rounded-full"
                style={{
                  background: "rgba(249,115,22,0.14)",
                  border: "1px solid rgba(249,115,22,0.25)",
                  color: "#f97316",
                }}
              >
                1 NEW
              </span>
            </div>

            {/* Notification item */}
            <DropdownMenuItem
              className="mx-2 my-2 rounded-xl p-0 focus:bg-transparent cursor-pointer"
              style={{ outline: "none" }}
            >
              <div
                className="flex items-start gap-3 w-full p-3 rounded-xl transition-colors duration-150 hover:bg-white/[0.04]"
              >
                <div
                  className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 mt-0.5"
                  style={{
                    background: "rgba(249,115,22,0.12)",
                    border: "1px solid rgba(249,115,22,0.2)",
                  }}
                >
                  <Cpu className="w-4 h-4 text-brand-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-white">RAG index loaded</p>
                  <p className="text-xs text-gray-500 mt-0.5">
                    12 ICMR guidelines ready · just now
                  </p>
                </div>
                <div
                  className="w-1.5 h-1.5 rounded-full mt-1.5 shrink-0"
                  style={{ background: "#f97316" }}
                />
              </div>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  )
}
