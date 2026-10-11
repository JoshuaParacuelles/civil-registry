const KEY = "cr_offline_creds_v1";
const LOCK_KEY = "cr_offline_lock_v1";
const ITER = 150000;
const MAX_TRIES = 5;
const LOCK_MS = 60 * 1000; // 1 minute lang kung 5x sayop

const enc = new TextEncoder();
const toB64 = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf)));
const fromB64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

async function derive(password, salt, iterations) {
  const key = await crypto.subtle.importKey(
    "raw", enc.encode(password), "PBKDF2", false, ["deriveBits"]
  );
  return crypto.subtle.deriveBits(
    { name: "PBKDF2", salt, iterations, hash: "SHA-256" }, key, 256
  );
}

const readAll = () => {
  try { return JSON.parse(localStorage.getItem(KEY) || "{}"); } catch { return {}; }
};

const readLock = () => {
  try { return JSON.parse(localStorage.getItem(LOCK_KEY) || "{}"); } catch { return {}; }
};

// Tawga human sa malampuson nga ONLINE login
export async function saveOfflineCredential(username, password, user) {
  try {
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const hash = await derive(password, salt, ITER);
    const all = readAll();
    all[username.trim().toLowerCase()] = {
      salt: toB64(salt),
      hash: toB64(hash),
      iter: ITER,
      user,
      savedAt: Date.now(),
    };
    localStorage.setItem(KEY, JSON.stringify(all));
    // Pangayoa nga dili i-clear sa browser ang storage
    if (navigator.storage?.persist) navigator.storage.persist().catch(() => {});
  } catch (e) {
    console.warn("Could not save offline credential", e);
  }
}

// Returns { ok, user?, reason? }  (walay expiry)
export async function verifyOfflineLogin(username, password) {
  const lock = readLock();
  if (lock.until && Date.now() < lock.until) {
    return { ok: false, reason: "locked" };
  }

  const rec = readAll()[username.trim().toLowerCase()];
  if (!rec) return { ok: false, reason: "no_record" };

  const hash = await derive(password, fromB64(rec.salt), rec.iter);
  if (toB64(hash) === rec.hash) {
    localStorage.removeItem(LOCK_KEY);
    return { ok: true, user: rec.user };
  }

  const tries = (lock.tries || 0) + 1;
  localStorage.setItem(
    LOCK_KEY,
    JSON.stringify(tries >= MAX_TRIES ? { tries: 0, until: Date.now() + LOCK_MS } : { tries })
  );
  return { ok: false, reason: "bad_password" };
}