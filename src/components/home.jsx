import React, { useEffect, useState, useCallback } from "react";
import ChangePassword from "./Account Settings/ChangePassword";
import AuditLogs from "./Account Settings/Auditlogs";
import RoleManagement from "./Account Settings/RoleManagement";
import AccessDenied from "./Account Settings/AccessDenied";

import UnifiedBirthRegistry from "./Vital Records Management/birth/Birthverifier";
import UnifiedMarriageRegistry from "./Vital Records Management/marriage/Marriageverifier";
import DeathVerifier from "./Vital Records Management/death/Deathverifier";
import PaymentInventory from "./dashboard/dashboard";
import Heatmaps from "./Heatmaps/Heatmaps";
import ExternalIndividualsLookup from "./External Individuals/ExternalIndividualsLookup";
import DocumentTracking from "./document tracking/document_tracking";

import { usePermissions } from "./PermissionContext";

import logoImg       from "../assets/sidebar-icon/scc.png";
import dashboardIcon from "../assets/sidebar-icon/dashboard.png";
import vitalIcon     from "../assets/sidebar-icon/vital.png";
import heatmapsIcon  from "../assets/sidebar-icon/heatmap.png";
import trackingIcon  from "../assets/sidebar-icon/tracking.png";
import accountIcon   from "../assets/sidebar-icon/account.png";
import logoutIcon    from "../assets/sidebar-icon/logout.png";

import "./home.css";

const MENU_KEYS = {
  DASHBOARD:         "Dashboard",
  VITAL:             "Vital Records Management",
  HEATMAPS:          "Heatmaps",
  DOCUMENT_TRACKING: "Document Tracking",
  SETTINGS:          "System Settings",
  BIRTH:             "Birth Verifier",
  MARRIAGE:          "Marriage Verifier",
  DEATH:             "Death Verifier",
  SCIMS:             "SCIMS Lookup",
  ACCOUNT:           "Update Account",
  AUDIT:             "Audit Logs",
  ROLE_MANAGEMENT:   "Role Management",
};

const VITAL_CHILDREN    = [MENU_KEYS.BIRTH, MENU_KEYS.MARRIAGE, MENU_KEYS.DEATH, MENU_KEYS.SCIMS];
const SETTINGS_CHILDREN = [MENU_KEYS.ACCOUNT, MENU_KEYS.AUDIT, MENU_KEYS.ROLE_MANAGEMENT];

const BP_TABLET_MAX = 1024;
const BP_MOBILE_MAX = 767;

// FIX: A session flag used to tell "this is a fresh login" apart from
// "this is a refresh within the same still-logged-in session". We only
// want submenu-open state to survive a same-session refresh, never to
// leak in from a previous login.
const SESSION_FLAG_KEY = "homeSessionActive";

const getViewport = () => {
  const w = window.innerWidth;
  if (w <= BP_MOBILE_MAX) return "mobile";
  if (w <= BP_TABLET_MAX) return "tablet";
  return "desktop";
};

const toTitleCase = (str = "") => str.replace(/\b\w/g, (c) => c.toUpperCase());

const getStoredUsername = () => {
  try { return sessionStorage.getItem("username") || ""; }
  catch { return ""; }
};

// FIX: Reads a submenu's persisted open/closed state, but only if we're
// still inside the same session that set it. If this is a fresh login
// (no active session flag yet), it always returns false, so the sidebar
// never opens up a submenu the user never touched this session.
const getPersistedSubmenuState = (key) => {
  try {
    const sameSession = sessionStorage.getItem(SESSION_FLAG_KEY) === "true";
    return sameSession && localStorage.getItem(key) === "true";
  } catch {
    return false;
  }
};

/* ── Topbar date/time formatting ──────────────────────────────
   Kept as plain helpers (not component-scoped) so they don't get
   recreated on every render; they just take the current Date. ── */
const formatTopbarDate = (d) =>
  d.toLocaleDateString("en-PH", { weekday: "short", month: "short", day: "numeric", year: "numeric" });

