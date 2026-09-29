import { Navigate } from "react-router-dom";
import { usePermissions } from "../context/PermissionContext";
import LoadingScreen from "./LoadingScreen";

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