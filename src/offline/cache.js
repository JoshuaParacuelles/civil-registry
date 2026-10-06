// Encrypted read-cache sa API responses (PII gyud ni: civil registry).
// Mo-save ra kung unlocked (naay key). Gigamit ang db.meta, walay schema change.
import { db } from './db'
import { getKey } from './offlineAuth'
import { encryptJSON, decryptJSON } from './crypto'

const P = 'cache:'

export async function cacheSet(key, data) {
  const k = getKey()
  if (!k) return false // ayaw i-save nga plaintext
  const blob = await encryptJSON(k, data)
  await db.meta.put({ key: P + key, value: { blob, savedAt: Date.now() } })
  return true
}

export async function cacheGet(key, maxAgeMs = 7 * 24 * 60 * 60 * 1000) {
  const k = getKey()
  if (!k) return null
  const row = await db.meta.get(P + key)
  if (!row || Date.now() - row.value.savedAt > maxAgeMs) return null
  try {
    return await decryptJSON(k, row.value.blob)
  } catch {
    return null
  }
}

export async function cacheClear() {
  const keys = (await db.meta.toCollection().primaryKeys()).filter((k) => String(k).startsWith(P))
  await db.meta.bulkDelete(keys)
}