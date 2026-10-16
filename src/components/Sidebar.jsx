import React, { memo } from "react";
import { useOffline } from "../context/OfflineContext";
import "./Sidebar.css";

// Badge shows up to 99; anything higher reads "99+". The exact count stays in the tooltip.
const formatBadgeCount = (n) => (n > 99 ? "99+" : String(n));

// Permissions that make each sync module visible. Mirrors ENTITY_PERMISSIONS in
// src/offline/syncScope.js, so the badge only counts modules this user can use.
const SYNC_MODULE_PERMISSIONS = {
  birth: ["birth_verification", "birth_archive_uploader"],
  marriage: ["marriage_verification", "marriage_archive_uploader"],
  death: ["death_verification", "death_archive_uploader"],
  tracking: [
    "document_tracking",
    "document_stage_registration",
    "document_stage_civil_registrar",
    "document_stage_posting_period",
    "document_stage_records_division",
    "document_stage_registry_number",
    "document_stage_releasing",
  ],
};

const SYNC_MODULE_LABEL = {
  birth: "Birth",
  marriage: "Marriage",
  death: "Death",
  tracking: "Document Tracking",
};

const Sidebar = ({
  activeSubMenu,
  settingsOpen,
  vitalRecordsOpen,
  mobileMenuOpen,
  viewport,
  sidebarCollapsed,
  tabletExpanded,
  showLabels,
  visibleVitalChildren,
  canAccess,
  handleMenuClick,
  handleSubMenuClick,
  setShowLogoutModal,
  displayName,
  isAdminUser,
  MENU_KEYS,
  VITAL_CHILDREN,
  SETTINGS_CHILDREN,
  logoImg,
  dashboardIcon,
  vitalIcon,
  heatmapsIcon,
  trackingIcon,
  accountIcon,
  logoutIcon,
  syncIcon,
}) => {
  const { moduleCounts } = useOffline();

  const vitalIsActive = VITAL_CHILDREN ? VITAL_CHILDREN.includes(activeSubMenu) : false;
  const settingsIsActive = SETTINGS_CHILDREN ? SETTINGS_CHILDREN.includes(activeSubMenu) : false;

  const sidebarClasses = [
    "sidebar",
    viewport === "mobile" && mobileMenuOpen ? "mobile-open" : "",
    viewport === "desktop" && sidebarCollapsed ? "collapsed" : "",
    viewport === "tablet" && tabletExpanded ? "tablet-expanded" : "",
    viewport === "tablet" && !tabletExpanded ? "collapsed" : "",
  ].filter(Boolean).join(" ");

  // Per-module breakdown for only the modules this user can access.
  const syncBreakdown = Object.entries(SYNC_MODULE_PERMISSIONS)
    .filter(([, perms]) => perms.some((p) => canAccess(p)))
    .map(([key]) => ({
      key,
      label: SYNC_MODULE_LABEL[key],
      total: moduleCounts?.[key]?.total ?? 0,
    }));

  const syncTotal = syncBreakdown.reduce((sum, m) => sum + m.total, 0);
  const syncTooltip = syncBreakdown.length
    ? syncBreakdown.map((m) => `${m.label}: ${m.total}`).join(" · ")
    : "Nothing to sync";
  const pendingLabel = `${syncTotal} not yet synced (${syncTooltip})`;

  return (
    <aside id="main-sidebar" className={sidebarClasses} aria-label="Main navigation">
      <div className="sidebar-header">
        <img src={logoImg} alt="Local Civil Registry" className="logo-img" width="38" height="38" />
        <div className="sidebar-brand-text">
          <span className="sidebar-brand-title">Local Civil Registry</span>
          <span className="sidebar-brand-subtitle">San Carlos City</span>
        </div>
      </div>

      <div className="sidebar-body">
        <div className="sidebar-user">
          {showLabels && (
            <div className="sidebar-user-info">
              <span className="sidebar-user-name">{displayName}</span>
              <span className="sidebar-user-role">{isAdminUser ? "Admin Panel" : "Active"}</span>
            </div>
          )}
        </div>

        <ul className="sidebar-menu" role="menu">
          <li role="menuitem" className={activeSubMenu === MENU_KEYS.DASHBOARD ? "active" : ""} onClick={() => handleMenuClick(MENU_KEYS.DASHBOARD)}>
            <img src={dashboardIcon} alt="" className="menu-icon" width="18" height="18" />
            {showLabels && <span>Dashboard</span>}
          </li>

          <hr className="menu-separator" />

          {visibleVitalChildren.length > 0 && (
            <>
              <li role="menuitem" aria-expanded={vitalRecordsOpen} className={`parent-only${vitalIsActive ? " active" : ""}`} onClick={() => handleMenuClick(MENU_KEYS.VITAL)}>
                <img src={vitalIcon} alt="" className="menu-icon" width="18" height="18" />
                {showLabels && <span>Vital Records Management</span>}
                {showLabels && <span className={`arrow${vitalRecordsOpen ? " down" : ""}`} />}
              </li>

              {showLabels && (
                <ul className={`submenu ${vitalRecordsOpen ? "open" : ""}`} role="menu">
                  {canAccess("birth_verification") && (
                    <li role="menuitem" className={activeSubMenu === MENU_KEYS.BIRTH ? "active" : ""} onClick={() => handleSubMenuClick(MENU_KEYS.BIRTH, MENU_KEYS.VITAL)}>
                      Birth Verifier
                    </li>
                  )}
                  {canAccess("marriage_verification") && (
                    <li role="menuitem" className={activeSubMenu === MENU_KEYS.MARRIAGE ? "active" : ""} onClick={() => handleSubMenuClick(MENU_KEYS.MARRIAGE, MENU_KEYS.VITAL)}>
                      Marriage Verifier
                    </li>
                  )}
                  {canAccess("death_verification") && (
                    <li role="menuitem" className={activeSubMenu === MENU_KEYS.DEATH ? "active" : ""} onClick={() => handleSubMenuClick(MENU_KEYS.DEATH, MENU_KEYS.VITAL)}>
                      Death Verifier
                    </li>
                  )}
                  {canAccess("scims_lookup") && (
                    <li role="menuitem" className={activeSubMenu === MENU_KEYS.SCIMS ? "active" : ""} onClick={() => handleSubMenuClick(MENU_KEYS.SCIMS, MENU_KEYS.VITAL)}>
                      SCIMS Lookup
                    </li>
                  )}
                </ul>
              )}

              <hr className="menu-separator" />
            </>
          )}

          {canAccess("heatmaps") && (
            <>
              <li role="menuitem" className={activeSubMenu === MENU_KEYS.HEATMAPS ? "active" : ""} onClick={() => handleMenuClick(MENU_KEYS.HEATMAPS)}>
                <img src={heatmapsIcon} alt="" className="menu-icon" width="18" height="18" />
                {showLabels && <span>Heatmaps</span>}
              </li>
              <hr className="menu-separator" />
            </>
          )}

          {canAccess("document_tracking") && (
            <>
              <li role="menuitem" className={activeSubMenu === MENU_KEYS.DOCUMENT_TRACKING ? "active" : ""} onClick={() => handleMenuClick(MENU_KEYS.DOCUMENT_TRACKING)}>
                <img src={trackingIcon} alt="" className="menu-icon" width="18" height="18" />
                {showLabels && <span>Document Tracking</span>}
              </li>
              <hr className="menu-separator" />
            </>
          )}

          {canAccess("offline_sync") && (
            <>
              <li
                role="menuitem"
                className={activeSubMenu === MENU_KEYS.OFFLINE_SYNC ? "active" : ""}
                onClick={() => handleMenuClick(MENU_KEYS.OFFLINE_SYNC)}
                title={pendingLabel}
              >
                <img src={syncIcon} alt="" className="menu-icon menu-icon--sync" width="18" height="18" />
                {showLabels && <span>Offline Data &amp; Sync</span>}
                {showLabels && syncTotal > 0 && (
                  <span className="sync-badge" aria-label={pendingLabel}>
                    {formatBadgeCount(syncTotal)}
                  </span>
                )}
              </li>
            </>
          )}

          <li role="menuitem" aria-expanded={settingsOpen} className={`parent-only${settingsIsActive ? " active" : ""}`} onClick={() => handleMenuClick(MENU_KEYS.SETTINGS)}>
            <img src={accountIcon} alt="" className="menu-icon" width="18" height="18" />
            {showLabels && <span>System Settings</span>}
            {showLabels && <span className={`arrow${settingsOpen ? " down" : ""}`} />}
          </li>

          {showLabels && (
            <ul className={`submenu ${settingsOpen ? "open" : ""}`} role="menu">
              <li role="menuitem" className={activeSubMenu === MENU_KEYS.ACCOUNT ? "active" : ""} onClick={() => handleSubMenuClick(MENU_KEYS.ACCOUNT, MENU_KEYS.SETTINGS)}>
                Update Account
              </li>
              {canAccess("audit_logs") && (
                <li role="menuitem" className={activeSubMenu === MENU_KEYS.AUDIT ? "active" : ""} onClick={() => handleSubMenuClick(MENU_KEYS.AUDIT, MENU_KEYS.SETTINGS)}>
                  Audit Logs
                </li>
              )}
              {canAccess("role_management") && (
                <li role="menuitem" className={activeSubMenu === MENU_KEYS.ROLE_MANAGEMENT ? "active" : ""} onClick={() => handleSubMenuClick(MENU_KEYS.ROLE_MANAGEMENT, MENU_KEYS.SETTINGS)}>
                  Role Management
                </li>
              )}
              <li role="menuitem" className={activeSubMenu === MENU_KEYS.DISPLAY ? "active" : ""} onClick={() => handleSubMenuClick(MENU_KEYS.DISPLAY, MENU_KEYS.SETTINGS)}>
                Display
              </li>
            </ul>
          )}
        </ul>

        <div className="sidebar-footer">
          <button className="footer-item" onClick={() => setShowLogoutModal(true)} type="button">
            <img src={logoutIcon} alt="" className="menu-icon" width="18" height="18" />
            {showLabels && <span>Logout</span>}
          </button>
        </div>
      </div>
    </aside>
  );
};

export default memo(Sidebar);