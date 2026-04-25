import { useState, useEffect } from "react"
import { motion, AnimatePresence } from "framer-motion"
import {
  Syringe, CheckCircle2, Clock, AlertCircle, Baby,
  Plus, X, User, Calendar, MapPin, RefreshCw,
} from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Progress } from "@/components/ui/progress"
import { toast } from "sonner"
import { formatDate } from "@/lib/utils"
import { demoGet, demoSet, syncVaxToReminders, onSync } from "@/lib/demoStore"

const STORAGE_KEY = "immunization_children"

type VaxStatus = "done" | "due" | "overdue" | "upcoming"

interface Child {
  id: string; name: string; dob: string; mother: string; village: string
  vaccines: Record<string, VaxStatus>
}

const VACCINES = [
  { id:"bcg",          label:"BCG",             timing:"At birth",       weekMin:0,  weekMax:1   },
  { id:"hepb0",        label:"Hep B (Birth)",   timing:"At birth",       weekMin:0,  weekMax:1   },
  { id:"opv0",         label:"OPV 0",           timing:"At birth",       weekMin:0,  weekMax:1   },
  { id:"penta1",       label:"Pentavalent 1",   timing:"6 weeks",        weekMin:6,  weekMax:8   },
  { id:"opv1",         label:"OPV 1",           timing:"6 weeks",        weekMin:6,  weekMax:8   },
  { id:"rota1",        label:"Rotavirus 1",     timing:"6 weeks",        weekMin:6,  weekMax:8   },
  { id:"penta2",       label:"Pentavalent 2",   timing:"10 weeks",       weekMin:10, weekMax:12  },
  { id:"opv2",         label:"OPV 2",           timing:"10 weeks",       weekMin:10, weekMax:12  },
  { id:"rota2",        label:"Rotavirus 2",     timing:"10 weeks",       weekMin:10, weekMax:12  },
  { id:"penta3",       label:"Pentavalent 3",   timing:"14 weeks",       weekMin:14, weekMax:16  },
  { id:"opv3",         label:"OPV 3",           timing:"14 weeks",       weekMin:14, weekMax:16  },
  { id:"ipv",          label:"IPV",             timing:"14 weeks",       weekMin:14, weekMax:16  },
  { id:"measles1",     label:"Measles 1",       timing:"9 months",       weekMin:39, weekMax:52  },
  { id:"vitA1",        label:"Vit A (1st)",     timing:"9 months",       weekMin:39, weekMax:52  },
  { id:"mr1",          label:"MR 1",            timing:"9–12 months",    weekMin:39, weekMax:52  },
  { id:"je1",          label:"JE 1",            timing:"9–12 months",    weekMin:39, weekMax:52  },
  { id:"dpt_booster",  label:"DPT Booster",    timing:"16–24 months",   weekMin:70, weekMax:104 },
  { id:"measles2",     label:"Measles 2",       timing:"16–24 months",   weekMin:70, weekMax:104 },
]

function calcVaxStatus(dob: string): Record<string, VaxStatus> {
  const ageWeeks = Math.floor((Date.now() - new Date(dob).getTime()) / (7 * 24 * 60 * 60 * 1000))
  const result: Record<string, VaxStatus> = {}
  for (const v of VACCINES) {
    if (ageWeeks >= v.weekMax + 2) result[v.id] = "overdue"
    else if (ageWeeks >= v.weekMin) result[v.id] = "due"
    else result[v.id] = "upcoming"
  }
  return result
}

