import { useEffect } from "react"
import { toast } from "sonner"
import { demoAppointments } from "@/lib/demoStore"
import { addManualAppointment } from "@/lib/api"
import { useStore } from "@/store/useStore"

/**
 * SyncManager runs in the background to automatically sync 
 * offline-booked appointments to the backend when the network connection is restored.
 */
export default function SyncManager() {
  const { isAuthenticated } = useStore()

  useEffect(() => {
    if (!isAuthenticated) return

    const syncPending = async () => {
      if (!navigator.onLine) return

      const pending = demoAppointments.getAll().filter(a => !a.is_synced && a.doctor_id)
      if (pending.length === 0) return

      let syncedCount = 0
      for (const appt of pending) {
        try {
          const [date, time] = appt.preferred_time.split(" ")
          await addManualAppointment({
            doctor_id: appt.doctor_id!,
            patient_name: appt.patient_name,
            patient_phone: appt.phone || undefined,
            date: date,
            time_slot: time,
            reason: appt.reason,
          })
          demoAppointments.markSynced(appt.id)
          syncedCount++
        } catch (err) {
          console.error("Failed to sync appointment:", appt.id, err)
        }
      }

      if (syncedCount > 0) {
        toast.success(`Synced ${syncedCount} offline appointment${syncedCount > 1 ? "s" : ""} to the backend.`, {
          duration: 5000
        })
      }
    }

    // Attempt to sync on mount
    syncPending()

    // And attempt to sync when coming back online
    window.addEventListener("online", syncPending)
    
    // Also periodically check every 60 seconds just in case
    const interval = setInterval(syncPending, 60_000)

    return () => {
      window.removeEventListener("online", syncPending)
      clearInterval(interval)
    }
  }, [isAuthenticated])

  return null // Headless component
}
