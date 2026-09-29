import { useEffect } from "react";

export default function HomePreloader() {
  useEffect(() => {
    let idleId;
    let timeoutId;
    const preload = () => {
      import("../pages/Home/Home").catch(() => undefined);
    };

    if (typeof window.requestIdleCallback === "function") {
      idleId = window.requestIdleCallback(preload, { timeout: 3000 });
    } else {
      timeoutId = window.setTimeout(preload, 1500);
    }

    return () => {
      if (idleId !== undefined) window.cancelIdleCallback?.(idleId);
      if (timeoutId !== undefined) window.clearTimeout(timeoutId);
    };
  }, []);

  return null;
}