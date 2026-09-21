import React, { useEffect, useState, useCallback, useRef } from "react";
import ChangePassword from "./Account Settings/ChangePassword";
import AuditLogs from "./Account Settings/AuditLogs";
import RoleManagement from "./Account Settings/RoleManagement";
import AccessDenied from "./Account Settings/AccessDenied";

import UnifiedBirthRegistry from "./Vital Records Management/birth/Birthverifier";
import UnifiedMarriageRegistry from "./Vital Records Management/marriage/Marriageverifier";
import DeathVerifier from "./Vital Records Management/death/Deathverifier";
import PaymentInventory from "./dashboard/dashboard";
import Heatmaps from "./Heatmaps/Heatmaps";
import ExternalIndividualsLookup from "./External Individuals/Externalindividualslookup";
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

// A session flag used to tell "this is a fresh login" apart from
// "this is a refresh within the same still-logged-in session".
const SESSION_FLAG_KEY = "homeSessionActive";

/* ── Notifications: backend + behaviour ───────────────────────
   NOTIF_API_BASE points at the Flask request backend (request.py,
   port 5001), which serves:
     GET   /api/notifications
     GET   /api/notifications/unread-count
     PATCH /api/notifications/<id>/read
     PATCH /api/notifications/mark-all-read
   Override it with VITE_REQUEST_API_URL in your .env if the backend
   lives somewhere else (or set it to "" if you proxy /api instead). ── */
const NOTIF_API_BASE =
  (typeof import.meta !== "undefined" && import.meta.env && import.meta.env.VITE_REQUEST_API_URL) ||
  "http://localhost:5001";

const NOTIF_POLL_MS = 15000; // how often the bell checks for new requests

// Which verifier module each notification type opens when clicked.
const NOTIF_TARGETS = {
  birth:    { menu: MENU_KEYS.BIRTH,    permission: "birth_verification" },
  marriage: { menu: MENU_KEYS.MARRIAGE, permission: "marriage_verification" },
  death:    { menu: MENU_KEYS.DEATH,    permission: "death_verification" },
};

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

// Reads a submenu's persisted open/closed state, but only inside the same
// session that set it, so a fresh login always starts with submenus closed.
const getPersistedSubmenuState = (key) => {
  try {
    const sameSession = sessionStorage.getItem(SESSION_FLAG_KEY) === "true";
    return sameSession && localStorage.getItem(key) === "true";
  } catch {
    return false;
  }
};

/* ── Topbar date formatting ── */
const formatTopbarDate = (d) =>
  d.toLocaleDateString("en-PH", { weekday: "short", month: "short", day: "numeric", year: "numeric" });

/* "5m ago", "2h ago", "3d ago", then a short date. */
const timeAgo = (iso) => {
  if (!iso) return "";
  const then = new Date(iso);
  if (Number.isNaN(then.getTime())) return "";
  const secs = Math.max(0, Math.floor((Date.now() - then.getTime()) / 1000));
  if (secs < 60)     return "Just now";
  if (secs < 3600)   return `${Math.floor(secs / 60)}m ago`;
  if (secs < 86400)  return `${Math.floor(secs / 3600)}h ago`;
  if (secs < 604800) return `${Math.floor(secs / 86400)}d ago`;
  return then.toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" });
};

/* ── Small inline icons (no extra asset files needed) ── */
const CalendarIcon = () => (
  <svg className="topbar-datetime-icon" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <rect x="3" y="5" width="18" height="16" rx="3" stroke="currentColor" strokeWidth="1.6" />
    <path d="M3 9.5H21" stroke="currentColor" strokeWidth="1.6" />
    <path d="M8 3V6.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    <path d="M16 3V6.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
  </svg>
);

const BellIcon = () => (
  <svg className="notif-btn-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M13.73 21a2 2 0 0 1-3.46 0" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const BirthIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <circle cx="12" cy="8" r="4" stroke="currentColor" strokeWidth="1.6" />
    <path d="M4 21c0-4 3.5-6 8-6s8 2 8 6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
  </svg>
);

const MarriageIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
  </svg>
);

const DeathIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path d="M12 3v18M7 8h10" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
  </svg>
);

const SystemIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.6" />
    <path d="M12 8v5M12 16h.01" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
  </svg>
);

const CloseIcon = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
  </svg>
);

