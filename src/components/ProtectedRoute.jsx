import { Navigate } from "react-router-dom";
import { usePermissions } from "./PermissionContext";

const LoadingScreen = () => (
  <div style={{
    display: "flex", flexDirection: "column",
    alignItems: "center", justifyContent: "center",
    height: "100vh", gap: "12px", color: "#888",
  }}>
    <div style={{
      width: "32px", height: "32px",
      border: "3px solid #e5e7eb",
      borderTop: "3px solid #6366f1",
      borderRadius: "50%",
      animation: "spin 0.8s linear infinite",
    }} />
    <p style={{ margin: 0 }}>Loading...</p>
    <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
  </div>
);

export default function ProtectedRoute({ module, adminOnly = false, children }) {
  const { hasAccess, is_admin, loading } = usePermissions();

  // 1. Show loading screen while context is fetching /api/session
  if (loading) return <LoadingScreen />;

  // BUG FIX: "name/role suddenly change to Admin/Administrator after
  // refreshing" — this used to also allow through anyone with a stale
  // sessionStorage "isAuthenticated" flag:
  //
  //   const isAuth = sessionStorage.getItem("isAuthenticated") === "true";
  //   if (!isAuth && !hasAccess("dashboard")) { ...redirect... }
  //
  // That flag is a leftover local value — it isn't guaranteed to be
  // cleared or refreshed in lockstep with the real, server-verified
  // session. If the backend session ever became invalid behind the
  // scenes (e.g. the Flask dev server restarting while you edit code,
  // which invalidates the session cookie) while the OLD "true" value was
  // still sitting in sessionStorage from before, that stale flag alone
  // was enough to stop this guard from redirecting to login. The route
  // would then keep rendering with PermissionContext's just-reset
  // defaults instead of a real identity, which is how the sidebar ended
  // up showing the fallback "Admin" name and "Administrator"-style admin
  // state instead of the actual current user.
  //
  // `hasAccess("dashboard")` already comes entirely from PermissionContext,
  // which itself is only ever set from a successful /api/session response
  // (see PermissionContext.jsx). It is true if and only if the server
  // currently considers this session authenticated, so it's the only
  // signal this guard needs — no local sessionStorage flag required.
  if (!hasAccess("dashboard")) {
    return <Navigate to="/" replace />;
  }

  // 3. Admin-only route guard
  if (adminOnly && !is_admin) {
    return <Navigate to="/access-denied" replace />;
  }

  // 4. Module permission guard
  if (module && !hasAccess(module)) {
    return <Navigate to="/access-denied" replace />;
  }

  return children;
}