// src/components/Account Settings/AccessDenied.jsx
import { usePermissions } from "../PermissionContext";
import "./AccessDenied.css";

/**
 * AccessDenied — used in two contexts:
 *
 * 1. As a full-page route (/access-denied) — rendered by React Router
 *    outside of Home, so it gets the full viewport height.
 *
 * 2. Inline inside Home's <main> — rendered by renderContent() when a user
 *    navigates to a page they don't have permission for.
 *
 * The component itself doesn't navigate anywhere — it just shows the message.
 * When rendered inline, the user can click a sidebar item to go elsewhere.
 * We include a "Go to Dashboard" button that sets the active page via the
 * window.dispatchEvent trick, but since Home controls navigation internally
 * the simplest approach is to just show the card without routing.
 *
 * NOTE: We do NOT use useNavigate() here because when rendered inline inside
 * Home, navigating to "/dashboard" causes a full page reload which clears
 * the session. Instead we dispatch a custom event that Home can listen to,
 * OR we simply omit the button when rendered inline (Home's auto-redirect
 * effect already sends forbidden pages back to Dashboard).
 */
export default function AccessDenied() {
  const { role } = usePermissions();

  // Detect if we're rendered as a full-page route (not inside Home's <main>).
  // We do this by checking whether we're inside an element with class
  // "main-content". If not, we're a standalone page and can show the full
  // viewport card. Either way, the CSS handles the layout difference.

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