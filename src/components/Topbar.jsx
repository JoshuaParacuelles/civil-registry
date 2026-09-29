import React, { memo, useEffect, useState } from "react";
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

      {children}
    </div>
  </header>
);

export default memo(Topbar);
