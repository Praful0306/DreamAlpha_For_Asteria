import { useState, useEffect } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { Bell, User, Calendar, Check, Plus, X, Tag } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Badge } from "@/components/ui/badge"
import {
  Select, SelectContent, SelectItem,
  SelectTrigger, SelectValue,
} from "@/components/ui/select"
import { toast } from "sonner"
import { formatDate } from "@/lib/utils"
import {
  demoGet, demoSet, onSync,
  syncReminderToMaternal, syncReminderToImmunization,
} from "@/lib/demoStore"

interface Reminder {
  id: string; title: string; patient?: string
  due: string; category: string; done: boolean
}

const STORAGE_KEY = "asha_reminders"

const INIT: Reminder[] = [
  { id:"1", title:"ANC 3rd Visit",          patient:"Sunita Bai",    due: new Date().toISOString(),               category:"Maternal",     done: false },
  { id:"2", title:"TB DOTS — Day 15",       patient:"Ramesh Kumar",  due: new Date(Date.now()+86400000).toISOString(),   category:"TB",          done: false },
  { id:"3", title:"Pentavalent 2nd dose",   patient:"Baby of Priya", due: new Date(Date.now()+2*86400000).toISOString(), category:"Immunization", done: false },
  { id:"4", title:"Malaria RDT follow-up",  patient:"Mohan Lal",     due: new Date(Date.now()+3*86400000).toISOString(), category:"Malaria",      done: false },
  { id:"5", title:"IFA distribution Ward 5",                          due: new Date(Date.now()+7*86400000).toISOString(), category:"Nutrition",    done: true  },
]

const CATEGORIES = ["Maternal","Immunization","TB","Malaria","Nutrition","Dengue","Follow-up","Other"]

const CAT_COLOR: Record<string, string> = {
  Maternal:      "bg-pink-500/15 text-pink-400 border-pink-500/25",
  TB:            "bg-red-500/15 text-red-400 border-red-500/25",
  Immunization:  "bg-blue-500/15 text-blue-400 border-blue-500/25",
  Malaria:       "bg-yellow-500/15 text-yellow-400 border-yellow-500/25",
  Nutrition:     "bg-green-500/15 text-green-400 border-green-500/25",
  Dengue:        "bg-orange-500/15 text-orange-400 border-orange-500/25",
  "Follow-up":   "bg-purple-500/15 text-purple-400 border-purple-500/25",
  Other:         "bg-gray-500/15 text-gray-400 border-gray-500/25",
}

const EMPTY_FORM = { title:"", patient:"", due:"", category:"Other" }

