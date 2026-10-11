import { getDB } from './db';
import { isOnline, markOnline } from './connectivityService';
import { enqueue, newOpId } from './outboxQueue';
import { saveFile } from './fileStore';

export const isNetworkError = (e) =>
  e?.network === true || e instanceof TypeError || /failed to fetch|network|load failed/i.test(e?.message || '');

async function trim(entity, max) {
  const db = await getDB();
  const items = await db.getAllFromIndex('cache', 'entity', entity);
  if (items.length <= max) return;
  items.sort((a, b) => a.cachedAt - b.cachedAt);
  await Promise.all(items.slice(0, items.length - max).map((i) => db.delete('cache', i.key)));
}

/**
 * GET JSON. Online: fetch + remember it. Offline (or the server is up but its
 * database is unreachable, i.e. HTTP 5xx): return the remembered copy.
 */
export async function cachedGetJson(url, { entity = 'http', signal, maxEntries = 0, forceNetwork = false } = {}) {
  const db = await getDB();
  const key = `GET:${url}`;
  let lastErr = null;

  // forceNetwork: try the server even if the app currently thinks it is offline
  // (used by Retry and by the auto-recovery check).
  if (isOnline() || forceNetwork) {
    try {
      const res = await fetch(url, { signal, credentials: 'include' });
      let body = null;
      try { body = await res.json(); } catch { /* non-JSON */ }
      if (!res.ok) throw Object.assign(new Error(body?.error || `Server responded with ${res.status}`), { http: res.status });
      markOnline(true); // a real request just worked, so we are online
      await db.put('cache', { key, entity, id: url, data: body, cachedAt: Date.now() });
      if (maxEntries) await trim(entity, maxEntries);
      return { data: body, fromCache: false, cachedAt: Date.now() };
    } catch (err) {
      if (err?.name === 'AbortError') throw err;
      // 4xx (not logged in, forbidden, bad request) are real answers: do not hide them.
      if (err.http && err.http < 500) throw err;
      // Network failure or 5xx (e.g. Flask is up but Supabase is not): use the saved copy.
      lastErr = err;
    }
  }

  const hit = await db.get('cache', key);
  if (hit) return { data: hit.data, fromCache: true, cachedAt: hit.cachedAt };

  // Nothing saved. If the server answered with an error, show that; otherwise we are simply offline.
  if (lastErr?.http) throw lastErr;
  throw new Error('You are offline and this data is not saved on this device yet.');
}

/** Edit a saved GET copy (e.g. hide a record you deleted offline). */
export async function patchCachedJson(url, updater) {
  const db = await getDB();
  const hit = await db.get('cache', `GET:${url}`);
  if (hit) await db.put('cache', { ...hit, data: updater(hit.data) });
}

/** JSON write. Sent now if online, otherwise queued. */
export async function mutate({ entity, label, method = 'POST', url, json = null }) {
  const opId = newOpId(); // same id on the direct try and the queued retry = never applied twice
  if (isOnline()) {
    try {
      const res = await fetch(url, {
        method,
        credentials: 'include',
        headers: { 'X-Offline-Op-Id': opId, ...(json ? { 'Content-Type': 'application/json' } : {}) },
        body: json ? JSON.stringify(json) : undefined,
      });
      let data = {};
      try { data = await res.json(); } catch { /* non-JSON */ }
      return { queued: false, res, data };
    } catch (err) {
      if (!isNetworkError(err)) throw err;
    }
  }
  const op = await enqueue({ opId, entity, label, method, url, json });
  return { queued: true, op };
}

/** Save a PDF upload to send later. */
export async function queueUpload({ entity, label, url, file, fileField = 'file' }) {
  const fileId = await saveFile(file);
  return enqueue({ entity, label, method: 'POST', url, fileId, fileField });
}

/**
 * Upload with real progress when online; if there is no internet (or it drops),
 * save the file on this device and send it later. Same op id both ways, so a
 * lost response can never create a duplicate record.
 */
export async function uploadOrQueue({ entity, label, url, file, fileField = 'file', onProgress = () => {} }) {
  const opId = newOpId();
  if (isOnline()) {
    try {
      const data = await new Promise((resolve, reject) => {
        const fd = new FormData();
        fd.append(fileField, file);
        const xhr = new XMLHttpRequest();
        xhr.open('POST', url);
        xhr.withCredentials = true;
        xhr.setRequestHeader('X-Offline-Op-Id', opId);
        xhr.upload.onprogress = (e) => { if (e.lengthComputable) onProgress(Math.min(99, (e.loaded / e.total) * 100)); };
        xhr.onload = () => {
          let body = {};
          try { body = JSON.parse(xhr.responseText || '{}'); } catch { /* non-JSON */ }
          if (xhr.status >= 200 && xhr.status < 300) { onProgress(100); resolve(body); }
          else reject(new Error(body.error || 'Upload failed'));
        };
        xhr.onerror = () => reject(Object.assign(new Error('Cannot reach server.'), { network: true }));
        xhr.send(fd);
      });
      return { queued: false, data };
    } catch (err) {
      if (!isNetworkError(err)) throw err;
    }
  }
  const fileId = await saveFile(file);
  await enqueue({ opId, entity, label, method: 'POST', url, fileId, fileField });
  onProgress(100);
  return {
    queued: true,
    data: { queued: true, file_name: file.name.replace(/\.pdf$/i, ''), uploaded_at: new Date().toISOString() },
  };
}