/**
 * Supabase OAuth callback page.
 * Supabase redirects here after Google login with the session in the URL hash.
 */
import { useEffect } from "react"
import { useNavigate } from "react-router-dom"
import { toast } from "sonner"
import { supabase } from "@/lib/auth"
import { supabaseLogin } from "@/lib/api"
import { storeSession } from "@/lib/auth"
import { useStore } from "@/store/useStore"

const ROLE_ROUTES: Record<string, string> = {
  patient: "/patient",
  doctor:  "/doctor",
  asha:    "/asha",
}

export default function AuthCallback() {
  const navigate = useNavigate()
  const setAuth  = useStore((s) => s.setAuth)

  useEffect(() => {
    async function handle() {
      const { data: { session }, error } = await supabase.auth.getSession()
      if (error || !session) {
        toast.error("Google login failed — please try again")
        navigate("/auth", { replace: true })
        return
      }

      const pendingRole = (sessionStorage.getItem("sahayak_pending_role") || "patient") as "patient" | "doctor" | "asha"
      sessionStorage.removeItem("sahayak_pending_role")

      try {
        const res = await supabaseLogin(session.access_token, pendingRole)
        const displayName = res.full_name ?? res.name ?? "User"
        storeSession(res.access_token, res.role, { name: displayName, id: res.user_id })
        setAuth({ id: res.user_id, patient_id: res.patient_id ?? null, name: displayName, role: res.role as "patient" | "doctor" | "asha" }, res.access_token)
        toast.success(`Welcome, ${displayName}!`)
        navigate(ROLE_ROUTES[res.role] ?? "/patient", { replace: true })
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Login failed")
        navigate("/auth", { replace: true })
      }
    }
    handle()
  }, [])

  return (
    <div className="min-h-screen bg-[#0f0f13] flex items-center justify-center">
      <div className="text-center space-y-3">
        <div className="w-10 h-10 border-2 border-brand-500 border-t-transparent rounded-full animate-spin mx-auto" />
        <p className="text-gray-400 text-sm">Signing you in…</p>
      </div>
    </div>
  )
}
