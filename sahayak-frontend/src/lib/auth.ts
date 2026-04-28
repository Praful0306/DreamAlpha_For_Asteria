/**
 * Sahayak AI — Supabase Auth Helpers
 * Replaces Firebase Auth entirely.
 */
import { createClient } from "@supabase/supabase-js"

const SUPABASE_URL  = (import.meta.env.VITE_SUPABASE_URL  as string) || "https://placeholder.supabase.co"
const SUPABASE_ANON = (import.meta.env.VITE_SUPABASE_ANON_KEY as string) || "placeholder-anon-key"

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON)

// ── Email/Password Auth ───────────────────────────────────────────────────────

export async function signUpWithEmail(email: string, password: string, fullName: string) {
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { full_name: fullName } },
  })
  if (error) throw new Error(error.message)
  return data
}

export async function signInWithEmail(email: string, password: string) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password })
  if (error) throw new Error(error.message)
  return data
}

// ── Google OAuth ──────────────────────────────────────────────────────────────

export async function signInWithGoogle() {
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: `${window.location.origin}/auth/callback`,
    },
  })
  if (error) throw new Error(error.message)
  return data
}

// ── Sign Out ──────────────────────────────────────────────────────────────────

export async function signOut() {
  await supabase.auth.signOut()
  clearSession()
}

// ── Session Storage ───────────────────────────────────────────────────────────

export function storeSession(token: string, role: string, user: { name: string; id: string | number }) {
  localStorage.setItem("sahayak_token", token)
  localStorage.setItem("sahayak_role", role)
  localStorage.setItem("sahayak_user", JSON.stringify(user))
}

export function clearSession() {
  localStorage.removeItem("sahayak_token")
  localStorage.removeItem("sahayak_role")
  localStorage.removeItem("sahayak_user")
  sessionStorage.removeItem("sahayak_patient_id")
}

export function getStoredToken(): string | null {
  return localStorage.getItem("sahayak_token")
}
