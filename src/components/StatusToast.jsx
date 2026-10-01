import React, { useLayoutEffect, useRef } from "react";
import "./StatusToast.css";

const CloseIcon = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
  </svg>
);

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
  if (type === "error") return <ToastErrorIcon />;
  return <ToastSuccessIcon />;
};

const StatusToast = ({ id, title, message, type = "success", duration = 5000, createdAt, hiding, onDismiss }) => {
  const progressRef = useRef(null);
  useLayoutEffect(() => {
    const elapsed = Math.min(Date.now() - createdAt, duration);
    progressRef.current?.style.setProperty("animation-delay", `-${elapsed}ms`);
  }, [createdAt, duration]);

  return (
    <div className={`notif-toast notif-toast--${type}${hiding ? " notif-toast--hiding" : ""}`}>
      <span className="notif-toast__icon-wrap">
        <StatusToastIcon type={type} />
      </span>
      <div className="notif-toast__body">
        <div className="notif-toast__title">{title}</div>
        {message && <div className="notif-toast__msg">{message}</div>}
      </div>
      <button type="button" className="notif-toast__close" onClick={() => onDismiss(id)} aria-label="Dismiss">
        <CloseIcon />
      </button>
      <div className="notif-toast__progress">
        <div ref={progressRef} className="notif-toast__progress-bar" style={{ animationDuration: `${duration}ms` }} />
      </div>
    </div>
  );
};

export default StatusToast;
