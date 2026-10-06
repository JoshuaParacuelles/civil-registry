// Manual backup/restore sa outbox (safety net kung ma-clear ang browser data).
// Ang file naay PII: i-encrypt gamit ang unlocked key kung available.
import { db } from './db'
import { getKey } from './offlineAuth'
import { encryptJSON, decryptJSON, toB64, fromB64 } from './crypto'

const PENDING = ['pending', 'failed', 'syncing', 'conflict']

export async function exportBackup() {
  const ops = (await db.outbox.toArray()).filter((o) => PENDING.includes(o.status))
  const opIds = new Set(ops.map((o) => o.opId))
  const files = []
  for (const f of await db.files.toArray()) {
    if (!opIds.has(f.opId)) continue
    files.push({
      fileId: f.fileId, opId: f.opId, sha256: f.sha256,
      type: f.blob.type, name: f.blob.name || null,
      data: toB64(await f.blob.arrayBuffer()),
    })
  }
  const payload = { version: 1, exportedAt: Date.now(), ops, files }
  const key = getKey()
  return key ? { encrypted: true, ...(await encryptJSON(key, payload)) } : { encrypted: false, payload }
}

export async function downloadBackup() {
  const out = await exportBackup()
  const blob = new Blob([JSON.stringify(out)], { type: 'application/json' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = `lcr-backup-${new Date().toISOString().slice(0, 10)}.json`
  a.click()
  URL.revokeObjectURL(a.href)
}

// Gidawat ang File gikan sa <input type="file">. Ang server mo-dedupe pinaagi sa opId.
export async function importBackup(file) {
  const parsed = JSON.parse(await file.text())
  let payload = parsed.payload
  if (parsed.encrypted) {
    const key = getKey()
    if (!key) throw new Error('Unlock una (offline login) aron ma-decrypt ang backup.')
    payload = await decryptJSON(key, parsed)
  }
  let restored = 0
  await db.transaction('rw', db.outbox, db.files, async () => {
    for (const op of payload.ops) {
      if (await db.outbox.get(op.opId)) continue
      await db.outbox.add({ ...op, status: 'pending', attempts: 0, nextRetryAt: 0 })
      restored++
    }
    for (const f of payload.files) {
      if (await db.files.get(f.fileId)) continue
      const blob = new Blob([fromB64(f.data)], { type: f.type })
      await db.files.add({ fileId: f.fileId, opId: f.opId, sha256: f.sha256, blob })
    }
  })
  const { runSync } = await import('./syncEngine')
  runSync()
  return restored
}