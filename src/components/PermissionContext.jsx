import { createContext, useContext, useEffect, useState, useCallback, useRef } from "react";

// Relative by default. Only set VITE_API_BASE_URL if your backend truly
// lives on a different origin (e.g. a separate deployed domain) — leave it
// unset for local/LAN/devtunnel dev so requests go through the Vite proxy
// on the same origin the page was loaded from.
const API = import.meta.env.VITE_API_BASE_URL || "";

// BUG FIX: cold-start timeout too short.
// This was 8000ms. Free-tier backends (e.g. Render) that spin down after
// inactivity can take 50-90+ seconds to wake up on the first request after
// idling. An 8s timeout meant that first /api/session call reliably
// aborted mid-wake-up, was treated as "not logged in", and bounced the
// user straight back to the login page even though login itself had just
// succeeded. 45s comfortably covers a cold start; a warm server still
// responds in well under a second either way, so this costs nothing in
// the common case.
const FETCH_TIMEOUT_MS = 45000;

const PermissionContext = createContext({
  role:                 null,
  permissions:          [],
  is_admin:             false,
  can_manage_personnel: false,
  loading:              true,
  error:                null,
  hasAccess:            () => false,
  refresh:              async () => {},
  clearPerms:           () => {},
  logout:               async () => {},
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
  // ordinary loading, purely so the UI (ProtectedRoute's LoadingScreen)
  // can tell the user *why* it's taking a while instead of looking stuck
  // or silently kicking them back to login after a long wait.
  const [waking, setWaking] = useState(false);

  // Tracks whether this is the very first /api/session call since the
  // page loaded. Only that first call is likely to hit a cold backend;
  // subsequent refreshes (tab focus, manual retry, etc.) hit an already-
  // warm server and don't need the "waking up" messaging.
  const isFirstRefresh = useRef(true);

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
      clearPerms();
      sessionStorage.clear();
    }
  }, [clearPerms]);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);

    const firstAttempt = isFirstRefresh.current;
    isFirstRefresh.current = false;

    // Only show "waking up" messaging on the first load, and only after
    // a couple seconds — a warm server responds almost instantly, so this
    // avoids flashing the message on every normal page load.
    let wakingTimer = null;
    if (firstAttempt) {
      wakingTimer = setTimeout(() => setWaking(true), 2000);
    }

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
        clearPerms();
        return;
      }

      const data = await res.json();

      if (data.authenticated || data.user) {
        const userObj = data.user || {};

        const userAdmin =
          Boolean(userObj.is_admin || data.is_admin) ||
          (userObj.role && userObj.role.toLowerCase().includes("admin")) ||
          (data.role && data.role.toLowerCase().includes("admin"));

        const perms = Array.isArray(userObj.permissions)
          ? userObj.permissions
          : Array.isArray(data.permissions)
            ? data.permissions
            : [];

        if (!perms.includes("dashboard")) {
          perms.push("dashboard");
        }

        setRole(userObj.role || data.role || (userAdmin ? "Administrator" : "User"));
        setPermissions(perms);
        setIsAdmin(userAdmin);
        setAuthenticated(true);

        if (data.username) {
          sessionStorage.setItem("username", data.username);
        }
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
      clearPerms();
    } finally {
      if (wakingTimer) clearTimeout(wakingTimer);
      setWaking(false);
      setLoading(false);
    }
  }, [clearPerms]);

  useEffect(() => {
    refresh();
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

  const canManagePersonnel = isAdmin;

  return (
    <PermissionContext.Provider value={{
      role,
      permissions,
      is_admin: isAdmin,
      can_manage_personnel: canManagePersonnel,
      loading,
      waking,
      error,
      hasAccess,
      refresh,
      clearPerms,
      logout,
    }}>
      {children}
    </PermissionContext.Provider>
  );
}

export function usePermissions() {
  return useContext(PermissionContext);
}