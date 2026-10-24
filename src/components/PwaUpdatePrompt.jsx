import { useRegisterSW } from "virtual:pwa-register/react";

const UPDATE_CHECK_MS = 60 * 60 * 1000; // susiha kada oras

export default function PwaUpdatePrompt() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_url, reg) {
      // Susiha kada oras kon naay bag-ong version samtang naka-open ang app.
      if (reg) {
        setInterval(() => {
          if (!document.hidden) reg.update();
        }, UPDATE_CHECK_MS);
      }
    },
    onRegisterError(error) {
      console.error("[PWA] Service worker registration failed:", error);
    },
  });

  if (!needRefresh) return null;

  return (
    <div
      role="alert"
      aria-live="polite"
      style={{
        position: "fixed",
        bottom: 16,
        right: 16,
        zIndex: 9999,
        background: "#1a3c6e",
        color: "#fff",
        padding: "12px 16px",
        borderRadius: 8,
        display: "flex",
        gap: 12,
        alignItems: "center",
        boxShadow: "0 4px 12px rgba(0,0,0,0.25)",
      }}
    >
      <span>May bag-ong version na.</span>
      <button type="button" onClick={() => updateServiceWorker(true)}>
        Update
      </button>
      <button type="button" onClick={() => setNeedRefresh(false)}>
        Later
      </button>
    </div>
  );
}