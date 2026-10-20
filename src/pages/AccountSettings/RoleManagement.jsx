import { useEffect, useState, useRef, useCallback } from "react";
import { usePermissions } from "../../context/PermissionContext";
import { useRegisterRefresh } from "../../context/RefreshContext";
import { pushToast } from "../../services/toastService";
import { fetchMemberProfiles, memberAvatarUrl } from "../../services/profileService";
import { syncOfflineAccountsFromServer } from "../../offline/adapters/offlineLogin";
import UserAvatar from "../../components/UserAvatar";
import "./RoleManagement.css";

// Use empty string to route via Vite proxy, avoiding CORS/Cookie domain mismatches
const API = import.meta.env.VITE_API_BASE_URL || "";

const MODULE_LABELS = {
  dashboard:                  "Dashboard",
  birth_verification:        "Birth Verification",
  birth_archive_uploader:    "Birth Archive",
  death_verification:        "Death Verification",
  death_archive_uploader:    "Death Archive",
  marriage_verification:     "Marriage Verification",
  marriage_archive_uploader: "Marriage Archive",
  document_tracking:         "Document Tracking",
  // ─── DOCUMENT TRACKING STAGE MODULES ────────────────────────────────────
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
    // ─── DOCUMENT TRACKING STAGE MODULES ──────────────────────────────────
    // Adding these here is what makes the Registration / Civil Registrar /
    // Posting Period / Records Division / Assign Registry Number /
    // Releasing roles show up (and get filtered/scoped correctly) under the
    // "Document Tracking Credentials" tab.
    "document_stage_registration",
    "document_stage_civil_registrar",
    "document_stage_posting_period",
    "document_stage_records_division",
    "document_stage_registry_number",
    "document_stage_releasing",
  ],
};

// ─── CATEGORY RESOLUTION ───────────────────────────────────────────────────
// Every user_roles row carries an explicit `category` from the backend
// ("vital" | "document" | "admin" | "other"). Each assignment belongs to
// EXACTLY ONE category, which keeps a username's Vital Record Management
// credentials and its Document Tracking credentials as two separate rows.
//
// The permission-based branch below is only a fallback for rows created
// before the category column existed.
function resolveCategory(entity) {
  if (!entity) return "other";
  if (entity.category) return entity.category;

  const perms = Array.isArray(entity.permissions) ? entity.permissions : [];
  if (perms.some(m => ADMIN_ONLY_MODULES.has(m))) return "admin";
  if (perms.some(m => CATEGORY_MODULES.document.includes(m))) return "document";
  if (perms.some(m => CATEGORY_MODULES.vital.includes(m))) return "vital";
  return "other";
}

// Display name from the member's profile, falling back to the login username.
const memberName = (username, profile) => profile?.display_name || username || "?";

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

