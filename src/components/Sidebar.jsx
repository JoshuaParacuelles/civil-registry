import React, { memo } from "react";
import "./Sidebar.css";

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
}) => {
  const vitalIsActive = VITAL_CHILDREN ? VITAL_CHILDREN.includes(activeSubMenu) : false;
  const settingsIsActive = SETTINGS_CHILDREN ? SETTINGS_CHILDREN.includes(activeSubMenu) : false;

  const sidebarClasses = [
    "sidebar",
    viewport === "mobile" && mobileMenuOpen ? "mobile-open" : "",
    viewport === "desktop" && sidebarCollapsed ? "collapsed" : "",
    viewport === "tablet" && tabletExpanded ? "tablet-expanded" : "",
    viewport === "tablet" && !tabletExpanded ? "collapsed" : "",
  ].filter(Boolean).join(" ");

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
          {showLabels && <p className="sidebar-group-label">MAIN</p>}

          <li role="menuitem" className={activeSubMenu === MENU_KEYS.DASHBOARD ? "active" : ""} onClick={() => handleMenuClick(MENU_KEYS.DASHBOARD)}>
            <img src={dashboardIcon} alt="" className="menu-icon" width="18" height="18" />
            {showLabels && <span>Dashboard</span>}
          </li>

          <hr className="menu-separator" />

          {visibleVitalChildren.length > 0 && (
            <>
              {showLabels && <p className="sidebar-group-label">VERIFIERS</p>}

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
              {showLabels && <p className="sidebar-group-label">HEATMAPS</p>}
              <li role="menuitem" className={activeSubMenu === MENU_KEYS.HEATMAPS ? "active" : ""} onClick={() => handleMenuClick(MENU_KEYS.HEATMAPS)}>
                <img src={heatmapsIcon} alt="" className="menu-icon" width="18" height="18" />
                {showLabels && <span>Heatmaps</span>}
              </li>
              <hr className="menu-separator" />
            </>
          )}

          {canAccess("document_tracking") && (
            <>
              {showLabels && <p className="sidebar-group-label">DOCUMENT TRACKING</p>}
              <li role="menuitem" className={activeSubMenu === MENU_KEYS.DOCUMENT_TRACKING ? "active" : ""} onClick={() => handleMenuClick(MENU_KEYS.DOCUMENT_TRACKING)}>
                <img src={trackingIcon} alt="" className="menu-icon" width="18" height="18" />
                {showLabels && <span>Document Tracking</span>}
              </li>
              <hr className="menu-separator" />
            </>
          )}

          {showLabels && <p className="sidebar-group-label">ADMINISTRATION</p>}

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
