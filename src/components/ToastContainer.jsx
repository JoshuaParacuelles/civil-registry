import React, { useLayoutEffect, useRef } from "react";
import ReactDOM from "react-dom";
import useToasts from "../hooks/useToasts";
import { hideToast } from "../services/toastService";
import StatusToast from "./StatusToast";
import "./ToastContainer.css";

const TOAST_WRAP_STYLE = {
  position: "fixed",
  top: "12px",
  right: "12px",
  left: "auto",
  bottom: "auto",
  zIndex: 999999,
};

function Toast({ id, title, message, duration, createdAt, hiding, success = true }) {
  const progressRef = useRef(null);
  useLayoutEffect(() => {
    const elapsed = Math.min(Date.now() - createdAt, duration);
    progressRef.current?.style.setProperty("animation-delay", `-${elapsed}ms`);
  }, [createdAt, duration]);
  const iconColor = success ? "#16a34a" : "#dc2626";

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
      <button type="button" className="toast-close" onClick={() => hideToast(id)} aria-label="Dismiss">×</button>
      <div className="toast-progress">
        <div
          ref={progressRef}
          className="toast-progress-bar"
          style={{ animationDuration: `${duration}ms`, background: iconColor }}
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
        t.presentation === "status"
          ? <StatusToast key={t.id} {...t} onDismiss={hideToast} />
          : <Toast key={t.id} {...t} />
      ))}
    </div>,
    document.body
  );
}