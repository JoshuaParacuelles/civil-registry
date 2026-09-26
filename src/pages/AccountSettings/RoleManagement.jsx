import { useEffect, useState, useRef, useCallback } from "react";
import { usePermissions } from "../../context/PermissionContext";
import "./RoleManagement.css";

// Use empty string to route via Vite proxy, avoiding CORS/Cookie domain mismatches
const API = "";

const MODULE_LABELS = {
  dashboard:                  "Dashboard",
  birth_verification:        "Birth Verification",
  birth_archive_uploader:    "Birth Archive",
  death_verification:        "Death Verification",
  death_archive_uploader:    "Death Archive",
  marriage_verification:     "Marriage Verification",
  marriage_archive_uploader: "Marriage Archive",
  document_tracking:         "Document Tracking",
  // ─── DOCUMENT TRACKING STAGE MODULES (NEW) ──────────────────────────────
  // One label per pipeline stage, so a user scoped to a single stage shows
  // a readable chip (e.g. "Posting Period") instead of the raw module key.
  document_stage_registration:     "Registration",
  document_stage_civil_registrar:  "Civil Registrar",
  document_stage_posting_period:   "Posting Period",
  document_stage_records_division: "Records Division",
  document_stage_registry_number:  "Assign Registry Number",
  document_stage_releasing:        "Releasing",
  audit_logs:                "Audit Logs",
  change_password:           "Change Password",
  role_management:           "Role Management",
  user_management:           "User Management",
};

const ADMIN_ONLY_MODULES = new Set(["role_management", "user_management", "audit_logs"]);

// ─── CREDENTIAL CATEGORIES ─────────────────────────────────────────────────
// Splits Role Management into two independently-managed credential groups,
// selectable via the tab control at the top of the page. A user/role is
// considered part of a category if any of its permissions fall inside that
// category's module set.
const CATEGORIES = [
  { key: "vital",    label: "Vital Record Management Credentials" },
  { key: "document", label: "Document Tracking Credentials" },
];

const CATEGORY_MODULES = {
  vital: [
    "birth_verification",
    "birth_archive_uploader",
    "death_verification",
    "death_archive_uploader",
    "marriage_verification",
    "marriage_archive_uploader",
  ],
  document: [
    "document_tracking",
    // ─── DOCUMENT TRACKING STAGE MODULES (NEW) ────────────────────────────
    // Adding these here is what makes the Registration / Civil Registrar /
    // Posting Period / Records Division / Assign Registry Number /
    // Releasing roles show up (and get filtered/scoped correctly) under the
    // "Document Tracking Credentials" tab — same mechanism that already
    // scopes Birth/Death/Marriage Verifier under "Vital Record Management
    // Credentials".
    "document_stage_registration",
    "document_stage_civil_registrar",
    "document_stage_posting_period",
    "document_stage_records_division",
    "document_stage_registry_number",
    "document_stage_releasing",
  ],
};

// ─── CATEGORY RESOLUTION (NEW) ─────────────────────────────────────────────
// Every user_roles row now carries an explicit `category` from the backend
// ("vital" | "document" | "admin" | "other"). Each assignment belongs to
// EXACTLY ONE category, which is what keeps a username's Vital Record
// Management credentials and its Document Tracking credentials as two
// separate, independent rows that never overwrite one another.
//
// The permission-based branch below is only a fallback for rows created
// before the category column existed, so the page still renders correctly
// on a database where the migration hasn't been run yet.
//
// FIX: `permissions` is now coerced to an array before `.some()` is called.
// A row whose permissions came back null/undefined (e.g. a user_roles row
// whose joined role failed to resolve) used to throw
// "Cannot read properties of undefined (reading 'some')" and blank the page.
function resolveCategory(entity) {
  if (!entity) return "other";
  if (entity.category) return entity.category;

  const perms = Array.isArray(entity.permissions) ? entity.permissions : [];
  if (perms.some(m => ADMIN_ONLY_MODULES.has(m))) return "admin";
  if (perms.some(m => CATEGORY_MODULES.document.includes(m))) return "document";
  if (perms.some(m => CATEGORY_MODULES.vital.includes(m))) return "vital";
  return "other";
}

const EMPTY_ASSIGN = {
  username: "", password: "", confirmPassword: "", role_id: "", showPass: false,
};

// ─── SHARED SVG ICONS ─────────────────────────────────────────────────────────
const EyeIcon = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
    <circle cx="12" cy="12" r="3"/>
  </svg>
);

const EyeOffIcon = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94"/>
    <path d="M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19"/>
    <line x1="1" y1="1" x2="23" y2="23"/>
  </svg>
);

const CopyIcon = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="9" y="9" width="13" height="13" rx="2"/>
    <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/>
  </svg>
);

const CheckIcon = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="20 6 9 17 4 12"/>
  </svg>
);

const SearchIcon = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="11" cy="11" r="8"/>
    <line x1="21" y1="21" x2="16.65" y2="16.65"/>
  </svg>
);

const LockIcon = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
    <path d="M7 11V7a5 5 0 0110 0v4"/>
  </svg>
);

// ─── TOAST SYSTEM ─────────────────────────────────────────────────────────────

let _rmToastSetters = [];

function useRmToasts() {
  const [toasts, setToasts] = useState([]);
  useEffect(() => {
    _rmToastSetters.push(setToasts);
    return () => {
      _rmToastSetters = _rmToastSetters.filter((s) => s !== setToasts);
    };
  }, []);
  return toasts;
}

function pushRmToast(toast) {
  const id = Date.now() + Math.random();
  _rmToastSetters.forEach((set) => set((prev) => [...prev, { ...toast, id }]));
  return id;
}

function removeRmToast(id) {
  _rmToastSetters.forEach((set) =>
    set((prev) => prev.filter((t) => t.id !== id))
  );
}

function RmToastContainer() {
  const toasts = useRmToasts();
  return (
    <div className="rm-toast-wrap">
      {toasts.map((t) => (
        <RmToast key={t.id} {...t} />
      ))}
    </div>
  );
}

