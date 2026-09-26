import React, { useState, useEffect, useRef } from "react";
import ReactDOM from "react-dom";
import axios from "axios";
import "./Login.css";

import bgImage from "../../assets/home.jpg";
import loginLogo from "../../assets/scc.png";

// BUG FIX: this was hardcoded to the absolute Render URL
// ("https://civil-registry.onrender.com"), which made every login
// request cross-origin/cross-site relative to the page — even in local
// dev, since it pointed at the deployed backend instead of localhost.
// That meant the session cookie Set-Cookie'd back by the login response
// was a third-party cookie from the browser's point of view, which
// modern browsers block or drop by default. The result: login appeared
// to succeed, but the cookie never actually stuck, so the very next
// /api/session check (in PermissionContext) came back unauthenticated
// and bounced the user straight back to the login page.
//
// Relative by default — same pattern as PermissionContext.jsx. In local
// dev this goes through the Vite proxy to localhost:5000; in production
// it goes through the vercel.json rewrite to the Render backend. Either
// way the request stays same-origin from the browser's perspective, so
// the cookie is set and sent as first-party.
const API = import.meta.env.VITE_API_BASE_URL || "";

/* ── Icons ─────────────────────────────────────────────────────── */
const UserIcon = () => (
  <svg width="19" height="19" viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
    <circle cx="12" cy="7" r="4" />
  </svg>
);

const LockIcon = () => (
  <svg width="19" height="19" viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
    <path d="M7 11V7a5 5 0 0 1 10 0v4" />
  </svg>
);

const EyeIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
    <circle cx="12" cy="12" r="3" />
  </svg>
);

const EyeOffIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
    <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
    <line x1="1" y1="1" x2="23" y2="23" />
  </svg>
);

const LockFilledIcon = () => (
  <svg width="19" height="19" viewBox="0 0 24 24" fill="currentColor">
    <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
    <path d="M7 11V7a5 5 0 0 1 10 0v4" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
  </svg>
);

/* ── Lock countdown formatting ───────────────────────────────────
   Backend sends lock_seconds_remaining (an integer, from
   compute_lock_status() in login.py). Format it the way that reads
   best at each scale:
     < 1 hour  -> "4:59"        (mm:ss, always 2-digit seconds)
     >= 1 hour -> "23h 59m 12s" (the 24h tier)
   ────────────────────────────────────────────────────────────────── */