export default function Rolemanagement() {
  const { is_admin } = usePermissions();

  const [userRoles,    setUserRoles]    = useState([]);
  const [profiles,     setProfiles]     = useState({});
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
  // occasionally be a brief race rather than a truly dead session, so it must
  // be seen twice in a row before we treat it as a genuine session expiry.
  const consecutive401Ref = useRef(0);

  const showToast = useCallback((msg, type = "success", detail = "") => {
    const isSuccess = type === "success";
    pushToast({ title: msg, message: detail, success: isSuccess, duration: 6000 });
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

  // Returns true when the data is up to date, false when it could not be loaded.
  // On failure, userRoles is left as it was, so the table keeps showing the
  // last good data.
  const fetchAll = useCallback(async (isSilent = false) => {
    try {
      // Member profiles are non-essential: if they fail, rows fall back to
      // usernames and initials instead of failing the whole page.
      const [rolesRes, userRolesRes, memberProfiles] = await Promise.all([
        fetch(`${API}/api/roles`,      { credentials: "include" }),
        fetch(`${API}/api/user-roles`, { credentials: "include" }),
        fetchMemberProfiles().catch(() => ({})),
      ]);

      const checkJson = async (res) => {
        const contentType = res.headers.get("content-type");
        if (!contentType || !contentType.includes("application/json")) {
          const text = await res.text();
          throw new Error(`Server returned non-JSON response (${res.status}): ${text.substring(0, 100)}`);
        }
      };

      // A 401 means the browser still thinks it is logged in but the Flask
      // session is gone. Confirm once more before treating it as expired.
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

      const r2 = await userRolesRes.json();

      // Normalise every row so `permissions` is always an array.
      const normalise = (list) =>
        (Array.isArray(list) ? list : []).map(item => ({
          ...item,
          permissions: Array.isArray(item?.permissions) ? item.permissions : [],
        }));

      setUserRoles(normalise(r2));
      setProfiles(memberProfiles);
      // Keep this device's offline logins in step with Role Management.
      syncOfflineAccountsFromServer().catch(() => {});
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

  // Manual refresh from the page-level Refresh button (RefreshContext).
  // fetchAll reports failure by returning false, so this wrapper turns that
  // into a thrown error, which lets the caller's button show a failed state.
  const refreshRoles = useCallback(async () => {
    const ok = await fetchAll(false);
    if (!ok) throw new Error("Role data could not be refreshed.");
  }, [fetchAll]);

  useRegisterRefresh(refreshRoles);

  useEffect(() => {
    if (!is_admin) return;

    let isSubscribed = true;
    let intervalId = null;
    let consecutiveFails = 0;

    const poll = async () => {
      const ok = await fetchAll(true);
      if (!isSubscribed) return;
      consecutiveFails = ok ? 0 : consecutiveFails + 1;

      // Only give up on periodic refresh after several consecutive failures.
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
        // A successful manual refresh resumes periodic polling if it had stopped.
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

  // ─── PER-CATEGORY PASSWORDS ───────────────────────────────────────────────
  // "New credential" means "no account for THIS username in THIS category
  // yet", not "this username has never been seen anywhere". Each category
  // has its own separate password.
  const isNewUser = !userRoles.some(
    u => u.username === assignForm.username.trim() && resolveCategory(u) === activeCategory
  ) && assignForm.username.trim() !== "";

  const saveAssign = async () => {
    const { username, password, confirmPassword, role_id } = assignForm;
    if (!username.trim() || !role_id) return showToast("Username and role are required", "error");
    if (isNewUser) {
      if (!password)                    return showToast("Password required for new accounts", "error");
      if (password.length < 6)          return showToast("Password must be at least 6 characters", "error");
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
      // The backend may succeed but report it had to fall back to a single
      // shared password for this username (users.category missing).
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
      const category = resolveCategory(deleteTarget) || activeCategory;
      const params = new URLSearchParams({
        role_id: String(deleteTarget.role_id ?? ""),
        category,
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
    if (!password)                    return showToast("New password required", "error");
    if (password.length < 6)          return showToast("Min 6 characters", "error");
    if (password !== confirmPassword) return showToast("Passwords do not match", "error");
    setSaving(true);
    try {
      // Each category is its own account with its own password, so the
      // backend needs to know WHICH credential to reset.
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

  // ─── PER-CATEGORY PASSWORDS ───────────────────────────────────────────────
  // Takes the whole row so the credential's category can be sent along. Lock
  // state belongs to one (username, category) account.
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

  // Administrator accounts are managed separately and are excluded from this
  // list. Also scoped to the selected credential category, so a username with
  // one role in each category appears under BOTH tabs as two separate rows.
  // Search also matches the member's display name.
  const filteredUsers = userRoles
    .filter(u => !u.is_admin)
    .filter(u => resolveCategory(u) === activeCategory)
    .filter(u =>
      (u.username || "").toLowerCase().includes(q) ||
      (profiles[u.username]?.display_name || "").toLowerCase().includes(q) ||
      (u.role_name && u.role_name.toLowerCase().includes(q))
    );

  return (
    <div className="rm-wrap">

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
          profiles={profiles}
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
          profile={profiles[deleteTarget.username]}
          saving={saving}
          onConfirm={confirmDelete}
          onClose={closeModal}
        />
      )}

      {modal === "view" && viewTarget && (
        <ViewCredentialsModal
          user={viewTarget}
          profile={profiles[viewTarget.username]}
          onClose={closeModal}
        />
      )}
    </div>
  );
}

// ─── USERS TABLE ──────────────────────────────────────────────────────────────
// Every <td> carries a data-label attribute. The mobile media query in
// RoleManagement.css uses `content: attr(data-label)` to turn each row into a
// labeled stacked card.
//
// The <colgroup> fixes the column widths so every row lines up. The Actions
// column is a fixed pixel width so its four buttons always fit on one line.
function UsersTable({ users, profiles, onRemove, onReset, onUnlock, onView }) {
  if (!users.length)
    return <div className="rm-empty">No users assigned yet. Add one to get started.</div>;

  return (
    <div className="rm-table-wrap">
      <table className="rm-table">
        <colgroup>
          <col style={{ width: "19%" }} />   {/* User */}
          <col style={{ width: "15%" }} />   {/* Role */}
          <col style={{ width: "28%" }} />   {/* Access */}
          <col style={{ width: "10%" }} />   {/* Status */}
          <col style={{ width: "11%" }} />   {/* Assigned */}
          <col style={{ width: "340px" }} /> {/* Actions */}
        </colgroup>
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
            const profile  = profiles[u.username];
            const name     = memberName(u.username, profile);
            return (
              <tr key={u.id} className={isLocked ? "rm-row--locked" : ""}>
                <td data-label="User">
                  <div className="rm-user-cell">
                    <UserAvatar
                      src={memberAvatarUrl(u.username, profile)}
                      name={name}
                      size={36}
                      className={`rm-avatar-user${u.is_admin ? " rm-avatar-user--admin" : ""}`}
                    />
                    <div>
                      <span>{name}</span>
                      {name !== u.username && <span className="rm-user-sub">@{u.username}</span>}
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
                  {/* "Not Active" means offline right now. It is a neutral state,
                      not an error, so it does not reuse the red locked styling. */}
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
          // Guarantee every role has a permissions array.
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

  // eslint-disable-next-line react-hooks/set-state-in-effect -- initial roles load; state already matches defaults
  useEffect(() => { loadRoles(); }, [loadRoles]);

  const typedName = form.username.trim();

  // ─── CREDENTIAL CATEGORY SEPARATION ───────────────────────────────────────
  // Three situations, so the admin can see what a save will do before doing it:
  //   1. brand new username → new account + password, this category only
  //   2. username exists in the OTHER category → a SEPARATE credential row
  //      (own password) is added for this category
  //   3. username already has a row in THIS category → only that row's role
  //      changes, no new password
  const assignmentInThisCategory = userRoles.find(
    u => u.username === typedName && resolveCategory(u) === activeCategory
  );
  const assignmentsInOtherCategories = userRoles.filter(
    u => u.username === typedName && resolveCategory(u) !== activeCategory
  );

  // Roles already held by someone ELSE in this category. The user being
  // edited keeps their own current role selectable.
  const takenRoleIds = new Set(
    userRoles
      .filter(u =>
        resolveCategory(u) === activeCategory &&
        u.username !== typedName &&
        u.role_id != null
      )
      .map(u => String(u.role_id))
  );

  // ─── PER-CATEGORY PASSWORDS ───────────────────────────────────────────────
  // Password fields appear whenever THIS category has no existing credential
  // for the username, even if the username exists under another category.
  const isNewUser = !assignmentInThisCategory && typedName !== "";

  // ── Single-admin enforcement ─────────────────────────────────────────────
  // The Administrator role may only be held by one account at a time.
  const existingAdmin    = userRoles.find(u => u.is_admin);
  const adminHeldByOther = !!existingAdmin && existingAdmin.username !== typedName;

  const selectableRoles = roles.filter(r => {
    if (r.is_admin) {
      // Administrator lives in its own "admin" category, so assigning it from
      // this tab would make it vanish from the Document Tracking table.
      if (activeCategory === "document") return false;
      return !adminHeldByOther;
    }

    // Non-admin roles: hide any role already assigned to another user in
    // this category, then keep only roles that belong to this category.
    if (takenRoleIds.has(String(r.id))) return false;
    return (Array.isArray(r.permissions) ? r.permissions : [])
      .some(m => categoryModules.includes(m));
  });

  const roleIsLockedToAdmin =
    !!form.role_id &&
    roles.find(r => String(r.id) === String(form.role_id))?.is_admin === true;

  // Once Administrator is chosen, collapse the list down to just that option.
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
                {takenRoleIds.size > 0
                  ? "Every role in this category is already assigned."
                  : "No roles available for this category yet."}
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

// ─── RESET PASSWORD MODAL ─────────────────────────────────────────────────────
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
function DeleteModal({ user, profile, saving, onConfirm, onClose }) {
  const categoryLabel = (CATEGORIES.find(c => c.key === resolveCategory(user)) || {}).label;
  const name = memberName(user.username, profile);

  return (
    <Overlay onClose={onClose}>
      <div className="rm-modal rm-modal--sm">
        <ModalHeader title="Remove User Role" onClose={onClose} />
        <div className="rm-modal__body">

          <div className="rm-delete-card">
            <UserAvatar
              src={memberAvatarUrl(user.username, profile)}
              name={name}
              size={44}
              className={`rm-avatar-user${user.is_admin ? " rm-avatar-user--admin" : ""}`}
            />
            <div className="rm-delete-card__info">
              <span className="rm-delete-card__name">{name}</span>
              {name !== user.username && <span className="rm-user-sub">@{user.username}</span>}
              <span className={`rm-role-pill ${user.is_admin ? "rm-role-pill--admin" : ""}`} style={{ fontSize: "11px", padding: "2px 10px" }}>
                {user.role_name}
              </span>
            </div>
          </div>

          <p className="rm-confirm-msg">
            Are you sure you want to remove the <strong>{user.role_name}</strong> role from <strong>{user.username}</strong>
            {categoryLabel ? <> under <strong>{categoryLabel}</strong></> : null}?
          </p>

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
function ViewCredentialsModal({ user, profile, onClose }) {
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
  const name = memberName(user.username, profile);

  return (
    <Overlay onClose={onClose}>
      <div className="rm-modal rm-modal--view">
        <ModalHeader title={`Credentials — ${user.username}`} onClose={onClose} />
        <div className="rm-modal__body">

          <div className="rm-creds-hero">
            <UserAvatar
              src={memberAvatarUrl(user.username, profile)}
              name={name}
              size={52}
              className={`rm-avatar-user${user.is_admin ? " rm-avatar-user--admin" : ""}`}
            />
            <div className="rm-creds-hero__info">
              <span className="rm-creds-hero__name">{name}</span>
              {name !== user.username && <span className="rm-user-sub">@{user.username}</span>}
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
              <span className="rm-cred-row__label">DISPLAY NAME</span>
              <div className="rm-cred-row__value-wrap">
                <span className="rm-cred-row__value">{profile?.display_name || "Not set"}</span>
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