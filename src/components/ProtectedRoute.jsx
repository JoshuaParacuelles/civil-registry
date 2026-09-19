import { Navigate } from "react-router-dom";
import { usePermissions } from "./PermissionContext";

const LoadingScreen = ({ waking }) => (
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
    {/* BUG FIX: without this, a cold-start wait (50-90s+ on a free-tier
        backend) just looks like a frozen spinner, and users assume the
        app is broken. Naming what's actually happening (and that it can
        take up to a minute) sets the right expectation instead. */}
    <p style={{ margin: 0 }}>
      {waking ? "Waking up the server, this can take up to a minute…" : "Loading..."}
    </p>
    <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
  </div>
);

export default function ProtectedRoute({ module, adminOnly = false, children }) {
  const { hasAccess, is_admin, loading, waking } = usePermissions();

  // 1. Show loading screen while context is fetching /api/session
  if (loading) return <LoadingScreen waking={waking} />;

  // hasAccess("dashboard") comes entirely from PermissionContext, which is
  // only ever set from a successful /api/session response. It is true if
  // and only if the server currently considers this session authenticated.
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