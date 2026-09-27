import React from "react";
import "./Topbar.css";

const CalendarIcon = () => (
  <svg className="topbar-datetime-icon" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <rect x="3" y="5" width="18" height="16" rx="3" stroke="currentColor" strokeWidth="1.6" />
    <path d="M3 9.5H21" stroke="currentColor" strokeWidth="1.6" />
    <path d="M8 3V6.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    <path d="M16 3V6.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
  </svg>
);

const Topbar = ({ activeSubMenu, now, toggleSidebar, children }) => (
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
          <span>{new Date(now).toLocaleDateString("en-PH", { weekday: "short", month: "short", day: "numeric", year: "numeric" })}</span>
        </span>
      </div>

      {children}
    </div>
  </header>
);

export default Topbar;
