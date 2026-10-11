// src/offline/cache.js
// Encrypted read-cache of API responses (civil registry data is PII).
// Only saves while unlocked (a key exists in memory). Uses the 'cache' store in db.js.
import { getDB } from './db'
import { getKey } from './offlineAuth'
import { encryptJSON, decryptJSON } from './crypto'

const P = 'cache:'
const DEFAULT_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000

export async function cacheSet(key, data) {
  const k = getKey()
  if (!k) return false // never store plaintext
  const blob = await encryptJSON(k, data)
  const db = await getDB()
  await db.put('cache', { key: P + key, blob, savedAt: Date.now() })
  return true
}

export async function cacheGet(key, maxAgeMs = DEFAULT_MAX_AGE_MS) {
  const k = getKey()
  if (!k) return null
  const db = await getDB()
  const row = await db.get('cache', P + key)
  if (!row || Date.now() - row.savedAt > maxAgeMs) return null
  try {
    return await decryptJSON(k, row.blob)
  } catch {
    return null // wrong key or corrupted entry
  }
}

// Used on logout. Removes only cached API responses. The outbox and files stay.
export async function cacheClear() {
  const db = await getDB()
  const keys = (await db.getAllKeys('cache')).filter((k) => String(k).startsWith(P))
  const tx = db.transaction('cache', 'readwrite')
  for (const k of keys) tx.store.delete(k)
  await tx.done
}