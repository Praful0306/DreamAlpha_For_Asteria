/**
 * useSmartWatch — Web Bluetooth hook for GoBolt smartwatch
 *
 * PERSISTENT connection: stays alive until user clicks Disconnect.
 * - Keep-alive ping every 5 seconds (reads battery to prevent BLE timeout)
 * - Instant auto-reconnect on any unintentional disconnect (retries forever)
 * - watchdog timer detects silent disconnects
 * - Page visibility handler pauses/resumes keepalive
 */

import { useState, useRef, useCallback, useEffect } from "react"

// ── BLE UUIDs ──────────────────────────────────────────────────────────────────
const HEART_RATE_SERVICE    = 0x180D
const HR_MEASUREMENT_CHAR   = 0x2A37
const BATTERY_SERVICE       = 0x180F
const BATTERY_LEVEL_CHAR    = 0x2A19
const DEVICE_INFO_SERVICE   = 0x180A

// GoBolt / generic fitness band custom UUIDs
const CUSTOM_SERVICE_1 = "0000fee7-0000-1000-8000-00805f9b34fb"

// Keep-alive: ping every 5 seconds to prevent BLE idle disconnect
const KEEPALIVE_MS = 5_000
// Reconnect: retry instantly, then back off to max 2s
const RECONNECT_DELAYS = [0, 500, 1000, 1500, 2000]

// ── Types ──────────────────────────────────────────────────────────────────────

export interface WatchVitals {
  heartRate:   number | null
  spo2:        number | null
  steps:       number | null
  battery:     number | null
  temperature: number | null
  timestamp:   string
}

export interface WatchState {
  status:       "disconnected" | "connecting" | "connected" | "error"
  deviceName:   string | null
  error:        string | null
  vitals:       WatchVitals
  history:      WatchVitals[]
  reconnects:   number
}

const EMPTY_VITALS: WatchVitals = {
  heartRate: null, spo2: null, steps: null, battery: null, temperature: null,
  timestamp: new Date().toISOString(),
}

// ── Hook ───────────────────────────────────────────────────────────────────────

