// src/hooks/useRequestDetail.js
import { useCallback, useEffect, useReducer, useRef } from "react";

const TTL_MS = 15000;
const TIMEOUT_MS = 6000;

const cache = new Map();          // key -> { data, ts }
const inflight = new Map();       // key -> Promise
const statusOverrides = new Map(); // key -> { status, updated_at }

export const requestKey = (n) =>
  n ? `${n.record_type}:${n.record_id ?? ""}:${n.control_no ?? ""}` : null;

const readFresh = (key) => {
  const hit = key ? cache.get(key) : null;
  return hit && Date.now() - hit.ts < TTL_MS ? hit.data : null;
};

/**
 * Apply a status this admin just saved. The override is ignored once the
 * server row has a newer updated_at than our save (someone else changed it).
 */
const applyOverride = (key, data) => {
  const o = key ? statusOverrides.get(key) : null;
  if (!o || !data) return data;
  const serverStamp = Date.parse(data.updated_at || "");
  const savedStamp = Date.parse(o.updated_at);
  if (!Number.isNaN(serverStamp) && !Number.isNaN(savedStamp) && serverStamp > savedStamp) {
    return data;
  }
  return { ...data, status: o.status };
};

const withTimeout = (promise, ms) =>
  new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error("timeout")), ms);
    promise.then(
      (v) => { clearTimeout(t); resolve(v); },
      (e) => { clearTimeout(t); reject(e); }
    );
  });

/** Fetch (or reuse) the latest snapshot. De-duplicates concurrent calls. */
export function loadSnapshot(notification, fetcher, { force = false } = {}) {
  if (typeof fetcher !== "function") {
    return Promise.reject(new Error("fetchSnapshot was not provided"));
  }
  const key = requestKey(notification);
  if (!force) {
    const fresh = readFresh(key);
    if (fresh) return Promise.resolve(fresh);
    if (inflight.has(key)) return inflight.get(key);
  }
  const p = withTimeout(new Promise((resolve) => resolve(fetcher(notification))), TIMEOUT_MS)
    .then((data) => {
      if (!data) throw new Error("empty snapshot");
      const merged = applyOverride(key, data);
      cache.set(key, { data: merged, ts: Date.now() });
      return merged;
    })
    .finally(() => {
      if (inflight.get(key) === p) inflight.delete(key);
    });
  inflight.set(key, p);
  return p;
}

/** Warm the cache (hover / focus / touch). Never throws. */
export function prefetchRequestSnapshot(notification, fetcher) {
  if (!notification?.request_snapshot) return;
  loadSnapshot(notification, fetcher).catch(() => {});
}

/**
 * Record a status the server just confirmed. Every later read of this request
 * (cache, live fetch, stored snapshot fallback) shows this status until the
 * server reports a newer change.
 */
export function recordSavedStatus(notification, status, updatedAt) {
  const key = requestKey(notification);
  if (!key || !status) return;
  statusOverrides.set(key, {
    status: String(status).toUpperCase(),
    updated_at: updatedAt || new Date().toISOString(),
  });
  const hit = cache.get(key);
  if (hit) cache.set(key, { data: applyOverride(key, hit.data), ts: hit.ts });
}

/**
 * phase:
 *  "idle"     – nothing to fetch
 *  "loading"  – fresh data not here yet
 *  "ready"    – fresh data available
 *  "fallback" – fetch failed; showing the saved copy with a banner
 */
export function useRequestDetail(notification, fetcher) {
  const hasFetcher = typeof fetcher === "function";
  if (notification?.request_snapshot && !hasFetcher && import.meta.env?.DEV) {
    console.warn("[useRequestDetail] No fetchSnapshot prop passed to NotificationDetailModal.");
  }
  const key = notification?.request_snapshot && hasFetcher ? requestKey(notification) : null;
  const [, rerender] = useReducer((x) => x + 1, 0);
  const failed = useRef(new Set());
  const held = useRef({ key: null, data: null });
  const fetcherRef = useRef(fetcher);
  const notifRef = useRef(notification);
  fetcherRef.current = fetcher;
  notifRef.current = notification;

  const fresh = readFresh(key);
  if (fresh) held.current = { key, data: fresh };
  const data = held.current.key === key ? held.current.data : null;

  useEffect(() => {
    if (!key || readFresh(key)) return undefined;
    let cancelled = false;
    failed.current.delete(key);
    loadSnapshot(notifRef.current, fetcherRef.current)
      .catch(() => failed.current.add(key))
      .finally(() => { if (!cancelled) rerender(); });
    return () => { cancelled = true; };
  }, [key]);

  const refresh = useCallback(async () => {
    try {
      await loadSnapshot(notifRef.current, fetcherRef.current, { force: true });
    } catch { /* keep showing what we have */ }
    rerender();
  }, []);

  const retry = useCallback(() => {
    if (!key) return;
    failed.current.delete(key);
    rerender();
    loadSnapshot(notifRef.current, fetcherRef.current, { force: true })
      .catch(() => failed.current.add(key))
      .finally(rerender);
  }, [key]);

  let phase = "idle";
  if (key) phase = data ? "ready" : failed.current.has(key) ? "fallback" : "loading";

  return {
    key,
    phase,
    // Apply the saved override on every path, including the stored-snapshot fallback.
    snapshot: applyOverride(key, data ?? notification?.request_snapshot ?? null),
    refresh,
    retry,
  };
}