import { isDbAvailable, subscribeConnectivity } from './connectivityService';
import {
  listByStatus, updateOp, markSynced, trimSynced, recoverInterrupted, requeueOne,
} from './outboxQueue';
import { markConflict } from './conflictResolver';
import { getDB, getMeta, setMeta } from './db';
import { decryptJSON } from './secureStore';
import { isEntityAllowed } from './syncScope';

// ---------- Backend base URL ----------

const API_BASE = (import.meta.env.VITE_API_BASE_URL || 'https://civil-registry.onrender.com')
  .replace(/\/+$/, '');

// Ang offline records nga na-save nga naay placeholder host ipunting sa tinuod nga backend.
const PLACEHOLDER_HOST = /^https:\/\/your-render-url\.onrender\.com/;

function normalizeUrl(url) {
  return url.replace(PLACEHOLDER_HOST, API_BASE);
}

// ---------- Sync settings ----------

const PAUSE_EVERY = 10;
const PAUSE_MS = 500;
const MAX_ATTEMPTS = 8;
const BASE_BACKOFF_MS = 3000;
const POLL_MS = 60000;

let running = false;
let retryTimer = null;
let pollTimer = null;
let unsub = null;
let failStreak = 0;
const stateListeners = new Set();

let state = {
  syncing: false, done: 0, total: 0,
  succeeded: 0, failedRun: 0,
  lastError: null, authRequired: false, lastSyncAt: null,
};

const setState = (p) => { state = { ...state, ...p }; stateListeners.forEach((fn) => fn(state)); };
export const getSyncState = () => state;
export const subscribeSyncState = (fn) => (stateListeners.add(fn), () => stateListeners.delete(fn));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const currentUser = () => { try { return sessionStorage.getItem('username'); } catch { return null; } };

// A queued change may point at a temporary document id ("offline-<opId>").
// Swap in the real id saved when that document was created on the server.
async function resolveUrl(url) {
  const m = url.match(/\/api\/documents\/(offline-[\w-]+)/);
  if (!m) return url;
  const createOpId = m[1].slice('offline-'.length);
  const realId = await getMeta(`docmap:${createOpId}`);
  if (realId == null) {
    throw Object.assign(new Error('The document for this change was not created on the server.'), { fatal: true });
  }
  return url.replace(m[1], String(realId));
}

async function replay(op) {
  const url = normalizeUrl(await resolveUrl(op.url));
  const headers = { 'X-Offline-Op-Id': op.opId, 'X-Offline-Created-At': String(op.createdAt) };
  let body;
  if (op.fileId) {
    const db = await getDB();
    const rec = await db.get('files', op.fileId);
    if (!rec) throw Object.assign(new Error('Attached file is missing on this device.'), { fatal: true });
    const fd = new FormData();
    fd.append(op.fileField, rec.blob, rec.name);
    body = fd;
  } else if (op.json) {
    let payload = op.json;
    if (op.json.__enc) {
      try {
        payload = await decryptJSON(op.json.__enc);
      } catch {
        throw Object.assign(new Error('Cannot decrypt this queued change on this device.'), { fatal: true });
      }
    }
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(payload);
  }
  return fetch(url, { method: op.method, headers, body, credentials: 'include' });
}

// Returns { succeeded, failed } for the run, or null if it could not run.
export async function runSync() {
  if (running || !isDbAvailable()) return null;
  running = true;
  clearTimeout(retryTimer);
  const summary = { succeeded: 0, failed: 0 };
  try {
    await recoverInterrupted();
    const me = currentUser();

    // Only send work that (a) belongs to this login and (b) this user's
    // permissions allow for its entity. Anything else stays in the queue,
    // untouched, for a user who is allowed to send it.
    const queue = (await listByStatus('pending')).filter(
      (o) => (!o.username || !me || o.username === me) && isEntityAllowed(o.entity)
    );
    if (!queue.length) return summary;

    setState({ syncing: true, done: 0, total: queue.length, succeeded: 0, failedRun: 0, lastError: null, authRequired: false });

    let done = 0;
    for (const op of queue) {
      if (!isDbAvailable()) throw new Error('Connection lost');
      await updateOp(op.opId, { status: 'syncing' });

      let res;
      try {
        res = await replay(op);
      } catch (err) {
        if (err.fatal) {
          await updateOp(op.opId, { status: 'failed', lastError: err.message });
          summary.failed += 1;
          done += 1;
          setState({ done, failedRun: summary.failed });
          continue;
        }
        await updateOp(op.opId, { status: 'pending' });
        throw err; // network error: stop here so the order is kept
      }

      const s = res.status;
      const body = await res.json().catch(() => ({}));
      const msg = body?.error || '';

      if ((s >= 200 && s < 300) || (op.method === 'DELETE' && s === 404)) {
        // A document created offline: remember its real id so later queued
        // changes for the temporary id can be sent to the right document.
        if (op.method === 'POST' && /\/api\/documents$/.test(op.url) && body?.id != null) {
          await setMeta(`docmap:${op.opId}`, body.id);
        }
        await markSynced(op.opId);
        summary.succeeded += 1;
      } else if (s === 401) {
        await updateOp(op.opId, { status: 'pending' });
        setState({ authRequired: true, lastError: 'Session expired. Log in again to continue syncing.' });
        return summary;
      } else if (s === 403) {
        // Server says this login may not send this entity. Stop retrying it.
        await updateOp(op.opId, { status: 'failed', lastError: msg || 'Access denied for this module' });
        summary.failed += 1;
      } else if (s >= 500 || s === 408 || s === 429) {
        const attempts = op.attempts + 1;
        await updateOp(op.opId, {
          status: attempts >= MAX_ATTEMPTS ? 'failed' : 'pending',
          attempts,
          lastError: msg || `Server error (${s})`,
        });
        throw new Error(`Server error (${s})`);
      } else if (s === 409) {
        await markConflict(op, msg);
        summary.failed += 1;
      } else {
        await updateOp(op.opId, { status: 'failed', lastError: msg || `Rejected (${s})` });
        summary.failed += 1;
      }

      done += 1;
      setState({ done, succeeded: summary.succeeded, failedRun: summary.failed });
      if (done % PAUSE_EVERY === 0) await sleep(PAUSE_MS);
    }

    failStreak = 0;
    const now = Date.now();
    await setMeta('lastSyncAt', now);
    await trimSynced();
    setState({ lastSyncAt: now });
    return summary;
  } catch (err) {
    failStreak += 1;
    setState({ lastError: err.message });
    retryTimer = setTimeout(runSync, Math.min(BASE_BACKOFF_MS * 2 ** failStreak, 5 * 60 * 1000));
    return summary;
  } finally {
    setState({ syncing: false });
    running = false;
  }
}

// Re-queue only the failed and conflicting items this login may send, then sync.
export async function retryAllFailed() {
  const rows = [
    ...(await listByStatus('failed')),
    ...(await listByStatus('conflict')),
  ].filter((o) => isEntityAllowed(o.entity));
  for (const o of rows) await requeueOne(o.opId);
  return runSync();
}

export function startSyncEngine() {
  if (unsub) return;
  getMeta('lastSyncAt')
    .then((v) => { if (v) setState({ lastSyncAt: v }); })
    .catch(() => {});
  unsub = subscribeConnectivity((online) => { if (online) runSync(); });
  pollTimer = setInterval(runSync, POLL_MS);
  if (isDbAvailable()) runSync();
}

export function stopSyncEngine() {
  unsub?.();
  unsub = null;
  clearInterval(pollTimer);
  clearTimeout(retryTimer);
}