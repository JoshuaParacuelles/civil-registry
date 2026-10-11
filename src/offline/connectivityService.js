const API_BASE = import.meta.env.VITE_API_BASE_URL || '';
const HEARTBEAT_URL = `${API_BASE}/api/health`;
const HEARTBEAT_ONLINE_MS = 15000;
const HEARTBEAT_OFFLINE_MS = 3000;
const TIMEOUT_MS = 20000;

// Server reachable (login, general UI).
let online = typeof navigator !== 'undefined' ? navigator.onLine : true;
// Database reachable from the server (data calls, prefetch, sync).
// Starts true so first-load behaviour is unchanged until the first check.
let dbOk = true;

let timer = null;
let running = false;
const listeners = new Set();
const dbListeners = new Set();

function setOnline(next) {
  if (next === online) return;
  online = next;
  listeners.forEach((fn) => fn(online));
}

function setDb(next) {
  if (next === dbOk) return;
  dbOk = next;
  dbListeners.forEach((fn) => fn(dbOk));
}

export function markOnline(next = true) {
  setOnline(!!next);
}

export async function checkNow() {
  if (!navigator.onLine) {
    setOnline(false);
    setDb(false);
    return false;
  }
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(HEARTBEAT_URL, { cache: 'no-store', signal: ctrl.signal });
    // Any HTTP response means the server is reachable.
    setOnline(true);
    // The server reports whether Supabase answered. If the field is missing,
    // fall back to the HTTP status.
    let db = res.ok;
    try {
      const body = await res.json();
      db = body?.db !== false && res.ok;
    } catch {
      /* non-JSON body: keep the status-based value */
    }
    setDb(db);
  } catch {
    // Network failure or timeout: the server cannot be reached at all.
    setOnline(false);
    setDb(false);
  } finally {
    clearTimeout(t);
  }
  return online;
}

function schedule() {
  if (!running) return;
  clearTimeout(timer);
  timer = setTimeout(async () => {
    await checkNow();
    schedule();
  }, online ? HEARTBEAT_ONLINE_MS : HEARTBEAT_OFFLINE_MS);
}

const onBrowserOnline = () => { checkNow(); };
const onBrowserOffline = () => { setOnline(false); setDb(false); };

export function startConnectivityMonitor() {
  if (running) return;
  running = true;
  window.addEventListener('online', onBrowserOnline);
  window.addEventListener('offline', onBrowserOffline);
  checkNow().finally(schedule);
}

export function stopConnectivityMonitor() {
  running = false;
  clearTimeout(timer);
  timer = null;
  window.removeEventListener('online', onBrowserOnline);
  window.removeEventListener('offline', onBrowserOffline);
}

// Server reachable: use for login and general UI.
export const isOnline = () => online;

// Server reachable AND database reachable: use for every data call, prefetch and sync.
export const isDbAvailable = () => online && dbOk;

export function subscribeConnectivity(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function subscribeDb(fn) {
  dbListeners.add(fn);
  return () => dbListeners.delete(fn);
}