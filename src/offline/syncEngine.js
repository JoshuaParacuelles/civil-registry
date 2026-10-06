import { db } from './db'
import { isOnline, onChange } from './connectivity'

const API = import.meta.env.VITE_API_URL || ''
const BATCH = 25
let running = false

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function markFailed(ops) {
  await db.outbox.bulkPut(ops.map((o) => {
    const attempts = (o.attempts || 0) + 1
    const delay = Math.min(2 ** attempts * 1000, 600000) + Math.random() * 1000
    return { ...o, status: 'failed', attempts, nextRetryAt: Date.now() + delay }
  }))
}

async function applyResult(r) {
  if (r.status === 'applied' || r.status === 'duplicate')
    await db.outbox.update(r.opId, { status: 'synced', syncedAt: Date.now() })
  else if (r.status === 'conflict')
    await db.outbox.update(r.opId, { status: 'conflict', serverState: r.serverState })
  else
    await db.outbox.update(r.opId, { status: 'rejected', error: r.error })
}

export async function runSync() {
  if (running || !isOnline()) return
  running = true
  try {
    while (isOnline()) {
      const ops = (await db.outbox.where('status').anyOf('pending', 'failed').toArray())
        .filter((o) => (o.nextRetryAt ?? 0) <= Date.now())
        .sort((a, b) => a.createdAt - b.createdAt)
        .slice(0, BATCH)
      if (!ops.length) break

      await db.outbox.bulkPut(ops.map((o) => ({ ...o, status: 'syncing' })))
      try {
        const res = await fetch(`${API}/api/sync/batch`, {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ops }),
        })
        if (res.status === 401) {
          // session expired: ibalik sa pending, ayaw i-delete. Kinahanglan mo-login balik.
          await db.outbox.bulkPut(ops.map((o) => ({ ...o, status: 'pending' })))
          window.dispatchEvent(new Event('sync-auth-required'))
          break
        }
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const { results } = await res.json()
        for (const r of results) await applyResult(r)
      } catch {
        await markFailed(ops)
        break
      }
      await sleep(500)
    }
  } finally {
    running = false
  }
}

// Crash recovery: ang 'syncing' nga na-stuck human sa refresh/crash, ibalik sa pending
db.outbox.where('status').equals('syncing').modify({ status: 'pending' }).then(runSync)

onChange((v) => v && runSync())
setInterval(runSync, 30000)