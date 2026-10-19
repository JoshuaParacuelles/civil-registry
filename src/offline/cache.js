// src/offline/cache.js
// Called on logout. Removes personal data cached on this device.
// The outbox (unsynced changes) and offline login records are kept.
import { getDB } from './db'

const LOCAL_STORAGE_KEYS = ['dt_store_v4', 'dt_personnel_cache_v1']

export async function cacheClear() {
  const db = await getDB()

  // Cached API responses, PDF copies, and dashboard data
  await db.clear('cache')

  // Archive record lists and archive password verifiers kept in meta
  const metaKeys = (await db.getAllKeys('meta')).filter(
    (k) => String(k).startsWith('archiveList:') || k === 'archiveCreds:v2'
  )
  const tx = db.transaction('meta', 'readwrite')
  for (const k of metaKeys) tx.store.delete(k)
  await tx.done

  // Document Tracking copies kept in localStorage
  LOCAL_STORAGE_KEYS.forEach((k) => {
    try { localStorage.removeItem(k) } catch { /* ignore */ }
  })
}