import { useEffect } from "react";

const API = import.meta.env.VITE_API_BASE_URL || "";
const HEARTBEAT_MS = 30000;

// Tells the server this session is still in use. Paused while the window is
// hidden or minimized, so the account turns Not Active when the user stops.
export default function useHeartbeat(enabled = true) {
  useEffect(() => {
    if (!enabled) return undefined;

    const beat = () => {
      if (document.hidden) return;
      fetch(`${API}/api/heartbeat`, { method: "POST", credentials: "include" })
        .catch(() => {});
    };

    const onVisibility = () => {
      if (!document.hidden) beat();
    };

    beat();
    const timer = setInterval(beat, HEARTBEAT_MS);
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [enabled]);
}