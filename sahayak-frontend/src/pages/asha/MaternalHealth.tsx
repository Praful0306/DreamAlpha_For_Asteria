import { useState, useEffect } from "react"
import { motion, AnimatePresence } from "framer-motion"
import {
  Baby, CheckCircle2, AlertTriangle, Plus, X,
  MapPin, User, Calendar, Stethoscope,
} from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Progress } from "@/components/ui/progress"
import {
  Select, SelectContent, SelectItem,
  SelectTrigger, SelectValue,
} from "@/components/ui/select"
import { toast } from "sonner"
import { formatDate } from "@/lib/utils"
import { demoGet, demoSet, syncAncToReminders, onSync } from "@/lib/demoStore"

const STORAGE_KEY = "maternal_mothers"

interface Mother {
  id: string; name: string; age: string; village: string
  lmp: string; edd: string
  anc_done: number; anc_total: number
  ifa_weeks: number; calcium: boolean; tt_doses: number
  risk: string
}

const INIT_MOTHERS: Mother[] = [
  { id:"1", name:"Sunita Bai",   age:"24", village:"Rampur",    lmp:"2025-09-15", edd:"2026-06-22", anc_done:2, anc_total:4, ifa_weeks:12, calcium:true,  tt_doses:2, risk:"LOW"    },
  { id:"2", name:"Meena Devi",   age:"28", village:"Ganeshpur", lmp:"2025-11-01", edd:"2026-08-08", anc_done:1, anc_total:4, ifa_weeks:6,  calcium:false, tt_doses:1, risk:"MEDIUM" },
  { id:"3", name:"Kamlesh Bai",  age:"32", village:"Sultanpur", lmp:"2025-07-10", edd:"2026-04-16", anc_done:3, anc_total:4, ifa_weeks:20, calcium:true,  tt_doses:2, risk:"HIGH"   },
]

const ANC_VISITS = [
  { visit:1, timing:"1st trimester",   items:["BP check","Weight","Hb","Blood group","USG","HIV/HBsAg"] },
  { visit:2, timing:"14–26 weeks",      items:["BP","Weight","FHR","Fundal height","Hb"] },
  { visit:3, timing:"28–34 weeks",      items:["BP","Weight","Presentation","Hb","ANC card"] },
  { visit:4, timing:"36 weeks+",        items:["BP","Weight","Presentation","Birth plan","JSY"] },
]

function riskColor(r: string) {
  if (r === "HIGH"   ) return "bg-red-500/15 text-red-400 border-red-500/30"
  if (r === "MEDIUM" ) return "bg-yellow-500/15 text-yellow-400 border-yellow-500/30"
  return "bg-green-500/15 text-green-400 border-green-500/30"
}

function calcEDD(lmp: string): string {
  if (!lmp) return ""
  const d = new Date(lmp)
  d.setDate(d.getDate() + 280)
  return d.toISOString().split("T")[0]
}

function weeksPregnant(lmp: string) {
  const diff = Date.now() - new Date(lmp).getTime()
  return Math.max(0, Math.floor(diff / (7 * 24 * 60 * 60 * 1000)))
}

const EMPTY_FORM = {
  name:"", age:"", village:"", lmp:"",
  anc_done:"0", ifa_weeks:"0",
  calcium:"no", tt_doses:"0", risk:"LOW",
}

