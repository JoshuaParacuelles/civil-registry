import React, { useState, useEffect, useMemo, useRef } from "react";
import { usePermissions } from "../PermissionContext";
import "./ChangePassword.css";

// ── ICONS ──────────────────────────────────────────────────────────────────

const EyeIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
    <circle cx="12" cy="12" r="3" />
  </svg>
);

const EyeOffIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
    <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
    <line x1="1" y1="1" x2="23" y2="23" />
  </svg>
);

const LockIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
    <path d="M7 11V7a5 5 0 0 1 10 0v4" />
  </svg>
);

const UserIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
    <circle cx="12" cy="7" r="4" />
  </svg>
);

const ArchiveIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="21 8 21 21 3 21 3 8" />
    <rect x="1" y="3" width="22" height="5" />
    <line x1="10" y1="12" x2="14" y2="12" />
  </svg>
);

const ShieldIcon = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
  </svg>
);

// ── CONFIG ─────────────────────────────────────────────────────────────────

const API_BASE = "http://localhost:5000";

const MODULE_CONFIGS = {
  archiveBirth: {
    label: "Archive Birth",
    endpoint: `${API_BASE}/api/change-module-password`,
    moduleKey: "archive_birth",
  },
  marriageArchive: {
    label: "Marriage Archive",
    endpoint: `${API_BASE}/api/change-module-password`,
    moduleKey: "archive_marriage",
  },
  deathArchive: {
    label: "Death Archive",
    endpoint: `${API_BASE}/api/change-module-password`,
    moduleKey: "archive_death",
  },
};

const TABS = [
  { key: "password",        label: "Password",        icon: <LockIcon />,    section: "Account"   },
  { key: "username",        label: "Username",         icon: <UserIcon />,    section: "Account"   },
  { key: "archiveBirth",    label: "Archive Birth",    icon: <ArchiveIcon />, section: "Password"  },
  { key: "marriageArchive", label: "Marriage Archive", icon: <ArchiveIcon />, section: "Password"  },
  { key: "deathArchive",    label: "Death Archive",    icon: <ArchiveIcon />, section: "Password"  },
];

const TAB_REQUIRED_MODULE = {
  password:        null,
  username:        null,
  archiveBirth:    "birth_archive_uploader",
  marriageArchive: "marriage_archive_uploader",
  deathArchive:    "death_archive_uploader",
};

const TAB_INFO = {
  password:        { title: "Change Password",           desc: "Update your account login password",                     icon: <LockIcon />    },
  username:        { title: "Change Username",           desc: "Update your display name",                               icon: <UserIcon />    },
  archiveBirth:    { title: "Archive Birth Password",    desc: "Manage access password for the Archive Birth module",    icon: <ArchiveIcon /> },
  marriageArchive: { title: "Marriage Archive Password", desc: "Manage access password for the Marriage Archive module", icon: <ArchiveIcon /> },
  deathArchive:    { title: "Death Archive Password",    desc: "Manage access password for the Death Archive module",    icon: <ArchiveIcon /> },
};

const MODULE_STATUS_CONFIG = [
  { label: "Account Password", badge: "Protected", cls: "protected", module: null },
  { label: "Archive Birth",    badge: "Protected", cls: "protected", module: "birth_archive_uploader" },
  { label: "Marriage Archive", badge: "Protected", cls: "protected", module: "marriage_archive_uploader" },
  { label: "Death Archive",    badge: "Protected", cls: "protected", module: "death_archive_uploader" },
  { label: "Current Session",  badge: "Active",    cls: "active-now", module: null },
];

const SECURITY_TIPS = [
  "Use at least 8 characters",
  "Mix letters, numbers & symbols",
  "Never share your credentials",
  "Update passwords regularly",
  "Use unique passwords per module",
];

// ── ERROR RESPONSE HELPER ────────────────────────────────────────────────

function classifyError(status, result) {
  const code = result?.code;

  if (code === "NOT_LOGGED_IN" || (!code && status === 401)) {
    return { title: "Session expired", isSessionError: true };
  }
  if (code === "INVALID_PASSWORD" || status === 403) {
    return { title: "Incorrect password", isSessionError: false };
  }
  if (code === "USERNAME_TAKEN" || status === 409) {
    return { title: "Username unavailable", isSessionError: false };
  }
  if (code === "VALIDATION_ERROR" || status === 400) {
    return { title: "Check your input", isSessionError: false };
  }
  if (code === "NOT_FOUND" || status === 404) {
    return { title: "Not found", isSessionError: false };
  }
  return { title: "Update failed", isSessionError: false };
}

