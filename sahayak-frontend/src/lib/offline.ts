/**
 * Sahayak AI — Offline Queue
 * Uses IndexedDB (idb) to queue failed POST/PATCH requests
 * and replay them when the network reconnects.
 */
import { openDB, type IDBPDatabase } from "idb"

interface QueuedRequest {
  url: string
  method: string
  body: unknown
  headers: Record<string, string>
  timestamp: number
}

let dbPromise: Promise<IDBPDatabase> | null = null

function getDB() {
  if (!dbPromise) {
    dbPromise = openDB("sahayak-offline", 1, {
      upgrade(db) {
        db.createObjectStore("queue", { autoIncrement: true, keyPath: "id" })
      },
    })
  }
  return dbPromise
}

export async function queueRequest(
  url: string,
  method: string,
  body: unknown,
  headers: Record<string, string> = {}
) {
  const db = await getDB()
  await db.add("queue", {
    url,
    method,
    body,
    headers,
    timestamp: Date.now(),
  })
}

async function flushQueue() {
  const db = await getDB()
  const tx = db.transaction("queue", "readwrite")
  const store = tx.objectStore("queue")
  const all = await store.getAll()
  const keys = await store.getAllKeys()

  for (let i = 0; i < all.length; i++) {
    const item = all[i] as QueuedRequest & { id?: number }
    try {
      const res = await fetch(item.url, {
        method: item.method,
        headers: { "Content-Type": "application/json", ...item.headers },
        body: JSON.stringify(item.body),
      })
      if (res.ok) {
        await db.delete("queue", keys[i])
      }
    } catch {
      // still offline — leave in queue
    }
  }
}

// Replay on reconnect
window.addEventListener("online", () => {
  flushQueue()
})

export async function getQueueLength(): Promise<number> {
  const db = await getDB()
  return db.count("queue")
}
