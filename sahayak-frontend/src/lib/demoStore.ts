/**
 * demoStore — localStorage-based persistence for demo mode.
 * When the backend is unavailable (demo_token), this keeps data across
 * page refreshes and shares data across roles (e.g. appointments).
 *
 * Cross-store sync:
 *   • syncAncToReminders      — MaternalHealth visit click → updates asha_reminders
 *   • syncReminderToMaternal  — Reminders toggle → updates maternal_mothers anc_done
 *   • syncVaxToReminders      — Immunization vaccine toggle → updates asha_reminders
 *   • syncReminderToImmunization — Reminders toggle → updates immunization_children
 *
 * All sync helpers call dispatchSync() so any component using onSync() re-reads
 * localStorage immediately (same-tab, same-frame cross-component reactivity).
 */

export const DEMO_PREFIX = "sahayak_demo_"

export function demoGet<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(DEMO_PREFIX + key)
    return raw ? (JSON.parse(raw) as T) : fallback
  } catch {
    return fallback
  }
}

export function demoSet<T>(key: string, value: T): void {
  try {
    localStorage.setItem(DEMO_PREFIX + key, JSON.stringify(value))
  } catch { /* quota exceeded — silently ignore */ }
}

export function demoRemove(key: string): void {
  localStorage.removeItem(DEMO_PREFIX + key)
}

/**
 * Check whether the current session is in demo mode.
 *
 * Auth.tsx's demo button calls setAuth({...}, "demo_token") which stores the
 * token inside Zustand's persisted "sahayak-store" key — it does NOT call
 * storeSession(), so localStorage.getItem("sahayak_token") is always null.
 * We must read from the Zustand persisted store instead.
 */
export function isDemoMode(): boolean {
  try {
    // Primary: Zustand persist store (where Auth.tsx demo button writes)
    const raw = localStorage.getItem("sahayak-store")
    if (raw) {
      const store = JSON.parse(raw)
      // Zustand persist wraps state under store.state in v4+
      const token = store?.state?.token ?? store?.token
      if (token === "demo_token") return true
    }
    // Fallback: direct key (set by storeSession() for real accounts)
    return localStorage.getItem("sahayak_token") === "demo_token"
  } catch {
    return false
  }
}

// ── Cross-store sync events ────────────────────────────────────────────────────

const SYNC_EVENT = "sahayak:store:sync"

/** Notify all onSync() subscribers that localStorage was updated */
export function dispatchSync(): void {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(SYNC_EVENT))
  }
}

/**
 * Subscribe to cross-store sync events.
 * Returns an unsubscribe function — call it in a useEffect cleanup.
 */
export function onSync(callback: () => void): () => void {
  window.addEventListener(SYNC_EVENT, callback)
  return () => window.removeEventListener(SYNC_EVENT, callback)
}

// ── Typed helpers ─────────────────────────────────────────────────────────────

export interface DemoAppointment {
  id: string
  patient_name: string
  reason: string
  preferred_time: string
  phone?: string
  created_at: string
  status: "pending" | "confirmed" | "completed"
  booked_by: "patient" | "asha"
}

export const demoAppointments = {
  getAll: (): DemoAppointment[] => demoGet<DemoAppointment[]>("appointments", []),
  add: (appt: Omit<DemoAppointment, "id" | "created_at">): DemoAppointment => {
    const newAppt: DemoAppointment = {
      ...appt,
      id: Date.now().toString(),
      created_at: new Date().toISOString(),
    }
    const all = demoAppointments.getAll()
    demoSet("appointments", [newAppt, ...all])
    return newAppt
  },
  updateStatus: (id: string, status: DemoAppointment["status"]): void => {
    const all = demoAppointments.getAll().map(a => a.id === id ? { ...a, status } : a)
    demoSet("appointments", all)
  },
}

// ── Call logs (ASHA outbound health checks) ───────────────────────────────────

export interface DemoCallLog {
  id:              string
  direction:       "inbound" | "outbound"
  call_type:       string   // health_check | followup | reminder | emergency
  patient_phone:   string
  patient_name:    string
  health_update:   string | null
  symptoms:        string | null
  visit_requested: boolean
  urgency:         string | null
  created_at:      string
  status:          "initiated" | "completed" | "failed"
  asha_name?:      string
}

const MAX_ENTRIES = 200