/* ── Small inline icons (no extra asset files needed) ── */
const CalendarIcon = () => (
  <svg className="topbar-datetime-icon" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <rect x="3" y="5" width="18" height="16" rx="3" stroke="currentColor" strokeWidth="1.6" />
    <path d="M3 9.5H21" stroke="currentColor" strokeWidth="1.6" />
    <path d="M8 3V6.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    <path d="M16 3V6.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
  </svg>
);

const Home = () => {
  // FIX: `loading` is now consumed here too. We use it to avoid making
  // any permission-based rendering decision (sidebar items, AccessDenied)
  // before PermissionContext has actually finished asking the server
  // what this user is allowed to see.
  const { hasAccess, is_admin, loading, logout } = usePermissions();
  const username = getStoredUsername();

  // FIX: isAdminUser now comes EXCLUSIVELY from the PermissionContext's
  // `is_admin`, which itself is derived only from the server/Role
  // Management (see PermissionContext.jsx). This used to also treat a
  // sessionStorage username of "admin" (or a role string that merely
  // *contained* the word "admin") as automatic admin access. Those were
  // stale, locally-cached signals that don't necessarily reflect the
  // account's *current* role — that mismatch is exactly what let a
  // refreshed session end up with unauthorized "access to everything",
  // and, conversely, could leave a real Administrator's own isAdminUser
  // flag out of sync with what PermissionContext already knew to be
  // true. `is_admin` is the single source of truth; there is no need to
  // (and no safe way to) re-derive it from local strings.
  const isAdminUser = is_admin;

  const canAccess = useCallback(
    (mod) => {
      if (isAdminUser) return true;
      try { return !!hasAccess(mod); }
      catch (err) { return false; }
    },
    [isAdminUser, hasAccess]
  );

  const [activeSubMenu, setActiveSubMenu] = useState(MENU_KEYS.DASHBOARD);

  // FIX: Submenus now always start collapsed on a fresh login. They only
  // stay open across a same-session page refresh (see getPersistedSubmenuState).
  const [settingsOpen, setSettingsOpen] = useState(() =>
    getPersistedSubmenuState("settingsOpen")
  );

  const [vitalRecordsOpen, setVitalRecordsOpen] = useState(() =>
    getPersistedSubmenuState("vitalRecordsOpen")
  );

  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [viewport, setViewport] = useState(getViewport);

  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    try { return localStorage.getItem("sidebarCollapsed") === "true"; }
    catch { return false; }
  });

  const [tabletExpanded, setTabletExpanded] = useState(false);
  const [showLogoutModal, setShowLogoutModal] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);

  // Live clock/calendar shown in the topbar. Ticks every second; cleaned
  // up on unmount so it doesn't keep a timer running after Home unmounts.
  const [now, setNow] = useState(() => new Date());

  const vitalIsActive    = VITAL_CHILDREN.includes(activeSubMenu);
  const settingsIsActive = SETTINGS_CHILDREN.includes(activeSubMenu);

  const visibleVitalChildren = isAdminUser
    ? VITAL_CHILDREN
    : [
        ...(canAccess("birth_verification")    ? [MENU_KEYS.BIRTH]    : []),
        ...(canAccess("marriage_verification") ? [MENU_KEYS.MARRIAGE] : []),
        ...(canAccess("death_verification")    ? [MENU_KEYS.DEATH]    : []),
        ...(canAccess("scims_lookup")          ? [MENU_KEYS.SCIMS]    : []),
      ];

  // FIX: Mark this browser tab's session as "active" the moment Home
  // mounts (i.e. right after a successful login). This flag lives in
  // sessionStorage, so it naturally disappears when the tab is closed,
  // and we also clear it explicitly on logout below — either way, the
  // next login starts clean and the submenu-open localStorage values
  // are ignored until this flag is set again.
  useEffect(() => {
    try { sessionStorage.setItem(SESSION_FLAG_KEY, "true"); } catch {}
  }, []);

  useEffect(() => {
    const handleResize = () => {
      const vp = getViewport();
      setViewport(vp);
      if (vp !== "mobile") setMobileMenuOpen(false);
      if (vp !== "tablet") setTabletExpanded(false);
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  useEffect(() => {
    const tick = setInterval(() => setNow(new Date()), 60000);
    return () => clearInterval(tick);
  }, []);

  // Lock body scroll while the mobile drawer is open so the page behind
  // it doesn't scroll along with it.
  useEffect(() => {
    if (viewport === "mobile" && mobileMenuOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => { document.body.style.overflow = ""; };
  }, [viewport, mobileMenuOpen]);

  const toggleSidebar = useCallback(() => {
    if (viewport === "mobile") {
      setMobileMenuOpen((p) => !p);
    } else if (viewport === "tablet") {
      setTabletExpanded((p) => !p);
    } else {
      setSidebarCollapsed((p) => {
        const next = !p;
        localStorage.setItem("sidebarCollapsed", String(next));
        return next;
      });
    }
  }, [viewport]);

  const closeMobileMenu = useCallback(() => {
    if (viewport === "mobile") setMobileMenuOpen(false);
  }, [viewport]);

  const handleMenuClick = (menu) => {
    if (menu === MENU_KEYS.VITAL) {
      setVitalRecordsOpen((prev) => {
        const next = !prev;
        localStorage.setItem("vitalRecordsOpen", String(next));
        return next;
      });
      return;
    }
    if (menu === MENU_KEYS.SETTINGS) {
      setSettingsOpen((prev) => {
        const next = !prev;
        localStorage.setItem("settingsOpen", String(next));
        return next;
      });
      return;
    }
    setActiveSubMenu(menu);
    closeMobileMenu();
  };

  const handleSubMenuClick = (submenu, parent) => {
    setActiveSubMenu(submenu);
    if (parent === MENU_KEYS.VITAL) {
      setVitalRecordsOpen(true);
      localStorage.setItem("vitalRecordsOpen", "true");
    }
    if (parent === MENU_KEYS.SETTINGS) {
      setSettingsOpen(true);
      localStorage.setItem("settingsOpen", "true");
    }
    closeMobileMenu();
  };

  // ─────────────────────────────────────────────
  // BUG FIX: "Joshua still shows Active after logout"
  // ─────────────────────────────────────────────
  // Previously this just did `await logout(); ...; window.location.replace("/")`.
  // `logout()` (from PermissionContext) is what actually calls the
  // credentialed POST /api/logout that flips the account's `is_online`
  // flag to false server-side. But if that call ever threw — a dropped
  // connection, a momentary backend hiccup, or the request simply not
  // resolving in time — the missing try/catch meant execution still fell
  // straight through to `window.location.replace("/")`. Navigating away
  // immediately cancels any still-in-flight request in the browser, so
  // the server never got the chance to persist `is_online = false`,
  // leaving the account stuck showing "Active" in Role Management
  // indefinitely (until some unrelated action happened to reset it).
  //
  // Now: if the context's logout() throws, we retry once with a direct,
  // credentialed call to /api/logout ourselves and wait for it to settle
  // before doing any local cleanup or navigating away. This guarantees
  // the server-side "Not Active" update is given a real chance to commit
  // before the tab leaves the page, without changing any other logout
  // behavior (confirmation modal, storage cleanup, redirect target).
  const handleConfirmLogout = async () => {
    setLoggingOut(true);
    try {
      await logout();
    } catch (err) {
      console.error("[Home] logout() failed, retrying direct /api/logout call:", err);
      try {
        await fetch("/api/logout", { method: "POST", credentials: "include" });
      } catch (fallbackErr) {
        console.error("[Home] Fallback /api/logout also failed:", fallbackErr);
      }
    }
    sessionStorage.clear();
    localStorage.removeItem("vitalRecordsOpen");
    localStorage.removeItem("settingsOpen");
    window.location.replace("/");
  };

  const showLabels =
    viewport === "mobile" ||
    (viewport === "tablet"  && tabletExpanded) ||
    (viewport === "desktop" && !sidebarCollapsed);

  const sidebarClasses = [
    "sidebar",
    viewport === "mobile"  && mobileMenuOpen  ? "mobile-open"     : "",
    viewport === "desktop" && sidebarCollapsed ? "collapsed"       : "",
    viewport === "tablet"  && tabletExpanded   ? "tablet-expanded" : "",
    viewport === "tablet"  && !tabletExpanded  ? "collapsed"       : "",
  ].filter(Boolean).join(" ");

  const containerClasses = [
    "dashboard-container",
    viewport === "desktop" && sidebarCollapsed  ? "sidebar-is-collapsed"       : "",
    viewport === "tablet"  && tabletExpanded    ? "sidebar-is-tablet-expanded" : "",
    viewport === "tablet"  && !tabletExpanded   ? "sidebar-is-collapsed"       : "",
  ].filter(Boolean).join(" ");

  const displayName = username ? toTitleCase(username) : "Admin";

  const renderContent = () => {
    // FIX: Don't evaluate canAccess()/render AccessDenied while
    // PermissionContext is still fetching the current permission set
    // (e.g. right after a login/refresh, before /api/session resolves).
    // At that moment is_admin/permissions are still at their initial
    // (empty/false) defaults, which previously could make a real
    // Administrator briefly see "Access Denied" on modules like Role
    // Management until the next render arrived with the real data. This
    // keeps the module in view sync with the actual, server-confirmed
    // permission state instead of a transient default one.
    if (loading) {
      return (
        <div className="module-loading-state" style={{ padding: "2rem", textAlign: "center", color: "#64748b" }}>
          Loading…
        </div>
      );
    }

    switch (activeSubMenu) {
      case MENU_KEYS.DASHBOARD:
        return <PaymentInventory />;

      case MENU_KEYS.HEATMAPS:
        return canAccess("heatmaps") ? <Heatmaps /> : <AccessDenied />;

      case MENU_KEYS.DOCUMENT_TRACKING:
        return canAccess("document_tracking") ? <DocumentTracking /> : <AccessDenied />;

      case MENU_KEYS.ACCOUNT:
        return <ChangePassword />;

      case MENU_KEYS.BIRTH:
        return canAccess("birth_verification") ? <UnifiedBirthRegistry /> : <AccessDenied />;

      case MENU_KEYS.MARRIAGE:
        return canAccess("marriage_verification") ? <UnifiedMarriageRegistry /> : <AccessDenied />;

      case MENU_KEYS.DEATH:
        return canAccess("death_verification") ? <DeathVerifier /> : <AccessDenied />;

      case MENU_KEYS.SCIMS:
        return canAccess("scims_lookup") ? <ExternalIndividualsLookup /> : <AccessDenied />;

      case MENU_KEYS.AUDIT:
        return canAccess("audit_logs") ? <AuditLogs /> : <AccessDenied />;

      case MENU_KEYS.ROLE_MANAGEMENT:
        return canAccess("role_management") ? <RoleManagement /> : <AccessDenied />;

      default:
        return <PaymentInventory />;
    }
  };

  return (
    <div className={containerClasses}>
      {/* ── Mobile hamburger toggle (fixed, only visible ≤767px via CSS) ── */}
      <button
        type="button"
        className={`mobile-menu-toggle${mobileMenuOpen ? " active" : ""}`}
        aria-label={mobileMenuOpen ? "Close menu" : "Open menu"}
        aria-expanded={mobileMenuOpen}
        aria-controls="main-sidebar"
        onClick={() => setMobileMenuOpen((p) => !p)}
      >
        <span />
        <span />
        <span />
      </button>

      {/* ── Overlay behind the mobile drawer; tap to close ── */}
      <div
        className={`mobile-overlay${mobileMenuOpen ? " active" : ""}`}
        onClick={closeMobileMenu}
        aria-hidden="true"
      />

      <aside id="main-sidebar" className={sidebarClasses} aria-label="Main navigation">
        <div className="sidebar-header">
          <img src={logoImg} alt="Local Civil Registry" className="logo-img" />
          <div className="sidebar-brand-text">
            <span className="sidebar-brand-title">Local Civil Registry</span>
            <span className="sidebar-brand-subtitle">San Carlos City</span>
          </div>
        </div>

        <div className="sidebar-body">
          <div className="sidebar-user">
            {showLabels && (
              <div className="sidebar-user-info">
                <span className="sidebar-user-name">{displayName}</span>
                <span className="sidebar-user-role">
                  {isAdminUser ? "Admin Panel" : "Active"}
                </span>
              </div>
            )}
          </div>

          <ul className="sidebar-menu" role="menu">
            {showLabels && <p className="sidebar-group-label">MAIN</p>}

            <li
              role="menuitem"
              className={activeSubMenu === MENU_KEYS.DASHBOARD ? "active" : ""}
              onClick={() => handleMenuClick(MENU_KEYS.DASHBOARD)}
            >
              <img src={dashboardIcon} alt="" className="menu-icon" />
              {showLabels && <span>Dashboard</span>}
            </li>

            <hr className="menu-separator" />

            {visibleVitalChildren.length > 0 && (
              <>
                {showLabels && <p className="sidebar-group-label">VERIFIERS</p>}

                <li
                  role="menuitem"
                  aria-expanded={vitalRecordsOpen}
                  className={`parent-only${vitalIsActive ? " active" : ""}`}
                  onClick={() => handleMenuClick(MENU_KEYS.VITAL)}
                >
                  <img src={vitalIcon} alt="" className="menu-icon" />
                  {showLabels && <span>Vital Records Management</span>}
                  {showLabels && (
                    <span className={`arrow${vitalRecordsOpen ? " down" : ""}`} />
                  )}
                </li>

                {showLabels && (
                  <ul className={`submenu ${vitalRecordsOpen ? "open" : ""}`} role="menu">
                    {canAccess("birth_verification") && (
                      <li
                        role="menuitem"
                        className={activeSubMenu === MENU_KEYS.BIRTH ? "active" : ""}
                        onClick={() => handleSubMenuClick(MENU_KEYS.BIRTH, MENU_KEYS.VITAL)}
                      >
                        Birth Verifier
                      </li>
                    )}
                    {canAccess("marriage_verification") && (
                      <li
                        role="menuitem"
                        className={activeSubMenu === MENU_KEYS.MARRIAGE ? "active" : ""}
                        onClick={() => handleSubMenuClick(MENU_KEYS.MARRIAGE, MENU_KEYS.VITAL)}
                      >
                        Marriage Verifier
                      </li>
                    )}
                    {canAccess("death_verification") && (
                      <li
                        role="menuitem"
                        className={activeSubMenu === MENU_KEYS.DEATH ? "active" : ""}
                        onClick={() => handleSubMenuClick(MENU_KEYS.DEATH, MENU_KEYS.VITAL)}
                      >
                        Death Verifier
                      </li>
                    )}
                    {canAccess("scims_lookup") && (
                      <li
                        role="menuitem"
                        className={activeSubMenu === MENU_KEYS.SCIMS ? "active" : ""}
                        onClick={() => handleSubMenuClick(MENU_KEYS.SCIMS, MENU_KEYS.VITAL)}
                      >
                        SCIMS Lookup
                      </li>
                    )}
                  </ul>
                )}

                <hr className="menu-separator" />
              </>
            )}

            {canAccess("heatmaps") && (
              <>
                {showLabels && <p className="sidebar-group-label">HEATMAPS</p>}
                <li
                  role="menuitem"
                  className={activeSubMenu === MENU_KEYS.HEATMAPS ? "active" : ""}
                  onClick={() => handleMenuClick(MENU_KEYS.HEATMAPS)}
                >
                  <img src={heatmapsIcon} alt="" className="menu-icon" />
                  {showLabels && <span>Heatmaps</span>}
                </li>
                <hr className="menu-separator" />
              </>
            )}

            {canAccess("document_tracking") && (
              <>
                {showLabels && <p className="sidebar-group-label">DOCUMENT TRACKING</p>}
                <li
                  role="menuitem"
                  className={activeSubMenu === MENU_KEYS.DOCUMENT_TRACKING ? "active" : ""}
                  onClick={() => handleMenuClick(MENU_KEYS.DOCUMENT_TRACKING)}
                >
                  <img src={trackingIcon} alt="" className="menu-icon" />
                  {showLabels && <span>Document Tracking</span>}
                </li>
                <hr className="menu-separator" />
              </>
            )}

            {showLabels && <p className="sidebar-group-label">ADMINISTRATION</p>}

            <li
              role="menuitem"
              aria-expanded={settingsOpen}
              className={`parent-only${settingsIsActive ? " active" : ""}`}
              onClick={() => handleMenuClick(MENU_KEYS.SETTINGS)}
            >
              <img src={accountIcon} alt="" className="menu-icon" />
              {showLabels && <span>System Settings</span>}
              {showLabels && (
                <span className={`arrow${settingsOpen ? " down" : ""}`} />
              )}
            </li>

            {showLabels && (
              <ul className={`submenu ${settingsOpen ? "open" : ""}`} role="menu">
                <li
                  role="menuitem"
                  className={activeSubMenu === MENU_KEYS.ACCOUNT ? "active" : ""}
                  onClick={() => handleSubMenuClick(MENU_KEYS.ACCOUNT, MENU_KEYS.SETTINGS)}
                >
                  Update Account
                </li>
                {canAccess("audit_logs") && (
                  <li
                    role="menuitem"
                    className={activeSubMenu === MENU_KEYS.AUDIT ? "active" : ""}
                    onClick={() => handleSubMenuClick(MENU_KEYS.AUDIT, MENU_KEYS.SETTINGS)}
                  >
                    Audit Logs
                  </li>
                )}
                {canAccess("role_management") && (
                  <li
                    role="menuitem"
                    className={activeSubMenu === MENU_KEYS.ROLE_MANAGEMENT ? "active" : ""}
                    onClick={() => handleSubMenuClick(MENU_KEYS.ROLE_MANAGEMENT, MENU_KEYS.SETTINGS)}
                  >
                    Role Management
                  </li>
                )}
              </ul>
            )}
          </ul>

          <div className="sidebar-footer">
            <button
              className="footer-item"
              onClick={() => setShowLogoutModal(true)}
              type="button"
            >
              <img src={logoutIcon} alt="" className="menu-icon" />
              {showLabels && <span>Logout</span>}
            </button>
          </div>
        </div>
      </aside>

      <div className="main-content-wrapper">
        <header className="topbar">
          <div className="topbar-left">
            <button className="topbar-toggle" onClick={toggleSidebar} type="button">
              <span className="topbar-toggle-icon">☰</span>
            </button>

            <span className="topbar-breadcrumb-current">{activeSubMenu}</span>
          </div>

          {/* Moved to the right side of the topbar */}
          <div className="topbar-right">
            <div className="topbar-datetime" aria-label="Current date">
              <span className="topbar-datetime-item">
                <CalendarIcon />
                <span>{formatTopbarDate(now)}</span>
              </span>
            </div>
          </div>
        </header>

        <main className="main-content">
          {renderContent()}
        </main>
      </div>

      {showLogoutModal && (
        <div
          className="logout-modal-overlay"
          onClick={() => !loggingOut && setShowLogoutModal(false)}
        >
          <div className="logout-modal" onClick={(e) => e.stopPropagation()}>
            <h2>Confirm Logout</h2>
            <p>Are you sure you want to exit? You'll need to sign in again to continue.</p>
            <div className="logout-modal-actions">
              <button
                type="button"
                className="logout-cancel-btn"
                onClick={() => setShowLogoutModal(false)}
                disabled={loggingOut}
              >
                Cancel
              </button>
              <button
                type="button"
                className="logout-confirm-btn"
                onClick={handleConfirmLogout}
                disabled={loggingOut}
              >
                {loggingOut ? "Logging out…" : "Yes, Logout"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Home;