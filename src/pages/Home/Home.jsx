import React, { useEffect, useState, useCallback, useRef } from "react";
import { supabase } from "../../services/supabaseClient";
import ChangePassword from "../AccountSettings/ChangePassword";
import AuditLogs from "../AccountSettings/AuditLogs";
import RoleManagement from "../AccountSettings/RoleManagement";
import AccessDenied from "../AccountSettings/AccessDenied";

import UnifiedBirthRegistry from "../VitalRecords/Birth/BirthVerifier";
import UnifiedMarriageRegistry from "../VitalRecords/Marriage/MarriageVerifier";
import DeathVerifier from "../VitalRecords/Death/DeathVerifier";
import PaymentInventory from "../Dashboard/Dashboard";
import Heatmaps from "../Heatmaps/Heatmaps";
import ExternalIndividualsLookup from "../ExternalIndividuals/ExternalIndividualsLookup";
import DocumentTracking from "../DocumentTracking/DocumentTracking";

import { usePermissions } from "../../context/PermissionContext";

import Sidebar from "../../components/Sidebar";
import Topbar from "../../components/Topbar";
import StatusToast from "../../components/StatusToast";
import LogoutModal from "../../components/LogoutModal";
import NotificationBell from "../../components/NotificationBell";
import NotificationDetailModal from "../../components/NotificationDetailModal";
import useNotifications from "../../hooks/useNotifications";

import logoImg from "../../assets/icons/sidebar/scc.png";
import dashboardIcon from "../../assets/icons/sidebar/dashboard.png";
import vitalIcon from "../../assets/icons/sidebar/vital.png";
import heatmapsIcon from "../../assets/icons/sidebar/heatmap.png";
import trackingIcon from "../../assets/icons/sidebar/tracking.png";
import accountIcon from "../../assets/icons/sidebar/account.png";
import logoutIcon from "../../assets/icons/sidebar/logout.png";

import "./Home.css";

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

const SESSION_FLAG_KEY = "homeSessionActive";

const NOTIF_API_BASE =
  (typeof import.meta !== "undefined" && import.meta.env && import.meta.env.VITE_REQUEST_API_URL) ||
  "http://localhost:5001";

const NOTIFICATION_TABLE = "notification";

const NOTIF_TARGETS = {
  birth:    { menu: MENU_KEYS.BIRTH,    permission: "birth_verification" },
  marriage: { menu: MENU_KEYS.MARRIAGE, permission: "marriage_verification" },
  death:    { menu: MENU_KEYS.DEATH,    permission: "death_verification" },
};

const REQUEST_STATUS_OPTIONS = ["PENDING", "PROCESSING", "COMPLETED"];
const REQUEST_STATUS_LABELS = {
  PENDING:    "Pending Review",
  PROCESSING: "Being Processed",
  COMPLETED:  "Complete",
  REJECTED:   "Rejected",
};

const TYPE_SECTIONS = {
  birth: {
    title: "Child's information",
    fields: [
      ["child_firstname",  "First name"],
      ["child_middlename", "Middle name"],
      ["child_surname",    "Surname"],
      ["birth_month",      "Birth month"],
      ["birth_date",       "Birth day"],
      ["birth_year",       "Birth year"],
      ["place_of_birth",   "Place of birth"],
    ],
  },
  death: {
    title: "Deceased's information",
    fields: [
      ["deceased_firstname",  "First name"],
      ["deceased_middlename", "Middle name"],
      ["deceased_surname",    "Surname"],
      ["death_month",         "Death month"],
      ["death_date",          "Death day"],
      ["death_year",          "Death year"],
      ["place_of_death",      "Place of death"],
    ],
  },
  marriage: {
    title: "Marriage information",
    fields: [
      ["husband_fullname",  "Husband's full name"],
      ["wife_maiden_name",  "Wife's maiden name"],
      ["marriage_date",     "Date of marriage"],
      ["place_of_marriage", "Place of marriage"],
    ],
  },
};

const COMMON_SECTIONS = [
  {
    title: "Request details",
    fields: [
      ["form_type",  "Form type"],
      ["num_copies", "Number of copies"],
      ["purposes",   "Purpose"],
      ["search_by",  "Search by"],
    ],
  },
  {
    title: "Requester",
    fields: [
      ["requester_name",         "Name"],
      ["requester_relationship", "Relationship to owner"],
      ["requester_address",      "Address"],
      ["requester_telephone",    "Telephone"],
      ["requester_email",        "Email"],
      ["signature_printed_name", "Signature over printed name"],
    ],
  },
  {
    title: "Registry reference",
    fields: [
      ["registry_no",          "Registry no."],
      ["date_of_registration", "Date of registration"],
      ["book",                 "Book"],
      ["page",                 "Page"],
    ],
  },
];

