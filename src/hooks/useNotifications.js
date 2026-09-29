import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "../services/supabaseClient";

const NOTIFICATION_TABLE = "notification";
const READS_TABLE = "notification_reads";
const NOTIF_COLUMNS =
  "id, record_type, record_id, control_no, title, message, request_snapshot, created_at";
// Embeds this admin's read row (if any). Filtered per user in fetchNotifications.
const NOTIF_SELECT = `${NOTIF_COLUMNS}, ${READS_TABLE}(username)`;
const NOTIF_POLL_MS = 15000;
const PENDING_TTL_MS = 30000;

// Turns a joined row into the shape the UI already expects (is_read is per admin).
const toNotif = (row) => {
  const { [READS_TABLE]: reads, ...rest } = row;
  return { ...rest, is_read: Array.isArray(reads) && reads.length > 0 };
};

const sameNotification = (a, b) =>
  a.id === b.id &&
  a.record_type === b.record_type &&
  a.record_id === b.record_id &&
  a.control_no === b.control_no &&
  a.title === b.title &&
  a.message === b.message &&
  a.created_at === b.created_at &&
  a.is_read === b.is_read &&
  JSON.stringify(a.request_snapshot) === JSON.stringify(b.request_snapshot);

const retainUnchangedNotifications = (previous, next) => {
  if (previous.length !== next.length) return next;
  let changed = false;
  const stable = next.map((notification, index) => {
    if (sameNotification(previous[index], notification)) return previous[index];
    changed = true;
    return notification;
  });
  return changed ? stable : previous;
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
  // Read state is stored per admin. If username isn't known yet, a placeholder is used
  // and the list refetches automatically once it arrives.
  const reader = username || "unknown";

  const [notifOpen, setNotifOpen] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [notifLoading, setNotifLoading] = useState(true);
  const [notifStatus, setNotifStatus] = useState("connecting");
  const [openActionMenuId, setOpenActionMenuId] = useState(null);
  const notifWrapperRef = useRef(null);
  const notificationsRef = useRef(notifications);
  const pendingRef = useRef(new Map()); // id -> { is_read, ts } optimistic changes not yet confirmed
  const manualUnreadRef = useRef(new Set()); // ids marked unread by hand while the panel is open
  const wasOpenRef = useRef(false);
  const fetchSeqRef = useRef(0);
  const statusRef = useRef(notifStatus);

  useEffect(() => {
    notificationsRef.current = notifications;
  }, [notifications]);

  useEffect(() => {
    statusRef.current = notifStatus;
  }, [notifStatus]);

  const fetchNotifications = useCallback(async () => {
    const sequence = ++fetchSeqRef.current;
    try {
      const [listResult, countResult] = await Promise.all([
        supabase
          .from(NOTIFICATION_TABLE)
          .select(NOTIF_SELECT)
          .eq(`${READS_TABLE}.username`, reader)
          .order("created_at", { ascending: false })
          .limit(50),
        supabase.rpc("notification_unread_count", { p_username: reader }),
      ]);

      if (sequence !== fetchSeqRef.current) return;
      if (listResult.error) throw listResult.error;
      if (countResult.error) throw countResult.error;

      const rows = (Array.isArray(listResult.data) ? listResult.data : []).map(toNotif);
      const serverCount = typeof countResult.data === "number" ? countResult.data : 0;

      // Keep optimistic changes until the server agrees (or they expire).
      const nowMs = Date.now();
      let adjust = 0;
      const merged = rows.map((n) => {
        const p = pendingRef.current.get(n.id);
        if (!p) return n;
        if (nowMs - p.ts > PENDING_TTL_MS || p.is_read === n.is_read) {
          pendingRef.current.delete(n.id);
          return n;
        }
        adjust += p.is_read ? -1 : 1;
        return { ...n, is_read: p.is_read };
      });

      setNotifications((previous) => retainUnchangedNotifications(previous, merged));
      setUnreadCount(Math.max(0, serverCount + adjust));

      setNotifStatus((prev) => (prev === "live" ? "live" : "connecting"));
    } catch (err) {
      if (sequence !== fetchSeqRef.current) return;
      console.error("[Home] Could not load notifications:", err);
      setNotifStatus("error");
    } finally {
      if (sequence === fetchSeqRef.current) setNotifLoading(false);
    }
  }, [reader]);

  useEffect(() => {
    let refetchTimer = null;
    const scheduleRefetch = () => {
      window.clearTimeout(refetchTimer);
      refetchTimer = window.setTimeout(fetchNotifications, 400);
    };

    const handleReadChange = (payload) => {
      const row = payload.eventType === "DELETE" ? payload.old : payload.new;
      const pending = row && pendingRef.current.get(row.notification_id);
      const isReadEvent = payload.eventType !== "DELETE";
      const matchesPending = pending && (
        (isReadEvent && pending.is_read) || (!isReadEvent && !pending.is_read)
      );

      if (
        row?.username === reader &&
        matchesPending &&
        Date.now() - pending.ts <= PENDING_TTL_MS
      ) {
        pendingRef.current.delete(row.notification_id);
        return;
      }

      scheduleRefetch();
    };

    fetchNotifications();

    const channel = supabase
      .channel("home-notification-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: NOTIFICATION_TABLE }, (payload) => {
        if (payload.eventType === "INSERT") {
          const row = { ...payload.new, is_read: false };
          setNotifications((prev) => (prev.some((n) => n.id === row.id) ? prev : [row, ...prev].slice(0, 50)));
          setUnreadCount((c) => c + 1);
        } else if (payload.eventType === "UPDATE") {
          // Ignore the legacy global is_read/read_at/read_by; read state is per admin now.
          const rest = { ...payload.new };
          delete rest.is_read;
          delete rest.read_at;
          delete rest.read_by;
          setNotifications((prev) => prev.map((n) => (n.id === rest.id ? { ...n, ...rest } : n)));
        } else if (payload.eventType === "DELETE") {
          const row = payload.old;
          const removed = notificationsRef.current.find((n) => n.id === row.id);
          if (removed && !removed.is_read) setUnreadCount((c) => Math.max(0, c - 1));
          setNotifications((prev) => prev.filter((n) => n.id !== row.id));
        }
      })
        // Read changes are per admin; ignore this client's confirmed optimistic writes.
        .on("postgres_changes", {
          event: "*",
          schema: "public",
          table: READS_TABLE,
          filter: `username=eq.${reader}`,
        }, handleReadChange)
      .subscribe((status) => {
          if (status === "SUBSCRIBED") {
            statusRef.current = "live";
            setNotifStatus("live");
          } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
            statusRef.current = "error";
            setNotifStatus("error");
          } else {
            statusRef.current = "connecting";
            setNotifStatus("connecting");
          }
      });

    const poll = setInterval(() => {
        if (!document.hidden && statusRef.current !== "live") fetchNotifications();
    }, NOTIF_POLL_MS);

    const onVisible = () => {
      if (!document.hidden) fetchNotifications();
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      clearInterval(poll);
      window.clearTimeout(refetchTimer);
      document.removeEventListener("visibilitychange", onVisible);
      supabase.removeChannel(channel);
    };
  }, [fetchNotifications, reader]);

  useEffect(() => {
    if (notifOpen) fetchNotifications();
  }, [notifOpen, fetchNotifications]);

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

  const toggleNotifDropdown = useCallback(() => setNotifOpen((prev) => !prev), []);

  // Saves "read" rows for this admin. Verifies rows were actually written.
  const saveReads = useCallback(
    async (ids) => {
      const now = new Date().toISOString();
      const { data, error } = await supabase
        .from(READS_TABLE)
        .upsert(
          ids.map((id) => ({ username: reader, notification_id: id, read_at: now })),
          { onConflict: "username,notification_id" }
        )
        .select("notification_id");
      if (error) throw error;
      if (!data || data.length === 0) {
        throw new Error("Nothing was saved (check the RLS policies on notification_reads).");
      }
    },
    [reader]
  );

  const markNotificationRead = useCallback(
    async (notif) => {
      if (!notif || notif.is_read) return;
      manualUnreadRef.current.delete(notif.id);
      pendingRef.current.set(notif.id, { is_read: true, ts: Date.now() });
      setNotifications((prev) => prev.map((n) => (n.id === notif.id ? { ...n, is_read: true } : n)));
      setUnreadCount((c) => Math.max(0, c - 1));

      try {
        await saveReads([notif.id]);
      } catch (err) {
        console.error("[Home] Could not mark notification as read:", err);
        pendingRef.current.delete(notif.id);
        fetchNotifications();
      }
    },
    [fetchNotifications, saveReads]
  );

  const markNotificationUnread = useCallback(
    async (notif) => {
      if (!notif || !notif.is_read) return;
      manualUnreadRef.current.add(notif.id);
      pendingRef.current.set(notif.id, { is_read: false, ts: Date.now() });
      setNotifications((prev) => prev.map((n) => (n.id === notif.id ? { ...n, is_read: false } : n)));
      setUnreadCount((c) => c + 1);

      try {
        const { data, error } = await supabase
          .from(READS_TABLE)
          .delete()
          .eq("username", reader)
          .eq("notification_id", notif.id)
          .select("notification_id");
        if (error) throw error;
        if (!data || data.length === 0) {
          throw new Error("Nothing was removed (check the RLS policies on notification_reads).");
        }
      } catch (err) {
        console.error("[Home] Could not mark notification as unread:", err);
        pendingRef.current.delete(notif.id);
        manualUnreadRef.current.delete(notif.id);
        fetchNotifications();
      }
    },
    [fetchNotifications, reader]
  );

  const markIdsRead = useCallback(
    async (ids) => {
      if (!ids.length) return;
      const idSet = new Set(ids);
      const nowMs = Date.now();
      ids.forEach((id) => pendingRef.current.set(id, { is_read: true, ts: nowMs }));
      setNotifications((prev) => prev.map((n) => (idSet.has(n.id) ? { ...n, is_read: true } : n)));
      setUnreadCount((c) => Math.max(0, c - ids.length));

      try {
        await saveReads(ids);
      } catch (err) {
        console.error("[Home] Could not mark notifications as read:", err);
        ids.forEach((id) => pendingRef.current.delete(id));
        fetchNotifications();
      }
    },
    [fetchNotifications, saveReads]
  );

  const markAllNotificationsRead = useCallback(async () => {
    if (unreadCount === 0) return;
    manualUnreadRef.current.clear();
    const nowMs = Date.now();
    notificationsRef.current
      .filter((n) => !n.is_read)
      .forEach((n) => pendingRef.current.set(n.id, { is_read: true, ts: nowMs }));
    setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
    setUnreadCount(0);

    try {
      const { error } = await supabase.rpc("notification_mark_all_read", { p_username: reader });
      if (error) throw error;
    } catch (err) {
      console.error("[Home] Could not mark all notifications as read:", err);
      notificationsRef.current.forEach((n) => pendingRef.current.delete(n.id));
    }
    fetchNotifications();
  }, [fetchNotifications, reader, unreadCount]);

  // Opening the bell shows what's new; closing it marks what you saw as read (saved to the DB).
  useEffect(() => {
    if (notifOpen) {
      wasOpenRef.current = true;
      manualUnreadRef.current.clear();
      return;
    }
    if (!wasOpenRef.current) return;
    wasOpenRef.current = false;
    const ids = notificationsRef.current
      .filter((n) => !n.is_read && !manualUnreadRef.current.has(n.id))
      .map((n) => n.id);
    markIdsRead(ids);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [notifOpen]);

  const markNotificationClicked = useCallback(
    (id) => {
      const notif = notificationsRef.current.find((n) => n.id === id);
      if (notif) markNotificationRead(notif);
    },
    [markNotificationRead]
  );

  // Removing a notification deletes it for every admin (same as before);
  // their notification_reads rows are removed automatically.
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