export default function MaternalHealth() {
  const [mothers,   setMothers]   = useState<Mother[]>(() => demoGet<Mother[]>(STORAGE_KEY, INIT_MOTHERS))
  const [selected,  setSelected]  = useState<Mother | null>(null)
  const [showModal, setShowModal] = useState(false)
  const [form,      setForm]      = useState(EMPTY_FORM)
  const [errors,    setErrors]    = useState<Record<string, string>>({})

  // Auto-select first patient & persist to localStorage whenever list changes
  useEffect(() => {
    if (!selected && mothers.length > 0) setSelected(mothers[0])
    demoSet(STORAGE_KEY, mothers)
  }, [mothers])

  // Re-read from localStorage whenever another section (e.g. Reminders) updates it
  useEffect(() => {
    return onSync(() => {
      const fresh = demoGet<Mother[]>(STORAGE_KEY, INIT_MOTHERS)
      setMothers(fresh)
      setSelected(prev => fresh.find(m => m.id === prev?.id) ?? fresh[0] ?? null)
    })
  }, [])

  /** Toggle an ANC visit done/undone — syncs to Reminders */
  function handleAncClick(visitNum: number) {
    if (!selected) return
    const wasDone    = selected.anc_done >= visitNum
    const newCount   = wasDone ? visitNum - 1 : visitNum
    const updated    = { ...selected, anc_done: newCount }
    const newMothers = mothers.map(mo => mo.id === updated.id ? updated : mo)

    // ★ Write to localStorage FIRST — syncAncToReminders calls dispatchSync()
    //   which triggers the onSync handler synchronously. If localStorage is stale
    //   at that point, onSync overwrites our pending React state update.
    demoSet(STORAGE_KEY, newMothers)

    setMothers(newMothers)
    setSelected(updated)
    syncAncToReminders(selected.name, visitNum, !wasDone)
    toast.success(wasDone ? `ANC Visit ${visitNum} unmarked` : `✅ ANC Visit ${visitNum} marked complete!`)
  }

  function validate() {
    const e: Record<string, string> = {}
    if (!form.name.trim())    e.name    = "Name is required"
    if (!form.age.trim())     e.age     = "Age is required"
    if (!form.village.trim()) e.village = "Village is required"
    if (!form.lmp)            e.lmp     = "LMP date is required"
    return e
  }

  function handleSubmit() {
    const e = validate()
    if (Object.keys(e).length) { setErrors(e); return }

    const newMother: Mother = {
      id:        Date.now().toString(),
      name:      form.name.trim(),
      age:       form.age.trim(),
      village:   form.village.trim(),
      lmp:       form.lmp,
      edd:       calcEDD(form.lmp),
      anc_done:  parseInt(form.anc_done)  || 0,
      anc_total: 4,
      ifa_weeks: parseInt(form.ifa_weeks) || 0,
      calcium:   form.calcium === "yes",
      tt_doses:  parseInt(form.tt_doses)  || 0,
      risk:      form.risk,
    }
    setMothers(m => [newMother, ...m])
    setSelected(newMother)
    setShowModal(false)
    setForm(EMPTY_FORM)
    setErrors({})
    toast.success(`${newMother.name} registered successfully!`)
  }

  function set(field: string, value: string) {
    setForm(f => ({ ...f, [field]: value }))
    setErrors(e => { const n = {...e}; delete n[field]; return n })
  }

  return (
    <div className="p-4 sm:p-6 max-w-5xl mx-auto space-y-6">

      {/* Header */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-2xl font-bold text-white">Maternal Health</h2>
          <p className="text-gray-500 mt-0.5">ANC tracking · IFA · TT immunization</p>
        </div>
        <Button
          onClick={() => setShowModal(true)}
          className="gap-2 text-white font-semibold h-10 px-4"
          style={{ background:"linear-gradient(135deg,#ec4899,#db2777)", boxShadow:"0 0 20px rgba(236,72,153,0.35)" }}
        >
          <Plus className="w-4 h-4" /> Register Pregnancy
        </Button>
      </div>

      {/* Summary strip */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label:"Total", value: mothers.length, color:"text-white" },
          { label:"High Risk", value: mothers.filter(m => m.risk === "HIGH").length, color:"text-red-400" },
          { label:"ANC Pending", value: mothers.filter(m => m.anc_done < m.anc_total).length, color:"text-yellow-400" },
        ].map(s => (
          <Card key={s.label} className="bg-[#1a1a22] border-[#2a2a35]">
            <CardContent className="p-4 text-center">
              <p className={`text-2xl font-extrabold ${s.color}`}>{s.value}</p>
              <p className="text-xs text-gray-500 mt-1">{s.label}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid lg:grid-cols-3 gap-4">
        {/* Mother list */}
        <div className="space-y-2">
          {mothers.map((m) => (
            <motion.button
              key={m.id}
              onClick={() => setSelected(m)}
              initial={{ opacity:0, x:-10 }}
              animate={{ opacity:1, x:0 }}
              className={`w-full text-left p-4 rounded-xl border transition-all ${
                selected?.id === m.id
                  ? "border-pink-500/40 bg-pink-500/5"
                  : "border-[#2a2a35] bg-[#1a1a22] hover:border-white/15"
              }`}
            >
              <div className="flex items-center justify-between mb-1">
                <p className="text-sm font-semibold text-white">{m.name}</p>
                <Badge className={`text-[10px] ${riskColor(m.risk)}`}>{m.risk}</Badge>
              </div>
              <p className="text-xs text-gray-500">
                {weeksPregnant(m.lmp)} wks · {m.village} · EDD {formatDate(m.edd)}
              </p>
              <div className="mt-2">
                <Progress value={(m.anc_done / m.anc_total) * 100} className="h-1.5 bg-white/10" />
                <p className="text-[10px] text-gray-600 mt-0.5">ANC {m.anc_done}/{m.anc_total}</p>
              </div>
            </motion.button>
          ))}

          {mothers.length === 0 && (
            <div className="text-center py-10 text-gray-600 text-sm">
              No pregnancies registered yet.<br />
              <button onClick={() => setShowModal(true)} className="text-pink-400 hover:underline mt-1">Register one</button>
            </div>
          )}
        </div>

        {/* Detail panel */}
        <div className="lg:col-span-2 space-y-4">
          {selected ? (
            <>
              <Card className="bg-[#1a1a22] border-[#2a2a35]">
                <CardContent className="p-5">
                  <div className="flex items-start gap-4 flex-wrap">
                    <div
                      className="w-12 h-12 rounded-2xl flex items-center justify-center shrink-0"
                      style={{ background:"rgba(236,72,153,0.15)", border:"1px solid rgba(236,72,153,0.25)" }}
                    >
                      <Baby className="w-6 h-6 text-pink-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="text-xl font-bold text-white">{selected.name}</h3>
                      <p className="text-sm text-gray-400">
                        Age {selected.age} · {selected.village} · {weeksPregnant(selected.lmp)} weeks pregnant
                      </p>
                      <p className="text-xs text-gray-500 mt-0.5">EDD {formatDate(selected.edd)}</p>
                      <Badge className={`mt-1.5 text-xs ${riskColor(selected.risk)}`}>{selected.risk} Risk</Badge>
                    </div>
                  </div>

                  {/* Checklist */}
                  <div className="mt-5 grid grid-cols-2 sm:grid-cols-4 gap-3">
                    {[
                      { label:`IFA ${selected.ifa_weeks}wk`,  done: selected.ifa_weeks > 0,   icon:"💊" },
                      { label:"Calcium",                      done: selected.calcium,           icon:"🥛" },
                      { label:`TT ${selected.tt_doses}/2`,    done: selected.tt_doses >= 2,    icon:"💉" },
                      { label:`ANC ${selected.anc_done}/4`,   done: selected.anc_done >= 4,    icon:"📋" },
                    ].map(({label, done, icon}) => (
                      <div key={label} className={`p-3 rounded-xl border text-center ${done ? "bg-green-500/10 border-green-500/25" : "bg-white/[0.03] border-white/10"}`}>
                        <span className="text-xl">{icon}</span>
                        <p className="text-xs text-gray-400 mt-1">{label}</p>
                        {done
                          ? <CheckCircle2 className="w-4 h-4 text-green-500 mx-auto mt-1" />
                          : <AlertTriangle className="w-4 h-4 text-yellow-500 mx-auto mt-1" />
                        }
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>

              {/* ANC schedule */}
              <Card className="bg-[#1a1a22] border-[#2a2a35]">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-semibold text-white">ANC Visit Schedule</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-[11px] text-gray-600 mb-3">Click any visit to mark it complete / undo</p>
                  <div className="space-y-3">
                    {ANC_VISITS.map((v) => {
                      const isDone = selected.anc_done >= v.visit
                      const isNext = selected.anc_done + 1 === v.visit
                      return (
                        <button
                          key={v.visit}
                          onClick={() => handleAncClick(v.visit)}
                          className={`w-full text-left p-3 rounded-xl border transition-all active:scale-[0.98] ${
                            isDone
                              ? "bg-green-500/8 border-green-500/30 hover:bg-green-500/12"
                              : isNext
                              ? "bg-pink-500/5 border-pink-500/30 hover:bg-pink-500/10"
                              : "bg-white/[0.02] border-white/[0.08] hover:bg-white/[0.04]"
                          }`}
                        >
                          <div className="flex items-center gap-3 mb-2">
                            <span className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0 transition-all ${
                              isDone ? "bg-green-500 text-white shadow-[0_0_8px_rgba(34,197,94,0.5)]" : "bg-white/10 text-gray-400"
                            }`}>
                              {isDone ? "✓" : v.visit}
                            </span>
                            <div className="flex-1">
                              <p className="text-sm font-medium text-white">Visit {v.visit}</p>
                              <p className="text-xs text-gray-500">{v.timing}</p>
                            </div>
                            {isNext && (
                              <span className="text-[10px] text-pink-400 font-semibold bg-pink-500/10 px-2 py-0.5 rounded-full border border-pink-500/20">
                                Next due
                              </span>
                            )}
                            {isDone && (
                              <span className="text-[10px] text-green-400 font-semibold">✔ Done</span>
                            )}
                          </div>
                          <div className="flex flex-wrap gap-1.5 ml-10">
                            {v.items.map(item => (
                              <span key={item} className="text-[10px] bg-white/5 text-gray-400 px-2 py-0.5 rounded-full border border-white/[0.08]">
                                {item}
                              </span>
                            ))}
                          </div>
                        </button>
                      )
                    })}
                  </div>
                </CardContent>
              </Card>
            </>
          ) : (
            <div className="h-64 flex items-center justify-center text-gray-600 text-sm">
              Select a patient from the list
            </div>
          )}
        </div>
      </div>

      {/* ── Register Pregnancy Modal ──────────────────────────────────────────── */}
      <AnimatePresence>
        {showModal && (
          <>
            {/* Backdrop */}
            <motion.div
              key="backdrop"
              className="fixed inset-0 z-40 bg-black/70"
              initial={{ opacity:0 }} animate={{ opacity:1 }} exit={{ opacity:0 }}
              onClick={() => setShowModal(false)}
            />

            {/* Panel */}
            <motion.div
              key="modal"
              className="fixed inset-y-0 right-0 z-50 w-full max-w-md flex flex-col"
              initial={{ x:"100%" }}
              animate={{ x:0 }}
              exit={{ x:"100%" }}
              transition={{ type:"spring", stiffness:300, damping:30 }}
              style={{
                background:"linear-gradient(180deg, rgba(18,10,30,0.99) 0%, rgba(10,8,20,1) 100%)",
                borderLeft:"1px solid rgba(236,72,153,0.2)",
                boxShadow:"-20px 0 60px rgba(0,0,0,0.6)",
              }}
            >
              {/* Header */}
              <div
                className="flex items-center justify-between px-6 py-5 shrink-0"
                style={{ borderBottom:"1px solid rgba(255,255,255,0.06)" }}
              >
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl flex items-center justify-center"
                    style={{ background:"rgba(236,72,153,0.15)", border:"1px solid rgba(236,72,153,0.3)" }}>
                    <Baby className="w-5 h-5 text-pink-400" />
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-white">Register Pregnancy</h3>
                    <p className="text-xs text-gray-500">Add new ANC case</p>
                  </div>
                </div>
                <button
                  onClick={() => setShowModal(false)}
                  className="w-8 h-8 rounded-lg flex items-center justify-center text-gray-500 hover:text-white hover:bg-white/[0.07] transition-all"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Form */}
              <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">

                {/* Mother's Name */}
                <div>
                  <Label className="text-xs text-gray-400 mb-2 block flex items-center gap-1.5">
                    <User className="w-3.5 h-3.5" /> Mother's Full Name *
                  </Label>
                  <Input
                    placeholder="e.g. Radha Devi"
                    value={form.name}
                    onChange={e => set("name", e.target.value)}
                    className={`bg-white/[0.04] border text-white h-11 placeholder:text-gray-600 focus:ring-1 focus:ring-pink-500/50 ${errors.name ? "border-red-500/50" : "border-white/[0.08]"}`}
                  />
                  {errors.name && <p className="text-xs text-red-400 mt-1">{errors.name}</p>}
                </div>

                {/* Age + Village */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs text-gray-400 mb-2 block">Age (years) *</Label>
                    <Input
                      type="number" min="15" max="50"
                      placeholder="e.g. 26"
                      value={form.age}
                      onChange={e => set("age", e.target.value)}
                      className={`bg-white/[0.04] border text-white h-11 placeholder:text-gray-600 ${errors.age ? "border-red-500/50" : "border-white/[0.08]"}`}
                    />
                    {errors.age && <p className="text-xs text-red-400 mt-1">{errors.age}</p>}
                  </div>
                  <div>
                    <Label className="text-xs text-gray-400 mb-2 block flex items-center gap-1.5">
                      <MapPin className="w-3 h-3" /> Village *
                    </Label>
                    <Input
                      placeholder="e.g. Rampur"
                      value={form.village}
                      onChange={e => set("village", e.target.value)}
                      className={`bg-white/[0.04] border text-white h-11 placeholder:text-gray-600 ${errors.village ? "border-red-500/50" : "border-white/[0.08]"}`}
                    />
                    {errors.village && <p className="text-xs text-red-400 mt-1">{errors.village}</p>}
                  </div>
                </div>

                {/* LMP + EDD */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs text-gray-400 mb-2 block flex items-center gap-1.5">
                      <Calendar className="w-3 h-3" /> LMP Date *
                    </Label>
                    <Input
                      type="date"
                      value={form.lmp}
                      max={new Date().toISOString().split("T")[0]}
                      onChange={e => set("lmp", e.target.value)}
                      className={`bg-white/[0.04] border text-white h-11 ${errors.lmp ? "border-red-500/50" : "border-white/[0.08]"}`}
                    />
                    {errors.lmp && <p className="text-xs text-red-400 mt-1">{errors.lmp}</p>}
                  </div>
                  <div>
                    <Label className="text-xs text-gray-400 mb-2 block">Expected Delivery</Label>
                    <div className="h-11 flex items-center px-3 rounded-lg border border-white/[0.06] bg-white/[0.02] text-sm text-gray-400">
                      {form.lmp ? formatDate(calcEDD(form.lmp)) : "Auto-calculated"}
                    </div>
                  </div>
                </div>

                <div
                  className="h-px"
                  style={{ background:"linear-gradient(90deg, transparent, rgba(236,72,153,0.2), transparent)" }}
                />

                {/* Risk level */}
                <div>
                  <Label className="text-xs text-gray-400 mb-2 block flex items-center gap-1.5">
                    <Stethoscope className="w-3.5 h-3.5" /> Risk Category
                  </Label>
                  <div className="grid grid-cols-3 gap-2">
                    {["LOW","MEDIUM","HIGH"].map(r => (
                      <button
                        key={r}
                        type="button"
                        onClick={() => set("risk", r)}
                        className={`py-2 rounded-lg border text-xs font-semibold transition-all ${
                          form.risk === r
                            ? r === "HIGH"   ? "bg-red-500/20 border-red-500/50 text-red-400"
                            : r === "MEDIUM" ? "bg-yellow-500/20 border-yellow-500/50 text-yellow-400"
                            :                  "bg-green-500/20 border-green-500/50 text-green-400"
                            : "bg-white/[0.03] border-white/[0.08] text-gray-500 hover:border-white/20"
                        }`}
                      >
                        {r}
                      </button>
                    ))}
                  </div>
                </div>

                {/* ANC done + IFA weeks */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs text-gray-400 mb-2 block">ANC Visits Done</Label>
                    <Select value={form.anc_done} onValueChange={v => set("anc_done", v)}>
                      <SelectTrigger className="bg-white/[0.04] border-white/[0.08] text-white h-11">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="bg-[#1a1a22] border-[#2a2a35]">
                        {["0","1","2","3","4"].map(n => (
                          <SelectItem key={n} value={n} className="text-white focus:bg-white/10">{n} visits</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-xs text-gray-400 mb-2 block">IFA Weeks</Label>
                    <Input
                      type="number" min="0"
                      placeholder="0"
                      value={form.ifa_weeks}
                      onChange={e => set("ifa_weeks", e.target.value)}
                      className="bg-white/[0.04] border-white/[0.08] text-white h-11 placeholder:text-gray-600"
                    />
                  </div>
                </div>

                {/* Calcium + TT doses */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs text-gray-400 mb-2 block">Calcium Supplement</Label>
                    <div className="flex gap-2">
                      {["yes","no"].map(v => (
                        <button
                          key={v}
                          type="button"
                          onClick={() => set("calcium", v)}
                          className={`flex-1 py-2 rounded-lg border text-xs font-semibold transition-all capitalize ${
                            form.calcium === v
                              ? "bg-pink-500/15 border-pink-500/40 text-pink-300"
                              : "bg-white/[0.03] border-white/[0.08] text-gray-500 hover:border-white/20"
                          }`}
                        >
                          {v}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <Label className="text-xs text-gray-400 mb-2 block">TT Doses Given</Label>
                    <Select value={form.tt_doses} onValueChange={v => set("tt_doses", v)}>
                      <SelectTrigger className="bg-white/[0.04] border-white/[0.08] text-white h-11">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="bg-[#1a1a22] border-[#2a2a35]">
                        {["0","1","2"].map(n => (
                          <SelectItem key={n} value={n} className="text-white focus:bg-white/10">{n} doses</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

              </div>

              {/* Footer */}
              <div
                className="px-6 py-4 flex gap-3 shrink-0"
                style={{ borderTop:"1px solid rgba(255,255,255,0.06)" }}
              >
                <Button
                  className="flex-1 h-11 font-semibold text-white gap-2"
                  style={{ background:"linear-gradient(135deg,#ec4899,#db2777)", boxShadow:"0 0 20px rgba(236,72,153,0.3)" }}
                  onClick={handleSubmit}
                >
                  <CheckCircle2 className="w-4 h-4" /> Register Pregnancy
                </Button>
                <Button
                  variant="outline"
                  className="h-11 px-4 border-white/10 text-gray-400 hover:text-white"
                  onClick={() => { setShowModal(false); setErrors({}) }}
                >
                  Cancel
                </Button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  )
}
