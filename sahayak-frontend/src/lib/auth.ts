/**
 * Sahayak AI — Simple Local Auth Helpers
 * No Supabase — any @gmail.com email can sign in.
 */

// ── Simple Email Auth (no external provider) ──────────────────────────────────

/**
 * Validates that the email ends with @gmail.com (case-insensitive).
 * Returns a mock user object on success.
 */
export function validateGmailLogin(email: string, password: string) {
  const trimmed = email.trim().toLowerCase()
  if (!trimmed.endsWith("@gmail.com")) {
    throw new Error("Only @gmail.com emails are allowed. Please use a Gmail address.")
  }
  if (password.length < 6) {
    throw new Error("Password must be at least 6 characters.")
  }
  // Extract display name from email (before @)
  const namePart = trimmed.split("@")[0]
  const displayName = namePart
    .replace(/[._]/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase())

  return {
    email: trimmed,
    name: displayName,
    id: generateUserId(trimmed),
  }
}

/**
 * Validates that the email ends with @gmail.com for registration.
 * Returns a mock user object on success.
 */
export function validateGmailRegister(email: string, password: string, fullName: string) {
  const trimmed = email.trim().toLowerCase()
  if (!trimmed.endsWith("@gmail.com")) {
    throw new Error("Only @gmail.com emails are allowed. Please use a Gmail address.")
  }
  if (password.length < 6) {
    throw new Error("Password must be at least 6 characters.")
  }
  if (fullName.trim().length < 2) {
    throw new Error("Name must be at least 2 characters.")
  }

  return {
    email: trimmed,
    name: fullName.trim(),
    id: generateUserId(trimmed),
  }
}

/**
 * Generate a deterministic numeric user ID from email.
 * This ensures the same email always gets the same ID.
 */
function generateUserId(email: string): number {
  let hash = 0
  for (let i = 0; i < email.length; i++) {
    const char = email.charCodeAt(i)
    hash = ((hash << 5) - hash) + char
    hash = hash & hash // Convert to 32-bit integer
  }
  return Math.abs(hash) || 1
}

// ── Sign Out ──────────────────────────────────────────────────────────────────

export function signOut() {
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

/**
 * Generate a simple local token for the session.
 */
export function generateLocalToken(email: string, role: string): string {
  return btoa(JSON.stringify({ email, role, ts: Date.now() }))
}
