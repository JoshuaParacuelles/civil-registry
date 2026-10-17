const KEY = "lcr.displayPrefs";

export const ZOOM_OPTIONS = [
  { value: 90, label: "Small" },
  { value: 100, label: "Default" },
  { value: 115, label: "Large" },
  { value: 130, label: "Extra large" },
];

export const THEME_OPTIONS = [
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
  { value: "system", label: "System" },
];

export const DEFAULT_PREFS = {
  theme: "light",
  zoom: 100,
  highContrast: false,
};

export function loadDisplayPrefs() {
  try {
    return { ...DEFAULT_PREFS, ...JSON.parse(localStorage.getItem(KEY) || "{}") };
  } catch {
    return { ...DEFAULT_PREFS };
  }
}

export function saveDisplayPrefs(prefs) {
  try {
    localStorage.setItem(KEY, JSON.stringify(prefs));
  } catch {
    /* storage unavailable: preference applies for this session only */
  }
}

const systemQuery =
  typeof window !== "undefined" && window.matchMedia
    ? window.matchMedia("(prefers-color-scheme: dark)")
    : null;

function resolveTheme(theme) {
  if (theme === "system") return systemQuery?.matches ? "dark" : "light";
  return theme === "dark" ? "dark" : "light";
}

export function applyDisplayPrefs(prefs) {
  const root = document.documentElement;
  root.style.zoom = prefs.zoom === 100 ? "" : String(prefs.zoom / 100);
  root.classList.toggle("lcr-high-contrast", !!prefs.highContrast);
  root.dataset.theme = resolveTheme(prefs.theme);
}

export function applyStoredDisplayPrefs() {
  const prefs = loadDisplayPrefs();
  applyDisplayPrefs(prefs);

  // If the user chose "System", follow Windows when it switches modes.
  systemQuery?.addEventListener?.("change", () => {
    if (loadDisplayPrefs().theme === "system") {
      applyDisplayPrefs(loadDisplayPrefs());
    }
  });
}