export const demoCallLogs = {
  getAll: (): DemoCallLog[] => demoGet<DemoCallLog[]>("call_logs", []),
  add: (log: Omit<DemoCallLog, "id" | "created_at">): DemoCallLog => {
    const entry: DemoCallLog = {
      ...log,
      id:         Date.now().toString(),
      created_at: new Date().toISOString(),
    }
    demoSet("call_logs", [entry, ...demoCallLogs.getAll()].slice(0, MAX_ENTRIES))
    dispatchSync()
    return entry
  },
  updateStatus: (id: string, status: DemoCallLog["status"], healthUpdate?: string): void => {
    const all = demoCallLogs.getAll().map(l =>
      l.id === id ? { ...l, status, health_update: healthUpdate ?? l.health_update } : l
    )
    demoSet("call_logs", all)
    dispatchSync()
  },
}

// ── Health records (populated from calls + reports) ───────────────────────────

export interface DemoHealthRecord {
  id:           string
  patient_name: string
  patient_phone?: string
  record_type:  "call" | "report" | "appointment"
  title:        string
  summary:      string
  bp?:          string
  hr?:          string
  temp?:        string
  spo2?:        string
  risk_level:   "LOW" | "MEDIUM" | "HIGH" | "EMERGENCY"
  created_at:   string
  source:       "asha_call" | "patient_upload" | "voice_booking" | "manual"
}

export const demoHealthRecords = {
  getAll: (): DemoHealthRecord[] => demoGet<DemoHealthRecord[]>("health_records", []),
  getByPatient: (nameOrPhone: string): DemoHealthRecord[] =>
    demoHealthRecords.getAll().filter(r =>
      r.patient_name.toLowerCase().includes(nameOrPhone.toLowerCase()) ||
      (r.patient_phone && r.patient_phone.includes(nameOrPhone))
    ),
  add: (rec: Omit<DemoHealthRecord, "id" | "created_at">): DemoHealthRecord => {
    const entry: DemoHealthRecord = {
      ...rec,
      id:         Date.now().toString(),
      created_at: new Date().toISOString(),
    }
    demoSet("health_records", [entry, ...demoHealthRecords.getAll()].slice(0, MAX_ENTRIES))
    dispatchSync()
    return entry
  },
}

// ── Batch add (single dispatchSync for both stores) ──────────────────────────

export function demoAddCallWithRecord(
  log: Omit<DemoCallLog, "id" | "created_at">,
  rec: Omit<DemoHealthRecord, "id" | "created_at">,
): void {
  const now = new Date().toISOString()
  const logEntry: DemoCallLog = { ...log, id: Date.now().toString(), created_at: now }
  const recEntry: DemoHealthRecord = { ...rec, id: (Date.now() + 1).toString(), created_at: now }
  demoSet("call_logs",      [logEntry, ...demoCallLogs.getAll()].slice(0, MAX_ENTRIES))
  demoSet("health_records", [recEntry, ...demoHealthRecords.getAll()].slice(0, MAX_ENTRIES))
  dispatchSync()
}

// ── Cross-store sync helpers ───────────────────────────────────────────────────

type RawReminder = { id: string; title: string; patient?: string; done: boolean }
type RawMother   = { id: string; name: string; anc_done: number }
type RawChild    = { id: string; name: string; mother: string; vaccines: Record<string, string> }

/**
 * Called from MaternalHealth when a visit card is clicked.
 * Marks (or unmarks) the matching ANC reminder in asha_reminders.
 */
export function syncAncToReminders(motherName: string, visitNum: number, done: boolean): void {
  try {
    const all = demoGet<RawReminder[]>("asha_reminders", [])
    const updated = all.map(r => {
      if (r.patient !== motherName) return r
      const hasAnc = /anc/i.test(r.title)
      // Match "3rd", "3", "3rd visit" etc. — ordinals need (?:st|nd|rd|th)?
      const hasNum = new RegExp(`${visitNum}(?:st|nd|rd|th)?`, "i").test(r.title)
      if (hasAnc && hasNum) return { ...r, done }
      return r
    })
    demoSet("asha_reminders", updated)
    dispatchSync()
  } catch { /* ignore */ }
}

/**
 * Called from Reminders when an ANC reminder is toggled.
 * Updates the matching mother's anc_done in maternal_mothers.
 */