// ── TOAST SYSTEM ────────────────────────────────────────────────────────────

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
  _toastSetters.forEach((set) =>
    set((prev) => prev.filter((t) => t.id !== id))
  );
}

function ToastContainer() {
  const toasts = useToasts();
  return (
    <div className="cp-toast-wrap">
      {toasts.map((t) => (
        <Toast key={t.id} {...t} />
      ))}
    </div>
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
  }, []);

  const iconColor = success ? "#16a34a" : "#dc2626";
  const barColor  = success ? "#16a34a" : "#dc2626";

  return (
    <div className={`cp-toast${hiding ? " hiding" : ""}`}>
      <svg
        className="cp-toast-icon"
        viewBox="0 0 24 24"
        fill="none"
        stroke={iconColor}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
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
      <div className="cp-toast-body">
        <div className="cp-toast-title">{title}</div>
        <div className="cp-toast-msg">{message}</div>
      </div>
      <button className="cp-toast-close" onClick={dismiss}>×</button>
      <div className="cp-toast-progress">
        <div
          className="cp-toast-progress-bar"
          style={{ animationDuration: `${duration}ms`, background: barColor }}
        />
      </div>
    </div>
  );
}

// ── SUB-COMPONENTS ─────────────────────────────────────────────────────────

const SectionDivider = ({ label }) => (
  <div className="cp-section-divider">
    <div className="cp-section-divider-line" />
    <span className="cp-section-divider-text">{label}</span>
    <div className="cp-section-divider-line" />
  </div>
);

// FIX: accepts an `id` prop now, used on the <input> AND as the
// label's `htmlFor`, so every field is properly associated with its
// label (fixes "No label associated with a form field") and has a
// globally-unique id (fixes "neither an id nor a name attribute" /
// duplicate-id autofill confusion when the same component is reused
// across the Password tab, Username tab, and the three archive forms).
const PasswordField = ({ id, label, name, value, onChange, show, onToggle, placeholder, autoComplete }) => (
  <div className="cp-field">
    <label className="cp-label" htmlFor={id}>{label}</label>
    <div className="cp-input-wrap">
      <input
        id={id}
        type={show ? "text" : "password"}
        name={name}
        className="cp-input"
        placeholder={placeholder}
        value={value}
        onChange={onChange}
        autoComplete={autoComplete}
      />
      <button type="button" className="cp-toggle-btn" onClick={onToggle} aria-label={`Toggle ${label.toLowerCase()} visibility`}>
        {show ? <EyeOffIcon /> : <EyeIcon />}
      </button>
    </div>
  </div>
);

const ConfirmPasswordField = ({ id, value, newPassword, show, onToggle, onChange }) => (
  <div className="cp-field">
    <label className="cp-label" htmlFor={id}>Confirm New Password</label>
    <div className="cp-input-wrap">
      <input
        id={id}
        type={show ? "text" : "password"}
        name="confirmPassword"
        className="cp-input"
        placeholder="Re-enter new password"
        value={value}
        onChange={onChange}
        autoComplete="new-password"
      />
      <button type="button" className="cp-toggle-btn" onClick={onToggle} aria-label="Toggle confirm password visibility">
        {show ? <EyeOffIcon /> : <EyeIcon />}
      </button>
    </div>
    {value && newPassword !== value && <p className="cp-field-error">Passwords do not match</p>}
    {value && newPassword === value && newPassword && <p className="cp-field-ok">✓ Passwords match</p>}
  </div>
);