export default function Reminders() {
  const [reminders, setReminders] = useState<Reminder[]>(() =>
    demoGet<Reminder[]>(STORAGE_KEY, INIT)
  )
  const [notify,    setNotify]    = useState(true)
  const [showForm,  setShowForm]  = useState(false)
  const [form,      setForm]      = useState(EMPTY_FORM)
  const [errors,    setErrors]    = useState<Record<string,string>>({})

  // Persist to localStorage on every change
  useEffect(() => { demoSet(STORAGE_KEY, reminders) }, [reminders])

  // Re-read when MaternalHealth or Immunization updates this store via sync event
  useEffect(() => {
    return onSync(() => {
      setReminders(demoGet<Reminder[]>(STORAGE_KEY, INIT))
    })
  }, [])

  function toggle(id: string) {
    const rem = reminders.find(r => r.id === id)
    if (!rem) return
    const newDone      = !rem.done
    const newReminders = reminders.map(r2 => r2.id === id ? { ...r2, done: newDone } : r2)

    // ★ Write to localStorage FIRST — cross-sync helpers call dispatchSync()
    //   synchronously, and onSync() would re-read stale data if we haven't saved yet.
    demoSet(STORAGE_KEY, newReminders)
    setReminders(newReminders)

    // ── Cross-store sync ────────────────────────────────────────────
    if (rem.patient) {
      // ANC visit? matches "ANC 3rd Visit", "ANC Visit 3", "ANC 3", etc.
      // Use (\d+)(?:st|nd|rd|th)? so ordinals like "3rd" are captured as 3
      const ancMatch = rem.title.match(/(\d+)(?:st|nd|rd|th)?/i)
      if (/anc/i.test(rem.title) && ancMatch) {
        const visitNum = parseInt(ancMatch[1])
        if (visitNum >= 1 && visitNum <= 4) {
          syncReminderToMaternal(rem.patient, visitNum, newDone)
        }
      }

      // Vaccine reminder? e.g. "Pentavalent 2nd dose" / "BCG" / "OPV 1"
      const isVaxReminder = /pentavalent|penta|opv|bcg|hep\s*b|measles|rotavirus|ipv|vit.*a|dpt|mr\s*\d|je\s*\d/i.test(rem.title)
      if (isVaxReminder) {
        syncReminderToImmunization(rem.patient, rem.title, newDone)
      }
    }
  }

  function deleteReminder(id: string) {
    setReminders(r => r.filter(rem => rem.id !== id))
    toast.success("Reminder removed")
  }

  function validate() {
    const e: Record<string,string> = {}
    if (!form.title.trim()) e.title = "Title is required"
    if (!form.due)          e.due   = "Due date is required"
    return e
  }

  function handleAdd() {
    const e = validate()
    if (Object.keys(e).length) { setErrors(e); return }
    const newReminder: Reminder = {
      id:       Date.now().toString(),
      title:    form.title.trim(),
      patient:  form.patient.trim() || undefined,
      due:      new Date(form.due).toISOString(),
      category: form.category,
      done:     false,
    }
    setReminders(r => [newReminder, ...r])
    setShowForm(false)
    setForm(EMPTY_FORM)
    setErrors({})
    toast.success("Reminder added!")
  }

  const due     = reminders.filter(r => !r.done).sort((a,b) => new Date(a.due).getTime() - new Date(b.due).getTime())
  const done    = reminders.filter(r =>  r.done)
  const overdue = due.filter(r => new Date(r.due) < new Date())

  return (
    <div className="p-4 sm:p-6 max-w-2xl mx-auto space-y-5">

      {/* Header */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-2xl font-bold text-white">Reminders</h2>
          <p className="text-gray-500 mt-0.5">{due.length} upcoming · {overdue.length} overdue</p>
        </div>
        <div className="flex items-center gap-3">
          <Button
            onClick={() => setShowForm(s => !s)}
            size="sm"
            className="gap-1.5 text-white h-9"
            style={{ background:"linear-gradient(135deg,#f97316,#fb923c)", boxShadow:"0 0 16px rgba(249,115,22,0.3)" }}
          >
            <Plus className="w-3.5 h-3.5" /> Add Reminder
          </Button>
          <div className="flex items-center gap-2">
            <Bell className={`w-4 h-4 ${notify ? "text-brand-400" : "text-gray-600"}`} />
            <Switch checked={notify} onCheckedChange={setNotify} />
          </div>
        </div>
      </div>

      {/* Overdue alert */}
      {overdue.length > 0 && (
        <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-3 flex items-center gap-2 text-sm text-red-400">
          <Bell className="w-4 h-4 shrink-0" />
          {overdue.length} overdue reminder{overdue.length > 1 ? "s" : ""} need immediate attention
        </div>
      )}

      {/* Add reminder inline form */}
      <AnimatePresence>
        {showForm && (
          <motion.div
            key="form"
            initial={{ opacity:0, height:0 }}
            animate={{ opacity:1, height:"auto" }}
            exit={{ opacity:0, height:0 }}
            className="overflow-hidden"
          >
            <div
              className="p-4 rounded-xl space-y-4"
              style={{ background:"rgba(249,115,22,0.04)", border:"1px solid rgba(249,115,22,0.2)" }}
            >
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold text-white">New Reminder</p>
                <button onClick={() => { setShowForm(false); setErrors({}) }} className="text-gray-500 hover:text-white">
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Title */}
              <div>
                <Label className="text-xs text-gray-400 mb-1.5 block">Title *</Label>
                <Input
                  placeholder="e.g. ANC 3rd visit for Radha Devi"
                  value={form.title}
                  onChange={e => { setForm(f => ({...f, title:e.target.value})); setErrors(er => {const n={...er};delete n.title;return n}) }}
                  className={`bg-white/[0.04] border text-white h-10 placeholder:text-gray-600 ${errors.title ? "border-red-500/50" : "border-white/[0.08]"}`}
                />
                {errors.title && <p className="text-xs text-red-400 mt-1">{errors.title}</p>}
              </div>

              <div className="grid grid-cols-2 gap-3">
                {/* Patient */}
                <div>
                  <Label className="text-xs text-gray-400 mb-1.5 block flex items-center gap-1">
                    <User className="w-3 h-3" /> Patient (optional)
                  </Label>
                  <Input
                    placeholder="Patient name"
                    value={form.patient}
                    onChange={e => setForm(f => ({...f, patient:e.target.value}))}
                    className="bg-white/[0.04] border-white/[0.08] text-white h-10 placeholder:text-gray-600"
                  />
                </div>

                {/* Category */}
                <div>
                  <Label className="text-xs text-gray-400 mb-1.5 block flex items-center gap-1">
                    <Tag className="w-3 h-3" /> Category
                  </Label>
                  <Select value={form.category} onValueChange={v => setForm(f => ({...f, category:v}))}>
                    <SelectTrigger className="bg-white/[0.04] border-white/[0.08] text-white h-10">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-[#1a1a22] border-[#2a2a35]">
                      {CATEGORIES.map(c => (
                        <SelectItem key={c} value={c} className="text-white focus:bg-white/10">{c}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Due date */}
              <div>
                <Label className="text-xs text-gray-400 mb-1.5 block flex items-center gap-1">
                  <Calendar className="w-3 h-3" /> Due Date *
                </Label>
                <Input
                  type="datetime-local"
                  value={form.due}
                  onChange={e => { setForm(f => ({...f, due:e.target.value})); setErrors(er => {const n={...er};delete n.due;return n}) }}
                  className={`bg-white/[0.04] border text-white h-10 ${errors.due ? "border-red-500/50" : "border-white/[0.08]"}`}
                />
                {errors.due && <p className="text-xs text-red-400 mt-1">{errors.due}</p>}
              </div>

              <Button
                onClick={handleAdd}
                className="w-full h-10 font-semibold text-white gap-2"
                style={{ background:"linear-gradient(135deg,#f97316,#fb923c)" }}
              >
                <Plus className="w-4 h-4" /> Save Reminder
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Upcoming */}
      {due.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider px-1">Upcoming ({due.length})</h3>
          {due.map((r, i) => {
            const isOverdue = new Date(r.due) < new Date()
            const isToday   = new Date(r.due).toDateString() === new Date().toDateString()
            return (
              <motion.div
                key={r.id}
                initial={{ opacity:0, y:8 }}
                animate={{ opacity:1, y:0 }}
                transition={{ delay: i * 0.04 }}
                className={`flex items-start gap-3 p-4 rounded-xl border group ${
                  isOverdue ? "bg-red-500/5 border-red-500/20"
                  : isToday  ? "bg-brand-500/5 border-brand-500/20"
                  :            "bg-[#1a1a22] border-[#2a2a35]"
                }`}
              >
                {/* Circle toggle */}
                <button
                  onClick={() => toggle(r.id)}
                  className={`mt-0.5 shrink-0 w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all ${
                    isOverdue ? "border-red-500 hover:bg-red-500/20" : "border-gray-600 hover:border-brand-500"
                  }`}
                />

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm font-medium text-white">{r.title}</p>
                    <Badge className={`text-[10px] ${CAT_COLOR[r.category] ?? "bg-gray-500/15 text-gray-400 border-gray-500/25"}`}>
                      {r.category}
                    </Badge>
                    {isOverdue && <Badge className="text-[10px] bg-red-500/15 text-red-400 border-red-500/25">Overdue</Badge>}
                    {isToday && !isOverdue && <Badge className="text-[10px] bg-brand-500/15 text-brand-400 border-brand-500/25">Today</Badge>}
                  </div>
                  {r.patient && (
                    <span className="flex items-center gap-1 text-xs text-gray-500 mt-0.5">
                      <User className="w-3 h-3" /> {r.patient}
                    </span>
                  )}
                  <span className={`flex items-center gap-1 text-xs mt-1 ${isOverdue ? "text-red-400" : isToday ? "text-brand-400" : "text-gray-500"}`}>
                    <Calendar className="w-3 h-3" /> {formatDate(r.due)}
                  </span>
                </div>

                {/* Delete button */}
                <button
                  onClick={() => deleteReminder(r.id)}
                  className="opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded-lg text-gray-600 hover:text-red-400 hover:bg-red-500/10"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </motion.div>
            )
          })}
        </div>
      )}

      {due.length === 0 && (
        <div className="text-center py-10 text-gray-600 text-sm">
          No upcoming reminders.{" "}
          <button onClick={() => setShowForm(true)} className="text-brand-400 hover:underline">Add one</button>
        </div>
      )}

      {/* Done */}
      {done.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider px-1">Completed ({done.length})</h3>
          {done.map(r => (
            <div key={r.id} className="flex items-center gap-3 p-4 rounded-xl bg-white/[0.02] border border-white/[0.05] group">
              <button onClick={() => toggle(r.id)}>
                <Check className="w-5 h-5 text-green-500 shrink-0" />
              </button>
              <p className="text-sm text-gray-500 line-through flex-1">{r.title}</p>
              <button
                onClick={() => deleteReminder(r.id)}
                className="opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded-lg text-gray-600 hover:text-red-400"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
