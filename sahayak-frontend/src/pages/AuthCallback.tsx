/**
 * Auth callback page — redirects to /auth since we no longer use OAuth.
 */
import { useEffect } from "react"
import { useNavigate } from "react-router-dom"

export default function AuthCallback() {
  const navigate = useNavigate()

  useEffect(() => {
    // No OAuth callback needed — redirect to auth
    navigate("/auth", { replace: true })
  }, [navigate])

  return (
    <div className="min-h-screen bg-[#0f0f13] flex items-center justify-center">
      <div className="text-center space-y-3">
        <div className="w-10 h-10 border-2 border-brand-500 border-t-transparent rounded-full animate-spin mx-auto" />
        <p className="text-gray-400 text-sm">Redirecting…</p>
      </div>
    </div>
  )
}
