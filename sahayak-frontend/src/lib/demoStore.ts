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
  is_synced?: boolean
  doctor_id?: number
}

export const demoAppointments = {
  getAll: (): DemoAppointment[] => demoGet<DemoAppointment[]>("appointments", []),
  add: (appt: Omit<DemoAppointment, "id" | "created_at">): DemoAppointment => {
    const newAppt: DemoAppointment = {
      ...appt,
      id: Date.now().toString(),
      created_at: new Date().toISOString(),
      is_synced: false,
    }
    const all = demoAppointments.getAll()
    demoSet("appointments", [newAppt, ...all])
    dispatchSync()   // notify doctor dashboard instantly
    return newAppt
  },
  updateStatus: (id: string, status: DemoAppointment["status"]): void => {
    const all = demoAppointments.getAll().map(a => a.id === id ? { ...a, status } : a)
    demoSet("appointments", all)
    dispatchSync()
  },
  markSynced: (id: string): void => {
    const all = demoAppointments.getAll().map(a => a.id === id ? { ...a, is_synced: true } : a)
    demoSet("appointments", all)
    dispatchSync()
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

// ── Demo data seed (judges / hackathon demo) ──────────────────────────────────

const DEMO_SEED_KEY = "sahayak_demo_seeded_v4"

/**
 * Pre-seeds all demo stores with realistic Indian rural health data.
 * Runs once per browser session (guarded by a version flag in localStorage).
 * Call this at app startup when isDemoMode() is true.
 */
export function seedDemoData(): void {
  if (localStorage.getItem(DEMO_SEED_KEY)) return   // already seeded

  // ── Patients ──────────────────────────────────────────────────────────────
  demoSet("asha_patients", [
    { id: 1,  name: "Priya Devi",    age: 28, gender: "F", village: "Rampur",    phone: "9876543210", risk_level: "HIGH",      diagnosis: "Suspected Dengue",    last_visit: "2026-04-29" },
    { id: 2,  name: "Rajesh Kumar",  age: 45, gender: "M", village: "Sitapur",   phone: "9812345678", risk_level: "MEDIUM",    diagnosis: "Hypertension",        last_visit: "2026-04-28" },
    { id: 3,  name: "Sunita Bai",    age: 32, gender: "F", village: "Rampur",    phone: "9898765432", risk_level: "LOW",       diagnosis: "Iron Deficiency Anaemia", last_visit: "2026-04-27" },
    { id: 4,  name: "Arun Singh",    age: 8,  gender: "M", village: "Hardoi",    phone: "9754321098", risk_level: "HIGH",      diagnosis: "Malaria Suspect",     last_visit: "2026-04-30" },
    { id: 5,  name: "Meera Devi",    age: 25, gender: "F", village: "Rampur",    phone: "9765432109", risk_level: "LOW",       diagnosis: "ANC 2nd Trimester",   last_visit: "2026-04-26" },
    { id: 6,  name: "Ravi Prasad",   age: 60, gender: "M", village: "Lakhimpur", phone: "9743210987", risk_level: "EMERGENCY", diagnosis: "Chest Pain / Hypertension", last_visit: "2026-04-30" },
    { id: 7,  name: "Kavita Singh",  age: 22, gender: "F", village: "Sitapur",   phone: "9721098765", risk_level: "MEDIUM",    diagnosis: "Typhoid Suspect",     last_visit: "2026-04-25" },
    { id: 8,  name: "Mohan Lal",     age: 38, gender: "M", village: "Rampur",    phone: "9710987654", risk_level: "LOW",       diagnosis: "TB Screening – Negative", last_visit: "2026-04-24" },
  ])

  // ── Call Logs ─────────────────────────────────────────────────────────────
  const now = Date.now()
  demoSet("call_logs", [
    { id: String(now-1), direction: "outbound", call_type: "health_check",  patient_phone: "9876543210", patient_name: "Priya Devi",   health_update: "Fever persisting, advised hospital visit today",  symptoms: "High fever 102°F, headache, joint pain", visit_requested: true,  urgency: "urgent",  status: "completed", asha_name: "Sunita", created_at: new Date(now - 2*3600000).toISOString() },
    { id: String(now-2), direction: "inbound",  call_type: "emergency",     patient_phone: "9743210987", patient_name: "Ravi Prasad",  health_update: "Severe chest pain, referred to PHC immediately",  symptoms: "Chest pain, shortness of breath, sweating", visit_requested: true, urgency: "urgent",  status: "completed", asha_name: "Sunita", created_at: new Date(now - 5*3600000).toISOString() },
    { id: String(now-3), direction: "outbound", call_type: "followup",      patient_phone: "9812345678", patient_name: "Rajesh Kumar", health_update: "BP 148/92 — advised low salt diet, follow-up in 7 days", symptoms: "Headache, dizziness", visit_requested: false, urgency: null, status: "completed", asha_name: "Sunita", created_at: new Date(now - 1*86400000).toISOString() },
    { id: String(now-4), direction: "outbound", call_type: "reminder",      patient_phone: "9765432109", patient_name: "Meera Devi",   health_update: "Reminded for ANC 3rd visit. Will come Thursday.",  symptoms: null, visit_requested: false, urgency: null, status: "completed", asha_name: "Sunita", created_at: new Date(now - 2*86400000).toISOString() },
    { id: String(now-5), direction: "outbound", call_type: "health_check",  patient_phone: "9754321098", patient_name: "Arun Singh",   health_update: "Child has chills and rigour — malaria RDT positive. Referred to PHC.", symptoms: "Fever 103°F, chills, vomiting", visit_requested: true, urgency: "urgent", status: "completed", asha_name: "Sunita", created_at: new Date(now - 3*86400000).toISOString() },
  ])

  // ── Health Records ────────────────────────────────────────────────────────
  demoSet("health_records", [
    { id: String(now+1), patient_name: "Priya Devi",   record_type: "call",        title: "Dengue Follow-up",       summary: "Platelet count low, advised immediate hospitalisation",   bp: "110/70", hr: "98",  temp: "102", spo2: "97", risk_level: "HIGH",      created_at: new Date(now - 2*3600000).toISOString(),   source: "asha_call" },
    { id: String(now+2), patient_name: "Ravi Prasad",  record_type: "call",        title: "Emergency – Chest Pain", summary: "Referred to District Hospital. Possible cardiac event.",  bp: "170/100",hr: "112", temp: "98.6",spo2: "94", risk_level: "EMERGENCY", created_at: new Date(now - 5*3600000).toISOString(),   source: "asha_call" },
    { id: String(now+3), patient_name: "Rajesh Kumar", record_type: "appointment", title: "Hypertension Review",    summary: "BP managed with medication. Follow-up in 7 days.",        bp: "148/92", hr: "78",  temp: "98.4",spo2: "98", risk_level: "MEDIUM",    created_at: new Date(now - 1*86400000).toISOString(),  source: "manual" },
    { id: String(now+4), patient_name: "Arun Singh",   record_type: "report",      title: "Malaria RDT Positive",   summary: "Plasmodium vivax. Artemether-lumefantrine prescribed.",   bp: null,     hr: "108", temp: "103", spo2: "96", risk_level: "HIGH",      created_at: new Date(now - 3*86400000).toISOString(),  source: "asha_call" },
    { id: String(now+5), patient_name: "Sunita Bai",   record_type: "report",      title: "Anaemia Screening",      summary: "Hb 8.2 g/dL. IFA tablets distributed. Re-test in 30 days.", bp: "100/65",hr: "88",  temp: "98.2",spo2: "98", risk_level: "LOW",       created_at: new Date(now - 5*86400000).toISOString(),  source: "patient_upload" },
  ])

  // ── Maternal Mothers ──────────────────────────────────────────────────────
  demoSet("maternal_mothers", [
    { id: "m1", name: "Sunita Bai",  age: 24, village: "Rampur",    weeks: 32, edd: "2026-07-20", risk: "LOW",    anc_done: 2, anc_total: 4, ifa_given: true,  tt_done: true,  phone: "9898765432" },
    { id: "m2", name: "Meera Devi",  age: 25, village: "Rampur",    weeks: 20, edd: "2026-09-15", risk: "MEDIUM", anc_done: 1, anc_total: 4, ifa_given: true,  tt_done: false, phone: "9765432109" },
    { id: "m3", name: "Geeta Singh", age: 30, village: "Sultanpur", weeks: 38, edd: "2026-05-10", risk: "HIGH",   anc_done: 3, anc_total: 4, ifa_given: true,  tt_done: true,  phone: "9700123456" },
    { id: "m4", name: "Lata Sharma", age: 22, village: "Sitapur",   weeks: 14, edd: "2026-11-05", risk: "LOW",    anc_done: 0, anc_total: 4, ifa_given: false, tt_done: false, phone: "9822334455" },
    { id: "m5", name: "Rekha Yadav", age: 28, village: "Hardoi",    weeks: 28, edd: "2026-08-12", risk: "HIGH",   anc_done: 2, anc_total: 4, ifa_given: true,  tt_done: true,  phone: "9811223344" },
  ])

  // ── Tasks / Reminders ─────────────────────────────────────────────────────
  demoSet("asha_reminders", [
    { id: "t1", title: "Visit Sunita Devi for ANC 3rd visit",     patient: "Sunita Bai",  priority: "high",   due: "2026-05-02", done: false },
    { id: "t2", title: "Distribute IFA tablets in Ward 5",        patient: null,          priority: "high",   due: "2026-05-01", done: false },
    { id: "t3", title: "Update register for malaria surveillance",patient: null,          priority: "medium", due: "2026-05-03", done: false },
    { id: "t4", title: "Refer Priya to PHC for hemoglobin <7",    patient: "Priya Devi",  priority: "high",   due: "2026-05-01", done: false },
    { id: "t5", title: "Follow up with Arun Singh after malaria treatment", patient: "Arun Singh", priority: "high", due: "2026-05-04", done: false },
    { id: "t6", title: "Schedule BCG vaccination for newborn",    patient: "Geeta Singh", priority: "medium", due: "2026-05-05", done: false },
    { id: "t7", title: "Conduct village health sanitation committee meeting", patient: null, priority: "low", due: "2026-05-10", done: false },
    { id: "t8", title: "Visit Rekha Yadav for blood pressure monitoring", patient: "Rekha Yadav", priority: "high", due: "2026-05-02", done: false },
  ])

  // ── Immunization children ────────────────────────────────────────────────
  demoSet("immunization_children", [
    { id: "c1", name: "Baby of Geeta", mother: "Geeta Singh", dob: "2026-04-15", village: "Sultanpur",
      vaccines: { bcg: "done", hepb0: "done", opv0: "done", penta1: "due", opv1: "due", rota1: "upcoming" } },
    { id: "c2", name: "Rahul Kumar",   mother: "Anita Kumar",  dob: "2025-11-10", village: "Rampur",
      vaccines: { bcg: "done", hepb0: "done", opv0: "done", penta1: "done", opv1: "done", rota1: "done", penta2: "done", opv2: "done", rota2: "due", penta3: "upcoming" } },
  ])

  // ── Appointments (use today's date so they show on BOTH patient & doctor) ──
  const todayDate = new Date().toISOString().slice(0, 10)
  const tmrw = new Date(); tmrw.setDate(tmrw.getDate() + 1)
  const tomorrowDate = tmrw.toISOString().slice(0, 10)
  demoSet("appointments", [
    { id: String(now+10), patient_name: "Priya Devi",   reason: "Dengue follow-up",        preferred_time: `${todayDate} 10:00`, phone: "9876543210", status: "confirmed", booked_by: "asha",    doctor_id: 999, is_synced: true, created_at: new Date(now - 3*3600000).toISOString() },
    { id: String(now+11), patient_name: "Rajesh Kumar", reason: "Blood pressure check",    preferred_time: `${todayDate} 11:30`, phone: "9812345678", status: "pending",   booked_by: "patient", doctor_id: 999, is_synced: true, created_at: new Date(now - 6*3600000).toISOString() },
    { id: String(now+12), patient_name: "Arun Singh",   reason: "Malaria follow-up",       preferred_time: `${todayDate} 14:00`, phone: "9754321098", status: "pending",   booked_by: "asha",    doctor_id: 999, is_synced: true, created_at: new Date(now - 1*86400000).toISOString() },
    { id: String(now+13), patient_name: "Meera Devi",   reason: "ANC 3rd trimester visit", preferred_time: `${tomorrowDate} 09:00`, phone: "9765432109", status: "pending", booked_by: "asha",   doctor_id: 999, is_synced: true, created_at: new Date(now - 1*86400000).toISOString() },
    { id: String(now+14), patient_name: "Ravi Prasad",  reason: "Chest pain review",       preferred_time: `${tomorrowDate} 10:30`, phone: "9743210987", status: "pending", booked_by: "patient", doctor_id: 999, is_synced: true, created_at: new Date(now - 2*3600000).toISOString() },
  ])

  // ── Demo patient reports (so patient dashboard shows vitals & charts) ─────
  demoSet("patient_reports", [
    { id: 1001, created_at: new Date(now - 0*86400000).toISOString(), risk_level: "MEDIUM", heart_rate: 88, spo2: 96, temperature: 37.1, bp_systolic: 128, bp_diastolic: 82, diagnosis: "Mild fever, dengue suspected", health_score: 72 },
    { id: 1002, created_at: new Date(now - 2*86400000).toISOString(), risk_level: "HIGH",   heart_rate: 98, spo2: 94, temperature: 38.2, bp_systolic: 135, bp_diastolic: 88, diagnosis: "High fever, platelet drop",   health_score: 58 },
    { id: 1003, created_at: new Date(now - 5*86400000).toISOString(), risk_level: "MEDIUM", heart_rate: 82, spo2: 97, temperature: 36.8, bp_systolic: 122, bp_diastolic: 78, diagnosis: "Recovering, monitor vitals",    health_score: 68 },
    { id: 1004, created_at: new Date(now - 8*86400000).toISOString(), risk_level: "LOW",    heart_rate: 76, spo2: 98, temperature: 36.5, bp_systolic: 118, bp_diastolic: 75, diagnosis: "Normal checkup",              health_score: 82 },
    { id: 1005, created_at: new Date(now - 12*86400000).toISOString(),risk_level: "LOW",    heart_rate: 72, spo2: 99, temperature: 36.4, bp_systolic: 115, bp_diastolic: 72, diagnosis: "Routine screening",            health_score: 85 },
  ])

  localStorage.setItem(DEMO_SEED_KEY, "1")
  dispatchSync()
}