const ModulePasswordForm = ({ config, showNotify }) => {
  const [formData, setFormData] = useState({ currentPassword: "", newPassword: "", confirmPassword: "" });
  const [show, setShow] = useState({ current: false, new: false, confirm: false });
  const [loading, setLoading] = useState(false);

  // Unique id namespace per module (e.g. "archive_birth-current") so
  // ids never collide with the account Password tab or other modules.
  const idPrefix = config.moduleKey;

  const toggle = (field) => setShow((prev) => ({ ...prev, [field]: !prev[field] }));
  const handleChange = (e) => setFormData((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  const handleReset = () => setFormData({ currentPassword: "", newPassword: "", confirmPassword: "" });

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.currentPassword.trim()) return showNotify(false, "Error", `Current ${config.label} password is required.`);
    if (!formData.newPassword.trim())     return showNotify(false, "Error", "New password is required.");
    if (formData.newPassword.length < 6)  return showNotify(false, "Error", "New password must be at least 6 characters.");
    if (formData.newPassword !== formData.confirmPassword) return showNotify(false, "Error", "Passwords do not match.");
    if (formData.newPassword === formData.currentPassword) return showNotify(false, "Error", "New password must differ from current.");

    setLoading(true);
    try {
      const res = await fetch(config.endpoint, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          module: config.moduleKey,
          currentPassword: formData.currentPassword,
          newPassword: formData.newPassword,
        }),
      });
      let result = {};
      try { result = await res.json(); } catch { showNotify(false, "Error", "Invalid server response."); return; }
      if (res.ok && result.success) {
        showNotify(true, `${config.label} updated!`, result.message || "Password changed successfully.");
        handleReset();
      } else {
        const { title } = classifyError(res.status, result);
        showNotify(false, title, result.message || "An error occurred.");
      }
    } catch (err) {
      showNotify(false, "Connection error", navigator.onLine ? "Cannot reach the server." : "You are offline.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="cp-form" noValidate>
      <SectionDivider label="Verify Access" />
      <PasswordField
        id={`${idPrefix}-current`}
        label="Current Password"
        name="currentPassword"
        value={formData.currentPassword}
        onChange={handleChange}
        show={show.current}
        onToggle={() => toggle("current")}
        placeholder="Enter current password"
        autoComplete="current-password"
      />
      <SectionDivider label="Set New Password" />
      <PasswordField
        id={`${idPrefix}-new`}
        label="New Password"
        name="newPassword"
        value={formData.newPassword}
        onChange={handleChange}
        show={show.new}
        onToggle={() => toggle("new")}
        placeholder="Enter new password"
        autoComplete="new-password"
      />
      <ConfirmPasswordField
        id={`${idPrefix}-confirm`}
        value={formData.confirmPassword}
        newPassword={formData.newPassword}
        show={show.confirm}
        onToggle={() => toggle("confirm")}
        onChange={handleChange}
      />
      <div className="cp-form-actions">
        <button type="button" className="cp-btn-ghost" onClick={handleReset} disabled={loading}>
          Reset
        </button>
        <button type="submit" className="cp-btn-primary" disabled={loading}>
          {loading ? (<><span className="cp-spinner" /> Updating…</>) : "Update Password"}
        </button>
      </div>
    </form>
  );
};

// ── MAIN COMPONENT ─────────────────────────────────────────────────────────

