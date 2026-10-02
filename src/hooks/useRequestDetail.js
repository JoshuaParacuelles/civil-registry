// src/hooks/useRequestDetail.js
import { useCallback, useEffect, useReducer, useRef } from "react";

const TTL_MS = 15000;     // how long a fetched snapshot is considered fresh
const TIMEOUT_MS = 6000;  // give up and show the "Retry" banner after this

const cache = new Map();    // key -> { data, ts }
const inflight = new Map(); // key -> Promise

export const requestKey = (n) =>
  n ? `${n.record_type}:${n.record_id ?? ""}:${n.control_no ?? ""}` : null;

const readFresh = (key) => {
  const hit = key ? cache.get(key) : null;
  return hit && Date.now() - hit.ts < TTL_MS ? hit.data : null;
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
      cache.set(key, { data, ts: Date.now() });
      return data;
    })
    .finally(() => {
      if (inflight.get(key) === p) inflight.delete(key);
    });
  inflight.set(key, p);
  return p;
}

/** Warm the cache (call on hover / focus / touchstart). Never throws. */
export function prefetchRequestSnapshot(notification, fetcher) {
  if (!notification?.request_snapshot) return;
  loadSnapshot(notification, fetcher).catch(() => {});
}

/** Put a known-good snapshot straight into the cache (e.g. from a realtime event). */
export function primeRequestSnapshot(notification, data) {
  const key = requestKey(notification);
  if (key) cache.set(key, { data, ts: Date.now() });
}

export function invalidateRequestSnapshot(notification) {
  const key = requestKey(notification);
  if (key) cache.delete(key);
}

/**
 * phase:
 *  "idle"     – nothing to fetch (e.g. system notification)
 *  "loading"  – fresh data not here yet -> show skeleton, NEVER the stale snapshot
 *  "ready"    – fresh data available
 *  "fallback" – fetch failed/timed out -> showing the saved copy with a banner
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

  // Keep the last good data for this key so a TTL expiry can't flip us back to loading.
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

  /** Silent re-fetch that keeps showing current data until the new data lands. */
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
    snapshot: data ?? notification?.request_snapshot ?? null,
    refresh,
    retry,
  };
}