const NotifTypeIcon = ({ type }) => {
  if (type === "birth")    return <BirthIcon />;
  if (type === "marriage") return <MarriageIcon />;
  if (type === "death")    return <DeathIcon />;
  return <SystemIcon />;
};

const Home = () => {
  const { hasAccess, is_admin, loading, logout } = usePermissions();
  const username = getStoredUsername();

  // is_admin from PermissionContext is the single source of truth.
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

  // Live date shown in the topbar.
  const [now, setNow] = useState(() => new Date());

  /* ── Notification state ── */
  const [notifOpen, setNotifOpen]           = useState(false);
  const [notifications, setNotifications]   = useState([]);
  const [unreadCount, setUnreadCount]       = useState(0);
  const [notifLoading, setNotifLoading]     = useState(true);   // first load only
  const [notifStatus, setNotifStatus]       = useState("connecting"); // connecting | live | error
  const notifWrapperRef = useRef(null);

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

  // Mark this tab's session as "active" the moment Home mounts.
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

  // Lock body scroll while the mobile drawer is open.
  useEffect(() => {
    if (viewport === "mobile" && mobileMenuOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => { document.body.style.overflow = ""; };
  }, [viewport, mobileMenuOpen]);

  /* ═══════════════════════════════════════════════════════════
     NOTIFICATIONS
     ═══════════════════════════════════════════════════════════ */

  // Pulls the latest notifications + unread count in one go.
  const fetchNotifications = useCallback(async () => {
    try {
      const [listRes, countRes] = await Promise.all([
        fetch(`${NOTIF_API_BASE}/api/notifications`),
        fetch(`${NOTIF_API_BASE}/api/notifications/unread-count`),
      ]);
      if (!listRes.ok || !countRes.ok) throw new Error("Notification request failed");

      const list  = await listRes.json();
      const count = await countRes.json();

      setNotifications(Array.isArray(list) ? list : []);
      setUnreadCount(typeof count.count === "number" ? count.count : 0);
      setNotifStatus("live");
    } catch (err) {
      console.error("[Home] Could not load notifications:", err);
      setNotifStatus("error");
    } finally {
      setNotifLoading(false);
    }
  }, []);

  // Load once on mount, then poll so new requests show up on the bell
  // without a page refresh. Polling pauses while the tab is hidden.
  useEffect(() => {
    fetchNotifications();
    const poll = setInterval(() => {
      if (!document.hidden) fetchNotifications();
    }, NOTIF_POLL_MS);

    const onVisible = () => { if (!document.hidden) fetchNotifications(); };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      clearInterval(poll);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [fetchNotifications]);

  // Close the dropdown on outside click or Escape.
  useEffect(() => {
    if (!notifOpen) return undefined;

    const onPointerDown = (e) => {
      if (notifWrapperRef.current && !notifWrapperRef.current.contains(e.target)) {
        setNotifOpen(false);
      }
    };
    const onKeyDown = (e) => { if (e.key === "Escape") setNotifOpen(false); };

    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("touchstart", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("touchstart", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [notifOpen]);

  const toggleNotifDropdown = () => {
    setNotifOpen((prev) => {
      if (!prev) fetchNotifications(); // refresh right as it opens
      return !prev;
    });
  };

  // Marks one notification as read (optimistic; re-syncs if the call fails).
  const markNotificationRead = useCallback(
    async (notif) => {
      if (!notif || notif.is_read) return;

      setNotifications((prev) =>
        prev.map((n) => (n.id === notif.id ? { ...n, is_read: true } : n))
      );
      setUnreadCount((c) => Math.max(0, c - 1));

      try {
        const res = await fetch(`${NOTIF_API_BASE}/api/notifications/${notif.id}/read`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ read_by: username || null }),
        });
        if (!res.ok) throw new Error("Mark read failed");
      } catch (err) {
        console.error("[Home] Could not mark notification as read:", err);
        fetchNotifications();
      }
    },
    [username, fetchNotifications]
  );

  const markAllNotificationsRead = useCallback(async () => {
    if (unreadCount === 0) return;

    setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
    setUnreadCount(0);

    try {
      const res = await fetch(`${NOTIF_API_BASE}/api/notifications/mark-all-read`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ read_by: username || null }),
      });
      if (!res.ok) throw new Error("Mark all read failed");
    } catch (err) {
      console.error("[Home] Could not mark all notifications as read:", err);
      fetchNotifications();
    }
  }, [unreadCount, username, fetchNotifications]);

  /* ── Sidebar / menu handlers ── */
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

  // Clicking a notification marks it read and opens the matching verifier.
  const handleNotifClick = (notif) => {
    markNotificationRead(notif);

    const target = NOTIF_TARGETS[notif.record_type];
    if (target && canAccess(target.permission)) {
      setActiveSubMenu(target.menu);
      setVitalRecordsOpen(true);
      try { localStorage.setItem("vitalRecordsOpen", "true"); } catch {}
      closeMobileMenu();
    }
    setNotifOpen(false);
  };

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

  // Logout: if the context's logout() throws, retry once with a direct
  // credentialed call so the server-side "is_online = false" update gets a
  // real chance to commit before the tab navigates away.
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
    // Wait for PermissionContext before making any permission decision.
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

  const badgeText = unreadCount > 99 ? "99+" : String(unreadCount);

  const statusTitle =
    notifStatus === "live"       ? "Live — checking for new requests"
    : notifStatus === "error"    ? "Can't reach the server — retrying"
    :                              "Connecting…";

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

          <div className="topbar-right">
            <div className="topbar-datetime" aria-label="Current date">
              <span className="topbar-datetime-item">
                <CalendarIcon />
                <span>{formatTopbarDate(now)}</span>
              </span>
            </div>

            {/* ── Notification bell + dropdown ── */}
            <div className="notif-wrapper" ref={notifWrapperRef}>
              <button
                type="button"
                className="notif-btn"
                aria-label={
                  unreadCount > 0
                    ? `Notifications, ${unreadCount} unread`
                    : "Notifications"
                }
                aria-haspopup="true"
                aria-expanded={notifOpen}
                title="Notifications"
                onClick={toggleNotifDropdown}
              >
                <BellIcon />
                {unreadCount > 0 && (
                  <span className="notif-count-badge">{badgeText}</span>
                )}
              </button>

              {notifOpen && (
                <div className="notif-dropdown" role="dialog" aria-label="Notifications">
                  <div className="notif-panel-header">
                    <div className="notif-panel-title-row">
                      <span className="notif-panel-title">Notifications</span>
                      {unreadCount > 0 && (
                        <span className="notif-panel-count">{unreadCount} new</span>
                      )}
                      <span
                        className={`notif-sse-dot ${notifStatus}`}
                        title={statusTitle}
                        aria-label={statusTitle}
                      />
                    </div>

                    {unreadCount > 0 && (
                      <button
                        type="button"
                        className="notif-mark-all"
                        onClick={markAllNotificationsRead}
                      >
                        Mark all as read
                      </button>
                    )}
                  </div>

                  <ul className="notif-list">
                    {notifLoading ? (
                      [0, 1, 2].map((i) => (
                        <li key={i} className="notif-skeleton-item">
                          <div className="notif-skeleton-icon" />
                          <div className="notif-skeleton-lines">
                            <div className="notif-skeleton-line long" />
                            <div className="notif-skeleton-line short" />
                          </div>
                        </li>
                      ))
                    ) : notifications.length === 0 ? (
                      <li className="notif-empty">
                        <BellIcon />
                        <span>
                          {notifStatus === "error" ? "Can't load notifications" : "No notifications yet"}
                        </span>
                        <span className="notif-empty-sub">
                          {notifStatus === "error"
                            ? "Check that the request server is running."
                            : "New certificate requests will show up here."}
                        </span>
                      </li>
                    ) : (
                      notifications.map((n) => (
                        <li
                          key={n.id}
                          className={`notif-item${n.is_read ? "" : " unread"}`}
                          onClick={() => handleNotifClick(n)}
                        >
                          <span className="notif-dot" />
                          <div className={`notif-icon-wrap ${NOTIF_TARGETS[n.record_type] ? n.record_type : "system"}`}>
                            <NotifTypeIcon type={n.record_type} />
                          </div>
                          <div className="notif-body">
                            <p className="notif-msg">{n.message || n.title}</p>
                            <span className="notif-time">{timeAgo(n.created_at)}</span>
                          </div>
                          {!n.is_read && (
                            <button
                              type="button"
                              className="notif-dismiss"
                              title="Mark as read"
                              aria-label="Mark as read"
                              onClick={(e) => {
                                e.stopPropagation();
                                markNotificationRead(n);
                              }}
                            >
                              <CloseIcon />
                            </button>
                          )}
                        </li>
                      ))
                    )}
                  </ul>
                </div>
              )}
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