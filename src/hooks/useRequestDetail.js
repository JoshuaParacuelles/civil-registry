// src/hooks/useRequestDetail.js
import { useEffect, useReducer, useRef, useState } from "react";

const TTL_MS = 15000;
const TIMEOUT_MS = 6000;

const cache = new Map();           // key -> { data, ts }
const inflight = new Map();        // key -> Promise
const statusOverrides = new Map(); // key -> { status, updated_at }
const lastKnown = new Map();       // key -> latest data, no TTL; shown while refetching

export const requestKey = (n) =>
  n ? `${n.record_type}:${n.record_id ?? ""}:${n.control_no ?? ""}` : null;

const readFresh = (key) => {
  const hit = key ? cache.get(key) : null;
  return hit && Date.now() - hit.ts < TTL_MS ? hit.data : null;
};

const withKey = (set, k) => {
  const next = new Set(set);
  next.add(k);
  return next;
};

const withoutKey = (set, k) => {
  if (!set.has(k)) return set;
  const next = new Set(set);
  next.delete(k);
  return next;
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
      lastKnown.set(key, merged);
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
  loadSnapshot(notification, fetcher).catch(() => { /* ignore: prefetch is best-effort, the modal will retry */ });
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
  const known = lastKnown.get(key);
  if (known) lastKnown.set(key, applyOverride(key, known));
}

/**
 * phase:
 *  "idle"     – nothing to fetch
 *  "loading"  – no data for this request yet
 *  "ready"    – data available (fresh, or the last copy while refetching)
 *  "fallback" – last fetch failed; showing the saved copy with a banner
 */
export function useRequestDetail(notification, fetcher) {
  const hasFetcher = typeof fetcher === "function";
  if (notification?.request_snapshot && !hasFetcher && import.meta.env?.DEV) {
    console.warn("[useRequestDetail] No fetchSnapshot prop passed to NotificationDetailModal.");
  }
  const key = notification?.request_snapshot && hasFetcher ? requestKey(notification) : null;

  const [, rerender] = useReducer((x) => x + 1, 0);
  const [failedKeys, setFailedKeys] = useState(() => new Set());

  // Latest props for async callbacks. Written in an effect, not during render.
  const fetcherRef = useRef(fetcher);
  const notifRef = useRef(notification);
  useEffect(() => {
    fetcherRef.current = fetcher;
    notifRef.current = notification;
  });

  // Fresh cache first; otherwise the last row we have for this key.
  const data = readFresh(key) ?? (key ? lastKnown.get(key) ?? null : null);

  useEffect(() => {
    if (!key || readFresh(key)) return undefined;
    let cancelled = false;
    loadSnapshot(notifRef.current, fetcherRef.current)
      .then(() => {
        if (cancelled) return;
        setFailedKeys((prev) => withoutKey(prev, key));
        rerender();
      })
      .catch(() => {
        if (!cancelled) setFailedKeys((prev) => withKey(prev, key));
      });
    return () => { cancelled = true; };
  }, [key]);

  // Plain functions (not useCallback) so the compiler can optimize the component.
  const refresh = async () => {
    if (!key) return;
    try {
      await loadSnapshot(notifRef.current, fetcherRef.current, { force: true });
    } catch { /* keep showing what we have */ }
    rerender();
  };

  const retry = () => {
    if (!key) return;
    setFailedKeys((prev) => withoutKey(prev, key));
    loadSnapshot(notifRef.current, fetcherRef.current, { force: true })
      .then(() => rerender())
      .catch(() => setFailedKeys((prev) => withKey(prev, key)));
  };

  let phase = "idle";
  if (key) phase = data ? "ready" : failedKeys.has(key) ? "fallback" : "loading";

  return {
    key,
    phase,
    // Apply the saved override on every path, including the stored-snapshot fallback.
    snapshot: applyOverride(key, data ?? notification?.request_snapshot ?? null),
    refresh,
    retry,
  };
}