function formatLockCountdown(totalSeconds) {
  const s = Math.max(0, Math.floor(totalSeconds));

  if (s >= 3600) {
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    return `${h}h ${String(m).padStart(2, "0")}m ${String(sec).padStart(2, "0")}s`;
  }

  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}:${String(sec).padStart(2, "0")}`;
}

/* ── Toast System ────────────────────────────────────────────────── */
let _toastSetters = [];

function useToasts() {
  const [toasts, setToasts] = useState([]);
  useEffect(() => {
    _toastSetters.push(setToasts);
    return () => {
      _toastSetters = _toastSetters.filter((s) => s !== setToasts);
    };
  }, []);
  return toasts;
}

function pushToast(toast) {
  const id = Date.now();
  _toastSetters.forEach((set) => set((prev) => [...prev, { ...toast, id }]));
  return id;
}

function removeToast(id) {
  _toastSetters.forEach((set) => set((prev) => prev.filter((t) => t.id !== id)));
}

function ToastContainer() {
  const toasts = useToasts();
  return ReactDOM.createPortal(
    <div className="toast-wrap">
      {toasts.map((t) => (
        <Toast key={t.id} {...t} />
      ))}
    </div>,
    document.body
  );
}

function Toast({ id, title, message, duration = 5000, success = true }) {
  const [hiding, setHiding] = useState(false);

  const dismiss = () => {
    setHiding(true);
    setTimeout(() => removeToast(id), 300);
  };

  useEffect(() => {
    const timer = setTimeout(dismiss, duration);
    return () => clearTimeout(timer);
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

/* ── Mobile-only style override ──────────────────────────────────
   Requested fix: on mobile the page must be fully white (no bleed-
   through from the .login-right background photo behind the curve)
   and the toast must anchor to the UPPER-RIGHT corner — same as
   desktop — instead of stretching across the bottom of the screen.

   This is kept here (rather than only in Login.css) because the
   CSS-only version wasn't reliably taking effect. Rendering it as a
   <style> tag inside the component guarantees it loads after
   Login.css, and the `!important`s make the override unambiguous
   regardless of import/cache order. It only targets the existing
   `≤768px` mobile breakpoint, so the desktop layout (S-curve,
   background photo, top-right toast) is completely unaffected.
   ────────────────────────────────────────────────────────────────── */
const MobileOverrideStyles = () => (
  <style>{`
    @media (max-width: 768px) {
      /* Hide the background photo panel entirely so nothing shows
         through behind the curved/white form panel. */
      .login-right {
        display: none !important;
      }

      /* Make sure the page shell and the form panel are both a flat,
         completely white background. */
      .login-page {
        background: #ffffff !important;
      }

      .login-left {
        background: #ffffff !important;
      }

      /* Anchor the toast to the upper-right corner, matching the
         desktop position, instead of stretching across the bottom. */
      .toast-wrap {
        top: 20px !important;
        bottom: auto !important;
        right: 20px !important;
        left: auto !important;
      }

      .toast {
        min-width: 0 !important;
        max-width: min(340px, calc(100vw - 40px)) !important;
        width: auto !important;
        border-radius: 10px !important;
      }
    }
  `}</style>
);

/* ── Main Component ──────────────────────────────────────────────── */
const Login = () => {
  const [username, setUsername]         = useState("");
  const [password, setPassword]         = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading]           = useState(false);
  const [isLocked, setIsLocked]         = useState(false);

  // Live countdown for a temporary lockout. Seeded from the backend's
  // `lock_seconds_remaining` (see compute_lock_status() in login.py) and
  // ticks down client-side every second purely for display — the actual
  // unlock is always re-checked against the server on the next submit,
  // this timer never unlocks anything by itself.
  const [lockSecondsRemaining, setLockSecondsRemaining] = useState(0);
  const countdownRef = useRef(null);

  useEffect(() => {
    // If already authenticated, route directly
    if (sessionStorage.getItem("isAuthenticated") === "true") {
      window.location.href = "/dashboard";
    }
  }, []);

  // Tick the countdown down once a lock is active.
  useEffect(() => {
    if (!isLocked || lockSecondsRemaining <= 0) {
      clearInterval(countdownRef.current);
      return;
    }

    countdownRef.current = setInterval(() => {
      setLockSecondsRemaining((prev) => {
        if (prev <= 1) {
          clearInterval(countdownRef.current);
          // Countdown hit zero — let the person try again. The next
          // /api/login call is still the real source of truth; if the
          // backend clock disagrees (e.g. this tab was asleep), it will
          // just re-lock with a fresh, accurate remaining time.
          setIsLocked(false);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(countdownRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLocked]);

  const handleLogin = async (e) => {
    e.preventDefault();
    if (loading || isLocked) return;
    setLoading(true);

    try {
      const response = await axios.post(
        `${API}/api/login`,
        { username, password },
        { withCredentials: true }
      );

      const msg = response?.data?.message || "Login successful.";

      if (response.data.success) {
        setIsLocked(false);
        setLockSecondsRemaining(0);
        const userObj = response.data.user || {};
        const loggedUsername = userObj.username || username;

        // Persist session flags explicitly
        sessionStorage.setItem("isAuthenticated", "true");
        sessionStorage.setItem("username", loggedUsername);

        pushToast({ title: "Login successful!", message: msg, success: true, duration: 2000 });

        // Direct window refresh-navigation to trigger context re-mount
        setTimeout(() => {
          window.location.href = "/dashboard";
        }, 400);
      } else {
        const locked = msg.toLowerCase().includes("locked");
        setIsLocked(locked);
        setLockSecondsRemaining(locked ? (response.data.lock_seconds_remaining || 0) : 0);
        pushToast({
          title: locked ? "Account locked" : "Login failed",
          message: msg,
          success: false,
        });
        setLoading(false);
      }
    } catch (error) {
      console.error("Login error:", error);
      const backendMessage =
        error?.response?.data?.message || "Server error. Please try again later.";
      const locked = backendMessage.toLowerCase().includes("locked");
      setIsLocked(locked);
      setLockSecondsRemaining(locked ? (error?.response?.data?.lock_seconds_remaining || 0) : 0);
      pushToast({
        title: locked ? "Account locked" : "Login failed",
        message: backendMessage,
        success: false,
      });
      setLoading(false);
    }
  };

  return (
    <div className="login-page">
      <MobileOverrideStyles />

      <ToastContainer />

      <svg width="0" height="0" style={{ position: "absolute" }}>
        <defs>
          <clipPath id="loginCurve" clipPathUnits="objectBoundingBox">
            <path d="M 0 0 L 0.9091 0 C 0.9821 0.25, 0.8361 0.75, 0.9091 1 L 0 1 Z" />
          </clipPath>
        </defs>
      </svg>

      <div className="login-right">
        <div className="login-right-bg" style={{ backgroundImage: `url(${bgImage})` }} />
        <div className="login-right-overlay" />
      </div>

      <div className="login-left">
        <div className="login-left-inner">
          <div className="shake-wrapper">
            <img src={loginLogo} alt="City of San Carlos Logo" className="login-logo" />

            <div className="login-header">
              <h2>Local Civil Registrar</h2>
              <hr />
            </div>

            {isLocked && (
              <div className="lock-banner">
                <LockFilledIcon />
                <span>
                  Account temporarily locked
                  {lockSecondsRemaining > 0 && (
                    <>
                      {" "}— try again in{" "}
                      <span className="lock-countdown">
                        {formatLockCountdown(lockSecondsRemaining)}
                      </span>
                    </>
                  )}
                </span>
              </div>
            )}

            <form onSubmit={handleLogin}>
              <div className={`input-group${isLocked ? " input-locked" : ""}${username ? " has-value" : ""}`}>
                <span className="icon-left"><UserIcon /></span>
                <label className="floating-label" htmlFor="login-username">Username</label>
                <input
                  id="login-username"
                  name="username"
                  type="text"
                  placeholder="Username"
                  value={username}
                  onChange={(e) => { setUsername(e.target.value); setIsLocked(false); }}
                  required
                  autoComplete="username"
                  disabled={loading}
                />
              </div>

              <div className={`input-group password-group${isLocked ? " input-locked" : ""}${password ? " has-value" : ""}`}>
                <span className="icon-left"><LockIcon /></span>
                <label className="floating-label" htmlFor="login-password">Password</label>
                <input
                  id="login-password"
                  name="password"
                  type={showPassword ? "text" : "password"}
                  placeholder="Password"
                  value={password}
                  onChange={(e) => { setPassword(e.target.value); setIsLocked(false); }}
                  required
                  autoComplete="current-password"
                  disabled={loading}
                />
                <span
                  className="icon-right"
                  onClick={() => setShowPassword((p) => !p)}
                  role="button"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? <EyeOffIcon /> : <EyeIcon />}
                </span>
              </div>

              <button
                type="submit"
                className={`login-btn${loading ? " btn-loading" : ""}${isLocked ? " btn-locked" : ""}`}
                disabled={loading || isLocked}
              >
               {loading ? (
  <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
    <span className="spinner" />
    Logging in…
  </span>
) : isLocked ? (
  lockSecondsRemaining > 0
    ? `Account Locked (${formatLockCountdown(lockSecondsRemaining)})`
    : "Account Locked"
) : (
  "Log in"
)}
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Login;