function RmToast({ id, title, message, duration = 6000, success = true }) {
  const [hiding, setHiding] = useState(false);

  const dismiss = useCallback(() => {
    setHiding(true);
    setTimeout(() => removeRmToast(id), 300);
  }, [id]);

  useEffect(() => {
    const timer = setTimeout(dismiss, duration);
    return () => clearTimeout(timer);
  }, [duration, id, dismiss]);

  const iconColor = success ? "#16a34a" : "#dc2626";
  const barColor  = success ? "#16a34a" : "#dc2626";

  return (
    <div className={`rm-toast-item${hiding ? " hiding" : ""}`}>
      <svg
        className="rm-toast-icon"
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
      <div className="rm-toast-body">
        <div className="rm-toast-title">{title}</div>
        {message && <div className="rm-toast-msg">{message}</div>}
      </div>
      <button className="rm-toast-close" onClick={dismiss}>×</button>
      <div className="rm-toast-progress">
        <div
          className="rm-toast-progress-bar"
          style={{ animationDuration: `${duration}ms`, background: barColor }}
        />
      </div>
    </div>
  );
}

// ─── MAIN COMPONENT ───────────────────────────────────────────────────────────
export default function Rolemanagement() {
  const { is_admin } = usePermissions();

  const [roles,        setRoles]        = useState([]);
  const [userRoles,    setUserRoles]    = useState([]);
  const [loading,      setLoading]      = useState(true);
  const [modal,        setModal]        = useState(null);
  const [assignForm,   setAssignForm]   = useState(EMPTY_ASSIGN);
  const [resetTarget,  setResetTarget]  = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [viewTarget,   setViewTarget]   = useState(null);
  const [resetPass,    setResetPass]    = useState({ password: "", confirmPassword: "", showPass: false });
  const [saving,       setSaving]       = useState(false);
  const [search,       setSearch]       = useState("");
  // Which credential group is currently being managed: "vital" or "document".
  const [activeCategory, setActiveCategory] = useState(CATEGORIES[0].key);

  // Guards against a single transient 401 forcing a real logout. A 401 can
  // occasionally be a brief race (e.g. a poll landing a beat before a
  // freshly-issued session cookie is fully committed) rather than a truly
  // dead session, so we require it to be seen twice in a row before we
  // treat it as a genuine session expiry.
  const consecutive401Ref = useRef(0);

  const showToast = useCallback((msg, type = "success", detail = "") => {
    const isSuccess = type === "success";
    pushRmToast({ title: msg, message: detail, success: isSuccess, duration: 6000 });
  }, []);

  const describeFetchError = (err, res) => {
    if (res) {
      return `HTTP ${res.status} ${res.statusText || ""}`.trim();
    }
    if (err instanceof TypeError) {
      return `Network/CORS error: ${err.message}`;
    }
    if (err && err.message) return err.message;
    return "Unknown error";
  };

  const fetchAll = useCallback(async (isSilent = false) => {
    try {
      const [rolesRes, userRolesRes] = await Promise.all([
        fetch(`${API}/api/roles`,      { credentials: "include" }),
        fetch(`${API}/api/user-roles`, { credentials: "include" }),
      ]);

      const checkJson = async (res) => {
        const contentType = res.headers.get("content-type");
        if (!contentType || !contentType.includes("application/json")) {
          const text = await res.text();
          throw new Error(`Server returned non-JSON response (${res.status}): ${text.substring(0, 100)}`);
        }
      };

      // A 401 here means the browser's sessionStorage still says
      // "isAuthenticated" (so the app rendered this page at all) but the
      // actual Flask session is gone — most commonly because the backend
      // restarted and regenerated its secret key, silently invalidating
      // every existing session cookie. However, a single 401 can also be a
      // brief timing race (a poll landing just before a freshly-issued
      // session cookie is fully committed), not a truly dead session. So
      // instead of forcing a logout on the first 401, we confirm it once
      // more shortly after — only a second consecutive 401 is treated as a
      // real, dead session and sent back to log in for a fresh cookie.
      if (rolesRes.status === 401 || userRolesRes.status === 401) {
        consecutive401Ref.current += 1;

        if (consecutive401Ref.current < 2) {
          console.warn("[RoleManagement] Got 401, confirming before treating session as expired…");
          setTimeout(() => fetchAll(true), 1500);
          return false;
        }

        sessionStorage.removeItem("isAuthenticated");
        sessionStorage.removeItem("username");
        if (!isSilent) {
          showToast(
            "Session expired",
            "error",
            "Please log in again."
          );
        }
        setTimeout(() => { window.location.href = "/login"; }, 1200);
        return false;
      }
      consecutive401Ref.current = 0;

      if (!rolesRes.ok) {
        await checkJson(rolesRes);
        const body = await rolesRes.json().catch(() => ({}));
        throw { source: "/api/roles", res: rolesRes, body };
      }
      if (!userRolesRes.ok) {
        await checkJson(userRolesRes);
        const body = await userRolesRes.json().catch(() => ({}));
        throw { source: "/api/user-roles", res: userRolesRes, body };
      }

      await checkJson(rolesRes);
      await checkJson(userRolesRes);

      const r1 = await rolesRes.json();
      const r2 = await userRolesRes.json();

      // FIX: normalise every row so `permissions` is always an array. Any
      // row that arrives without one (a user_roles row whose joined role
      // didn't resolve, for instance) would otherwise blow up later with
      // "Cannot read properties of undefined (reading 'some')".
      const normalise = (list) =>
        (Array.isArray(list) ? list : []).map(item => ({
          ...item,
          permissions: Array.isArray(item?.permissions) ? item.permissions : [],
        }));

      setRoles(normalise(r1));
      setUserRoles(normalise(r2));
      return true;
    } catch (err) {
      console.error("[RoleManagement] fetchAll failed:", err);

      if (!isSilent) {
        if (err && err.res) {
          showToast(
            `Failed to load data (${err.source})`,
            "error",
            `${describeFetchError(null, err.res)}${err.body?.error ? " — " + err.body.error : ""}`
          );
        } else {
          showToast(
            "Failed to load data",
            "error",
            describeFetchError(err, null) +
              " — check that the backend at port 5000 is running and reachable."
          );
        }
      }
      return false;
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    if (!is_admin) return;

    let isSubscribed = true;
    let intervalId = null;
    let consecutiveFails = 0;

    const poll = async () => {
      const ok = await fetchAll(true);
      if (!isSubscribed) return;
      consecutiveFails = ok ? 0 : consecutiveFails + 1;

      // Only give up on periodic refresh after several consecutive
      // failures — a single transient hiccup (a brief 501/503 from the
      // backend, or the 401-confirmation retry above) shouldn't
      // permanently freeze this screen; it should just try again on the
      // next tick.
      if (consecutiveFails >= 3 && intervalId) {
        clearInterval(intervalId);
        intervalId = null;
      }
    };

    fetchAll(false).then((success) => {
      if (success && isSubscribed) {
        intervalId = setInterval(poll, 5000);
      }
    });

    const onFocus = () => {
      fetchAll(true).then((ok) => {
        // If polling had previously given up after repeated failures, a
        // successful manual refresh (e.g. tabbing back into the page)
        // resumes periodic polling instead of leaving the page frozen.
        if (ok && isSubscribed && !intervalId) {
          consecutiveFails = 0;
          intervalId = setInterval(poll, 5000);
        }
      });
    };
    window.addEventListener("focus", onFocus);

    return () => {
      isSubscribed = false;
      if (intervalId) clearInterval(intervalId);
      window.removeEventListener("focus", onFocus);
    };
  }, [is_admin, fetchAll]);

  if (!is_admin) {
    return (
      <div className="rm-wrap">
        <RmToastContainer />
        <div className="rm-access-denied">
          <span className="rm-access-denied__icon">
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
              <path d="M7 11V7a5 5 0 0110 0v4"/>
            </svg>
          </span>
          <h2>Access Denied</h2>
          <p>You do not have permission to view this page.</p>
        </div>
      </div>
    );
  }

  const closeModal = () => {
    setModal(null);
    setDeleteTarget(null);
    setViewTarget(null);
  };

  const openAssign = () => { setAssignForm(EMPTY_ASSIGN); setModal("assign"); };

  // ─── PER-CATEGORY PASSWORDS (FIX) ─────────────────────────────────────────
  // "New credential" now means "no account for THIS username in THIS
  // category yet" — not "this username has never been seen anywhere".
  // Each credential category has its own separate password, so the same
  // username can need a BRAND NEW password here even though it already has
  // a completely different password in another category (e.g. "joshua"
  // already exists under Vital Record Management, but has no Document
  // Tracking credential yet — that still requires a new password, sent as
  // its own separate account below). Only when this exact category already
  // has a credential for this username do we skip asking for a password.
  const isNewUser = !userRoles.some(
    u => u.username === assignForm.username.trim() && resolveCategory(u) === activeCategory
  ) && assignForm.username.trim() !== "";

  const saveAssign = async () => {
    const { username, password, confirmPassword, role_id } = assignForm;
    if (!username.trim() || !role_id) return showToast("Username and role are required", "error");
    if (isNewUser) {
      if (!password)               return showToast("Password required for new accounts", "error");
      if (password.length < 6)         return showToast("Password must be at least 6 characters", "error");
      if (password !== confirmPassword) return showToast("Passwords do not match", "error");
    }
    setSaving(true);
    try {
      const body = { username: username.trim(), role_id: Number(role_id) };
      if (password) body.password = password;

      const res = await fetch(`${API}/api/user-roles`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(body),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) return showToast(data.error || "Failed", "error", `HTTP ${res.status}`);
      // NEW: the backend may succeed but report that it had to fall back to
      // a single shared password for this username (users.category missing).
      // Surface that instead of silently implying separate passwords exist.
      showToast(
        data.account_created ? "Account created & role assigned!" : "Role assigned!",
        "success",
        data.warning || ""
      );
      closeModal();
      fetchAll(true);
    } catch (err) {
      console.error("[RoleManagement] saveAssign failed:", err);
      showToast("Network error", "error", describeFetchError(err, null));
    }
    finally   { setSaving(false); }
  };

  const openDelete = (u) => { setDeleteTarget(u); setModal("delete"); };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setSaving(true);
    try {
      // ─── CREDENTIAL CATEGORY SEPARATION (NEW) ──────────────────────────
      // A username can now hold an independent role in both the Vital
      // Record Management and Document Tracking categories at once, so
      // deleting by username alone would risk removing the wrong
      // assignment (or, on the backend's old behavior, every assignment
      // that username has). Passing BOTH role_id and category scopes the
      // delete to the exact row shown in this table/category, leaving any
      // role the same username holds in the other category untouched.
      const category = resolveCategory(deleteTarget) || activeCategory;
      const params = new URLSearchParams({
        role_id:  String(deleteTarget.role_id ?? ""),
        category: category,
      });
      const res  = await fetch(`${API}/api/user-roles/${deleteTarget.username}?${params.toString()}`, {
        method: "DELETE",
        credentials: "include",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) return showToast(data.error || "Failed", "error", `HTTP ${res.status}`);
      showToast(`Role removed from ${deleteTarget.username}`);
      closeModal();
      fetchAll(true);
    } catch (err) {
      console.error("[RoleManagement] confirmDelete failed:", err);
      showToast("Failed", "error", describeFetchError(err, null));
    }
    finally   { setSaving(false); }
  };

  const openReset = (u) => {
    setResetTarget(u);
    setResetPass({ password: "", confirmPassword: "", showPass: false });
    setModal("reset");
  };

  const saveReset = async () => {
    const { password, confirmPassword } = resetPass;
    if (!password)               return showToast("New password required", "error");
    if (password.length < 6)         return showToast("Min 6 characters", "error");
    if (password !== confirmPassword) return showToast("Passwords do not match", "error");
    setSaving(true);
    try {
      // ─── PER-CATEGORY PASSWORDS (FIX) ────────────────────────────────
      // Each category is its own account with its own password, so the
      // backend needs to know WHICH credential to reset. Without this the
      // request is rejected ("A valid category is required to reset this
      // credential's password") once the users.category migration is in
      // place. Taken from the exact row the admin opened Reset on.
      const category = resolveCategory(resetTarget) || activeCategory;
      const res  = await fetch(`${API}/api/user-roles/${resetTarget.username}/reset-password`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ password, category }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) return showToast(data.error || "Failed", "error", `HTTP ${res.status}`);
      showToast("Password reset!");
      closeModal();
    } catch (err) {
      console.error("[RoleManagement] saveReset failed:", err);
      showToast("Network error", "error", describeFetchError(err, null));
    }
    finally   { setSaving(false); }
  };

  // ─── PER-CATEGORY PASSWORDS (FIX) ───────────────────────────────────────
  // Takes the whole row rather than just the username, so the credential's
  // category can be sent along — lock state belongs to one (username,
  // category) account, not to the username as a whole.
  const unlockUser = async (u) => {
    try {
      const category = resolveCategory(u) || activeCategory;
      const params = new URLSearchParams({ category });
      const res  = await fetch(`${API}/api/user-roles/${u.username}/unlock?${params.toString()}`, {
        method: "PUT",
        credentials: "include",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) return showToast(data.error || "Failed", "error", `HTTP ${res.status}`);
      showToast(`${u.username} unlocked`);
      fetchAll(true);
    } catch (err) {
      console.error("[RoleManagement] unlockUser failed:", err);
      showToast("Failed", "error", describeFetchError(err, null));
    }
  };

  const openView = (u) => { setViewTarget(u); setModal("view"); };

  const q = search.toLowerCase();

  // Modules that belong to the currently selected credential category.
  const activeCategoryModules = CATEGORY_MODULES[activeCategory] || [];

  // Administrator accounts are managed separately and are intentionally
  // excluded from this list — this screen is for managing regular,
  // non-admin user role assignments only.
  // NEW: also scoped to the currently selected credential category. Each
  // assignment row now declares its own category, so a username holding
  // one role in Vital Record Management and another in Document Tracking
  // appears under BOTH tabs — as two separate rows with separate role_ids
  // — instead of one row jumping between tabs.
  const filteredUsers = userRoles
    .filter(u => !u.is_admin)
    .filter(u => resolveCategory(u) === activeCategory)
    .filter(u =>
      (u.username || "").toLowerCase().includes(q) ||
      (u.role_name && u.role_name.toLowerCase().includes(q))
    );

  return (
    <div className="rm-wrap">

      <RmToastContainer />

      {/* Credential category selector — lets the admin switch between
          managing Vital Record Management credentials and Document
          Tracking credentials independently. */}
      <div className="rm-category-tabs" role="tablist" aria-label="Credential category">
        {CATEGORIES.map(cat => (
          <button
            key={cat.key}
            type="button"
            role="tab"
            aria-selected={activeCategory === cat.key}
            className={`rm-category-tab ${activeCategory === cat.key ? "rm-category-tab--active" : ""}`}
            onClick={() => setActiveCategory(cat.key)}
          >
            {cat.label}
          </button>
        ))}
      </div>

      <div className="rm-toolbar">
        <button className="rm-btn rm-btn--primary" onClick={openAssign}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
          </svg>
          Add User
        </button>

        <div className="rm-search-wrap">
          <span className="rm-search-icon"><SearchIcon /></span>
          <input
            className="rm-search"
            placeholder="Search users…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
      </div>

      {loading ? (
        <div className="rm-loading"><div className="rm-spinner" /><p>Loading…</p></div>
      ) : (
        <UsersTable
          users={filteredUsers}
          onRemove={openDelete}
          onReset={openReset}
          onUnlock={unlockUser}
          onView={openView}
        />
      )}

      {modal === "assign" && (
        <AssignModal
          userRoles={userRoles}
          form={assignForm}
          setForm={setAssignForm}
          saving={saving}
          onSave={saveAssign}
          onClose={closeModal}
          activeCategory={activeCategory}
          categoryModules={activeCategoryModules}
        />
      )}

      {modal === "reset" && resetTarget && (
        <ResetPasswordModal
          username={resetTarget.username}
          form={resetPass}
          setForm={setResetPass}
          saving={saving}
          onSave={saveReset}
          onClose={closeModal}
        />
      )}

      {modal === "delete" && deleteTarget && (
        <DeleteModal
          user={deleteTarget}
          saving={saving}
          onConfirm={confirmDelete}
          onClose={closeModal}
        />
      )}

      {modal === "view" && viewTarget && (
        <ViewCredentialsModal
          user={viewTarget}
          onClose={closeModal}
        />
      )}
    </div>
  );
}

// ─── USERS TABLE ──────────────────────────────────────────────────────────────
// NOTE: every <td> below carries a data-label attribute. On desktop this is
// ignored, but the mobile media query in RoleManagement.css uses
// `content: attr(data-label)` to turn each row into a labeled stacked card,
// so every column stays visible on narrow screens instead of being clipped
// or requiring horizontal scrolling to find.
function UsersTable({ users, onRemove, onReset, onUnlock, onView }) {
  if (!users.length)
    return <div className="rm-empty">No users assigned yet. Add one to get started.</div>;

  return (
    <div className="rm-table-wrap">
      <table className="rm-table">
        <thead>
          <tr>
            <th>User</th>
            <th>Role</th>
            <th>Access</th>
            <th>Status</th>
            <th>Assigned</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {users.map(u => {
            const isLocked = u.lock_level > 0;
            const isOnline = !!u.is_online;
            const perms    = Array.isArray(u.permissions) ? u.permissions : [];
            return (
              <tr key={u.id} className={isLocked ? "rm-row--locked" : ""}>
                <td data-label="User">
                  <div className="rm-user-cell">
                    <span className={`rm-avatar ${u.is_admin ? "rm-avatar--admin" : ""}`}>
                      {(u.username || "?")[0].toUpperCase()}
                    </span>
                    <div>
                      <span>{u.username}</span>
                      {isLocked && <span className="rm-locked-badge">Locked</span>}
                    </div>
                  </div>
                </td>
                <td data-label="Role">
                  <span className={`rm-role-pill ${u.is_admin ? "rm-role-pill--admin" : ""}`}>
                    {u.role_name}
                  </span>
                </td>
                <td data-label="Access">
                  <div className="rm-chips rm-chips--inline">
                    {perms.slice(0, 3).map(m => (
                      <span
                        key={m}
                        className={`rm-chip rm-chip--sm ${ADMIN_ONLY_MODULES.has(m) ? "rm-chip--admin" : ""}`}
                      >
                        {MODULE_LABELS[m] || m}
                      </span>
                    ))}
                    {perms.length > 3 && (
                      <span className="rm-chip rm-chip--more">+{perms.length - 3}</span>
                    )}
                  </div>
                </td>
                <td data-label="Status">
                  {/* "Not Active" just means offline right now — it's a neutral
                      state, not an error, so it no longer reuses the red
                      "locked" styling (which stays reserved for the separate
                      Locked badge next to the username above). */}
                  <span className={`rm-status-badge ${isOnline ? "rm-status-badge--active" : "rm-status-badge--inactive"}`}>
                    {isOnline ? "Active" : "Not Active"}
                  </span>
                </td>
                <td data-label="Assigned">{u.assigned_at ? new Date(u.assigned_at).toLocaleDateString() : "—"}</td>
                <td data-label="Actions">
                  <div className="rm-action-btns">
                    {isLocked && (
                      <button
                        className="rm-pill-btn rm-pill-btn--warning"
                        onClick={() => onUnlock(u)}
                        title="Unlock Account"
                      >
                        Unlock
                      </button>
                    )}
                    <button
                      className="rm-pill-btn rm-pill-btn--view"
                      onClick={() => onView(u)}
                      title="View Credentials"
                    >
                      View
                    </button>
                    <button
                      className="rm-pill-btn rm-pill-btn--reset"
                      onClick={() => onReset(u)}
                      title="Reset Password"
                    >
                      Reset
                    </button>
                    <button
                      className="rm-pill-btn rm-pill-btn--delete"
                      onClick={() => onRemove(u)}
                      title="Remove Role"
                    >
                      Delete
                    </button>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ─── ASSIGN MODAL ─────────────────────────────────────────────────────────────
// FIX: `userRoles` and `categoryModules` now default to empty arrays. If this
// modal ever renders before those props are ready, `.some()` / `.includes()`
// on an undefined value is what produced
// "Cannot read properties of undefined (reading 'some')".
function AssignModal({
  userRoles = [],
  form,
  setForm,
  saving,
  onSave,
  onClose,
  activeCategory,
  categoryModules = [],
}) {
  const [roles,        setRoles]        = useState([]);
  const [rolesLoading, setRolesLoading] = useState(true);
  const [rolesError,   setRolesError]   = useState(null);

  const loadRoles = useCallback(() => {
    setRolesLoading(true);
    setRolesError(null);
    fetch(`${API}/api/roles-list`, { credentials: "include" })
      .then(async r => {
        const contentType = r.headers.get("content-type");
        if (!contentType || !contentType.includes("application/json")) {
          throw new Error(`HTTP ${r.status}`);
        }
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then(data => {
        if (Array.isArray(data) && data.length > 0) {
          // Normalise so every role is guaranteed a permissions array.
          setRoles(data.map(r => ({
            ...r,
            permissions: Array.isArray(r?.permissions) ? r.permissions : [],
          })));
        } else {
          setRolesError("No roles found. Please create a role first.");
        }
      })
      .catch(err => {
        console.error("[RoleManagement] loadRoles failed:", err);
        setRolesError(`Failed to load roles: ${err.message}`);
      })
      .finally(() => setRolesLoading(false));
  }, []);

  useEffect(() => { loadRoles(); }, [loadRoles]);

  const typedName = form.username.trim();

  // ─── CREDENTIAL CATEGORY SEPARATION ────────────────────────────────────
  // Three distinct situations, so the admin can see exactly what a save
  // will do BEFORE doing it:
  //   1. brand new username           → new account+password, this category only
  //   2. username exists in the OTHER category → a SEPARATE credential row
  //      (own password) is added for this category; the other category's
  //      row and password are untouched
  //   3. username already has a row in THIS category → only that row's role
  //      changes; nothing outside this category is affected, no new password
  const assignmentInThisCategory = userRoles.find(
    u => u.username === typedName && resolveCategory(u) === activeCategory
  );
  const assignmentsInOtherCategories = userRoles.filter(
    u => u.username === typedName && resolveCategory(u) !== activeCategory
  );

  // ─── PER-CATEGORY PASSWORDS (FIX) ─────────────────────────────────────────
  // "New credential" is decided per CATEGORY, not per username. Password
  // fields must appear (and a password must be required) whenever THIS
  // category has no existing credential yet — including when the username
  // already exists under a different category with its own, separate
  // password. Previously this checked "does the username exist ANYWHERE",
  // which is exactly what hid the password fields and made it impossible
  // to give "joshua" a Document Tracking password distinct from their
  // existing Vital Record Management one.
  const isNewUser = !assignmentInThisCategory && typedName !== "";

  // ── Single-admin enforcement ─────────────────────────────────────────────
  // The Administrator role may only ever be held by one account at a time.
  // If some other user already has it, it's removed from the pickable list
  // entirely — the only way to hand it off is to first remove it from the
  // current holder. If the user currently being assigned already IS the
  // admin, the Administrator option remains (so their assignment isn't
  // accidentally downgraded), but once "Administrator" is the selected
  // role, every other option is hidden — you can't pick anything else
  // without clearing the selection first (which requires reopening/closing
  // the modal, since the role field is then locked).
  const existingAdmin   = userRoles.find(u => u.is_admin);
  const adminHeldByOther = !!existingAdmin && existingAdmin.username !== typedName;

  const selectableRoles = roles.filter(r => {
    if (r.is_admin) {
      // NEW: Administrator is not a Document Tracking credential. It lives in
      // its own "admin" category (see get_role_category in Rolemanagement.py),
      // so an Administrator assignment made from this tab would be filed under
      // "admin" and then vanish from the Document Tracking table entirely.
      // Hiding it here keeps this tab strictly about Document Tracking roles;
      // administrators are still assigned exactly as before from the
      // Vital Record Management tab / Administrator selection panel.
      if (activeCategory === "document") return false;
      return !adminHeldByOther;   // admin role only selectable if free (or held by this same user)
    }
    // NEW: non-admin roles are further scoped to the active credential
    // category — only roles whose permissions include at least one module
    // from the selected category (Vital Record Management / Document
    // Tracking) are offered here. This is what makes the Registration /
    // Civil Registrar / Posting Period / Records Division / Assign
    // Registry Number / Releasing roles appear specifically under the
    // Document Tracking Credentials tab, and nowhere else.
    return (Array.isArray(r.permissions) ? r.permissions : [])
      .some(m => categoryModules.includes(m));
  });

  const roleIsLockedToAdmin =
    !!form.role_id &&
    roles.find(r => String(r.id) === String(form.role_id))?.is_admin === true;

  // Once Administrator is the chosen role, collapse the list down to just
  // that option so there is no way to pick a different role afterward.
  const visibleRoles = roleIsLockedToAdmin
    ? selectableRoles.filter(r => r.is_admin)
    : selectableRoles;

  const selectedRole = roles.find(r => String(r.id) === String(form.role_id));

  const activeCategoryLabel = (CATEGORIES.find(c => c.key === activeCategory) || {}).label;

  const otherCategoryLabels = assignmentsInOtherCategories
    .map(u => (CATEGORIES.find(c => c.key === resolveCategory(u)) || {}).label)
    .filter(Boolean);

  return (
    <Overlay onClose={onClose}>
      <div className="rm-modal rm-modal--md">
        <ModalHeader title="Add User & Assign Role" onClose={onClose} />
        <div className="rm-modal__body">

          {activeCategoryLabel && (
            <p className="rm-hint rm-hint--existing" style={{ margin: 0 }}>
              Managing: {activeCategoryLabel}
            </p>
          )}

          <Field label="Username" required>
            <input
              className="rm-input"
              value={form.username}
              onChange={e => setForm(f => ({ ...f, username: e.target.value }))}
              placeholder="Enter username"
            />
            {typedName && (
              <p className={`rm-hint ${isNewUser ? "rm-hint--new" : "rm-hint--existing"}`}>
                {isNewUser
                  ? (otherCategoryLabels.length > 0
                      ? "Existing user — a NEW, separate password will be set for this category"
                      : "New user — an account will be created")
                  : `Already assigned here — only the ${activeCategoryLabel} role will be updated`}
              </p>
            )}
          </Field>

          {isNewUser && (
            <>
              <Field label="Password" required>
                <div className="rm-pass-wrap">
                  <input
                    className="rm-input"
                    type={form.showPass ? "text" : "password"}
                    value={form.password}
                    onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
                    placeholder="Min 6 characters"
                  />
                  <button className="rm-eye" type="button"
                    onClick={() => setForm(f => ({ ...f, showPass: !f.showPass }))}>
                    {form.showPass ? <EyeOffIcon /> : <EyeIcon />}
                  </button>
                </div>
              </Field>
              <Field label="Confirm Password" required>
                <input
                  className="rm-input"
                  type={form.showPass ? "text" : "password"}
                  value={form.confirmPassword}
                  onChange={e => setForm(f => ({ ...f, confirmPassword: e.target.value }))}
                  placeholder="Re-enter password"
                />
                {form.password && form.confirmPassword && (
                  <p className={`rm-hint ${form.password === form.confirmPassword ? "rm-hint--ok" : "rm-hint--err"}`}>
                    {form.password === form.confirmPassword ? "Passwords match" : "Passwords do not match"}
                  </p>
                )}
              </Field>
            </>
          )}

          <Field label="Assign Role" required>
            {rolesLoading ? (
              <div className="rm-input" style={{ color: "var(--rm-text-3)", display: "flex", alignItems: "center", gap: "8px" }}>
                <div style={{
                  width: "14px", height: "14px",
                  border: "2px solid #e5e7eb",
                  borderTop: "2px solid #6366f1",
                  borderRadius: "50%",
                  animation: "spin 0.8s linear infinite",
                  flexShrink: 0,
                }} />
                <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
                Loading roles…
              </div>
            ) : rolesError ? (
              <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                <div className="rm-input" style={{ color: "#ef4444", fontSize: "0.875rem" }}>{rolesError}</div>
                <button className="rm-btn rm-btn--ghost"
                  style={{ alignSelf: "flex-start", fontSize: "0.8rem", padding: "4px 10px" }}
                  onClick={loadRoles}>Retry</button>
              </div>
            ) : visibleRoles.length === 0 ? (
              <div className="rm-input" style={{ color: "var(--rm-text-3)", fontSize: "0.875rem" }}>
                No roles available for this category yet.
              </div>
            ) : (
              <>
                <select
                  className="rm-input"
                  value={form.role_id}
                  disabled={roleIsLockedToAdmin}
                  onChange={e => setForm(f => ({ ...f, role_id: e.target.value }))}
                >
                  <option value="">— Pick a role —</option>
                  {visibleRoles.map(r => (
                    <option key={r.id} value={String(r.id)}>
                      {r.name}{r.is_admin ? " (Admin)" : ""}
                    </option>
                  ))}
                </select>
                {roleIsLockedToAdmin && (
                  <p className="rm-hint rm-hint--existing">
                    Administrator is an exclusive, single-holder role — clear this field to choose a different role.
                  </p>
                )}
              </>
            )}
          </Field>

          {roleIsLockedToAdmin && (
            <button
              type="button"
              className="rm-btn rm-btn--ghost"
              style={{ fontSize: "0.8rem", padding: "4px 10px", alignSelf: "flex-start" }}
              onClick={() => setForm(f => ({ ...f, role_id: "" }))}
            >
              Clear Administrator selection
            </button>
          )}

          {selectedRole && (
            <div className="rm-preview">
              <p className="rm-preview__label">
                This role gives access to:
                {selectedRole.is_admin && <span className="rm-admin-badge">Admin Role</span>}
              </p>
              <div className="rm-chips">
                {(selectedRole.permissions || []).map(m => (
                  <span
                    key={m}
                    className={`rm-chip ${ADMIN_ONLY_MODULES.has(m) ? "rm-chip--admin" : ""}`}
                  >
                    {MODULE_LABELS[m] || m}
                  </span>
                ))}
                {(!selectedRole.permissions || selectedRole.permissions.length === 0) &&
                  <span className="rm-chip rm-chip--none">No permissions</span>}
              </div>
            </div>
          )}
        </div>
        <ModalFooter
          onClose={onClose} onSave={onSave} saving={saving}
          saveLabel={isNewUser
            ? (otherCategoryLabels.length > 0 ? "Create Credential & Assign" : "Create Account & Assign")
            : "Assign Role"}
        />
      </div>
    </Overlay>
  );
}

// ─── RESET PASSWORD MODAL ────────────────────────────────────────────────     
function ResetPasswordModal({ username, form, setForm, saving, onSave, onClose }) {
  return (
    <Overlay onClose={onClose}>
      <div className="rm-modal rm-modal--sm">
        <ModalHeader title={`Reset Password — ${username}`} onClose={onClose} />
        <div className="rm-modal__body">
          <Field label="New Password" required>
            <div className="rm-pass-wrap">
              <input
                className="rm-input"
                type={form.showPass ? "text" : "password"}
                value={form.password}
                onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
                placeholder="Min 6 characters"
              />
              <button className="rm-eye" type="button"
                onClick={() => setForm(f => ({ ...f, showPass: !f.showPass }))}>
                {form.showPass ? <EyeOffIcon /> : <EyeIcon />}
              </button>
            </div>
          </Field>
          <Field label="Confirm Password" required>
            <input
              className="rm-input"
              type={form.showPass ? "text" : "password"}
              value={form.confirmPassword}
              onChange={e => setForm(f => ({ ...f, confirmPassword: e.target.value }))}
              placeholder="Re-enter password"
            />
            {form.password && form.confirmPassword && (
              <p className={`rm-hint ${form.password === form.confirmPassword ? "rm-hint--ok" : "rm-hint--err"}`}>
                {form.password === form.confirmPassword ? "Passwords match" : "Passwords do not match"}
              </p>
            )}
          </Field>
        </div>
        <ModalFooter onClose={onClose} onSave={onSave} saving={saving} saveLabel="Reset Password" />
      </div>
    </Overlay>
  );
}

// ─── DELETE MODAL ─────────────────────────────────────────────────────────────
function DeleteModal({ user, saving, onConfirm, onClose }) {
  const categoryLabel = (CATEGORIES.find(c => c.key === resolveCategory(user)) || {}).label;

  return (
    <Overlay onClose={onClose}>
      <div className="rm-modal rm-modal--sm">
        <ModalHeader title="Remove User Role" onClose={onClose} />
        <div className="rm-modal__body">

          <div className="rm-delete-card">
            <span className={`rm-avatar rm-avatar--lg ${user.is_admin ? "rm-avatar--admin" : ""}`}>
              {(user.username || "?")[0].toUpperCase()}
            </span>
            <div className="rm-delete-card__info">
              <span className="rm-delete-card__name">{user.username}</span>
              <span className={`rm-role-pill ${user.is_admin ? "rm-role-pill--admin" : ""}`} style={{ fontSize: "11px", padding: "2px 10px" }}>
                {user.role_name}
              </span>
            </div>
          </div>

          <p className="rm-confirm-msg">
            Are you sure you want to remove the <strong>{user.role_name}</strong> role from <strong>{user.username}</strong>
            {categoryLabel ? <> under <strong>{categoryLabel}</strong></> : null}?
          </p>

          {/* NEW: makes the category scoping of this delete explicit — only
              this one credential row goes away. */}
          <div className="rm-warn-box">
            The user account will remain, and any role this user holds in the other
            credential category will not be affected.
          </div>
        </div>

        <div className="rm-modal__foot">
          <button className="rm-btn rm-btn--ghost" onClick={onClose} disabled={saving}>Cancel</button>
          <button className="rm-btn rm-btn--danger" onClick={onConfirm} disabled={saving}>
            {saving ? "Removing…" : "Remove Role"}
          </button>
        </div>
      </div>
    </Overlay>
  );
}

// ─── VIEW CREDENTIALS MODAL ───────────────────────────────────────────────────
function ViewCredentialsModal({ user, onClose }) {
  const [showPass, setShowPass] = useState(false);
  const [copied,   setCopied]   = useState(null);

  const copyToClipboard = (text, field) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(field);
      setTimeout(() => setCopied(null), 2000);
    });
  };

  const permissions = [...(Array.isArray(user.permissions) ? user.permissions : [])].sort((a, b) => {
    const aAdmin = ADMIN_ONLY_MODULES.has(a);
    const bAdmin = ADMIN_ONLY_MODULES.has(b);
    if (aAdmin !== bAdmin) return aAdmin ? -1 : 1;
    return (MODULE_LABELS[a] || a).localeCompare(MODULE_LABELS[b] || b);
  });

  const categoryLabel = (CATEGORIES.find(c => c.key === resolveCategory(user)) || {}).label;

  return (
    <Overlay onClose={onClose}>
      <div className="rm-modal rm-modal--view">
        <ModalHeader title={`Credentials — ${user.username}`} onClose={onClose} />
        <div className="rm-modal__body">

          <div className="rm-creds-hero">
            <span className={`rm-avatar rm-avatar--xl ${user.is_admin ? "rm-avatar--admin" : ""}`}>
              {(user.username || "?")[0].toUpperCase()}
            </span>
            <div className="rm-creds-hero__info">
              <span className="rm-creds-hero__name">{user.username}</span>
              <span className={`rm-role-pill ${user.is_admin ? "rm-role-pill--admin" : ""}`}>
                {user.role_name}
              </span>
              {user.lock_level > 0 && (
                <span className="rm-locked-badge" style={{ marginTop: "4px" }}>Locked</span>
              )}
            </div>
          </div>

          <div className="rm-creds-table">

            <div className="rm-cred-row">
              <span className="rm-cred-row__label">USERNAME</span>
              <div className="rm-cred-row__value-wrap">
                <span className="rm-cred-row__value">{user.username}</span>
                <button
                  className={`rm-copy-btn ${copied === "username" ? "rm-copy-btn--copied" : ""}`}
                  onClick={() => copyToClipboard(user.username, "username")}
                  title="Copy username"
                >
                  {copied === "username" ? <CheckIcon /> : <CopyIcon />}
                </button>
              </div>
            </div>

            <div className="rm-cred-row">
              <span className="rm-cred-row__label">PASSWORD</span>
              <div className="rm-cred-row__value-wrap">
                <div className="rm-cred-pass-field">
                  <span className="rm-cred-pass-field__text">
                    {showPass
                      ? <span style={{ color: "var(--rm-text-3)", fontSize: "11px" }}>Stored as Hash</span>
                      : "••••••••••••"}
                  </span>
                  <button
                    className="rm-cred-eye"
                    type="button"
                    onClick={() => setShowPass(v => !v)}
                    title={showPass ? "Hide" : "Show"}
                  >
                    {showPass ? <EyeOffIcon /> : <EyeIcon />}
                  </button>
                </div>
              </div>
            </div>

            {/* NEW: which independent credential category this assignment
                belongs to, so it's obvious that it stands on its own. */}
            {categoryLabel && (
              <div className="rm-cred-row">
                <span className="rm-cred-row__label">CATEGORY</span>
                <div className="rm-cred-row__value-wrap">
                  <span className="rm-cred-row__value">{categoryLabel}</span>
                </div>
              </div>
            )}

            <div className="rm-cred-row">
              <span className="rm-cred-row__label">ROLE</span>
              <div className="rm-cred-row__value-wrap">
                <span className={`rm-role-pill ${user.is_admin ? "rm-role-pill--admin" : ""}`} style={{ fontSize: "12px" }}>
                  {user.role_name}
                </span>
                <button
                  className={`rm-copy-btn ${copied === "role" ? "rm-copy-btn--copied" : ""}`}
                  onClick={() => copyToClipboard(user.role_name, "role")}
                  title="Copy role"
                >
                  {copied === "role" ? <CheckIcon /> : <CopyIcon />}
                </button>
              </div>
            </div>

            <div className="rm-cred-row">
              <span className="rm-cred-row__label">ASSIGNED</span>
              <div className="rm-cred-row__value-wrap">
                <span className="rm-cred-row__value">
                  {user.assigned_at ? new Date(user.assigned_at).toLocaleDateString() : "—"}
                </span>
              </div>
            </div>

            <div className="rm-cred-row">
              <span className="rm-cred-row__label">STATUS</span>
              <div className="rm-cred-row__value-wrap">
                {user.is_online ? (
                  <span className="rm-cred-status rm-cred-status--active">Active</span>
                ) : (
                  <span className="rm-cred-status rm-cred-status--inactive">Not Active</span>
                )}
              </div>
            </div>

            <div className="rm-cred-row">
              <span className="rm-cred-row__label">ADMIN ACCESS</span>
              <div className="rm-cred-row__value-wrap">
                {user.is_admin ? (
                  <span className="rm-cred-status rm-cred-status--admin">Yes — Full Access</span>
                ) : (
                  <span className="rm-cred-status rm-cred-status--no">No</span>
                )}
              </div>
            </div>

          </div>

          <div className="rm-creds-perms">
            <p className="rm-creds-perms__label">
              <LockIcon />
              Access Permissions
              <span className="rm-creds-perms__count">{permissions.length}</span>
            </p>
            <div className="rm-chips">
              {permissions.map(m => (
                <span
                  key={m}
                  className={`rm-chip ${ADMIN_ONLY_MODULES.has(m) ? "rm-chip--admin" : ""}`}
                >
                  {MODULE_LABELS[m] || m}
                </span>
              ))}
              {permissions.length === 0 &&
                <span className="rm-chip rm-chip--none">No permissions assigned</span>}
            </div>
          </div>

        </div>

        <div className="rm-modal__foot">
          <button className="rm-btn rm-btn--ghost" onClick={onClose}>Close</button>
        </div>
      </div>
    </Overlay>
  );
}

// ─── SHARED COMPONENTS ────────────────────────────────────────────────────────
function Overlay({ children, onClose }) {
  const mouseDownTarget = useRef(null);
  const overlayRef      = useRef(null);
  return (
    <div
      className="rm-overlay"
      ref={overlayRef}
      onMouseDown={e => { mouseDownTarget.current = e.target; }}
      onMouseUp={e => {
        if (e.target === overlayRef.current && mouseDownTarget.current === overlayRef.current) onClose();
        mouseDownTarget.current = null;
      }}
    >
      {children}
    </div>
  );
}

function ModalHeader({ title, onClose }) {
  return (
    <div className="rm-modal__head">
      <h2>{title}</h2>
      <button className="rm-close" onClick={onClose}>✕</button>
    </div>
  );
}

function ModalFooter({ onClose, onSave, saving, saveLabel = "Save" }) {
  return (
    <div className="rm-modal__foot">
      <button className="rm-btn rm-btn--ghost" onClick={onClose} disabled={saving}>Cancel</button>
      <button className="rm-btn rm-btn--primary" onClick={onSave} disabled={saving}>
        {saving ? "Saving…" : saveLabel}
      </button>
    </div>
  );
}

function Field({ label, required, children }) {
  return (
    <div className="rm-field">
      <label className="rm-label">
        {label}{required && <span className="rm-req">*</span>}
      </label>
      {children}
    </div>
  );
}