const INIT_CHILDREN: Child[] = [
  {
    id:"1", name:"Baby Sunita", dob:"2025-09-15", mother:"Sunita Bai", village:"Rampur",
    vaccines: {
      bcg:"done", hepb0:"done", opv0:"done",
      penta1:"done", opv1:"done", rota1:"done",
      penta2:"due", opv2:"due", rota2:"upcoming",
      penta3:"upcoming", opv3:"upcoming", ipv:"upcoming",
      measles1:"upcoming", vitA1:"upcoming", mr1:"upcoming",
      je1:"upcoming", dpt_booster:"upcoming", measles2:"upcoming",
    },
  },
  {
    id:"2", name:"Baby Meena", dob:"2026-01-20", mother:"Meena Devi", village:"Ganeshpur",
    vaccines: {
      bcg:"done", hepb0:"done", opv0:"done",
      penta1:"overdue", opv1:"overdue", rota1:"overdue",
      penta2:"upcoming", opv2:"upcoming", rota2:"upcoming",
      penta3:"upcoming", opv3:"upcoming", ipv:"upcoming",
      measles1:"upcoming", vitA1:"upcoming", mr1:"upcoming",
      je1:"upcoming", dpt_booster:"upcoming", measles2:"upcoming",
    },
  },
]

const STATUS_STYLE: Record<VaxStatus, string> = {
  done:     "bg-green-500/15 text-green-400 border-green-500/25",
  due:      "bg-brand-500/15 text-brand-400 border-brand-500/25",
  overdue:  "bg-red-500/15 text-red-400 border-red-500/25",
  upcoming: "bg-white/5 text-gray-500 border-white/[0.08]",
}

const STATUS_ICON: Record<VaxStatus, React.ReactNode | null> = {
  done:     <CheckCircle2 className="w-3 h-3 shrink-0" />,
  due:      <Clock className="w-3 h-3 shrink-0" />,
  overdue:  <AlertCircle className="w-3 h-3 shrink-0" />,
  upcoming: null,
}

function ageInWeeks(dob: string) {
  return Math.max(0, Math.floor((Date.now() - new Date(dob).getTime()) / (7 * 24 * 60 * 60 * 1000)))
}

const EMPTY_FORM = { name:"", dob:"", mother:"", village:"" }

