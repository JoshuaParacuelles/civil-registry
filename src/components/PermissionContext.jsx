import { createContext, useContext, useEffect, useState, useCallback } from "react";

// Relative by default. Only set VITE_API_BASE_URL if your backend truly
// lives on a different origin (e.g. a separate deployed domain) — leave it
// unset for local/LAN/devtunnel dev so requests go through the Vite proxy
// on the same origin the page was loaded from.
const API = import.meta.env.VITE_API_BASE_URL || "";
const FETCH_TIMEOUT_MS = 8000;

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

  // BUG FIX: this used to only reset React state, leaving stale
  // "username" / "isAuthenticated" values sitting in sessionStorage from
  // whoever last used the browser/tab (e.g. a shared front-desk
  // terminal). Other logic then read those stale keys as if they still
  // described the current user, which is how the sidebar could end up
  // showing the previous user's access ("suddenly gives access to all
  // modules") or missing a module the current user should have. Clearing
  // them here keeps sessionStorage from ever describing an unauthenticated
  // or logged-out session as authenticated.
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

        // BUG FIX: admin status is now decided ONLY by what Role
        // Management actually reports (userObj.is_admin / data.is_admin,
        // or a role string containing "admin"). The previous version
        // also force-granted admin the moment sessionStorage's cached
        // "username" happened to equal "admin" — a leftover value from a
        // past login that has nothing to do with what role that account
        // currently holds. That's what let full access to every module
        // appear "out of nowhere": it didn't come from Role Management
        // at all, it came from a stale string in sessionStorage.
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

        // Keep the display-only sessionStorage copy of the username in
        // sync with whoever the server says is actually logged in, so it
        // can't drift from (or bleed over from) a previous session on the
        // same browser.
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
      setLoading(false);
    }
  }, [clearPerms]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // ─────────────────────────────────────────────
  // BUG FIX: status stays "Active" after closing the browser (NEW)
  // ─────────────────────────────────────────────
  // Backend already has everything needed to fix this — /api/logout and
  // /api/logout-beacon both set is_online to False (see Rolemanagement.py)
  // — but nothing on the frontend ever called logout-beacon when the
  // browser/tab was actually closed. logout() only runs when the user
  // clicks a "Logout" button, so hitting the window's X button (or closing
  // the tab, or the OS killing the browser) left the last-known is_online
  // value sitting at True in the database forever, which is exactly the
  // "still shows Active" symptom in Role Management.
  //
  // A normal fetch() cannot be relied on here: the page is torn down
  // before an ordinary async request has a chance to complete. The
  // `pagehide` event is the reliable, cross-browser signal that a page is
  // being unloaded (tab/browser closing, or a real full-page navigation
  // away) — it does NOT fire for in-app client-side route changes, since
  // those never unload the page. Paired with navigator.sendBeacon(), the
  // request is guaranteed to be dispatched even as the page disappears.
  //
  // This only runs while `authenticated` is true, and only calls the
  // existing /api/logout-beacon endpoint — no new backend behavior, no
  // change to any other existing logic.
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
      // BUG FIX: access decisions now come entirely from the permission
      // state fetched from /api/session (i.e. from Role Management),
      // rather than from sessionStorage flags. The old checks —
      // `storedUsername === "admin"` and `sessionStorage.getItem
      // ("isAuthenticated") === "true"` — read raw strings that are set
      // once at login and never reconciled against the user's *current*
      // role. If Role Management changed what a user (or the "admin"
      // account) is allowed to see, or if sessionStorage still held a
      // previous user's values, the sidebar would show the wrong modules
      // without anything being wrong in Role Management itself.

      // Absolute Admin Override — sourced only from the live is_admin
      // flag from Role Management.
      if (isAdmin) return true;

      // Wildcard Permission Override — a role can be granted "*" in
      // Role Management to mean "all modules".
      if (Array.isArray(permissions) && permissions.includes("*")) return true;

      // Every signed-in user gets Dashboard...
      if (mod === "dashboard" && authenticated) return true;

      // ─── CREDENTIAL CATEGORY SEPARATION (FIX) ───────────────────────
      // Document Tracking used to be auto-granted to EVERY authenticated
      // user here, the same way Dashboard is — regardless of what their
      // actual role/permissions were:
      //
      //     if (mod === "document_tracking" && authenticated) return true;
      //
      // That's why a Vital Record Management-only credential (e.g. a
      // Birth/Death/Marriage Verifier, who holds no Document Tracking
      // role at all) could still open Document Tracking: this override
      // fired before the real per-module permission check ever ran.
      //
      // Document Tracking is no longer special-cased. It now falls
      // through to the same per-module check every other module uses
      // (the `permissions.includes(mod)` line at the bottom of this
      // function), so only accounts that actually hold a Document
      // Tracking stage role — whose permissions list includes
      // "document_tracking" (see BUILTIN_ROLE_PERMISSIONS in
      // Rolemanagement.py) — get access. Admins are unaffected: they
      // still see it via the `isAdmin` override above, unchanged.

      // Per-module check — this is what actually gates modules like
      // "Vital Records Management" AND now "Document Tracking": present
      // in `permissions` (from Role Management) or not shown at all.
      return Array.isArray(permissions) && permissions.includes(mod);
    },
    [permissions, isAdmin, authenticated]
  );

  // Document Tracking personnel management (adding a new full name to
  // the handler pool, reassigning who handles a given document) is
  // reserved for Administrators — regular/non-admin users can view and
  // act on documents assigned to them, but never add or reassign
  // personnel. Kept as its own explicitly named flag (rather than every
  // personnel-related check reaching for `is_admin` directly) so that
  // if Role Management ever introduces a narrower permission for this
  // (e.g. a "personnel_manager" permission string distinct from full
  // admin), only this one line needs to change — every place that
  // reads can_manage_personnel keeps working without being touched.
  const canManagePersonnel = isAdmin;

  return (
    <PermissionContext.Provider value={{
      role,
      permissions,
      is_admin: isAdmin,
      can_manage_personnel: canManagePersonnel,
      loading,
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