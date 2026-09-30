import React, { useState, useEffect } from "react";
import ReactDOM from "react-dom";
import useToasts from "../hooks/useToasts";
import { removeToast } from "../services/toastService";
import "./ToastContainer.css";

const TOAST_WRAP_STYLE = {
  position: "fixed",
  top: "12px",
  right: "12px",
  left: "auto",
  bottom: "auto",
  zIndex: 999999,
};

function Toast({ id, title, message, duration = 5000, success = true }) {
  const [hiding, setHiding] = useState(false);

  const dismiss = () => {
    setHiding(true);
    setTimeout(() => removeToast(id), 300);
  };

  useEffect(() => {
    const timer = setTimeout(dismiss, duration);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [duration]);

  const iconColor = success ? "#16a34a" : "#dc2626";
  const barColor  = success ? "#16a34a" : "#dc2626";

  return (
    <div className={`toast${hiding ? " hiding" : ""}`}>
      <svg className="toast-icon" viewBox="0 0 24 24" fill="none"
        stroke={iconColor} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        {success ? (
          <>
            <circle cx="12" cy="12" r="10" />
            <path d="M9 12l2 2 4-4" />
          </>
        ) : (
          <>
            <circle cx="12" cy="12" r="10" />
            <path d="M12 8v4m0 4h.01" />
          </>
        )}
      </svg>
      <div className="toast-body">
        <div className="toast-title">{title}</div>
        <div className="toast-msg">{message}</div>
      </div>
      <button className="toast-close" onClick={dismiss}>×</button>
      <div className="toast-progress">
        <div
          className="toast-progress-bar"
          style={{ animationDuration: `${duration}ms`, background: barColor }}
        />
      </div>
    </div>
  );
}

export default function ToastContainer() {
  const toasts = useToasts();
  return ReactDOM.createPortal(
    <div className="toast-wrap" style={TOAST_WRAP_STYLE}>
      {toasts.map((t) => (
        <Toast key={t.id} {...t} />
      ))}
    </div>,
    document.body
  );
}