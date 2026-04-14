import { useEffect } from "react"
import { useStore } from "@/store/useStore"
import { getQueueLength } from "@/lib/offline"
import { useState } from "react"

export function useOffline() {
  const { isOnline, setOnline } = useStore()
  const [queueCount, setQueueCount] = useState(0)

  useEffect(() => {
    const handleOnline  = () => { setOnline(true);  refreshQueue() }
    const handleOffline = () => setOnline(false)

    window.addEventListener("online",  handleOnline)
    window.addEventListener("offline", handleOffline)

    return () => {
      window.removeEventListener("online",  handleOnline)
      window.removeEventListener("offline", handleOffline)
    }
  }, [setOnline])

  async function refreshQueue() {
    const count = await getQueueLength()
    setQueueCount(count)
  }

  useEffect(() => { refreshQueue() }, [isOnline])

  return { isOnline, queueCount }
}
