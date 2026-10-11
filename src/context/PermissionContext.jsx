import { createContext, useContext, useEffect, useMemo, useState, useCallback, useRef } from "react";
<<<<<<< HEAD
import { lock } from "../offline/offlineAuth";
import { cacheClear } from "../offline/cache";

// Relative by default. Only set VITE_API_BASE_URL if your backend truly
// lives on a different origin — leave it unset for local/LAN/devtunnel dev.
const API = import.meta.env.VITE_API_BASE_URL || "";
=======
import { getAllowedEntities, setSyncScope } from "../offline/syncScope";

// Relative by default. Only set VITE_API_BASE_URL if your backend truly
// lives on a different origin. Leave it unset for local/LAN/devtunnel dev
// so requests go through the Vite proxy on the same origin.
const API = import.meta.env.VITE_API_BASE_URL || "";

// Free-tier backends (e.g. Render) can take 50-90+ seconds to wake up
// after idling. 45s covers a cold start; a warm server responds quickly.
>>>>>>> 0550160 (Asdasd)
const FETCH_TIMEOUT_MS = 45000;

// ── Offline support ─────────────────────────────────────────────────────────
// Last known good session, kept on this device. The server cookie still
// decides real access; this only keeps the UI usable while the server cannot
// be reached. Nothing secret is stored (no password, no token).
const SESSION_CACHE_KEY = "cr_session_cache_v1";
const OFFLINE_GRACE_DAYS = 7;

function readSessionCache() {
  try {
    const raw = localStorage.getItem(SESSION_CACHE_KEY);
    if (!raw) return null;
    const c = JSON.parse(raw);
    if (Date.now() - (c.savedAt || 0) > OFFLINE_GRACE_DAYS * 86400000) {
      localStorage.removeItem(SESSION_CACHE_KEY);
      return null;
    }
    return c;
  } catch {
    return null;
  }
}

function writeSessionCache(c) {
  try {
    localStorage.setItem(SESSION_CACHE_KEY, JSON.stringify({ ...c, savedAt: Date.now() }));
  } catch {
    /* storage full or blocked */
  }
}

function clearSessionCache() {
  try {
    localStorage.removeItem(SESSION_CACHE_KEY);
  } catch {
    /* ignore */
  }
}

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

<<<<<<< HEAD
  // BUG FIX: distinguishes "still waking up the free-tier backend" from
  // ordinary loading, purely so the UI can tell the user why it's taking a while.
=======
  // True while the free-tier backend is waking up, so the UI can say why
  // it is slow instead of looking stuck.
>>>>>>> 0550160 (Asdasd)
  const [waking, setWaking] = useState(false);

  const inFlight = useRef(null);
  const hasLoadedOnce = useRef(false);

  const clearPerms = useCallback(() => {
    setRole(null);
    setPermissions([]);
    setIsAdmin(false);
    setAuthenticated(false);
    setSyncScope(new Set()); // logged out: nothing may sync
    clearSessionCache();
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

  // Used only when the server cannot be reached. Returns true if a saved
  // session was restored.
  const restoreFromCache = useCallback(() => {
    const c = readSessionCache();
    if (!c) return false;
    const cachedPerms = Array.isArray(c.permissions) ? c.permissions : [];
    setRole(c.role);
    setPermissions(cachedPerms);
    setIsAdmin(Boolean(c.isAdmin));
    setSyncScope(getAllowedEntities(cachedPerms, Boolean(c.isAdmin)));
    setAuthenticated(true);
    if (c.username) sessionStorage.setItem("username", c.username);
    sessionStorage.setItem("isAuthenticated", "true");
    return true;
  }, []);

  const refresh = useCallback(() => {
    if (inFlight.current) return inFlight.current;

    const run = async () => {
      const firstLoad = !hasLoadedOnce.current;
      if (firstLoad) setLoading(true);
      setError(null);

      let wakingTimer = null;
      if (firstLoad) wakingTimer = setTimeout(() => setWaking(true), 2000);

      try {
        // Browser already knows it is offline: skip the network wait.
        if (!navigator.onLine && restoreFromCache()) {
          setError(null);
          return;
        }

        const res = await fetchWithTimeout(`${API}/api/session`, {
          credentials: "include",
          headers: { "Cache-Control": "no-cache", "Pragma": "no-cache" },
        });

        // A real 401 means the session expired: log out and forget the cache.
        if (res.status === 401) {
          clearPerms();
          return;
        }

        if (!res.ok) {
          console.warn("[Permissions] /api/session returned status", res.status);
          setError(`Server returned ${res.status}`);
          if (firstLoad && !restoreFromCache()) clearPerms();
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

          const resolvedRole =
            userObj.role || data.role || (userAdmin ? "Administrator" : "User");

          // Scope the offline sync to this login's permissions BEFORE the
          // UI renders, so nothing outside the user's modules is ever sent.
          setSyncScope(getAllowedEntities(perms, userAdmin));

          setRole(resolvedRole);
          setPermissions(perms);
          setIsAdmin(userAdmin);
          setAuthenticated(true);

          // Remember this session for offline reloads.
          writeSessionCache({
            role: resolvedRole,
            permissions: perms,
            isAdmin: userAdmin,
            username: userObj.username || data.username || sessionStorage.getItem("username") || null,
          });

          const uname = userObj.username || data.username;
          if (uname) sessionStorage.setItem("username", uname);
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
        // Server unreachable: keep the user in with the saved session if we
        // have one, otherwise treat as logged out.
        if (firstLoad && !restoreFromCache()) clearPerms();
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
  }, [clearPerms, restoreFromCache]);

  // Initial session check inig mount. Kung wala ni, "Loading..." dili gyud matapos.
  useEffect(() => {
    refresh();
  }, [refresh]);

<<<<<<< HEAD
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
=======
  // Back online: confirm with the server. A 401 here means the session
  // really expired, so the user is sent to login.
  useEffect(() => {
    const onOnline = () => { refresh(); };
    window.addEventListener("online", onOnline);
    return () => window.removeEventListener("online", onOnline);
>>>>>>> 0550160 (Asdasd)
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