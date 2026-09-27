import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "../services/supabaseClient";

const NOTIFICATION_TABLE = "notification";
const NOTIF_SELECT_COLUMNS =
  "id, record_type, record_id, control_no, title, message, request_snapshot, is_read, created_at, read_at, read_by";
const NOTIF_POLL_MS = 15000;
const NOTIF_CLICKED_KEY = "notifClickedIds";

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

const timeAgo = (iso) => {
  if (!iso) return "";
  const then = new Date(iso);
  if (Number.isNaN(then.getTime())) return "";
  const secs = Math.max(0, Math.floor((Date.now() - then.getTime()) / 1000));
  if (secs < 60) return "Just now";
  if (secs < 3600) return `${Math.floor(secs / 60)}m ago`;
  if (secs < 86400) return `${Math.floor(secs / 3600)}h ago`;
  if (secs < 604800) return `${Math.floor(secs / 86400)}d ago`;
  return then.toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" });
};

export const NOTIF_TARGETS = {
  birth: { menu: "Birth Verifier", permission: "birth_verification" },
  marriage: { menu: "Marriage Verifier", permission: "marriage_verification" },
  death: { menu: "Death Verifier", permission: "death_verification" },
};

export default function useNotifications({ username, onOpenVerifier }) {
  const [notifOpen, setNotifOpen] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [notifLoading, setNotifLoading] = useState(true);
  const [notifStatus, setNotifStatus] = useState("connecting");
  const [clickedIds, setClickedIds] = useState(() => loadClickedIds() ?? new Set());
  const [openActionMenuId, setOpenActionMenuId] = useState(null);
  const clickedSeededRef = useRef(loadClickedIds() !== null);
  const notifWrapperRef = useRef(null);
  const notificationsRef = useRef(notifications);

  useEffect(() => {
    notificationsRef.current = notifications;
  }, [notifications]);

  const fetchNotifications = useCallback(async () => {
    try {
      const [listResult, countResult] = await Promise.all([
        supabase.from(NOTIFICATION_TABLE).select(NOTIF_SELECT_COLUMNS).order("created_at", { ascending: false }).limit(50),
        supabase.from(NOTIFICATION_TABLE).select("id", { count: "exact", head: true }).eq("is_read", false),
      ]);

      if (listResult.error) throw listResult.error;
      if (countResult.error) throw countResult.error;

      setNotifications(Array.isArray(listResult.data) ? listResult.data : []);
      setUnreadCount(typeof countResult.count === "number" ? countResult.count : 0);

      if (!clickedSeededRef.current && Array.isArray(listResult.data)) {
        clickedSeededRef.current = true;
        const seed = new Set(listResult.data.filter((n) => n.is_read).map((n) => n.id));
        localStorage.setItem(NOTIF_CLICKED_KEY, JSON.stringify([...seed].slice(-500)));
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
            setNotifications((prev) => (prev.some((n) => n.id === row.id) ? prev : [row, ...prev].slice(0, 50)));
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

    const onVisible = () => {
      if (!document.hidden) fetchNotifications();
    };
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
    const onKeyDown = (e) => {
      if (e.key === "Escape") setNotifOpen(false);
    };

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
    const onKeyDown = (e) => {
      if (e.key === "Escape") setOpenActionMenuId(null);
    };

    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("touchstart", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("touchstart", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [openActionMenuId]);

  const toggleActionMenu = useCallback((id, e) => {
    e.stopPropagation();
    setOpenActionMenuId((prev) => (prev === id ? null : id));
  }, []);

  const toggleNotifDropdown = useCallback(() => {
    setNotifOpen((prev) => {
      if (!prev) fetchNotifications();
      return !prev;
    });
  }, [fetchNotifications]);

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
    [fetchNotifications, username]
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
  }, [fetchNotifications, unreadCount, username]);

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

  const openNotification = useCallback(
    (notif) => {
      if (typeof onOpenVerifier === "function") {
        onOpenVerifier(notif);
      }
      setNotifOpen(false);
    },
    [onOpenVerifier]
  );

  return {
    notifOpen,
    setNotifOpen,
    notifications,
    setNotifications,
    unreadCount,
    setUnreadCount,
    notifLoading,
    setNotifLoading,
    notifStatus,
    setNotifStatus,
    clickedIds,
    setClickedIds,
    openActionMenuId,
    setOpenActionMenuId,
    notifWrapperRef,
    toggleActionMenu,
    toggleNotifDropdown,
    markNotificationRead,
    markNotificationUnread,
    markAllNotificationsRead,
    markNotificationClicked,
    deleteNotification,
    fetchNotifications,
    timeAgo,
    openNotification,
  };
}
