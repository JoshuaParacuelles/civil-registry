import {
  createContext, useCallback, useContext, useEffect,
  useMemo, useRef, useState,
} from "react";

const RefreshContext = createContext(null);

export function RefreshProvider({ children }) {
  const registry = useRef(new Set());
  const inFlight = useRef(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastRefreshedAt, setLastRefreshedAt] = useState(null);
  const [lastError, setLastError] = useState(null);

  const register = useCallback((fn) => {
    registry.current.add(fn);
    return () => registry.current.delete(fn);
  }, []);

  const refresh = useCallback(async () => {
    if (inFlight.current) return { ok: false, reason: "busy" };

    const fns = [...registry.current];
    if (fns.length === 0) return { ok: true, reason: "nothing-registered" };

    inFlight.current = true;
    setIsRefreshing(true);
    setLastError(null);
    try {
      const results = await Promise.allSettled(fns.map((fn) => fn()));
      const failed = results.filter((r) => r.status === "rejected");
      if (failed.length) {
        setLastError(failed[0].reason);
        return { ok: false, reason: "partial-failure", failedCount: failed.length };
      }
      setLastRefreshedAt(new Date());
      return { ok: true };
    } finally {
      inFlight.current = false;
      setIsRefreshing(false);
    }
  }, []);

  const value = useMemo(
    () => ({ register, refresh, isRefreshing, lastRefreshedAt, lastError }),
    [register, refresh, isRefreshing, lastRefreshedAt, lastError]
  );

  return <RefreshContext.Provider value={value}>{children}</RefreshContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components -- hook colocated with its provider
export function useGlobalRefresh() {
  const ctx = useContext(RefreshContext);
  if (!ctx) throw new Error("useGlobalRefresh must be used inside RefreshProvider");
  return ctx;
}

// Registers a page's loader. The latest loader is always called, so no useCallback is needed.
// eslint-disable-next-line react-refresh/only-export-components -- hook colocated with its provider
export function useRegisterRefresh(loader) {
  const ctx = useContext(RefreshContext);
  const loaderRef = useRef(loader);

  useEffect(() => {
    loaderRef.current = loader;
  });

  useEffect(() => {
    if (!ctx) return undefined;
    return ctx.register(() => loaderRef.current());
  }, [ctx]);
}