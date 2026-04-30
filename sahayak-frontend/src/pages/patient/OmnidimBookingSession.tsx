/**
 * OmnidimBookingSession
 * ─────────────────────
 * Appointment booking powered by Omnidim voice AI agent (149053).
 * The agent collects name/phone/age/time via voice, then calls:
 *   register_patient → get_available_slots → book_appointment
 * on our backend, saving the appointment to the DB automatically.
 * Doctor dashboard reads from the same DB — sync is automatic.
 */

import { useState, useEffect, useRef } from "react"
import { motion, AnimatePresence } from "framer-motion"
import {
  PhoneCall, Mic, CheckCircle2, ArrowLeft,
  Calendar, RefreshCw, ExternalLink,
} from "lucide-react"
import { toast } from "sonner"
import { isDemoMode, demoAppointments } from "@/lib/demoStore"

/* ── Omnidim widget trigger ──────────────────────────────────────────────────── */

function openOmnidimWidget(): boolean {
  const w = window as any
  // Try Omnidim window API (various SDK versions)
  for (const api of [w.omnidimChat, w.OmnidimWidget, w.omnidim, w.OmnidimChat]) {
    if (typeof api?.open === "function") { api.open(); return true }
    if (typeof api?.show === "function") { api.show(); return true }
  }
  // Find widget button in DOM (Omnidim typically uses id/class with "omnidim")
  const selectors = [
    "#omnidim-chat-button", "#omnidim-widget-button", "#omnidim-launcher",
    "[id^='omnidim']", "[class*='omnidim'][class*='button']",
    "[class*='omnidim'][class*='launch']",
  ]
  for (const sel of selectors) {
    const el = document.querySelector(sel) as HTMLElement | null
    if (el) { el.click(); return true }
  }
  return false
}

/* ── Component ──────────────────────────────────────────────────────────────── */

interface Props {
  onClose:     () => void
  reasonLabel: string
}

type Phase = "ready" | "active" | "done" | "demo_done"

