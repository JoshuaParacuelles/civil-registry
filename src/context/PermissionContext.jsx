import { createContext, useContext, useEffect, useMemo, useState, useCallback, useRef } from "react";
import { lock } from "../offline/offlineAuth";
import { cacheClear } from "../offline/cache";

// Relative by default. Only set VITE_API_BASE_URL if your backend truly
// lives on a different origin — leave it unset for local/LAN/devtunnel dev.
const API = import.meta.env.VITE_API_BASE_URL || "";
const FETCH_TIMEOUT_MS = 45000;

const PermissionContext = createContext({
  role:                 null,
  permissions:          [],
  is_admin:             false,
  can_manage_personnel: false,
  loading:              true,
  waking:               false,
  error:                null,
  hasAccess:            () => false,
  refresh:              async () => {},
  clearPerms:           () => {},
  logout:              async () => {},
});

async function fetchWithTimeout(url, options = {}, timeoutMs = FETCH_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...options, signal: controller.signal });
    return res;
  } finally {
    clearTimeout(timer);
  }
}

export function PermissionProvider({ children }) {
  const [role,          setRole]          = useState(null);
  const [permissions,   setPermissions]   = useState([]);
  const [isAdmin,       setIsAdmin]       = useState(false);
  const [authenticated, setAuthenticated] = useState(false);
  const [loading,       setLoading]       = useState(true);
  const [error,         setError]         = useState(null);

  // BUG FIX: distinguishes "still waking up the free-tier backend" from
  // ordinary loading, purely so the UI can tell the user why it's taking a while.
  const [waking, setWaking] = useState(false);

  const inFlight = useRef(null);
  const hasLoadedOnce = useRef(false);

  const clearPerms = useCallback(() => {
    setRole(null);
    setPermissions([]);
    setIsAdmin(false);
    setAuthenticated(false);
    sessionStorage.removeItem("username");
    sessionStorage.removeItem("isAuthenticated");
  }, []);

  const logout = useCallback(async () => {
    try {
      await fetchWithTimeout(`${API}/api/logout`, {
        method: "POST",
        credentials: "include",
      });
    } catch (e) {
      console.warn("[Permissions] logout request failed:", e);
    } finally {
      lock();
      cacheClear().catch(() => {});
      clearPerms();
      sessionStorage.clear();
    }
  }, [clearPerms]);

  const refresh = useCallback(() => {
    if (inFlight.current) return inFlight.current;

    const run = async () => {
      const firstLoad = !hasLoadedOnce.current;
      if (firstLoad) setLoading(true);
      setError(null);

      let wakingTimer = null;
      if (firstLoad) wakingTimer = setTimeout(() => setWaking(true), 2000);

      try {
        const res = await fetchWithTimeout(`${API}/api/session`, {
          credentials: "include",
          headers: { "Cache-Control": "no-cache", "Pragma": "no-cache" },
        });

        if (res.status === 401) {
          clearPerms();
          return;
        }

        if (!res.ok) {
          console.warn("[Permissions] /api/session returned status", res.status);
          setError(`Server returned ${res.status}`);
          if (firstLoad) clearPerms();
          return;
        }

        const data = await res.json();

        if (data.authenticated || data.user) {
          const userObj = data.user || {};

          const userAdmin =
            Boolean(userObj.is_admin || data.is_admin) ||
            (userObj.role && userObj.role.toLowerCase().includes("admin")) ||
            (data.role && data.role.toLowerCase().includes("admin"));

          const perms = [
            ...(Array.isArray(userObj.permissions)
              ? userObj.permissions
              : Array.isArray(data.permissions)
                ? data.permissions
                : []),
          ];

          if (!perms.includes("dashboard")) perms.push("dashboard");

          setRole(userObj.role || data.role || (userAdmin ? "Administrator" : "User"));
          setPermissions(perms);
          setIsAdmin(userAdmin);
          setAuthenticated(true);

          if (data.username) sessionStorage.setItem("username", data.username);
          sessionStorage.setItem("isAuthenticated", "true");
        } else {
          clearPerms();
        }
      } catch (e) {
        if (e.name === "AbortError") {
          console.error("[Permissions] /api/session timed out after", FETCH_TIMEOUT_MS, "ms");
          setError("Request timed out.");
        } else {
          console.error("[Permissions] /api/session failed:", e);
          setError("Could not reach the server.");
        }
        if (firstLoad) clearPerms();
      } finally {
        hasLoadedOnce.current = true;
        if (wakingTimer) clearTimeout(wakingTimer);
        setWaking(false);
        if (firstLoad) setLoading(false);
      }
    };

    inFlight.current = run().finally(() => {
      inFlight.current = null;
    });
    return inFlight.current;
  }, [clearPerms]);

  // Initial session check inig mount. Kung wala ni, "Loading..." dili gyud matapos.
  useEffect(() => {
    refresh();
  }, [refresh]);

  // Back/forward gikan sa bfcache: ayaw pagsaligi sa daan nga state, i-verify sa server
  useEffect(() => {
    const onPageShow = (e) => {
      if (!e.persisted) return;        // true ra kung gikan sa bfcache
      if (!navigator.onLine) return;   // offline mode: ayaw i-kick out
      hasLoadedOnce.current = false;   // treat as first load: LoadingScreen + clearPerms kung expired na ang session
      refresh();
    };
    
    window.addEventListener("pageshow", onPageShow);
    return () => window.removeEventListener("pageshow", onPageShow);
  }, [refresh]);

  useEffect(() => {
    if (!authenticated) return;

    const sendOfflineBeacon = () => {
      try {
        navigator.sendBeacon(`${API}/api/logout-beacon`);
      } catch (e) {
        console.warn("[Permissions] sendBeacon failed:", e);
      }
    };

    window.addEventListener("pagehide", sendOfflineBeacon);
    return () => {
      window.removeEventListener("pagehide", sendOfflineBeacon);
    };
  }, [authenticated]);

  const hasAccess = useCallback(
    (mod) => {
      if (isAdmin) return true;
      if (Array.isArray(permissions) && permissions.includes("*")) return true;
      if (mod === "dashboard" && authenticated) return true;
      return Array.isArray(permissions) && permissions.includes(mod);
    },
    [permissions, isAdmin, authenticated]
  );

  const value = useMemo(() => ({
    role,
    permissions,
    is_admin: isAdmin,
    can_manage_personnel: isAdmin,
    loading,
    waking,
    error,
    hasAccess,
    refresh,
    clearPerms,
    logout,
  }), [role, permissions, isAdmin, loading, waking, error, hasAccess, refresh, clearPerms, logout]);

  return (
    <PermissionContext.Provider value={value}>
      {children}
    </PermissionContext.Provider>
  );
}

export function usePermissions() {
  return useContext(PermissionContext);
}