export function useSmartWatch() {
  const [state, setState] = useState<WatchState>({
    status: "disconnected",
    deviceName: null,
    error: null,
    vitals: EMPTY_VITALS,
    history: [],
    reconnects: 0,
  })

  // Refs that persist across renders
  const deviceRef       = useRef<BluetoothDevice | null>(null)
  const serverRef       = useRef<BluetoothRemoteGATTServer | null>(null)
  const keepAliveRef    = useRef<ReturnType<typeof setInterval> | null>(null)
  const watchdogRef     = useRef<ReturnType<typeof setInterval> | null>(null)
  const historyRef      = useRef<WatchVitals[]>([])
  const wantConnected   = useRef(false)         // TRUE = user wants connection alive
  const reconnectCount  = useRef(0)
  const hrCharRef       = useRef<BluetoothRemoteGATTCharacteristic | null>(null)

  // ── Parse heart rate BLE notification ──────────────────────────────────────
  const handleHrNotification = useCallback((event: Event) => {
    const target = event.target as BluetoothRemoteGATTCharacteristic
    const value = target.value
    if (!value) return

    const flags = value.getUint8(0)
    const is16bit = (flags & 0x01) !== 0
    const hr = is16bit ? value.getUint16(1, true) : value.getUint8(1)

    setState(prev => {
      const updated: WatchVitals = {
        ...prev.vitals,
        heartRate: hr,
        timestamp: new Date().toISOString(),
      }
      historyRef.current = [...historyRef.current.slice(-499), updated]
      return { ...prev, vitals: updated, history: historyRef.current }
    })
  }, [])

  // ── Keep-alive: actively read a characteristic to prevent BLE timeout ──────
  const pingDevice = useCallback(async () => {
    if (!serverRef.current?.connected) return false
    try {
      // Try reading battery — this is a lightweight read that keeps GATT alive
      const svc  = await serverRef.current.getPrimaryService(BATTERY_SERVICE)
      const char = await svc.getCharacteristic(BATTERY_LEVEL_CHAR)
      const val  = await char.readValue()
      const batt = val.getUint8(0)
      setState(prev => ({ ...prev, vitals: { ...prev.vitals, battery: batt } }))
      return true
    } catch {
      try {
        // Fallback: try reading heart rate service descriptor (just to keep alive)
        const svc = await serverRef.current!.getPrimaryService(HEART_RATE_SERVICE)
        await svc.getCharacteristic(HR_MEASUREMENT_CHAR)
        return true
      } catch {
        return false
      }
    }
  }, [])

  // ── Subscribe to all available services on a GATT server ───────────────────
  const subscribeServices = useCallback(async (server: BluetoothRemoteGATTServer) => {
    // Heart rate notifications
    try {
      const hrSvc  = await server.getPrimaryService(HEART_RATE_SERVICE)
      const hrChar = await hrSvc.getCharacteristic(HR_MEASUREMENT_CHAR)
      // Remove old listener if any
      hrChar.removeEventListener("characteristicvaluechanged", handleHrNotification)
      await hrChar.startNotifications()
      hrChar.addEventListener("characteristicvaluechanged", handleHrNotification)
      hrCharRef.current = hrChar
    } catch {
      console.log("[Watch] Heart Rate service not available")
    }

    // Battery initial read
    try {
      const batSvc = await server.getPrimaryService(BATTERY_SERVICE)
      const batChar = await batSvc.getCharacteristic(BATTERY_LEVEL_CHAR)
      const val = await batChar.readValue()
      setState(prev => ({ ...prev, vitals: { ...prev.vitals, battery: val.getUint8(0) } }))
    } catch { /* no battery service */ }

    // Custom health data (SpO2, steps, temperature)
    try {
      const svc = await server.getPrimaryService(CUSTOM_SERVICE_1)
      const chars = await svc.getCharacteristics()
      for (const char of chars) {
        try {
          if (char.properties.notify) {
            await char.startNotifications()
            char.addEventListener("characteristicvaluechanged", (e) => {
              const t = e.target as BluetoothRemoteGATTCharacteristic
              const d = t.value
              if (!d || d.byteLength < 2) return
              const type = d.getUint8(0)
              setState(prev => {
                const v = { ...prev.vitals }
                if (type === 0x01 && d.byteLength >= 5) v.steps = d.getUint32(1, true)
                else if (type === 0x02 && d.byteLength >= 2) v.spo2 = d.getUint8(1)
                else if (type === 0x03 && d.byteLength >= 3) v.temperature = d.getUint16(1, true) / 100
                v.timestamp = new Date().toISOString()
                return { ...prev, vitals: v }
              })
            })
          }
        } catch { /* char not accessible */ }
      }
    } catch {
      console.log("[Watch] Custom health service not found")
    }
  }, [handleHrNotification])

  // ── Start keep-alive timer ─────────────────────────────────────────────────
  const startKeepAlive = useCallback(() => {
    // Clear any existing timers
    if (keepAliveRef.current) clearInterval(keepAliveRef.current)
    if (watchdogRef.current) clearInterval(watchdogRef.current)

    // Ping every 5 seconds to keep BLE connection alive
    keepAliveRef.current = setInterval(async () => {
      if (!wantConnected.current) return
      if (!serverRef.current?.connected) {
        // Connection lost silently — trigger reconnect
        console.log("[Watch] Keep-alive detected disconnect — reconnecting")
        doReconnect()
        return
      }
      await pingDevice()
    }, KEEPALIVE_MS)

    // Watchdog: every 15s, verify GATT is truly connected
    watchdogRef.current = setInterval(() => {
      if (!wantConnected.current) return
      if (deviceRef.current && !serverRef.current?.connected) {
        console.log("[Watch] Watchdog detected disconnect — reconnecting")
        doReconnect()
      }
    }, 15_000)
  }, [pingDevice])

  // ── Reconnect logic (called automatically, never gives up) ─────────────────
  const doReconnect = useCallback(async () => {
    if (!wantConnected.current || !deviceRef.current?.gatt) return

    const attempt = reconnectCount.current
    reconnectCount.current += 1
    const delay = RECONNECT_DELAYS[Math.min(attempt, RECONNECT_DELAYS.length - 1)]

    setState(prev => ({ ...prev, status: "connecting", reconnects: reconnectCount.current }))
    console.log(`[Watch] Reconnect attempt #${attempt + 1} (delay: ${delay}ms)`)

    if (delay > 0) await new Promise(r => setTimeout(r, delay))
    if (!wantConnected.current) return  // User disconnected while waiting

    try {
      const server = await deviceRef.current!.gatt!.connect()
      serverRef.current = server
      await subscribeServices(server)
      reconnectCount.current = 0  // Reset on success
      startKeepAlive()
      setState(prev => ({ ...prev, status: "connected", reconnects: 0 }))
      console.log("[Watch] Reconnected successfully!")
    } catch (err) {
      console.log("[Watch] Reconnect failed:", err)
      // Retry again — never give up until user disconnects
      if (wantConnected.current) {
        setTimeout(() => doReconnect(), 2000)
      }
    }
  }, [subscribeServices, startKeepAlive])

  // ── Connect (initial user action) ──────────────────────────────────────────
  const connect = useCallback(async () => {
    if (!navigator.bluetooth) {
      setState(prev => ({ ...prev, status: "error", error: "Web Bluetooth not supported. Use Chrome/Edge." }))
      return
    }

    wantConnected.current = true
    reconnectCount.current = 0
    setState(prev => ({ ...prev, status: "connecting", error: null }))

    try {
      const device = await navigator.bluetooth.requestDevice({
        filters: [
          { namePrefix: "GoBolt" },
          { namePrefix: "gobolt" },
          { namePrefix: "Band" },
          { namePrefix: "Watch" },
          { namePrefix: "Mi" },
          { namePrefix: "Smart" },
          { namePrefix: "ID" },
          { namePrefix: "HW" },
          { namePrefix: "Fitness" },
        ],
        optionalServices: [
          HEART_RATE_SERVICE,
          BATTERY_SERVICE,
          DEVICE_INFO_SERVICE,
          CUSTOM_SERVICE_1,
          "0000fee0-0000-1000-8000-00805f9b34fb",
          "0000fff0-0000-1000-8000-00805f9b34fb",
        ],
      })

      deviceRef.current = device
      setState(prev => ({ ...prev, deviceName: device.name || "GoBolt Watch" }))

      // CRITICAL: auto-reconnect on ANY disconnect (unless user explicitly disconnects)
      device.addEventListener("gattserverdisconnected", () => {
        if (wantConnected.current) {
          console.log("[Watch] GATT disconnected event — auto-reconnecting…")
          setState(prev => ({ ...prev, status: "connecting" }))
          // Immediate reconnect — don't wait
          doReconnect()
        }
      })

      // Connect GATT server
      const server = await device.gatt!.connect()
      serverRef.current = server

      // Subscribe to all services
      await subscribeServices(server)

      // Start aggressive keep-alive
      startKeepAlive()

      setState(prev => ({ ...prev, status: "connected" }))
      console.log("[Watch] Connected to", device.name)
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Connection failed"
      if (msg.includes("User cancelled")) {
        wantConnected.current = false
        setState(prev => ({ ...prev, status: "disconnected", error: null }))
      } else {
        setState(prev => ({ ...prev, status: "error", error: msg }))
        // Auto-retry if user wants connection
        if (wantConnected.current && deviceRef.current) {
          setTimeout(() => doReconnect(), 2000)
        }
      }
    }
  }, [doReconnect, subscribeServices, startKeepAlive])

  // ── Disconnect (ONLY when user clicks Disconnect) ──────────────────────────
  const disconnect = useCallback(() => {
    console.log("[Watch] User initiated disconnect")
    // FIRST: mark that we don't want to be connected anymore
    wantConnected.current = false

    // Clear all timers
    if (keepAliveRef.current) { clearInterval(keepAliveRef.current); keepAliveRef.current = null }
    if (watchdogRef.current) { clearInterval(watchdogRef.current); watchdogRef.current = null }

    // Remove HR notification listener
    if (hrCharRef.current) {
      try { hrCharRef.current.stopNotifications() } catch { /* ok */ }
      hrCharRef.current = null
    }

    // Disconnect GATT
    const dev = deviceRef.current
    deviceRef.current = null
    if (dev?.gatt?.connected) {
      try { dev.gatt.disconnect() } catch { /* ok */ }
    }
    serverRef.current = null
    reconnectCount.current = 0

    setState({
      status: "disconnected",
      deviceName: null,
      error: null,
      vitals: EMPTY_VITALS,
      history: [],
      reconnects: 0,
    })
    historyRef.current = []
  }, [])

  // ── Page visibility: pause/resume keepalive ────────────────────────────────
  useEffect(() => {
    const onVisChange = () => {
      if (document.hidden) {
        // Page hidden — timers still run but Chrome may throttle; that's OK
      } else {
        // Page visible again — check connection immediately
        if (wantConnected.current && !serverRef.current?.connected) {
          console.log("[Watch] Page visible — reconnecting")
          doReconnect()
        }
      }
    }
    document.addEventListener("visibilitychange", onVisChange)
    return () => document.removeEventListener("visibilitychange", onVisChange)
  }, [doReconnect])

  // Cleanup on unmount — but do NOT disconnect (keep BLE alive in background)
  useEffect(() => {
    return () => {
      if (keepAliveRef.current) clearInterval(keepAliveRef.current)
      if (watchdogRef.current) clearInterval(watchdogRef.current)
    }
  }, [])

  return { ...state, connect, disconnect }
}