export function syncReminderToMaternal(motherName: string, visitNum: number, done: boolean): void {
  try {
    const all = demoGet<RawMother[]>("maternal_mothers", [])
    const updated = all.map(m => {
      if (m.name !== motherName) return m
      const curr = m.anc_done ?? 0
      const next = done ? Math.max(curr, visitNum) : Math.min(curr, visitNum - 1)
      return { ...m, anc_done: next }
    })
    demoSet("maternal_mothers", updated)
    dispatchSync()
  } catch { /* ignore */ }
}

/**
 * Called from Immunization when a vaccine is toggled.
 * Marks (or unmarks) the matching vaccine reminder in asha_reminders.
 */
export function syncVaxToReminders(
  patientRef: string,  // child name or mother name
  vaxLabel: string,    // e.g. "Pentavalent 2"
  done: boolean,
): void {
  try {
    const all = demoGet<RawReminder[]>("asha_reminders", [])
    const labelWord = vaxLabel.split(/\s+/)[0].toLowerCase()
    const updated = all.map(r => {
      if (!r.patient) return r
      const patMatch =
        r.patient.toLowerCase().includes(patientRef.toLowerCase().split(/\s+/)[0]) ||
        patientRef.toLowerCase().includes(r.patient.toLowerCase().split(/\s+/)[0])
      if (!patMatch) return r
      if (!r.title.toLowerCase().includes(labelWord)) return r
      return { ...r, done }
    })
    demoSet("asha_reminders", updated)
    dispatchSync()
  } catch { /* ignore */ }
}

/**
 * Called from Reminders when a vaccine reminder is toggled.
 * Finds the matching child + vax in immunization_children and updates status.
 */
export function syncReminderToImmunization(
  patientRef: string,   // reminder.patient field
  reminderTitle: string,
  done: boolean,
): void {
  // Map vaccine keywords → vaccine IDs (must align with Immunization.tsx VACCINES array)
  const LABEL_TO_ID: [RegExp, string][] = [
    [/\bbcg\b/i,                         "bcg"],
    [/hep\s*b/i,                         "hepb0"],
    [/\bopv\s*0\b/i,                     "opv0"],
    [/penta.*\b1\b|pentavalent.*\b1\b/i, "penta1"],
    [/\bopv\s*1\b/i,                     "opv1"],
    [/rota.*\b1\b|rotavirus.*\b1\b/i,    "rota1"],
    [/penta.*\b2\b|pentavalent.*\b2\b/i, "penta2"],
    [/\bopv\s*2\b/i,                     "opv2"],
    [/rota.*\b2\b|rotavirus.*\b2\b/i,    "rota2"],
    [/penta.*\b3\b|pentavalent.*\b3\b/i, "penta3"],
    [/\bopv\s*3\b/i,                     "opv3"],
    [/\bipv\b/i,                         "ipv"],
    [/measles.*\b1\b/i,                  "measles1"],
    [/vit.*a\b|vitamin.*a\b/i,           "vitA1"],
    [/\bmr\s*1\b/i,                      "mr1"],
    [/\bje\s*1\b/i,                      "je1"],
    [/\bdpt\b/i,                         "dpt_booster"],
    [/measles.*\b2\b/i,                  "measles2"],
  ]

  let vaxId: string | null = null
  for (const [re, id] of LABEL_TO_ID) {
    if (re.test(reminderTitle)) { vaxId = id; break }
  }
  if (!vaxId) return

  try {
    const all  = demoGet<RawChild[]>("immunization_children", [])
    const ref  = patientRef.toLowerCase()
    const updated = all.map(c => {
      const match =
        c.name.toLowerCase().includes(ref.split(/\s+/)[0]) ||
        c.mother.toLowerCase().includes(ref.split(/\s+/)[0]) ||
        ref.includes(c.name.toLowerCase().split(/\s+/)[0]) ||
        ref.includes(c.mother.toLowerCase().split(/\s+/)[0])
      if (!match) return c
      const id     = vaxId as string
      const curr   = c.vaccines[id] ?? "upcoming"
      const newVal = done ? "done" : (curr === "done" ? "due" : curr)
      return { ...c, vaccines: { ...c.vaccines, [id]: newVal } }
    })
    demoSet("immunization_children", updated)
    dispatchSync()
  } catch { /* ignore */ }
}
