import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import { usePermissions } from "../../context/PermissionContext";
import "./AccessDenied.css";

// Same base URL as the rest of the app. Empty in dev (Vite proxy),
// the Render URL in the Electron build.
const API = import.meta.env.VITE_API_BASE_URL || "";

/**
 * AccessDenied: used in two contexts.
 *
 * 1. As a full-page route (/access-denied), rendered by React Router
 *    outside of Home, so it gets the full viewport height.
 *
 * 2. Inline inside Home's <main>, rendered by renderContent() when a user
 *    navigates to a page they don't have permission for.
 *
 * The component doesn't navigate. It shows the message and records the
 * denial. When rendered inline, Home's auto-redirect effect sends the user
 * back to the Dashboard, so no button is needed here.
 */
export default function AccessDenied() {
  const { role } = usePermissions();
  const location = useLocation();

  useEffect(() => {
    fetch(`${API}/api/audit/access-denied`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ route: location.pathname }),
    }).catch((error) => {
      console.warn("Could not record access-denied event:", error);
    });
  }, [location.pathname]);

  return (
    <div className="ad-wrap">
      <div className="ad-card">
        <div className="ad-icon">🚫</div>
        <h1 className="ad-title">Access Denied</h1>
        <p className="ad-msg">
          Your role <strong>{role ?? "Unknown"}</strong> does not have permission
          to view this page.
        </p>
        <p className="ad-sub">
          Contact your administrator if you believe this is a mistake.
        </p>
      </div>
    </div>
  );
}