const SIGNATURE_FIELD_KEY = "signature_printed_name";

const SIGNATURE_BASE64_KEYS = [
  "signature_base64",
  "signature_image",
  "signature_image_base64",
  "signature_data_url",
  "signature",
];

const getSignatureSrc = (snap, type, recordId) => {
  for (const key of SIGNATURE_BASE64_KEYS) {
    const val = snap?.[key];
    if (typeof val === "string" && val.trim()) {
      return val.startsWith("data:") ? val : `data:image/png;base64,${val}`;
    }
  }
  return `${NOTIF_API_BASE}/api/${type}/${recordId}/signature`;
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

const getPersistedSubmenuState = (key) => {
  try {
    const sameSession = sessionStorage.getItem(SESSION_FLAG_KEY) === "true";
    return sameSession && localStorage.getItem(key) === "true";
  } catch {
    return false;
  }
};

const Home = () => {
  const { hasAccess, is_admin: isAdminUser, loading, logout } = usePermissions();
  const username = getStoredUsername();

  const canAccess = useCallback(
    (mod) => {
      if (isAdminUser) return true;
      try { return !!hasAccess(mod); }
      catch { return false; }
    },
    [isAdminUser, hasAccess]
  );

  const [activeSubMenu, setActiveSubMenu] = useState(MENU_KEYS.DASHBOARD);
  const [settingsOpen, setSettingsOpen] = useState(() => getPersistedSubmenuState("settingsOpen"));
  const [vitalRecordsOpen, setVitalRecordsOpen] = useState(() => getPersistedSubmenuState("vitalRecordsOpen"));
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [viewport, setViewport] = useState(getViewport);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    try { return localStorage.getItem("sidebarCollapsed") === "true"; }
    catch { return false; }
  });
  const [tabletExpanded, setTabletExpanded] = useState(false);
  const [showLogoutModal, setShowLogoutModal] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const [now, setNow] = useState(() => new Date());

  const {
    notifOpen,
    setNotifOpen,
    notifications,
    setNotifications,
    unreadCount,
    notifLoading,
    notifStatus,
    clickedIds,
    openActionMenuId,
    notifWrapperRef,
    toggleActionMenu,
    toggleNotifDropdown,
    markNotificationRead,
    markNotificationUnread,
    markAllNotificationsRead,
    markNotificationClicked,
    deleteNotification,
    timeAgo,
    setOpenActionMenuId,
  } = useNotifications({ username, onOpenVerifier: null });

  const [selectedNotif, setSelectedNotif] = useState(null);
  const [sigFailed, setSigFailed]         = useState(false);
  const [sigZoomed, setSigZoomed]         = useState(false);
  const [statusDraft, setStatusDraft]     = useState("");
  const [statusNote, setStatusNote]       = useState("");
  const [statusSaving, setStatusSaving]   = useState(false);
  const [notifyVia, setNotifyVia]         = useState("email");

  const [statusToasts, setStatusToasts] = useState([]);
  const statusToastIdRef = useRef(0);

  const showStatusToast = useCallback((title, message, type = "success") => {
    const id = `${Date.now()}-${++statusToastIdRef.current}`;
    setStatusToasts((prev) => [...prev, { id, title, message, type }]);
  }, []);

  const dismissStatusToast = useCallback((id) => {
    setStatusToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const visibleVitalChildren = isAdminUser
    ? VITAL_CHILDREN
    : [
        ...(canAccess("birth_verification")    ? [MENU_KEYS.BIRTH]    : []),
        ...(canAccess("marriage_verification") ? [MENU_KEYS.MARRIAGE] : []),
        ...(canAccess("death_verification")    ? [MENU_KEYS.DEATH]    : []),
        ...(canAccess("scims_lookup")          ? [MENU_KEYS.SCIMS]    : []),
      ];

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

  useEffect(() => {
    document.body.style.overflow = viewport === "mobile" && mobileMenuOpen ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [viewport, mobileMenuOpen]);


  const handleNotifClick = async (notif) => {
    markNotificationClicked(notif.id);
    markNotificationRead(notif);
    setSigFailed(false);
    setSigZoomed(false);
    setSelectedNotif(notif);
    setNotifOpen(false);
    setStatusNote("");

    const snap = notif.request_snapshot || {};
    setNotifyVia((snap.requester_email || "").trim() ? "email" : "none");
    setStatusDraft((snap.status || "PENDING").toUpperCase());

    if (!notif.record_id) return;

    try {
      const res = await fetch(`/api/requests/${notif.record_id}`, { credentials: "include" });
      if (!res.ok) return;
      const data = await res.json().catch(() => null);
      const liveStatus = (data?.status || "").toUpperCase();
      if (!liveStatus) return;

      setStatusDraft(liveStatus);
      setSelectedNotif((prev) =>
        prev && prev.id === notif.id
          ? { ...prev, request_snapshot: { ...(prev.request_snapshot || {}), status: liveStatus } }
          : prev
      );
      setNotifications((prev) =>
        prev.map((n) =>
          n.id === notif.id
            ? { ...n, request_snapshot: { ...(n.request_snapshot || {}), status: liveStatus } }
            : n
        )
      );
    } catch (err) {
      console.error("[Home] Could not load live request status:", err);
    }
  };

  const closeNotifDetails = useCallback(() => {
    setSelectedNotif(null);
    setSigZoomed(false);
    setStatusDraft("");
    setStatusNote("");
    setNotifyVia("email");
  }, []);

  const updateRequestStatus = async () => {
    if (!selectedNotif?.record_id) return;
    setStatusSaving(true);
    try {
      const res = await fetch(`/api/requests/${selectedNotif.record_id}/status`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: statusDraft,
          note: statusNote.trim() || undefined,
          notify_via: notifyVia,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data?.error) throw new Error(data?.error || `HTTP ${res.status}`);

      const savedStatus = (data.status || statusDraft).toUpperCase();
      const updatedSnapshot = { ...(selectedNotif.request_snapshot || {}), status: savedStatus };

      const notifiedByEmail = Boolean(data.email_sent);
      showStatusToast(
        notifiedByEmail ? "Success" : "Notice",
        data.message || `Updated to ${data.status_label}.`,
        notifiedByEmail ? "success" : "warning"
      );

      setStatusDraft(savedStatus);
      setStatusNote("");
      setSelectedNotif((prev) => (prev ? { ...prev, request_snapshot: updatedSnapshot } : prev));
      setNotifications((prev) =>
        prev.map((n) => (n.id === selectedNotif.id ? { ...n, request_snapshot: updatedSnapshot } : n))
      );

      try {
        const { error: snapshotError } = await supabase
          .from(NOTIFICATION_TABLE)
          .update({ request_snapshot: updatedSnapshot })
          .eq("id", selectedNotif.id);
        if (snapshotError) throw snapshotError;
      } catch (snapshotErr) {
        console.error("[Home] Status saved, but could not persist it to the notification snapshot:", snapshotErr);
      }
    } catch (err) {
      showStatusToast("Error", err.message || "Could not update status.", "error");
    } finally {
      setStatusSaving(false);
    }
  };

  const openInVerifier = (notif) => {
    const target = NOTIF_TARGETS[notif.record_type];
    if (target && canAccess(target.permission)) {
      setActiveSubMenu(target.menu);
      setVitalRecordsOpen(true);
      try { localStorage.setItem("vitalRecordsOpen", "true"); } catch {}
      if (viewport === "mobile") setMobileMenuOpen(false);
    }
    setSelectedNotif(null);
  };

  useEffect(() => {
    if (!selectedNotif) return undefined;
    const onKeyDown = (e) => {
      if (e.key !== "Escape") return;
      if (sigZoomed) setSigZoomed(false);
      else closeNotifDetails();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [selectedNotif, sigZoomed, closeNotifDetails]);

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

  const containerClasses = [
    "dashboard-container",
    viewport === "desktop" && sidebarCollapsed ? "sidebar-is-collapsed"       : "",
    viewport === "tablet"  && tabletExpanded   ? "sidebar-is-tablet-expanded" : "",
    viewport === "tablet"  && !tabletExpanded  ? "sidebar-is-collapsed"       : "",
  ].filter(Boolean).join(" ");

  const displayName = username ? toTitleCase(username) : "Admin";

  const renderContent = () => {
    if (loading) {
      return (
        <div className="module-loading-state" style={{ padding: "2rem", textAlign: "center", color: "#64748b" }}>
          Loading…
        </div>
      );
    }

    switch (activeSubMenu) {
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
      case MENU_KEYS.DASHBOARD:
      default:
        return <PaymentInventory />;
    }
  };

  return (
    <div className={containerClasses}>
      <div className="notif-toast-wrap">
        {statusToasts.map((t) => (
          <StatusToast key={t.id} {...t} onDismiss={dismissStatusToast} />
        ))}
      </div>

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

      <div
        className={`mobile-overlay${mobileMenuOpen ? " active" : ""}`}
        onClick={closeMobileMenu}
        aria-hidden="true"
      />

      <Sidebar
        activeSubMenu={activeSubMenu}
        settingsOpen={settingsOpen}
        vitalRecordsOpen={vitalRecordsOpen}
        mobileMenuOpen={mobileMenuOpen}
        viewport={viewport}
        sidebarCollapsed={sidebarCollapsed}
        tabletExpanded={tabletExpanded}
        showLabels={showLabels}
        visibleVitalChildren={visibleVitalChildren}
        canAccess={canAccess}
        handleMenuClick={handleMenuClick}
        handleSubMenuClick={handleSubMenuClick}
        setShowLogoutModal={setShowLogoutModal}
        displayName={displayName}
        isAdminUser={isAdminUser}
        MENU_KEYS={MENU_KEYS}
        VITAL_CHILDREN={VITAL_CHILDREN}
        SETTINGS_CHILDREN={SETTINGS_CHILDREN}
        logoImg={logoImg}
        dashboardIcon={dashboardIcon}
        vitalIcon={vitalIcon}
        heatmapsIcon={heatmapsIcon}
        trackingIcon={trackingIcon}
        accountIcon={accountIcon}
        logoutIcon={logoutIcon}
      />

      <div className="main-content-wrapper">
        <Topbar activeSubMenu={activeSubMenu} now={now} toggleSidebar={toggleSidebar}>
          <NotificationBell
            notifOpen={notifOpen}
            notifWrapperRef={notifWrapperRef}
            toggleNotifDropdown={toggleNotifDropdown}
            unreadCount={unreadCount}
            notifStatus={notifStatus}
            notifLoading={notifLoading}
            notifications={notifications}
            clickedIds={clickedIds}
            openActionMenuId={openActionMenuId}
            toggleActionMenu={toggleActionMenu}
            markAllNotificationsRead={markAllNotificationsRead}
            markNotificationRead={markNotificationRead}
            markNotificationUnread={markNotificationUnread}
            deleteNotification={deleteNotification}
            handleNotifClick={handleNotifClick}
            timeAgo={timeAgo}
            NOTIF_TARGETS={NOTIF_TARGETS}
            setOpenActionMenuId={setOpenActionMenuId}
          />
        </Topbar>

        <main className="main-content">{renderContent()}</main>
      </div>

      <NotificationDetailModal
        notification={selectedNotif}
        onClose={closeNotifDetails}
        onOpenInVerifier={openInVerifier}
        canAccess={canAccess}
        timeAgo={timeAgo}
        sigFailed={sigFailed}
        setSigFailed={setSigFailed}
        sigZoomed={sigZoomed}
        setSigZoomed={setSigZoomed}
        statusDraft={statusDraft}
        setStatusDraft={setStatusDraft}
        statusNote={statusNote}
        setStatusNote={setStatusNote}
        statusSaving={statusSaving}
        updateRequestStatus={updateRequestStatus}
        NOTIF_TARGETS={NOTIF_TARGETS}
        TYPE_SECTIONS={TYPE_SECTIONS}
        COMMON_SECTIONS={COMMON_SECTIONS}
        SIGNATURE_FIELD_KEY={SIGNATURE_FIELD_KEY}
        getSignatureSrc={getSignatureSrc}
        REQUEST_STATUS_OPTIONS={REQUEST_STATUS_OPTIONS}
        REQUEST_STATUS_LABELS={REQUEST_STATUS_LABELS}
      />

      <LogoutModal
        open={showLogoutModal}
        loggingOut={loggingOut}
        onClose={() => setShowLogoutModal(false)}
        onConfirm={handleConfirmLogout}
      />
    </div>
  );
};

export default Home;