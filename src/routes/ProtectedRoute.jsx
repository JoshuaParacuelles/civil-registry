import { Navigate } from "react-router-dom";
import { usePermissions } from "../context/PermissionContext";
import LoadingScreen from "./LoadingScreen";
import useHeartbeat from "../hooks/useHeartbeat";


useHeartbeat(isAuthenticated);

export default function ProtectedRoute({ module, adminOnly = false, children }) {
  const { hasAccess, is_admin, loading, waking } = usePermissions();

  // 1. Launch-time session check only. After login, loading is already false,
  //    so this screen is not shown again.
  if (loading) return <LoadingScreen waking={waking} />;

  // 2. hasAccess("dashboard") is true only when the server confirmed this
  //    session is logged in.
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