import React, { memo, useEffect, useRef, useState } from "react";
import { useGlobalRefresh } from "../context/RefreshContext";
import "./Topbar.css";

const dateFmt = new Intl.DateTimeFormat("en-PH", {
  weekday: "short",
  month: "short",
  day: "numeric",
  year: "numeric",
});

const CalendarIcon = () => (
  <svg className="topbar-datetime-icon" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <rect x="3" y="5" width="18" height="16" rx="3" stroke="currentColor" strokeWidth="1.6" />
    <path d="M3 9.5H21" stroke="currentColor" strokeWidth="1.6" />
    <path d="M8 3V6.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    <path d="M16 3V6.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
  </svg>
);

const RefreshIcon = () => (
  <svg className="topbar-refresh-icon" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <path d="M20 12a8 8 0 1 1-2.34-5.66" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M20 4v5h-5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const TopbarDate = memo(function TopbarDate() {
  const [label, setLabel] = useState(() => dateFmt.format(new Date()));

  useEffect(() => {
    let timer;
    const schedule = () => {
      const now = new Date();
      const nextMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
      const delay = nextMidnight.getTime() - now.getTime() + 1000;
      timer = setTimeout(() => {
        setLabel(dateFmt.format(new Date()));
        schedule();
      }, delay);
    };

    schedule();
    return () => clearTimeout(timer);
  }, []);

  return (
    <div className="topbar-datetime" aria-label="Current date">
      <span className="topbar-datetime-item">
        <CalendarIcon />
        <span>{label}</span>
      </span>
    </div>
  );
});

const RefreshButton = memo(function RefreshButton() {
  const { refresh, isRefreshing } = useGlobalRefresh();
  const [status, setStatus] = useState(null); // null | "ok" | "error"
  const [online, setOnline] = useState(() => navigator.onLine);
  const statusTimer = useRef(null);

  useEffect(() => {
    const handleOnline = () => setOnline(true);
    const handleOffline = () => setOnline(false);
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  useEffect(() => () => clearTimeout(statusTimer.current), []);

  const handleClick = async () => {
    if (isRefreshing) return;

    const res = await refresh();
    if (res.reason === "busy") return;

    setStatus(res.ok ? "ok" : "error");
    clearTimeout(statusTimer.current);
    statusTimer.current = setTimeout(() => setStatus(null), 1800);
  };

  const state = isRefreshing ? "loading" : status ?? "idle";

  const title = isRefreshing
    ? "Refreshing…"
    : status === "error"
      ? "Refresh failed. Showing previous content."
      : online
        ? "Refresh page data"
        : "Offline: reload cached data";

  return (
    <>
      <button
        type="button"
        className="topbar-refresh-btn"
        data-state={state}
        onClick={handleClick}
        disabled={isRefreshing}
        aria-busy={isRefreshing}
        aria-label="Refresh page data"
        title={title}
      >
        <span className="topbar-refresh-icon-wrap">
          <RefreshIcon />
        </span>
      </button>
      <span className="topbar-refresh-sr" role="status" aria-live="polite">
        {isRefreshing
          ? "Refreshing data"
          : status === "ok"
            ? "Data refreshed"
            : status === "error"
              ? "Refresh failed"
              : ""}
      </span>
    </>
  );
});

const Topbar = ({ activeSubMenu, toggleSidebar, children }) => (
  <header className="topbar">
    <div className="topbar-left">
      <button className="topbar-toggle" onClick={toggleSidebar} type="button">
        <span className="topbar-toggle-icon">☰</span>
      </button>
      <span className="topbar-breadcrumb-current">{activeSubMenu}</span>
    </div>

    <div className="topbar-right">
      <TopbarDate />
      <RefreshButton />
      {children}
    </div>
  </header>
);

export default memo(Topbar);