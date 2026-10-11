import bcrypt from 'bcryptjs';
import { readCredentials, writeCredentials, purgeLegacyLocalStorage } from './archiveLocalStore';

const API_BASE = import.meta.env.VITE_API_BASE_URL || '';
const MAX_FAILS = 5;
const LOCK_MS = 5 * 60 * 1000;

export const OFFLINE_MODULES = [
  'birth_record', 'archive_birth',
  'death_record', 'archive_death',
  'marriage_record', 'archive_marriage',
];

let inFlight = null;
let purged = false;

/**
 * ONLINE: download every module's bcrypt verifier and store it in IndexedDB.
 * Modules the server omits keep their previous copy, so a partial response
 * cannot erase a good verifier. Returns "saved" | "failed".
 */
export function refreshAllOfflineCredentials() {
  if (inFlight) return inFlight;
  inFlight = (async () => {
    try {
      if (!purged) { purgeLegacyLocalStorage(); purged = true; }

      const res = await fetch(`${API_BASE}/api/offline-credentials`, {
        credentials: 'include',
        cache: 'no-store',
      });
      if (!res.ok) return 'failed';

      const body = await res.json();
      const mods = body?.modules;
      if (!mods || typeof mods !== 'object') return 'failed';

      const creds = await readCredentials();
      const now = Date.now();
      for (const m of OFFLINE_MODULES) {
        if (!(m in mods)) continue;
        creds.modules[m] = mods[m] ? { hash: mods[m], syncedAt: now } : null;
      }
      creds.syncedAt = now;
      await writeCredentials(creds);
      return 'saved';
    } catch (e) {
      console.warn('[archivePassword] refresh failed:', e);
      return 'failed';
    } finally {
      inFlight = null;
    }
  })();
  return inFlight;
}

// Backward-compatible: old callers pass (module, api); both are ignored.
export const refreshOfflineCredential = () => refreshAllOfflineCredentials();

/**
 * OFFLINE check. Returns "ok" | "wrong" | "locked" | "unset" | "none".
 */
export async function verifyArchivePasswordOffline(module, password) {
  const creds = await readCredentials();
  const fail = creds.fails[module] || { count: 0, lockedUntil: 0 };

  if (fail.lockedUntil && Date.now() < fail.lockedUntil) return 'locked';
  if (!(module in creds.modules)) return 'none';

  const saved = creds.modules[module];
  if (saved === null) return 'unset';

  let match = false;
  try {
    match = await bcrypt.compare(password, saved.hash);
  } catch {
    return 'none';
  }

  if (match) {
    creds.fails[module] = { count: 0, lockedUntil: 0 };
    await writeCredentials(creds);
    return 'ok';
  }

  const count = (fail.count || 0) + 1;
  creds.fails[module] = count >= MAX_FAILS
    ? { count: 0, lockedUntil: Date.now() + LOCK_MS }
    : { count, lockedUntil: 0 };
  await writeCredentials(creds);
  return 'wrong';
}