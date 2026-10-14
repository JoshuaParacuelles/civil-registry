import { useEffect, useState } from "react";
import "./Settings.css";

const TABS = [
  { key: "display", label: "Display", desc: "Full screen and window" },
  { key: "about",   label: "About",   desc: "App version and requirements" },
];

// Update these values after testing on the actual machine.
const SYSTEM_REQUIREMENTS = [
  ["Operating system", "Windows 10 or later"],
  ["Python",           "3.13"],
  ["Minimum RAM",      "4 GB"],
  ["Recommended RAM",  "8 GB"],
  ["Storage",          "500 MB free + space for uploads"],
  ["Screen",           "1366 x 768 or higher"],
  ["Internet",         "Required for login and sync"],
];

const isDesktopApp = () =>
  typeof window !== "undefined" && !!window.desktop;

/* ── Display ─────────────────────────────────────────────── */
function DisplayPanel() {
  const [isDesktop] = useState(isDesktopApp);
  const [isFull, setIsFull] = useState(false);

  useEffect(() => {
    if (!isDesktop || typeof window.desktop.isFullscreen !== "function") {
      return undefined;
    }

    let active = true;
    window.desktop.isFullscreen().then((v) => {
      if (active) setIsFull(!!v);
    });

    // Updates the button label when F11 or Esc changes the state
    const unsubscribe = window.desktop.onFullscreenChange?.((v) => setIsFull(!!v));

    return () => {
      active = false;
      unsubscribe?.();
    };
  }, [isDesktop]);

  const canToggle = isDesktop && typeof window.desktop.toggleFullscreen === "function";

  return (
    <section className="st-section">
      <h2 className="st-section-title">Full screen</h2>

      {canToggle ? (
        <>
          <p className="st-section-desc">
            Press F11 to toggle full screen, or Esc to exit.
          </p>
          <button
            type="button"
            className="st-btn st-btn--primary"
            onClick={() => window.desktop.toggleFullscreen()}
          >
            {isFull ? "Exit full screen" : "Enter full screen"}
          </button>
        </>
      ) : (
        <p className="st-note">
          Available in the desktop app only. Full screen can't be changed in the browser.
        </p>
      )}
    </section>
  );
}

/* ── About ───────────────────────────────────────────────── */
function AboutPanel() {
  const [isDesktop] = useState(isDesktopApp);
  const [version, setVersion] = useState(null);

  useEffect(() => {
    if (!isDesktop || typeof window.desktop.getAppVersion !== "function") {
      return undefined;
    }

    let active = true;
    window.desktop
      .getAppVersion()
      .then((v) => { if (active) setVersion(v || "Unknown"); })
      .catch(() => { if (active) setVersion("Unknown"); });

    return () => { active = false; };
  }, [isDesktop]);

  let versionText;
  if (!isDesktop) {
    versionText = "Browser";
  } else if (version) {
    versionText = version;
  } else {
    versionText = "Loading…";
  }

  return (
    <section className="st-section">
      <h2 className="st-section-title">Local Civil Register</h2>

      <dl className="st-info">
        <div className="st-info-row">
          <dt>Version</dt>
          <dd>{versionText}</dd>
        </div>
        <div className="st-info-row">
          <dt>Environment</dt>
          <dd>{isDesktop ? "Desktop app (Electron)" : "Web browser"}</dd>
        </div>
        <div className="st-info-row">
          <dt>Location</dt>
          <dd>San Carlos City</dd>
        </div>
        <div className="st-info-row">
          <dt>Platform</dt>
          <dd>{typeof navigator !== "undefined" ? navigator.platform || "Unknown" : "Unknown"}</dd>
        </div>
      </dl>

      <h2 className="st-section-title" style={{ marginTop: 8 }}>System requirements</h2>

      <dl className="st-info">
        {SYSTEM_REQUIREMENTS.map(([label, value]) => (
          <div className="st-info-row" key={label}>
            <dt>{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

/* ── Hub ─────────────────────────────────────────────────── */
const Settings = ({ initialTab = "display" }) => {
  const [tab, setTab] = useState(initialTab);

  useEffect(() => {
    setTab(initialTab);
  }, [initialTab]);

  const current = TABS.find((t) => t.key === tab) ?? TABS[0];

  return (
    <div className="st-root">
      <div className="st-body">
        <div className="st-tabs" role="tablist" aria-label="System settings">
          {TABS.map((t) => (
            <button
              key={t.key}
              type="button"
              role="tab"
              aria-selected={tab === t.key}
              className={`st-tab${tab === t.key ? " active" : ""}`}
              onClick={() => setTab(t.key)}
            >
              <span className="st-tab-label">{t.label}</span>
              <span className="st-tab-desc">{t.desc}</span>
            </button>
          ))}
        </div>

        <div className="st-panel" role="tabpanel">
          <div className="st-panel-head">
            <div className="st-panel-title">{current.label}</div>
            <div className="st-panel-desc">{current.desc}</div>
          </div>

          <div className="st-panel-body">
            {tab === "display" && <DisplayPanel />}
            {tab === "about" && <AboutPanel />}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Settings;