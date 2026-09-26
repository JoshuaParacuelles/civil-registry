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
const NOTIF_SELECT_COLUMNS =
  "id, record_type, record_id, control_no, title, message, request_snapshot, is_read, created_at, read_at, read_by";

const NOTIF_POLL_MS = 15000;

const NOTIF_CLICKED_KEY = "notifClickedIds";

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

const detailValue = (v) => (v === null || v === undefined || v === "" ? "—" : String(v));

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

const formatTopbarDate = (d) =>
  d.toLocaleDateString("en-PH", { weekday: "short", month: "short", day: "numeric", year: "numeric" });

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

const loadClickedIds = () => {
  try {
    const raw = localStorage.getItem(NOTIF_CLICKED_KEY);
    return raw === null ? null : new Set(JSON.parse(raw));
  } catch {
    return null;
  }
};

const saveClickedIds = (set) => {
  try {
    localStorage.setItem(NOTIF_CLICKED_KEY, JSON.stringify([...set].slice(-500)));
  } catch {}
};

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

const KebabIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <circle cx="5" cy="12" r="1.8" fill="currentColor" />
    <circle cx="12" cy="12" r="1.8" fill="currentColor" />
    <circle cx="19" cy="12" r="1.8" fill="currentColor" />
  </svg>
);

const NotifTypeIcon = ({ type }) => {
  if (type === "birth")    return <BirthIcon />;
  if (type === "marriage") return <MarriageIcon />;
  if (type === "death")    return <DeathIcon />;
  return <SystemIcon />;
};

const ToastSuccessIcon = () => (
  <svg className="notif-toast__type-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <circle cx="12" cy="12" r="10" />
    <path d="M9 12l2 2 4-4" />
  </svg>
);

const ToastWarningIcon = () => (
  <svg className="notif-toast__type-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z" />
    <line x1="12" y1="9" x2="12" y2="13" />
    <line x1="12" y1="17" x2="12.01" y2="17" />
  </svg>
);

const ToastErrorIcon = () => (
  <svg className="notif-toast__type-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <circle cx="12" cy="12" r="10" />
    <path d="M12 8v4m0 4h.01" />
  </svg>
);

const StatusToastIcon = ({ type }) => {
  if (type === "warning") return <ToastWarningIcon />;
  if (type === "error")   return <ToastErrorIcon />;
  return <ToastSuccessIcon />;
};

const STATUS_TOAST_DURATION = 5000;