export default function Immunization() {
  const [children,  setChildren]  = useState<Child[]>(() => demoGet<Child[]>(STORAGE_KEY, INIT_CHILDREN))
  const [selected,  setSelected]  = useState<Child>(() => demoGet<Child[]>(STORAGE_KEY, INIT_CHILDREN)[0] ?? INIT_CHILDREN[0])
  const [showModal, setShowModal] = useState(false)
  const [form,      setForm]      = useState(EMPTY_FORM)
  const [errors,    setErrors]    = useState<Record<string, string>>({})
  // For toggling individual vaccine status
  const [markMode, setMarkMode]   = useState(false)

  // Persist children list to localStorage whenever it changes
  useEffect(() => { demoSet(STORAGE_KEY, children) }, [children])

  // Re-read when Reminders updates a vaccine via sync event
  useEffect(() => {
    return onSync(() => {
      const fresh = demoGet<Child[]>(STORAGE_KEY, INIT_CHILDREN)
      setChildren(fresh)
      setSelected(prev => fresh.find(c => c.id === prev.id) ?? fresh[0] ?? prev)
    })
  }, [])

  const doneCount    = Object.values(selected.vaccines).filter(v => v === "done").length
  const overdueCount = Object.values(selected.vaccines).filter(v => v === "overdue").length
  const total        = VACCINES.length

  function validate() {
    const e: Record<string, string> = {}
    if (!form.name.trim())   e.name   = "Child name required"
    if (!form.dob)           e.dob    = "Date of birth required"
    if (!form.mother.trim()) e.mother = "Mother's name required"
    if (!form.village.trim()) e.village = "Village required"
    return e
  }

  function handleSubmit() {
    const e = validate()
    if (Object.keys(e).length) { setErrors(e); return }

    const newChild: Child = {
      id:      Date.now().toString(),
      name:    form.name.trim(),
      dob:     form.dob,
      mother:  form.mother.trim(),
      village: form.village.trim(),
      vaccines: calcVaxStatus(form.dob),
    }
    setChildren(c => [newChild, ...c])
    setSelected(newChild)
    setShowModal(false)
    setForm(EMPTY_FORM)
    setErrors({})
    toast.success(`${newChild.name} added to immunization tracker!`)
  }

  function setField(field: string, value: string) {
    setForm(f => ({ ...f, [field]: value }))
    setErrors(e => { const n = {...e}; delete n[field]; return n })
  }

  function toggleVax(vaxId: string) {
    if (!markMode) return
    const wasDone    = selected.vaccines[vaxId] === "done"
    const next: VaxStatus = wasDone ? "due" : "done"

    // Build the updated child and full children array eagerly
    const updatedChild    = { ...selected, vaccines: { ...selected.vaccines, [vaxId]: next } }
    const newChildren     = children.map(c => c.id === selected.id ? updatedChild : c)

    // ★ Write to localStorage FIRST before syncVaxToReminders calls dispatchSync()
    demoSet(STORAGE_KEY, newChildren)

    setChildren(newChildren)
    setSelected(updatedChild)

    // Sync to Reminders — use the vaccine label for matching
    const vaxLabel = VACCINES.find(v => v.id === vaxId)?.label ?? vaxId
    syncVaxToReminders(selected.name, vaxLabel, !wasDone)
    // Also try matching on mother name (reminder.patient may use mother name)
    if (selected.mother) syncVaxToReminders(selected.mother, vaxLabel, !wasDone)

    toast.success(wasDone ? "Vaccine unmarked" : `✅ ${vaxLabel} marked as done`)
  }

  return (
    <div className="p-4 sm:p-6 max-w-4xl mx-auto space-y-6">

      {/* Header */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-2xl font-bold text-white">Immunization</h2>
          <p className="text-gray-500 mt-0.5">Universal Immunization Programme — child vaccine tracker</p>
        </div>
        <Button
          onClick={() => setShowModal(true)}
          className="gap-2 text-white font-semibold h-10 px-4"
          style={{ background:"linear-gradient(135deg,#3b82f6,#6366f1)", boxShadow:"0 0 20px rgba(99,102,241,0.35)" }}
        >
          <Plus className="w-4 h-4" /> Add Child
        </Button>
      </div>

      {/* Child selector */}
      <div className="flex gap-3 flex-wrap">
        {children.map(c => (
          <button
            key={c.id}
            onClick={() => setSelected(c)}
            className={`flex items-center gap-3 p-3 rounded-xl border transition-all ${
              selected.id === c.id
                ? "border-blue-500/40 bg-blue-500/5"
                : "border-[#2a2a35] bg-[#1a1a22] hover:border-white/15"
            }`}
          >
            <div className="w-9 h-9 rounded-full bg-blue-500/15 flex items-center justify-center">
              <Baby className="w-4 h-4 text-blue-400" />
            </div>
            <div className="text-left">
              <p className="text-sm font-medium text-white">{c.name}</p>
              <p className="text-xs text-gray-500">{ageInWeeks(c.dob)} wks · {c.village}</p>
            </div>
            {Object.values(c.vaccines).some(v => v === "overdue") && (
              <span className="w-2 h-2 rounded-full bg-red-500 ml-1 shrink-0" />
            )}
          </button>
        ))}

        {children.length === 0 && (
          <div className="text-sm text-gray-600 py-3">
            No children added yet.{" "}
            <button onClick={() => setShowModal(true)} className="text-blue-400 hover:underline">Add one</button>
          </div>
        )}
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-4">
        <Card className="bg-[#1a1a22] border-[#2a2a35]">
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-extrabold text-green-400">{doneCount}</p>
            <p className="text-xs text-gray-500 mt-1">Completed</p>
          </CardContent>
        </Card>
        <Card className="bg-[#1a1a22] border-[#2a2a35]">
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-extrabold text-red-400">{overdueCount}</p>
            <p className="text-xs text-gray-500 mt-1">Overdue</p>
          </CardContent>
        </Card>
        <Card className="bg-[#1a1a22] border-[#2a2a35]">
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-extrabold text-white">{Math.round(doneCount / total * 100)}%</p>
            <p className="text-xs text-gray-500 mt-1">Complete</p>
          </CardContent>
        </Card>
      </div>

      {/* Progress */}
      <div>
        <div className="flex justify-between text-xs text-gray-500 mb-1.5">
          <span>Vaccination progress — {selected.name}</span>
          <span>{doneCount}/{total} vaccines</span>
        </div>
        <Progress value={(doneCount / total) * 100} className="h-2.5 bg-white/10" />
      </div>

      {/* Vaccine grid */}
      <Card className="bg-[#1a1a22] border-[#2a2a35]">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <CardTitle className="text-sm font-semibold text-white">
              Vaccine Schedule — {selected.name}
            </CardTitle>
            <button
              onClick={() => {
                setMarkMode(m => !m)
                if (!markMode) toast.info("Tap any vaccine to mark it done / undo")
              }}
              className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border transition-all ${
                markMode
                  ? "bg-brand-500/15 border-brand-500/40 text-brand-400"
                  : "bg-white/[0.04] border-white/[0.08] text-gray-500 hover:text-white"
              }`}
            >
              <RefreshCw className="w-3 h-3" />
              {markMode ? "Done marking" : "Mark vaccines"}
            </button>
          </div>
          {markMode && (
            <p className="text-[11px] text-brand-400 mt-1">
              Tap any vaccine below to toggle its status
            </p>
          )}
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {VACCINES.map(v => {
              const status = selected.vaccines[v.id] ?? "upcoming"
              return (
                <motion.button
                  key={v.id}
                  type="button"
                  onClick={() => toggleVax(v.id)}
                  initial={{ opacity:0, scale:0.95 }}
                  animate={{ opacity:1, scale:1 }}
                  className={`p-3 rounded-xl border flex items-center gap-2 text-left transition-all ${STATUS_STYLE[status]} ${markMode ? "cursor-pointer hover:scale-[1.03] active:scale-[0.97]" : "cursor-default"}`}
                >
                  {STATUS_ICON[status]}
                  <div className="min-w-0">
                    <p className="text-xs font-medium leading-tight truncate">{v.label}</p>
                    <p className="text-[10px] opacity-60 truncate">{v.timing}</p>
                  </div>
                </motion.button>
              )
            })}
          </div>

          {/* Legend */}
          <div className="flex flex-wrap gap-3 mt-4 pt-3 border-t border-white/[0.06]">
            {(["done","due","overdue","upcoming"] as VaxStatus[]).map(s => (
              <div key={s} className={`flex items-center gap-1.5 text-[11px] px-2 py-1 rounded-full border ${STATUS_STYLE[s]}`}>
                {STATUS_ICON[s]}
                <span className="capitalize">{s}</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* ── Add Child Modal ──────────────────────────────────────────────────── */}
      <AnimatePresence>
        {showModal && (
          <>
            <motion.div
              key="backdrop"
              className="fixed inset-0 z-40 bg-black/70"
              initial={{ opacity:0 }} animate={{ opacity:1 }} exit={{ opacity:0 }}
              onClick={() => setShowModal(false)}
            />

            <motion.div
              key="modal"
              className="fixed inset-y-0 right-0 z-50 w-full max-w-md flex flex-col"
              initial={{ x:"100%" }}
              animate={{ x:0 }}
              exit={{ x:"100%" }}
              transition={{ type:"spring", stiffness:300, damping:30 }}
              style={{
                background:"linear-gradient(180deg, rgba(15,12,30,0.99) 0%, rgba(10,8,20,1) 100%)",
                borderLeft:"1px solid rgba(99,102,241,0.2)",
                boxShadow:"-20px 0 60px rgba(0,0,0,0.6)",
              }}
            >
              {/* Header */}
              <div
                className="flex items-center justify-between px-6 py-5 shrink-0"
                style={{ borderBottom:"1px solid rgba(255,255,255,0.06)" }}
              >
                <div className="flex items-center gap-3">
                  <div
                    className="w-9 h-9 rounded-xl flex items-center justify-center"
                    style={{ background:"rgba(99,102,241,0.15)", border:"1px solid rgba(99,102,241,0.3)" }}
                  >
                    <Syringe className="w-5 h-5 text-indigo-400" />
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-white">Add Child</h3>
                    <p className="text-xs text-gray-500">Register for immunization tracking</p>
                  </div>
                </div>
                <button
                  onClick={() => { setShowModal(false); setErrors({}) }}
                  className="w-8 h-8 rounded-lg flex items-center justify-center text-gray-500 hover:text-white hover:bg-white/[0.07] transition-all"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Form body */}
              <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">

                {/* Child Name */}
                <div>
                  <Label className="text-xs text-gray-400 mb-2 block flex items-center gap-1.5">
                    <Baby className="w-3.5 h-3.5" /> Child's Name *
                  </Label>
                  <Input
                    placeholder="e.g. Baby Rekha"
                    value={form.name}
                    onChange={e => setField("name", e.target.value)}
                    className={`bg-white/[0.04] border text-white h-11 placeholder:text-gray-600 ${errors.name ? "border-red-500/50" : "border-white/[0.08]"}`}
                  />
                  {errors.name && <p className="text-xs text-red-400 mt-1">{errors.name}</p>}
                </div>

                {/* Date of Birth */}
                <div>
                  <Label className="text-xs text-gray-400 mb-2 block flex items-center gap-1.5">
                    <Calendar className="w-3.5 h-3.5" /> Date of Birth *
                  </Label>
                  <Input
                    type="date"
                    value={form.dob}
                    max={new Date().toISOString().split("T")[0]}
                    onChange={e => setField("dob", e.target.value)}
                    className={`bg-white/[0.04] border text-white h-11 ${errors.dob ? "border-red-500/50" : "border-white/[0.08]"}`}
                  />
                  {errors.dob && <p className="text-xs text-red-400 mt-1">{errors.dob}</p>}
                  {form.dob && (
                    <p className="text-xs text-gray-500 mt-1">
                      Age: {ageInWeeks(form.dob)} weeks — vaccines will be auto-calculated
                    </p>
                  )}
                </div>

                {/* Mother's Name */}
                <div>
                  <Label className="text-xs text-gray-400 mb-2 block flex items-center gap-1.5">
                    <User className="w-3.5 h-3.5" /> Mother's Name *
                  </Label>
                  <Input
                    placeholder="e.g. Rekha Devi"
                    value={form.mother}
                    onChange={e => setField("mother", e.target.value)}
                    className={`bg-white/[0.04] border text-white h-11 placeholder:text-gray-600 ${errors.mother ? "border-red-500/50" : "border-white/[0.08]"}`}
                  />
                  {errors.mother && <p className="text-xs text-red-400 mt-1">{errors.mother}</p>}
                </div>

                {/* Village */}
                <div>
                  <Label className="text-xs text-gray-400 mb-2 block flex items-center gap-1.5">
                    <MapPin className="w-3.5 h-3.5" /> Village *
                  </Label>
                  <Input
                    placeholder="e.g. Sultanpur"
                    value={form.village}
                    onChange={e => setField("village", e.target.value)}
                    className={`bg-white/[0.04] border text-white h-11 placeholder:text-gray-600 ${errors.village ? "border-red-500/50" : "border-white/[0.08]"}`}
                  />
                  {errors.village && <p className="text-xs text-red-400 mt-1">{errors.village}</p>}
                </div>

                {/* Info note */}
                <div
                  className="p-3 rounded-xl text-xs text-indigo-300"
                  style={{ background:"rgba(99,102,241,0.08)", border:"1px solid rgba(99,102,241,0.2)" }}
                >
                  <p className="font-semibold mb-1">🤖 Smart auto-schedule</p>
                  <p className="text-gray-400">
                    Vaccine statuses (due / overdue / upcoming) are calculated automatically
                    from the date of birth using ICMR UIP guidelines.
                    You can manually mark vaccines after adding.
                  </p>
                </div>
              </div>

              {/* Footer */}
              <div
                className="px-6 py-4 flex gap-3 shrink-0"
                style={{ borderTop:"1px solid rgba(255,255,255,0.06)" }}
              >
                <Button
                  className="flex-1 h-11 font-semibold text-white gap-2"
                  style={{ background:"linear-gradient(135deg,#3b82f6,#6366f1)", boxShadow:"0 0 20px rgba(99,102,241,0.3)" }}
                  onClick={handleSubmit}
                >
                  <Syringe className="w-4 h-4" /> Add to Tracker
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
