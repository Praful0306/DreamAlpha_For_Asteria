import { useState } from "react"
import { useNavigate, useSearchParams } from "react-router-dom"
import { motion, AnimatePresence } from "framer-motion"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { toast } from "sonner"
import {
  Users, Stethoscope, Heart, Mic, Brain, Shield,
  ArrowLeft, Loader2, Eye, EyeOff, Zap, Mail
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { cn } from "@/lib/utils"
import { storeSession } from "@/lib/auth"
import { emailLogin, registerUser } from "@/lib/api"
import { useStore } from "@/store/useStore"

// ── Types ─────────────────────────────────────────────────────────────────────
type Role = "patient" | "doctor" | "asha"
type AuthMode = "select-role" | "login" | "register"

const ROLES = [
  {
    id: "patient" as Role,
    label: "Patient",
    sub: "Track your health",
    icon: Users,
    color: "from-blue-500/20 to-blue-600/5",
    border: "border-blue-500/30",
    active: "ring-2 ring-blue-500 border-blue-500",
  },
  {
    id: "asha" as Role,
    label: "ASHA Worker",
    sub: "Community health guardian",
    icon: Heart,
    color: "from-brand-500/20 to-brand-600/5",
    border: "border-brand-500/30",
    active: "ring-2 ring-brand-500 border-brand-500",
    featured: true,
  },
  {
    id: "doctor" as Role,
    label: "Doctor",
    sub: "Expert medical oversight",
    icon: Stethoscope,
    color: "from-green-500/20 to-green-600/5",
    border: "border-green-500/30",
    active: "ring-2 ring-green-500 border-green-500",
  },
]

const loginSchema = z.object({
  email:    z.string().email("Invalid email").refine(
    (e) => e.trim().toLowerCase().endsWith("@gmail.com"),
    "Only @gmail.com emails are allowed"
  ),
  password: z.string().min(6, "Min 6 characters"),
})

const registerSchema = z.object({
  email:    z.string().email("Invalid email").refine(
    (e) => e.trim().toLowerCase().endsWith("@gmail.com"),
    "Only @gmail.com emails are allowed"
  ),
  password: z.string().min(6, "Min 6 characters"),
  name:         z.string().min(2, "Min 2 characters"),
  phone:        z.string().optional(),
  district:     z.string().optional(),
  specialization: z.string().optional(),
})

type LoginForm    = z.infer<typeof loginSchema>
type RegisterForm = z.infer<typeof registerSchema>

// ── Features panel (left side) ────────────────────────────────────────────────
const FEATURES = [
  { icon: Mic,    text: "Voice diagnosis in Hindi + English" },
  { icon: Brain,  text: "LLaMA 3.1 70B + AMD Ryzen AI NPU" },
  { icon: Shield, text: "12 ICMR disease protocols validated" },
]

export default function Auth() {
  const navigate      = useNavigate()
  const [params]      = useSearchParams()
  const { setAuth }   = useStore()

  const initialRole = (params.get("role") as Role) ?? null
  const [role,     setRole]   = useState<Role | null>(initialRole)
  const [mode,     setMode]   = useState<AuthMode>(initialRole ? "login" : "select-role")
  const [loading,  setLoading]= useState(false)
  const [showPwd,  setShowPwd]= useState(false)

  const loginForm = useForm<LoginForm>({ resolver: zodResolver(loginSchema) })
  const regForm   = useForm<RegisterForm>({ resolver: zodResolver(registerSchema) })

  const ROLE_ROUTES: Record<Role, string> = {
    patient: "/patient",
    doctor:  "/doctor",
    asha:    "/asha",
  }

  function handleRoleSelect(r: Role) {
    setRole(r)
    setMode("login")
  }

  // ── Email login (simple — any @gmail.com works) ─────────────────────────
  async function handleLogin(data: LoginForm) {
    if (!role) return
    setLoading(true)
    try {
      // Try login first
      const res = await emailLogin(data.email, data.password)
      const displayName = res.full_name ?? res.name ?? data.email.split("@")[0]
      storeSession(res.access_token, res.role, { name: displayName, id: res.user_id })
      setAuth(
        { id: res.user_id, name: displayName, email: data.email, role: res.role as Role, patient_id: res.patient_id ?? null },
        res.access_token
      )
      toast.success(`Welcome, ${displayName}!`)
      navigate(ROLE_ROUTES[res.role as Role], { replace: true })
    } catch (err) {
      // Auto-register if login fails due to invalid credentials
      if (err instanceof Error && (err.message.includes("Invalid email or password") || err.message.includes("401"))) {
        try {
          const res = await registerUser({
            name: data.email.split("@")[0],
            email: data.email,
            password: data.password,
            role: role,
            specialization: "",
            district: "Unknown",
            phone: "",
          })
          const displayName = res.full_name ?? res.name ?? data.email.split("@")[0]
          storeSession(res.access_token, res.role, { name: displayName, id: res.user_id })
          setAuth(
            { id: res.user_id, name: displayName, email: data.email, role: res.role as Role, patient_id: res.patient_id ?? null },
            res.access_token
          )
          toast.success(`Account created automatically! Welcome, ${displayName}!`)
          navigate(ROLE_ROUTES[res.role as Role], { replace: true })
        } catch (regErr) {
          toast.error(regErr instanceof Error ? regErr.message : "Auto-registration failed")
        }
      } else {
        toast.error(err instanceof Error ? err.message : "Login failed")
      }
    } finally {
      setLoading(false)
    }
  }

  // ── Email register (simple — any @gmail.com works) ──────────────────────
  async function handleRegister(data: RegisterForm) {
    if (!role) return
    setLoading(true)
    try {
      // Call backend register
      const res = await registerUser({
        name: data.name,
        email: data.email,
        password: data.password,
        role: role,
        specialization: data.specialization,
        district: data.district,
        phone: data.phone,
      })
      const displayName = res.full_name ?? res.name ?? data.name
      storeSession(res.access_token, res.role, { name: displayName, id: res.user_id })
      setAuth(
        { id: res.user_id, name: displayName, email: data.email, role: res.role as Role, patient_id: res.patient_id ?? null },
        res.access_token
      )
      toast.success(`Account created! Welcome, ${displayName}!`)
      navigate(ROLE_ROUTES[res.role as Role], { replace: true })
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Registration failed")
    } finally {
      setLoading(false)
    }
  }

  const selectedRole = ROLES.find((r) => r.id === role)

  return (
    <div className="min-h-screen bg-[#0f0f13] flex flex-col lg:flex-row">

      {/* ── Left panel ──────────────────────────────────────────────────────── */}
      <div className="hidden lg:flex flex-col justify-between w-[45%] bg-gradient-to-br from-brand-900/30 via-[#0f0f13] to-purple-900/20 p-12 border-r border-white/5">
        {/* Logo */}
        <button onClick={() => navigate("/")} className="flex items-center gap-2 group">
          <div className="w-9 h-9 rounded-xl bg-brand-600 flex items-center justify-center">
            <Heart className="w-5 h-5 text-white" />
          </div>
          <span className="text-xl font-bold text-white group-hover:text-brand-300 transition-colors">Sahayak AI</span>
        </button>

        {/* Hero text */}
        <div>
          <motion.h2
            initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}
            className="text-5xl font-extrabold text-white leading-tight mb-4"
          >
            Healthcare<br />
            <span className="gradient-text">Without Barriers</span>
          </motion.h2>
          <motion.p
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.4 }}
            className="text-gray-400 text-lg mb-10 leading-relaxed"
          >
            AI-powered clinical support for ASHA workers serving rural India — offline-first, voice-first.
          </motion.p>
          <div className="space-y-4">
            {FEATURES.map((f, i) => {
              const Icon = f.icon
              return (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.5 + i * 0.1 }}
                  className="flex items-center gap-3 text-gray-300"
                >
                  <div className="w-8 h-8 rounded-lg bg-brand-500/15 border border-brand-500/25 flex items-center justify-center shrink-0">
                    <Icon className="w-4 h-4 text-brand-400" />
                  </div>
                  {f.text}
                </motion.div>
              )
            })}
          </div>
        </div>

        <p className="text-gray-600 text-sm">Team DreamAlpha · Asteria 2026</p>
      </div>

      {/* ── Right panel ─────────────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col items-center justify-center px-6 py-12 min-h-screen lg:min-h-0">
        <div className="w-full max-w-md">
          {/* Mobile logo */}
          <button onClick={() => navigate("/")} className="flex items-center gap-2 mb-8 lg:hidden">
            <div className="w-8 h-8 rounded-lg bg-brand-600 flex items-center justify-center">
              <Heart className="w-4 h-4 text-white" />
            </div>
            <span className="font-bold text-white">Sahayak AI</span>
          </button>

          <AnimatePresence mode="wait">

            {/* ── Step 1: Role selection ─────────────────────────────────────── */}
            {mode === "select-role" && (
              <motion.div
                key="roles"
                initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }}
              >
                <h1 className="text-3xl font-bold text-white mb-2">Sign In</h1>
                <p className="text-gray-400 mb-8">Choose your role to continue</p>

                <div className="space-y-3">
                  {ROLES.map((r) => {
                    const Icon = r.icon
                    return (
                      <motion.button
                        key={r.id}
                        onClick={() => handleRoleSelect(r.id)}
                        whileHover={{ scale: 1.01 }} whileTap={{ scale: 0.98 }}
                        className={cn(
                          "w-full flex items-center gap-4 p-4 rounded-xl border bg-gradient-to-br transition-all text-left",
                          r.color, r.border,
                          "hover:brightness-110"
                        )}
                      >
                        <div className="w-11 h-11 rounded-xl bg-white/10 flex items-center justify-center shrink-0">
                          <Icon className="w-5 h-5 text-white" />
                        </div>
                        <div className="flex-1">
                          <div className="font-semibold text-white flex items-center gap-2">
                            {r.label}
                            {r.featured && (
                              <span className="text-[10px] font-bold bg-brand-500/30 text-brand-300 px-1.5 py-0.5 rounded border border-brand-500/30">
                                PRIMARY
                              </span>
                            )}
                          </div>
                          <div className="text-xs text-gray-400 mt-0.5">{r.sub}</div>
                        </div>
                        <ArrowLeft className="w-4 h-4 text-gray-500 rotate-180" />
                      </motion.button>
                    )
                  })}
                </div>

                <p className="text-center text-sm text-gray-600 mt-8">
                  By signing in you agree to our terms of service and privacy policy.
                </p>
              </motion.div>
            )}

            {/* ── Step 2: Login / Register ───────────────────────────────────── */}
            {(mode === "login" || mode === "register") && role && (
              <motion.div
                key="form"
                initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }}
              >
                {/* Back button */}
                <button
                  onClick={() => { setMode("select-role"); setRole(null) }}
                  className="flex items-center gap-2 text-sm text-gray-500 hover:text-white mb-6 transition-colors"
                >
                  <ArrowLeft className="w-4 h-4" />
                  Change role
                </button>

                {/* Role badge */}
                {selectedRole && (
                  <div className={cn(
                    "inline-flex items-center gap-2 px-3 py-1.5 rounded-full border text-sm mb-6",
                    selectedRole.border,
                    `bg-gradient-to-r ${selectedRole.color}`
                  )}>
                    <selectedRole.icon className="w-4 h-4 text-white" />
                    <span className="text-white font-medium">{selectedRole.label}</span>
                  </div>
                )}

                <h1 className="text-3xl font-bold text-white mb-1">
                  {mode === "login" ? "Welcome Back" : "Create Account"}
                </h1>
                <p className="text-gray-400 mb-2">
                  {mode === "login" ? "Sign in to your account" : "Get started in minutes"}
                </p>

                {/* Gmail notice */}
                <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-blue-500/10 border border-blue-500/20 mb-6">
                  <Mail className="w-4 h-4 text-blue-400 shrink-0" />
                  <p className="text-xs text-blue-300">Use any <span className="font-semibold">@gmail.com</span> email to sign in instantly</p>
                </div>

                {/* Register extra fields */}
                {mode === "register" && (
                  <div className="space-y-3 mb-4">
                    {/* Full name */}
                    <div>
                      <Label htmlFor="name" className="text-gray-300 text-sm mb-1.5 block">Full Name *</Label>
                      <Input
                        id="name"
                        placeholder={role === "doctor" ? "Dr. Arjun Sharma" : role === "asha" ? "Sunita Devi" : "Priya Sharma"}
                        className="bg-white/5 border-white/15 text-white placeholder:text-gray-600 h-11"
                        {...regForm.register("name")}
                      />
                      {regForm.formState.errors.name && (
                        <p className="text-xs text-red-400 mt-1">{regForm.formState.errors.name.message}</p>
                      )}
                    </div>

                    {/* Phone — optional */}
                    <div>
                      <Label htmlFor="phone" className="text-gray-300 text-sm mb-1.5 block">
                        Mobile Number
                        <span className="text-gray-600 font-normal ml-1.5">(optional)</span>
                      </Label>
                      <div className="flex gap-2">
                        <span className="flex items-center px-3 bg-white/5 border border-white/15 rounded-lg text-gray-400 text-sm whitespace-nowrap">🇮🇳 +91</span>
                        <Input
                          id="phone"
                          type="tel"
                          placeholder="9876543210"
                          maxLength={10}
                          className="bg-white/5 border-white/15 text-white placeholder:text-gray-600 h-11"
                          {...regForm.register("phone")}
                        />
                      </div>
                    </div>

                    {/* Doctor-specific: specialization */}
                    {role === "doctor" && (
                      <div>
                        <Label htmlFor="specialization" className="text-gray-300 text-sm mb-1.5 block">Specialization</Label>
                        <Input
                          id="specialization"
                          placeholder="General Medicine / Paediatrics…"
                          className="bg-white/5 border-white/15 text-white placeholder:text-gray-600 h-11"
                          {...regForm.register("specialization")}
                        />
                      </div>
                    )}

                    {/* ASHA-specific: district */}
                    {role === "asha" && (
                      <div>
                        <Label htmlFor="district" className="text-gray-300 text-sm mb-1.5 block">District / Block</Label>
                        <Input
                          id="district"
                          placeholder="Sitapur, Uttar Pradesh"
                          className="bg-white/5 border-white/15 text-white placeholder:text-gray-600 h-11"
                          {...regForm.register("district")}
                        />
                      </div>
                    )}
                  </div>
                )}

                <div className="mb-4">
                  <Label htmlFor="email" className="text-gray-300 text-sm mb-1.5 block">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="you@gmail.com"
                    className="bg-white/5 border-white/15 text-white placeholder:text-gray-600 h-11"
                    {...(mode === "login" ? loginForm.register("email") : regForm.register("email"))}
                  />
                  {(mode === "login" ? loginForm.formState.errors.email : regForm.formState.errors.email) && (
                    <p className="text-xs text-red-400 mt-1">
                      {(mode === "login" ? loginForm.formState.errors.email : regForm.formState.errors.email)?.message}
                    </p>
                  )}
                </div>

                <div className="mb-6">
                  <Label htmlFor="password" className="text-gray-300 text-sm mb-1.5 block">Password</Label>
                  <div className="relative">
                    <Input
                      id="password"
                      type={showPwd ? "text" : "password"}
                      placeholder="••••••••"
                      className="bg-white/5 border-white/15 text-white placeholder:text-gray-600 h-11 pr-10"
                      {...(mode === "login" ? loginForm.register("password") : regForm.register("password"))}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPwd((v) => !v)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-white"
                    >
                      {showPwd ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <Button
                  className="w-full h-11 bg-brand-600 hover:bg-brand-700 text-white font-semibold"
                  disabled={loading}
                  onClick={
                    mode === "login"
                      ? loginForm.handleSubmit(handleLogin)
                      : regForm.handleSubmit(handleRegister)
                  }
                >
                  {loading ? (
                    <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Please wait…</>
                  ) : mode === "login" ? "Sign In" : "Create Account"}
                </Button>

                {/* ── Quick login for each role ───────────────────── */}
                {mode === "login" && (
                  <div className="mt-3 p-3 rounded-xl bg-brand-500/8 border border-brand-500/20">
                    <p className="text-[11px] text-brand-300/70 font-medium mb-2 uppercase tracking-wide">
                      🎯 Quick Login
                    </p>
                    <div className="flex items-center justify-between gap-2">
                      <div className="text-xs text-gray-400 leading-relaxed">
                        <span className="text-gray-300 font-mono">{role}@gmail.com</span>
                        <br />
                        <span className="text-gray-500">Password: </span>
                        <span className="text-gray-300 font-mono">123456</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          loginForm.setValue("email", `${role}@gmail.com`)
                          loginForm.setValue("password", "123456")
                        }}
                        className="shrink-0 text-xs text-brand-400 hover:text-brand-300 border border-brand-500/30 hover:border-brand-400/50 px-2.5 py-1 rounded-lg transition-colors"
                      >
                        Auto-fill
                      </button>
                    </div>
                  </div>
                )}

                <div className="relative flex items-center gap-3 my-3">
                  <div className="flex-1 h-px bg-gray-700" />
                  <span className="text-xs text-gray-500">or instant demo</span>
                  <div className="flex-1 h-px bg-gray-700" />
                </div>
                <button
                  type="button"
                  onClick={() => {
                    const demoNames = {
                      patient: "Priya Devi",
                      doctor:  "Dr. Arjun Sharma",
                      asha:    "Sunita ASHA Worker",
                    }
                    // Clear any old real-user token so demo doesn't use wrong JWT
                    localStorage.removeItem("sahayak_token")
                    localStorage.removeItem("sahayak_role")
                    localStorage.removeItem("sahayak_user")
                    sessionStorage.removeItem("sahayak_patient_id")
                    setAuth(
                      {
                        id: 999,
                        name: demoNames[role as keyof typeof demoNames] ?? "Demo User",
                        role: role as "patient" | "doctor" | "asha",
                        isDemo: true,
                      },
                      "demo_token"
                    )
                    navigate("/" + role)
                  }}
                  className="w-full flex items-center justify-center gap-2 border border-dashed border-orange-500/50 text-orange-400 hover:bg-orange-500/10 rounded-xl py-2.5 text-sm font-medium transition-colors"
                >
                  <Zap className="w-4 h-4" />
                  Try Demo (No Backend Needed)
                </button>

                <p className="text-center text-sm text-gray-500 mt-5">
                  {mode === "login" ? "No account? " : "Already have one? "}
                  <button
                    type="button"
                    className="text-brand-400 hover:text-brand-300 font-medium transition-colors"
                    onClick={() => setMode(mode === "login" ? "register" : "login")}
                  >
                    {mode === "login" ? "Create one" : "Sign in"}
                  </button>
                </p>
              </motion.div>
            )}

          </AnimatePresence>
        </div>
      </div>
    </div>
  )
}
