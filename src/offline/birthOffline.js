// src/offline/birthOffline.js
//
// Offline support for the Birth Verifier ONLY. Builds on the IndexedDB layer
// (db.js / outboxQueue.js / fileStore.js) and does not touch the schema.
//
// Cache entities are named 'bv-pdf' on purpose. Record lists are stored in
// localStorage through archiveLocalStore.js; only PDFs go in IndexedDB.

import { useEffect, useState } from 'react';
import { getDB } from './db';
import { isDbAvailable } from './connectivityService';
import { enqueue, listByStatus, subscribeOutbox } from './outboxQueue';
import { saveFile, getFile } from './fileStore';
import { refreshAllOfflineCredentials } from './archivePassword';
import { saveRecordList, loadRecordList } from './archiveLocalStore';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* ───────────────────────── Record list cache (localStorage) ───────────────────────── */

export async function saveList(name, data) {
  saveRecordList(`birth:${name}`, data);
}

/** @returns {{data: any[], savedAt: number} | null} */
export async function loadList(name) {
  return loadRecordList(`birth:${name}`);
}

/* ───────────────────────── PDF cache (IndexedDB Blobs) ───────────────────────── */

const pdfKey = (id) => `bv-pdf:${id}`;

export async function getCachedPdf(id) {
  try {
    const db = await getDB();
    return (await db.get('cache', pdfKey(id)))?.blob || null;
  } catch {
    return null;
  }
}

export async function cachePdf(id, blob) {
  try {
    const db = await getDB();
    await db.put('cache', { key: pdfKey(id), entity: 'bv-pdf', blob, savedAt: Date.now() });
  } catch (e) {
    console.warn('[birthOffline] cachePdf failed (storage full?):', e);
  }
}

async function hasCachedPdf(id) {
  try {
    const db = await getDB();
    return (await db.getKey('cache', pdfKey(id))) !== undefined;
  } catch {
    return false;
  }
}

/**
 * Downloads every PDF that is not on this device yet, one at a time, with a
 * pause between each. Returns a cancel function.
 */
export function startPdfPrefetch(ids, { api, toBlob, gapMs = 600 }) {
  let cancelled = false;
  (async () => {
    try { await navigator.storage?.persist?.(); } catch { /* optional */ }
    let failures = 0;
    for (const id of new Set(ids)) {
      if (cancelled || !isDbAvailable()) return;
      if (await hasCachedPdf(id)) continue;
      try {
        // ?prefetch=1 tells the server NOT to write a "VIEW" audit entry.
        const res = await fetch(`${api}/records/${id}?prefetch=1`, { credentials: 'include' });
        if (res.status >= 500) throw new Error(String(res.status));
        if (res.ok) {
          const data = await res.json();
          const blob = toBlob(data?.pdf_data);
          if (blob) await cachePdf(id, blob);
        }
        failures = 0;
      } catch {
        if (++failures >= 3) return; // server unreachable: stop, retry later
      }
      await sleep(gapMs);
    }
  })();
  return () => { cancelled = true; };
}

/* ───────────────────────── Queue helpers (outbox) ───────────────────────── */

export async function queueBirthUpload(url, file) {
  const fileId = await saveFile(file);
  return enqueue({
    entity: 'birth', label: `Upload ${file.name}`, method: 'POST', url, fileId, fileField: 'file',
  });
}

export const queueBirthDelete = (url, who = '') =>
  enqueue({ entity: 'birth', label: `Delete ${who}`, method: 'DELETE', url });

export const queueBirthTransaction = (url, json, who = '', opId) =>
  enqueue({ opId, entity: 'birth', label: `Transaction: ${who}`, method: 'POST', url, json });

/* ───────────────────────── Pending-changes view ─────────────────────────
   Shows queued uploads immediately and hides queued deletes, without touching
   the cached server list. */

export function useBirthPending(api) {
  const [state, setState] = useState({ uploads: [], deleteIds: new Set(), count: 0 });

  useEffect(() => {
    let alive = true;
    const recordsUrl = `${api}/records`;
    const deletePrefix = `${api}/records/`;

    const load = async () => {
      try {
        const ops = (await listByStatus()).filter((o) => o.entity === 'birth');

        const uploads = [];
        for (const o of ops) {
          if (o.method !== 'POST' || !o.fileId || o.url !== recordsUrl) continue;
          if (o.status === 'conflict') continue;
          const f = await getFile(o.fileId);
          if (!f) continue;
          const when = new Date(o.createdAt).toISOString();
          uploads.push({
            id: `offline-${o.opId}`,
            file_name: f.name,
            uploaded_at: when,
            archived_at: when,
            _pending: true,
            _pendingOpId: o.opId,
            _pendingFileId: o.fileId,
            _syncStatus: o.status,
          });
        }
        uploads.reverse();

        const deleteIds = new Set(
          ops
            .filter((o) => o.method === 'DELETE' && (o.status === 'pending' || o.status === 'syncing') && o.url.startsWith(deletePrefix))
            .map((o) => decodeURIComponent(o.url.slice(deletePrefix.length))),
        );

        const count = ops.filter((o) => o.status === 'pending' || o.status === 'syncing').length;
        if (alive) setState({ uploads, deleteIds, count });
      } catch {
        /* IndexedDB unavailable: fall back to server data only */
      }
    };

    load();
    const unsub = subscribeOutbox(load);
    return () => { alive = false; unsub(); };
  }, [api]);

  return state;
}

/* ───────────────────────── App-wide cache warmup ───────────────────────── */

async function fetchArr(url) {
  const r = await fetch(url, { credentials: 'include' });
  if (!r.ok) throw new Error(String(r.status));
  const d = await r.json();
  return Array.isArray(d) ? d : [];
}

// data:application/pdf;base64,... -> Blob
function dataUrlToBlob(dataUrl) {
  if (typeof dataUrl !== 'string') return null;
  try {
    const bin = atob(dataUrl.replace(/^data:application\/pdf;base64,/i, '').replace(/\s/g, ''));
    const u8 = Uint8Array.from(bin, (c) => c.charCodeAt(0));
    return u8[0] === 0x25 && u8[1] === 0x50 ? new Blob([u8], { type: 'application/pdf' }) : null;
  } catch {
    return null;
  }
}

/** Downloads both lists, then the PDFs, to this device. Returns a cancel function or null. */
export async function warmBirthCache(api) {
  if (!isDbAvailable()) return null;
  await refreshAllOfflineCredentials();
  try {
    const [active, archived] = await Promise.all([
      fetchArr(`${api}/records`), fetchArr(`${api}/archived`),
    ]);
    await saveList('records', active);
    await saveList('archived', archived);
    return startPdfPrefetch([...active, ...archived].map((r) => r.id), { api, toBlob: dataUrlToBlob });
  } catch {
    return null;
  }
}

/** Mount once in a component that always renders after login. */
export function useBirthWarmup(api, online) {
  useEffect(() => {
    if (!online) return undefined;
    let cancel = null;
    let alive = true;
    warmBirthCache(api).then((c) => { if (alive) cancel = c; else c?.(); });
    return () => { alive = false; cancel?.(); };
  }, [api, online]);
}