const StatusToast = ({ id, title, message, type = "success", onDismiss }) => {
  const [hiding, setHiding] = useState(false);

  const dismiss = useCallback(() => {
    setHiding(true);
    setTimeout(() => onDismiss(id), 280);
  }, [id, onDismiss]);

  useEffect(() => {
    const timer = setTimeout(dismiss, STATUS_TOAST_DURATION);
    return () => clearTimeout(timer);
  }, []);

  return (
    <div className={`notif-toast notif-toast--${type}${hiding ? " notif-toast--hiding" : ""}`}>
      <span className="notif-toast__icon-wrap">
        <StatusToastIcon type={type} />
      </span>
      <div className="notif-toast__body">
        <div className="notif-toast__title">{title}</div>
        {message && <div className="notif-toast__msg">{message}</div>}
      </div>
      <button type="button" className="notif-toast__close" onClick={dismiss} aria-label="Dismiss">
        <CloseIcon />
      </button>
      <div className="notif-toast__progress">
        <div
          className="notif-toast__progress-bar"
          style={{ animationDuration: `${STATUS_TOAST_DURATION}ms` }}
        />
      </div>
    </div>
  );
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

  const [notifOpen, setNotifOpen]         = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount]     = useState(0);
  const [notifLoading, setNotifLoading]   = useState(true);
  const [notifStatus, setNotifStatus]     = useState("connecting");
  const [clickedIds, setClickedIds]       = useState(() => loadClickedIds() ?? new Set());
  const [openActionMenuId, setOpenActionMenuId] = useState(null);
  const clickedSeededRef = useRef(loadClickedIds() !== null);
  const notifWrapperRef  = useRef(null);

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

  const notificationsRef = useRef(notifications);
  useEffect(() => { notificationsRef.current = notifications; }, [notifications]);

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

  const fetchNotifications = useCallback(async () => {
    try {
      const [listResult, countResult] = await Promise.all([
        supabase
          .from(NOTIFICATION_TABLE)
          .select(NOTIF_SELECT_COLUMNS)
          .order("created_at", { ascending: false })
          .limit(50),
        supabase
          .from(NOTIFICATION_TABLE)
          .select("id", { count: "exact", head: true })
          .eq("is_read", false),
      ]);

      if (listResult.error) throw listResult.error;
      if (countResult.error) throw countResult.error;

      setNotifications(Array.isArray(listResult.data) ? listResult.data : []);
      setUnreadCount(typeof countResult.count === "number" ? countResult.count : 0);

      if (!clickedSeededRef.current && Array.isArray(listResult.data)) {
        clickedSeededRef.current = true;
        const seed = new Set(listResult.data.filter((n) => n.is_read).map((n) => n.id));
        saveClickedIds(seed);
        setClickedIds(seed);
      }

      setNotifStatus((prev) => (prev === "live" ? "live" : "connecting"));
    } catch (err) {
      console.error("[Home] Could not load notifications:", err);
      setNotifStatus("error");
    } finally {
      setNotifLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchNotifications();

    const channel = supabase
      .channel("home-notification-realtime")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: NOTIFICATION_TABLE },
        (payload) => {
          if (payload.eventType === "INSERT") {
            const row = payload.new;
            setNotifications((prev) =>
              prev.some((n) => n.id === row.id) ? prev : [row, ...prev].slice(0, 50)
            );
            if (!row.is_read) setUnreadCount((c) => c + 1);
          } else if (payload.eventType === "UPDATE") {
            const row = payload.new;
            const previous = notificationsRef.current.find((n) => n.id === row.id);
            const wasUnread = previous ? !previous.is_read : !payload.old?.is_read;
            const nowUnread = !row.is_read;
            if (wasUnread && !nowUnread) setUnreadCount((c) => Math.max(0, c - 1));
            else if (!wasUnread && nowUnread) setUnreadCount((c) => c + 1);
            setNotifications((prev) => prev.map((n) => (n.id === row.id ? { ...n, ...row } : n)));
          } else if (payload.eventType === "DELETE") {
            const row = payload.old;
            const removed = notificationsRef.current.find((n) => n.id === row.id);
            if (removed && !removed.is_read) setUnreadCount((c) => Math.max(0, c - 1));
            setNotifications((prev) => prev.filter((n) => n.id !== row.id));
          }
        }
      )
      .subscribe((status) => {
        if (status === "SUBSCRIBED") setNotifStatus("live");
        else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") setNotifStatus("error");
        else setNotifStatus("connecting");
      });

    const poll = setInterval(() => {
      if (!document.hidden) fetchNotifications();
    }, NOTIF_POLL_MS);

    const onVisible = () => { if (!document.hidden) fetchNotifications(); };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      clearInterval(poll);
      document.removeEventListener("visibilitychange", onVisible);
      supabase.removeChannel(channel);
    };
  }, [fetchNotifications]);

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

  useEffect(() => {
    if (!notifOpen) setOpenActionMenuId(null);
  }, [notifOpen]);

  useEffect(() => {
    if (openActionMenuId === null) return undefined;

    const onPointerDown = (e) => {
      if (!e.target.closest(".notif-kebab-wrap")) setOpenActionMenuId(null);
    };
    const onKeyDown = (e) => { if (e.key === "Escape") setOpenActionMenuId(null); };

    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("touchstart", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("touchstart", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [openActionMenuId]);

  const toggleActionMenu = (id, e) => {
    e.stopPropagation();
    setOpenActionMenuId((prev) => (prev === id ? null : id));
  };

  const toggleNotifDropdown = () => {
    setNotifOpen((prev) => {
      if (!prev) fetchNotifications();
      return !prev;
    });
  };

  const markNotificationRead = useCallback(
    async (notif) => {
      if (!notif || notif.is_read) return;

      setNotifications((prev) => prev.map((n) => (n.id === notif.id ? { ...n, is_read: true } : n)));
      setUnreadCount((c) => Math.max(0, c - 1));

      try {
        const { error } = await supabase
          .from(NOTIFICATION_TABLE)
          .update({ is_read: true, read_at: new Date().toISOString(), read_by: username || null })
          .eq("id", notif.id);
        if (error) throw error;
      } catch (err) {
        console.error("[Home] Could not mark notification as read:", err);
        fetchNotifications();
      }
    },
    [username, fetchNotifications]
  );

  const markNotificationUnread = useCallback(
    async (notif) => {
      if (!notif || !notif.is_read) return;

      setNotifications((prev) => prev.map((n) => (n.id === notif.id ? { ...n, is_read: false } : n)));
      setUnreadCount((c) => c + 1);

      try {
        const { error } = await supabase
          .from(NOTIFICATION_TABLE)
          .update({ is_read: false, read_at: null, read_by: null })
          .eq("id", notif.id);
        if (error) throw error;
      } catch (err) {
        console.error("[Home] Could not mark notification as unread:", err);
        fetchNotifications();
      }
    },
    [fetchNotifications]
  );

  const markAllNotificationsRead = useCallback(async () => {
    if (unreadCount === 0) return;

    setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
    setUnreadCount(0);

    try {
      const { error } = await supabase
        .from(NOTIFICATION_TABLE)
        .update({ is_read: true, read_at: new Date().toISOString(), read_by: username || null })
        .eq("is_read", false);
      if (error) throw error;
    } catch (err) {
      console.error("[Home] Could not mark all notifications as read:", err);
      fetchNotifications();
    }
  }, [unreadCount, username, fetchNotifications]);

  const markNotificationClicked = useCallback((id) => {
    setClickedIds((prev) => {
      if (prev.has(id)) return prev;
      const next = new Set(prev);
      next.add(id);
      saveClickedIds(next);
      return next;
    });
  }, []);

  const deleteNotification = useCallback(
    async (notif) => {
      if (!notif) return;

      setNotifications((prev) => prev.filter((n) => n.id !== notif.id));
      if (!notif.is_read) setUnreadCount((c) => Math.max(0, c - 1));

      try {
        const { data, error } = await supabase
          .from(NOTIFICATION_TABLE)
          .delete()
          .eq("id", notif.id)
          .select("id");
        if (error) throw error;
        if (!data || data.length === 0) {
          throw new Error("Nothing was deleted (check the delete policy on the notification table).");
        }
      } catch (err) {
        console.error("[Home] Could not delete notification:", err);
        fetchNotifications();
      }
    },
    [fetchNotifications]
  );

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

  const sidebarClasses = [
    "sidebar",
    viewport === "mobile"  && mobileMenuOpen   ? "mobile-open"     : "",
    viewport === "desktop" && sidebarCollapsed ? "collapsed"       : "",
    viewport === "tablet"  && tabletExpanded   ? "tablet-expanded" : "",
    viewport === "tablet"  && !tabletExpanded  ? "collapsed"       : "",
  ].filter(Boolean).join(" ");

  const containerClasses = [
    "dashboard-container",
    viewport === "desktop" && sidebarCollapsed ? "sidebar-is-collapsed"       : "",
    viewport === "tablet"  && tabletExpanded   ? "sidebar-is-tablet-expanded" : "",
    viewport === "tablet"  && !tabletExpanded  ? "sidebar-is-collapsed"       : "",
  ].filter(Boolean).join(" ");

  const displayName = username ? toTitleCase(username) : "Admin";
  const badgeText = unreadCount > 99 ? "99+" : String(unreadCount);

  const statusTitle =
    notifStatus === "live"    ? "Live — connected to real-time notifications"
    : notifStatus === "error" ? "Can't reach the server — retrying"
    :                           "Connecting…";

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
                <span className="sidebar-user-role">{isAdminUser ? "Admin Panel" : "Active"}</span>
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
                  {showLabels && <span className={`arrow${vitalRecordsOpen ? " down" : ""}`} />}
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
              {showLabels && <span className={`arrow${settingsOpen ? " down" : ""}`} />}
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
            <button className="footer-item" onClick={() => setShowLogoutModal(true)} type="button">
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

            <div className="notif-wrapper" ref={notifWrapperRef}>
              <button
                type="button"
                className="notif-btn"
                aria-label={unreadCount > 0 ? `Notifications, ${unreadCount} unread` : "Notifications"}
                aria-haspopup="true"
                aria-expanded={notifOpen}
                title="Notifications"
                onClick={toggleNotifDropdown}
              >
                <BellIcon />
                {unreadCount > 0 && <span className="notif-count-badge">{badgeText}</span>}
              </button>

              {notifOpen && (
                <div className="notif-dropdown" role="dialog" aria-label="Notifications">
                  <div className="notif-panel-header">
                    <div className="notif-panel-title-row">
                      <span className="notif-panel-title">Notifications</span>
                      {unreadCount > 0 && <span className="notif-panel-count">{unreadCount} new</span>}
                      <span
                        className={`notif-sse-dot ${notifStatus}`}
                        title={statusTitle}
                        aria-label={statusTitle}
                      />
                    </div>

                    {unreadCount > 0 && (
                      <button type="button" className="notif-mark-all" onClick={markAllNotificationsRead}>
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
                        <span>{notifStatus === "error" ? "Can't load notifications" : "No notifications yet"}</span>
                        <span className="notif-empty-sub">
                          {notifStatus === "error"
                            ? "Check your Supabase connection (see console for details)."
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
                            <div className="notif-msg-row">
                              <p className="notif-msg">{n.message || n.title}</p>
                              {!clickedIds.has(n.id) && <span className="notif-new-badge">NEW</span>}
                            </div>
                            <span className="notif-time">{timeAgo(n.created_at)}</span>
                          </div>
                          <div className="notif-kebab-wrap">
                            <button
                              type="button"
                              className="notif-kebab-btn"
                              aria-label="More actions"
                              aria-haspopup="true"
                              aria-expanded={openActionMenuId === n.id}
                              onClick={(e) => toggleActionMenu(n.id, e)}
                            >
                              <KebabIcon />
                            </button>

                            {openActionMenuId === n.id && (
                              <div
                                className="notif-action-menu"
                                role="menu"
                                onClick={(e) => e.stopPropagation()}
                              >
                                {n.is_read ? (
                                  <button
                                    type="button"
                                    role="menuitem"
                                    className="notif-action-menu-item"
                                    onClick={() => {
                                      markNotificationUnread(n);
                                      setOpenActionMenuId(null);
                                    }}
                                  >
                                    Mark as Unread
                                  </button>
                                ) : (
                                  <button
                                    type="button"
                                    role="menuitem"
                                    className="notif-action-menu-item"
                                    onClick={() => {
                                      markNotificationRead(n);
                                      setOpenActionMenuId(null);
                                    }}
                                  >
                                    Mark as read
                                  </button>
                                )}
                                <button
                                  type="button"
                                  role="menuitem"
                                  className="notif-action-menu-item notif-action-menu-item--danger"
                                  onClick={() => {
                                    deleteNotification(n);
                                    setOpenActionMenuId(null);
                                  }}
                                >
                                  Remove
                                </button>
                              </div>
                            )}
                          </div>
                        </li>
                      ))
                    )}
                  </ul>
                </div>
              )}
            </div>
          </div>
        </header>

        <main className="main-content">{renderContent()}</main>
      </div>

      {selectedNotif && (() => {
        const snap = selectedNotif.request_snapshot || {};
        const type = selectedNotif.record_type;
        const sections = [TYPE_SECTIONS[type], ...COMMON_SECTIONS].filter(Boolean);
        const target = NOTIF_TARGETS[type];
        const canOpen = target && canAccess(target.permission);

        const signatureSrc = getSignatureSrc(snap, type, selectedNotif.record_id);
        const showSignatureImage = Boolean(snap.has_signature) && !sigFailed;
        const topStatusValue = statusDraft || (snap.status || "").toUpperCase();
        const topStatusLabel = REQUEST_STATUS_LABELS[topStatusValue] || topStatusValue;

        return (
          <div className="notif-detail-overlay" onClick={closeNotifDetails}>
            <div
              className="notif-detail-modal"
              role="dialog"
              aria-modal="true"
              aria-label="Request details"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="notif-detail-header">
                <div className={`notif-icon-wrap ${target ? type : "system"}`}>
                  <NotifTypeIcon type={type} />
                </div>
                <div className="notif-detail-heading">
                  <h2>{selectedNotif.title || "Request details"}</h2>
                  <p>
                    Control No: <strong>{selectedNotif.control_no || "—"}</strong>
                    {" · "}
                    {timeAgo(selectedNotif.created_at)}
                  </p>
                </div>
                {topStatusValue && (
                  <span className={`notif-detail-status ${String(topStatusValue).toLowerCase()}`}>
                    {topStatusLabel}
                  </span>
                )}
                <button type="button" className="notif-detail-close" aria-label="Close" onClick={closeNotifDetails}>
                  <CloseIcon />
                </button>
              </div>

              <div className="notif-detail-body">
                {!selectedNotif.request_snapshot ? (
                  <p className="notif-detail-fallback">{selectedNotif.message}</p>
                ) : (
                  sections.map((section) => (
                    <section key={section.title} className="notif-detail-section">
                      <h3>{section.title}</h3>
                      <dl className="notif-detail-grid">
                        {section.fields.map(([key, label]) => (
                          <div key={key} className="notif-detail-field">
                            <dt>{label}</dt>
                            {key === SIGNATURE_FIELD_KEY && showSignatureImage ? (
                              <dd>
                                <img
                                  className="notif-detail-signature"
                                  src={signatureSrc}
                                  alt="Requester signature — click to enlarge"
                                  title="Click to enlarge"
                                  loading="eager"
                                  decoding="sync"
                                  onError={() => setSigFailed(true)}
                                  onClick={() => setSigZoomed(true)}
                                  role="button"
                                  tabIndex={0}
                                  onKeyDown={(e) => {
                                    if (e.key === "Enter" || e.key === " ") {
                                      e.preventDefault();
                                      setSigZoomed(true);
                                    }
                                  }}
                                />
                              </dd>
                            ) : (
                              <dd>{detailValue(snap[key])}</dd>
                            )}
                          </div>
                        ))}
                      </dl>
                    </section>
                  ))
                )}

                {canAccess("citizen_requests") && (
                  <section className="notif-detail-section">
                    <h3>Request Status</h3>
                    <div className="notif-status-editor">
                      <select
                        className="notif-status-select"
                        value={statusDraft}
                        onChange={(e) => setStatusDraft(e.target.value)}
                        disabled={statusSaving}
                      >
                        {REQUEST_STATUS_OPTIONS.map((s) => (
                          <option key={s} value={s}>{REQUEST_STATUS_LABELS[s]}</option>
                        ))}
                      </select>

                      <textarea
                        className="notif-status-note"
                        placeholder="Optional note to include in the citizen's notification…"
                        value={statusNote}
                        onChange={(e) => setStatusNote(e.target.value)}
                        disabled={statusSaving}
                      />
                      <button
                        type="button"
                        className="notif-status-update-btn"
                        onClick={updateRequestStatus}
                        disabled={
                          statusSaving ||
                          statusDraft === (selectedNotif?.request_snapshot?.status || "").toUpperCase()
                        }
                      >
                        {statusSaving ? "Updating…" : "Update Status"}
                      </button>
                    </div>
                  </section>
                )}
              </div>

              <div className="notif-detail-footer">
                <button type="button" className="logout-cancel-btn" onClick={closeNotifDetails}>
                  Close
                </button>
                {canOpen && (
                  <button type="button" className="notif-detail-open-btn" onClick={() => openInVerifier(selectedNotif)}>
                    Open in {target.menu}
                  </button>
                )}
              </div>
            </div>

            {sigZoomed && (
              <div
                className="sig-zoom-overlay"
                onClick={(e) => {
                  e.stopPropagation();
                  setSigZoomed(false);
                }}
              >
                <img
                  className="sig-zoom-img"
                  src={signatureSrc}
                  alt="Requester signature (enlarged)"
                  onClick={(e) => e.stopPropagation()}
                />
                <button
                  type="button"
                  className="sig-zoom-close"
                  aria-label="Close enlarged signature"
                  onClick={(e) => {
                    e.stopPropagation();
                    setSigZoomed(false);
                  }}
                >
                  <CloseIcon />
                </button>
              </div>
            )}
          </div>
        );
      })()}

      {showLogoutModal && (
        <div className="logout-modal-overlay" onClick={() => !loggingOut && setShowLogoutModal(false)}>
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