const ChangePassword = () => {
  const { hasAccess, is_admin, loading: permsLoading } = usePermissions();

  const [formData, setFormData] = useState({
    currentPassword: "",
    newPassword: "",
    confirmPassword: "",
    newUsername: "",
  });
  const [displayName, setDisplayName] = useState("");
  const [sessionConfirmed, setSessionConfirmed] = useState(false);
  const [show, setShow] = useState({ current: false, new: false, confirm: false });
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState("password");

  const showNotify = (success, title, message) => {
    pushToast({ title, message, success, duration: 5000 });
  };

  const visibleTabs = useMemo(() => {
    return TABS.filter(({ key }) => {
      const requiredModule = TAB_REQUIRED_MODULE[key];
      if (!requiredModule) return true;
      if (permsLoading) return false;
      return is_admin || hasAccess(requiredModule);
    });
  }, [is_admin, hasAccess, permsLoading]);

  const visibleModuleStatusItems = useMemo(() => {
    return MODULE_STATUS_CONFIG.filter(({ module }) => {
      if (!module) return true;
      if (permsLoading) return false;
      return is_admin || hasAccess(module);
    });
  }, [is_admin, hasAccess, permsLoading]);

  useEffect(() => {
    if (!visibleTabs.some((t) => t.key === activeTab)) {
      setActiveTab(visibleTabs[0]?.key || "password");
    }
  }, [visibleTabs, activeTab]);

  useEffect(() => {
    const fetchUser = async () => {
      try {
        const res = await fetch(`${API_BASE}/api/current-user`, { method: "GET", credentials: "include" });
        const data = await res.json();
        if (res.ok && data.username) {
          setDisplayName(data.username);
          setSessionConfirmed(true);
          localStorage.setItem("cp_displayName", data.username);
        } else {
          const c = localStorage.getItem("cp_displayName");
          if (c) setDisplayName(c);
          setSessionConfirmed(false);
          showNotify(
            false,
            "Not signed in",
            "Your session could not be verified with the server. Password/username changes will fail until you log in again."
          );
        }
      } catch {
        const c = localStorage.getItem("cp_displayName");
        if (c) setDisplayName(c);
        setSessionConfirmed(false);
      }
    };
    fetchUser();
  }, []);

  const handleChange = (e) => setFormData((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  const toggleShow = (field) => setShow((prev) => ({ ...prev, [field]: !prev[field] }));
  const handleReset = () => setFormData({ currentPassword: "", newPassword: "", confirmPassword: "", newUsername: "" });

  const validateForm = () => {
    const { currentPassword, newPassword, confirmPassword, newUsername } = formData;
    if (!currentPassword.trim()) return "Current password is required.";
    if (activeTab === "password") {
      if (!newPassword.trim())             return "New password is required.";
      if (newPassword.length < 6)          return "New password must be at least 6 characters.";
      if (newPassword !== confirmPassword) return "Passwords do not match.";
      if (newPassword === currentPassword) return "New password must differ from current.";
    }
    if (activeTab === "username") {
      if (!newUsername.trim())             return "New username is required.";
      if (newUsername.length < 3)          return "Username must be at least 3 characters.";
      if (newUsername === displayName)     return "New username must be different from current.";
    }
    return null;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!sessionConfirmed) {
      showNotify(
        false,
        "Not signed in",
        "We couldn't verify your session with the server. Please log in again before changing your password or username."
      );
      return;
    }

    const error = validateForm();
    if (error) { showNotify(false, "Incomplete form", error); return; }
    setLoading(true);
    try {
      const payload = {
        currentPassword: formData.currentPassword,
        newPassword: activeTab === "password" ? formData.newPassword : "",
        newUsername: activeTab === "username" ? formData.newUsername.trim() : "",
        action: activeTab,
      };
      const res = await fetch(`${API_BASE}/api/change-password`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      let result = {};
      try { result = await res.json(); } catch { showNotify(false, "Error", "Invalid response from server."); return; }

      if (res.ok && result.success) {
        const updatedName = result.username || displayName;
        setDisplayName(updatedName);
        localStorage.setItem("cp_displayName", updatedName);
        showNotify(true, "Account updated!", result.message || "Changes saved successfully.");
        handleReset();
        return;
      }

      const { title, isSessionError } = classifyError(res.status, result);
      if (isSessionError) {
        setSessionConfirmed(false);
      }
      showNotify(false, title, result.message || "An error occurred.");
    } catch {
      showNotify(false, "Connection error", navigator.onLine ? "Cannot reach the server." : "You are offline.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="cp-root">
      <ToastContainer />

      <div className="cp-body">
        <div className="cp-tab-strip">
          {visibleTabs.map(({ key, label, icon, section }) => (
            <button
              key={key}
              type="button"
              className={`cp-tab-btn ${activeTab === key ? "active" : ""}`}
              onClick={() => { setActiveTab(key); handleReset(); }}
            >
              <div className="cp-tab-icon">{icon}</div>
              <span className="cp-tab-label">{label}</span>
              <span className="cp-tab-section-badge">{section}</span>
            </button>
          ))}
        </div>

        <div className="cp-content-grid">
          <div className="cp-form-card">
            <div className="cp-form-card-top">
              <div className="cp-form-card-icon">{TAB_INFO[activeTab].icon}</div>
              <div>
                <div className="cp-form-card-title">{TAB_INFO[activeTab].title}</div>
                <div className="cp-form-card-desc">{TAB_INFO[activeTab].desc}</div>
              </div>
            </div>

            <div className="cp-form-card-body">
              {activeTab === "password" && (
                <form onSubmit={handleSubmit} className="cp-form" noValidate>
                  <SectionDivider label="Verify Access" />
                  <PasswordField
                    id="password-current"
                    label="Current Password"
                    name="currentPassword"
                    value={formData.currentPassword}
                    onChange={handleChange}
                    show={show.current}
                    onToggle={() => toggleShow("current")}
                    placeholder="Enter your current password"
                    autoComplete="current-password"
                  />
                  <SectionDivider label="Set New Password" />
                  <PasswordField
                    id="password-new"
                    label="New Password"
                    name="newPassword"
                    value={formData.newPassword}
                    onChange={handleChange}
                    show={show.new}
                    onToggle={() => toggleShow("new")}
                    placeholder="Enter new password"
                    autoComplete="new-password"
                  />
                  <ConfirmPasswordField
                    id="password-confirm"
                    value={formData.confirmPassword}
                    newPassword={formData.newPassword}
                    show={show.confirm}
                    onToggle={() => toggleShow("confirm")}
                    onChange={handleChange}
                  />
                  <div className="cp-form-actions">
                    <button type="button" className="cp-btn-ghost" onClick={handleReset} disabled={loading}>
                      Reset Fields
                    </button>
                    <button type="submit" className="cp-btn-primary" disabled={loading}>
                      {loading ? (<><span className="cp-spinner" /> Updating…</>) : "Update Password"}
                    </button>
                  </div>
                </form>
              )}

              {activeTab === "username" && (
                <form onSubmit={handleSubmit} className="cp-form" noValidate>
                  <SectionDivider label="Verify Identity" />
                  <PasswordField
                    id="username-current"
                    label="Current Password"
                    name="currentPassword"
                    value={formData.currentPassword}
                    onChange={handleChange}
                    show={show.current}
                    onToggle={() => toggleShow("current")}
                    placeholder="Enter your current password"
                    autoComplete="current-password"
                  />
                  <SectionDivider label="New Username" />
                  <div className="cp-field">
                    <label className="cp-label" htmlFor="username-new">New Username</label>
                    <input
                      id="username-new"
                      type="text"
                      name="newUsername"
                      className="cp-input"
                      placeholder="Enter your new username"
                      value={formData.newUsername}
                      onChange={handleChange}
                      autoComplete="off"
                      style={{ paddingRight: 14 }}
                    />
                    <p className="cp-field-hint">Minimum 3 characters. Cannot match current username.</p>
                  </div>
                  <div className="cp-form-actions">
                    <button type="button" className="cp-btn-ghost" onClick={handleReset} disabled={loading}>
                      Reset Fields
                    </button>
                    <button type="submit" className="cp-btn-primary" disabled={loading}>
                      {loading ? (<><span className="cp-spinner" /> Updating…</>) : "Update Username"}
                    </button>
                  </div>
                </form>
              )}

              {activeTab === "archiveBirth" && (is_admin || hasAccess("birth_archive_uploader")) && (
                <ModulePasswordForm config={MODULE_CONFIGS.archiveBirth} showNotify={showNotify} />
              )}
              {activeTab === "marriageArchive" && (is_admin || hasAccess("marriage_archive_uploader")) && (
                <ModulePasswordForm config={MODULE_CONFIGS.marriageArchive} showNotify={showNotify} />
              )}
              {activeTab === "deathArchive" && (is_admin || hasAccess("death_archive_uploader")) && (
                <ModulePasswordForm config={MODULE_CONFIGS.deathArchive} showNotify={showNotify} />
              )}
            </div>
          </div>

          <div className="cp-right-col">
            <div className="cp-status-card">
              <div className="cp-status-title">Module Status</div>
              <div className="cp-status-list">
                {visibleModuleStatusItems.map(({ label, badge, cls }) => (
                  <div key={label} className="cp-status-item">
                    <span className="cp-status-label">{label}</span>
                    <span className={`cp-status-badge ${cls}`}>{badge}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="cp-tips-card">
              <div className="cp-tips-card-title"><ShieldIcon /> Security Tips</div>
              <ul className="cp-tips-list">
                {SECURITY_TIPS.map((tip) => (
                  <li key={tip}><div className="cp-tips-dot" />{tip}</li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ChangePassword;