export default function OmnidimBookingSession({ onClose, reasonLabel }: Props) {
  const [phase,    setPhase]    = useState<Phase>("ready")
  const [pollSecs, setPollSecs] = useState(0)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    if (phase === "active") {
      timerRef.current = setInterval(() => setPollSecs(s => s + 1), 1000)
    } else {
      if (timerRef.current) clearInterval(timerRef.current)
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current) }
  }, [phase])

  /* ── Start the Omnidim agent conversation ── */
  function handleStart() {
    if (isDemoMode()) {
      demoAppointments.add({
        patient_name:   "Demo Patient",
        reason:         reasonLabel,
        preferred_time: `${new Date().toISOString().slice(0,10)} 10:00`,
        status:         "pending",
        booked_by:      "patient",
      })
      setPhase("demo_done")
      toast.success("Demo appointment booked! Visible on Doctor Dashboard.")
      return
    }

    const triggered = openOmnidimWidget()
    setPhase("active")
    if (!triggered) {
      toast.info(
        "Click the chat button in the bottom-right corner to start the AI booking assistant.",
        { duration: 8000 },
      )
    }
  }

  /* ── User says the conversation is done ── */
  function handleDone() {
    setPhase("done")
    toast.success("Appointment saved! Check Doctor Dashboard → Appointments.")
  }

  /* ─────────────────────── RENDERS ─────────────────────────────────────────── */

  /* ── Done state ── */
  if (phase === "done") return (
    <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
      className="rounded-3xl border border-blue-500/25 bg-gradient-to-br from-blue-600/10 to-transparent overflow-hidden">
      <div className="pt-10 pb-6 text-center px-6">
        <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }}
          transition={{ type: "spring", stiffness: 280, damping: 14 }}
          className="w-20 h-20 rounded-full bg-blue-500/20 border-2 border-blue-500/40 flex items-center justify-center mx-auto mb-5">
          <CheckCircle2 className="w-10 h-10 text-blue-400" />
        </motion.div>
        <h2 className="text-2xl font-bold text-white">Appointment Booked!</h2>
        <p className="text-gray-400 text-sm mt-2">
          Your appointment has been confirmed by the AI agent and saved to the Doctor's Dashboard automatically.
        </p>

        <div className="mt-5 rounded-2xl border border-blue-500/20 bg-blue-500/5 p-4 flex items-center gap-3 text-left">
          <Calendar className="w-5 h-5 text-blue-400 shrink-0" />
          <div>
            <p className="text-sm font-semibold text-white">Synced to Doctor Dashboard</p>
            <p className="text-xs text-gray-400 mt-0.5">Doctor can see your appointment under Appointments → Today/Upcoming</p>
          </div>
        </div>
      </div>

      <div className="px-5 pb-6">
        <button onClick={onClose}
          className="w-full py-3.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-semibold text-sm transition-all">
          Done
        </button>
      </div>
    </motion.div>
  )

  /* ── Demo done state ── */
  if (phase === "demo_done") return (
    <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
      className="rounded-3xl border border-green-500/25 bg-green-500/5 p-8 text-center space-y-4">
      <div className="w-16 h-16 rounded-full bg-green-500/20 flex items-center justify-center mx-auto">
        <CheckCircle2 className="w-8 h-8 text-green-400" />
      </div>
      <div>
        <h3 className="text-xl font-bold text-white">Demo Appointment Booked!</h3>
        <p className="text-sm text-gray-400 mt-1.5">Visible on Doctor Dashboard → Appointments</p>
      </div>
      <button onClick={onClose}
        className="px-6 py-2.5 rounded-xl bg-green-600/20 hover:bg-green-600/30 text-green-400 border border-green-500/30 text-sm font-medium transition-all">
        Done
      </button>
    </motion.div>
  )

  /* ── Ready state ── */
  if (phase === "ready") return (
    <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }}
      className="rounded-3xl border border-blue-500/25 bg-[#0d1117] overflow-hidden">

      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 bg-gradient-to-r from-blue-600/25 to-transparent border-b border-blue-500/20">
        <button onClick={onClose} className="flex items-center gap-1.5 text-gray-400 hover:text-white text-sm transition-colors">
          <ArrowLeft className="w-4 h-4" /> Back
        </button>
        <div className="text-center">
          <p className="text-sm font-bold text-white">AI Voice Booking</p>
          <p className="text-xs text-blue-400 mt-0.5">Powered by Omnidim Agent</p>
        </div>
        <div className="w-16" />
      </div>

      {/* Body */}
      <div className="p-6 space-y-6">
        {/* AI avatar */}
        <div className="flex flex-col items-center gap-4 py-4">
          <div className="relative">
            {[1.4, 1.9, 2.4].map((scale, i) => (
              <span key={i} className="absolute inset-0 rounded-full bg-blue-500 animate-ping"
                style={{ transform: `scale(${scale})`, opacity: 0.08, animationDelay: `${i * 0.2}s` }} />
            ))}
            <div className="w-20 h-20 rounded-full bg-blue-500/20 border-2 border-blue-500/40 flex items-center justify-center relative z-10"
              style={{ boxShadow: "0 0 40px rgba(59,130,246,0.2)" }}>
              <Mic className="w-9 h-9 text-blue-400" />
            </div>
          </div>
          <div className="text-center">
            <h3 className="text-lg font-bold text-white">AI Appointment Assistant</h3>
            <p className="text-sm text-gray-400 mt-1">
              Our AI will ask for your name, age, phone and preferred time — then book instantly.
            </p>
          </div>
        </div>

        {/* How it works */}
        <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-4 space-y-3">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">How it works</p>
          {[
            { step: "1", text: "Tap \"Start Booking\" below" },
            { step: "2", text: "A chat/voice window opens — speak naturally" },
            { step: "3", text: "AI confirms your slot and saves the appointment" },
            { step: "4", text: "Doctor Dashboard updates automatically" },
          ].map(({ step, text }) => (
            <div key={step} className="flex items-center gap-3">
              <div className="w-6 h-6 rounded-full bg-blue-500/20 border border-blue-500/30 flex items-center justify-center shrink-0">
                <span className="text-[11px] font-bold text-blue-400">{step}</span>
              </div>
              <p className="text-sm text-gray-300">{text}</p>
            </div>
          ))}
        </div>

        {/* Reason chip */}
        <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-blue-500/10 border border-blue-500/20 w-fit mx-auto">
          <Calendar className="w-3.5 h-3.5 text-blue-400" />
          <span className="text-xs font-semibold text-blue-300">{reasonLabel}</span>
        </div>

        {/* CTA */}
        <button onClick={handleStart}
          className="w-full flex items-center justify-center gap-3 py-4 rounded-2xl font-bold text-white text-base transition-all active:scale-[0.98] hover:brightness-110"
          style={{ background: "linear-gradient(135deg, #2563eb, #3b82f6)", boxShadow: "0 8px 32px rgba(59,130,246,0.35)" }}>
          <PhoneCall className="w-5 h-5" />
          Start AI Voice Booking
        </button>

        <p className="text-center text-xs text-gray-600">
          Speak in English · Hindi · Kannada
        </p>
      </div>
    </motion.div>
  )

  /* ── Active / Checking states ── */
  return (
    <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }}
      className="rounded-3xl border border-blue-500/25 bg-[#0d1117] overflow-hidden">

      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 bg-gradient-to-r from-blue-600/25 to-transparent border-b border-blue-500/20">
        <button onClick={onClose} className="flex items-center gap-1.5 text-gray-400 hover:text-white text-sm transition-colors">
          <ArrowLeft className="w-4 h-4" /> Back
        </button>
        <div className="text-center">
          <p className="text-sm font-bold text-white">AI Booking Active</p>
          <p className="text-xs text-blue-400 mt-0.5">{String(Math.floor(pollSecs/60)).padStart(2,"0")}:{String(pollSecs%60).padStart(2,"0")}</p>
        </div>
        <div className="w-16" />
      </div>

      <div className="p-6 space-y-5">
        {/* Animated orb */}
        <div className="flex flex-col items-center gap-4 py-6">
          <div className="relative">
            {[1.3, 1.7, 2.2].map((scale, i) => (
              <span key={i} className="absolute inset-0 rounded-full bg-blue-500 animate-ping"
                style={{ transform: `scale(${scale})`, opacity: 0.1, animationDelay: `${i * 0.25}s` }} />
            ))}
            <div className="w-24 h-24 rounded-full bg-blue-500/20 border-2 border-blue-400/50 flex items-center justify-center relative z-10"
              style={{ boxShadow: "0 0 60px rgba(59,130,246,0.3)" }}>
              {phase === "checking"
                ? <Loader2 className="w-10 h-10 text-blue-400 animate-spin" />
                : <Mic className="w-10 h-10 text-blue-400" />
              }
            </div>
          </div>

          <div className="text-center space-y-1.5">
            <p className="text-lg font-bold text-white">
              {phase === "checking" ? "Verifying your booking…" : "AI Agent is Active"}
            </p>
            <p className="text-sm text-gray-400">
              {phase === "checking"
                ? "Checking the Doctor Dashboard for your appointment…"
                : "Complete the conversation in the chat window, then tap 'I'm Done' below."
              }
            </p>
          </div>
        </div>

        {/* Hint — point to widget */}
        <AnimatePresence>
          {phase === "active" && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="rounded-2xl border border-blue-500/20 bg-blue-500/5 p-4 flex items-start gap-3">
              <ExternalLink className="w-4 h-4 text-blue-400 shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-semibold text-white">Chat window opened</p>
                <p className="text-xs text-gray-400 mt-0.5">
                  Talk to the AI assistant — it will ask for your name, age, phone and preferred time.
                  The appointment is saved automatically when you finish.
                </p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Action buttons */}
        {phase === "active" && (
          <div className="space-y-3">
            <button onClick={handleDone}
              className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl font-semibold text-white text-sm transition-all active:scale-[0.98]"
              style={{ background: "linear-gradient(135deg, #16a34a, #22c55e)", boxShadow: "0 4px 20px rgba(34,197,94,0.25)" }}>
              <CheckCircle2 className="w-5 h-5" />
              I'm Done — Appointment Booked
            </button>
            <button onClick={() => { openOmnidimWidget(); toast.info("Re-opening chat widget…") }}
              className="w-full flex items-center justify-center gap-2 py-3 rounded-xl border border-blue-500/25 text-blue-400 hover:text-blue-300 text-sm transition-all">
              <RefreshCw className="w-4 h-4" />
              Reopen Chat Widget
            </button>
          </div>
        )}
      </div>
    </motion.div>
  )
}
