import React, { memo, useEffect, useLayoutEffect, useState } from "react";
import "./NotificationBell.css";

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

const KebabIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <circle cx="5" cy="12" r="1.8" fill="currentColor" />
    <circle cx="12" cy="12" r="1.8" fill="currentColor" />
    <circle cx="19" cy="12" r="1.8" fill="currentColor" />
  </svg>
);

const NotifTypeIcon = ({ type }) => {
  if (type === "birth") return <BirthIcon />;
  if (type === "marriage") return <MarriageIcon />;
  if (type === "death") return <DeathIcon />;
  return <SystemIcon />;
};

// Max width of the notification panel on phones (shrinks on narrower screens)
const NOTIF_MOBILE_MAX_WIDTH = 340;

// True while the viewport matches the given media query (updates on resize/rotate)
const useMediaQuery = (query) => {
  const [matches, setMatches] = useState(
    () => typeof window !== "undefined" && window.matchMedia(query).matches
  );

  useEffect(() => {
    const mq = window.matchMedia(query);
    const onChange = (e) => setMatches(e.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [query]);

  return matches;
};

const NotifItem = memo(function NotifItem({
  n,
  menuOpen,
  targets,
  onClick,
  onToggleMenu,
  onRead,
  onUnread,
  onDelete,
  onCloseMenu,
  timeAgo,
}) {
  const act = (callback) => () => {
    callback(n);
    onCloseMenu(null);
  };

  return (
    <li className={`notif-item${n.is_read ? "" : " unread"}`} onClick={() => onClick(n)}>
      <span className="notif-dot" />
      <div className={`notif-icon-wrap ${targets[n.record_type] ? n.record_type : "system"}`}>
        <NotifTypeIcon type={n.record_type} />
      </div>
      <div className="notif-body">
        <div className="notif-msg-row">
          <p className="notif-msg">{n.message || n.title}</p>
          {!n.is_read && <span className="notif-new-badge">NEW</span>}
        </div>
        <span className="notif-time">{timeAgo(n.created_at)}</span>
      </div>
      <div className="notif-kebab-wrap">
        <button
          type="button"
          className="notif-kebab-btn"
          aria-label="More actions"
          aria-haspopup="true"
          aria-expanded={menuOpen}
          onClick={(e) => onToggleMenu(n.id, e)}
        >
          <KebabIcon />
        </button>
        {menuOpen && (
          <div className="notif-action-menu" role="menu" onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              role="menuitem"
              className="notif-action-menu-item"
              onClick={act(n.is_read ? onUnread : onRead)}
            >
              {n.is_read ? "Mark as Unread" : "Mark as read"}
            </button>
            <button
              type="button"
              role="menuitem"
              className="notif-action-menu-item notif-action-menu-item--danger"
              onClick={act(onDelete)}
            >
              Remove
            </button>
          </div>
        )}
      </div>
    </li>
  );
});

const NotificationBell = ({
  notifOpen,
  notifWrapperRef,
  toggleNotifDropdown,
  unreadCount,
  notifStatus,
  notifLoading,
  notifications,
  openActionMenuId,
  toggleActionMenu,
  markAllNotificationsRead,
  markNotificationRead,
  markNotificationUnread,
  deleteNotification,
  handleNotifClick,
  timeAgo,
  NOTIF_TARGETS,
  setOpenActionMenuId,
}) => {
  const isMobile = useMediaQuery("(max-width: 767px)");

  // On mobile, the panel is absolutely positioned inside the wrapper, but its
  // left offset and width are measured so it always fits inside the screen.
  const [mobileStyle, setMobileStyle] = useState(undefined);

  useLayoutEffect(() => {
    if (!notifOpen || !isMobile) return undefined;

    const measure = () => {
      const el = notifWrapperRef && notifWrapperRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const vw = document.documentElement.clientWidth || window.innerWidth;
      const margin = vw <= 480 ? 8 : 12;
      const width = Math.min(NOTIF_MOBILE_MAX_WIDTH, vw - margin * 2);
      // Right edge of the panel sits `margin` px from the right of the screen
      const leftInViewport = vw - margin - width;
      setMobileStyle({
        left: `${leftInViewport - rect.left}px`,
        right: "auto",
        width: `${width}px`,
      });
    };

    measure();
    window.addEventListener("resize", measure);
    window.addEventListener("orientationchange", measure);
    return () => {
      window.removeEventListener("resize", measure);
      window.removeEventListener("orientationchange", measure);
    };
  }, [notifOpen, isMobile, notifWrapperRef]);

  const badgeText = unreadCount > 99 ? "99+" : String(unreadCount);
  const statusTitle =
    notifStatus === "live"
      ? "Live — connected to real-time notifications"
      : notifStatus === "error"
        ? "Can't reach the server — retrying"
        : "Connecting…";

  const panel = (
    <div
      className="notif-dropdown"
      role="dialog"
      aria-label="Notifications"
      style={isMobile && notifOpen ? mobileStyle : undefined}
    >
      <div className="notif-panel-header">
        <div className="notif-panel-title-row">
          <span className="notif-panel-title">Notifications</span>
          {unreadCount > 0 && <span className="notif-panel-count">{unreadCount} new</span>}
          <span className={`notif-sse-dot ${notifStatus}`} title={statusTitle} aria-label={statusTitle} />
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
            <NotifItem
              key={n.id}
              n={n}
              menuOpen={openActionMenuId === n.id}
              targets={NOTIF_TARGETS}
              onClick={handleNotifClick}
              onToggleMenu={toggleActionMenu}
              onRead={markNotificationRead}
              onUnread={markNotificationUnread}
              onDelete={deleteNotification}
              onCloseMenu={setOpenActionMenuId}
              timeAgo={timeAgo}
            />
          ))
        )}
      </ul>
    </div>
  );

  return (
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

      {notifOpen && panel}
    </div>
  );
};

export default NotificationBell;