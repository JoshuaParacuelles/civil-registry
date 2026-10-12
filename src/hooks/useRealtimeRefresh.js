import { useEffect, useRef, useState } from "react";
import { supabase, isSupabaseConfigured } from "../services/supabaseClient";

/**
 * Nagpamati sa changes sa mga table ug nagtawag og onRefresh() human sa debounce.
 * - Wala mag-apply og patch; i-refetch ang tibuok data (angay sa aggregates)
 * - Walay overlap: kung nagdagan pa ang refresh, usa ra ang i-queue
 * - Polling backstop kung dili mo-live ang socket
 */
export function useRealtimeRefresh({
  tables,
  onRefresh,
  channelName = "dashboard-live",
  debounceMs = 750,
  pollMs = 60000,
  runOnMount = false,
}) {
  const [status, setStatus] = useState(isSupabaseConfigured ? "connecting" : "unconfigured");
  const [lastUpdated, setLastUpdated] = useState(null);

  const refreshRef = useRef(onRefresh);
  const statusRef = useRef(status);
  refreshRef.current = onRefresh;
  statusRef.current = status;

  useEffect(() => {
    let debounceTimer = null;
    let pollTimer = null;
    let cancelled = false;
    let inFlight = false;
    let queued = false;
    let channel = null;

    const runRefresh = async () => {
      if (cancelled) return;
      if (inFlight) {
        queued = true;
        return;
      }
      inFlight = true;
      try {
        await refreshRef.current?.();
        if (!cancelled) setLastUpdated(new Date());
      } catch (err) {
        console.error("[Dashboard] Refresh failed:", err);
      } finally {
        inFlight = false;
        if (queued && !cancelled) {
          queued = false;
          runRefresh();
        }
      }
    };

    const scheduleRefresh = () => {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(runRefresh, debounceMs);
    };

    if (isSupabaseConfigured) {
      channel = supabase.channel(channelName);
      tables.forEach((table) => {
        channel.on("postgres_changes", { event: "*", schema: "public", table }, scheduleRefresh);
      });
      channel.subscribe((state) => {
        if (cancelled) return;
        if (state === "SUBSCRIBED") {
          setStatus("live");
        } else if (["CHANNEL_ERROR", "TIMED_OUT", "CLOSED"].includes(state)) {
          setStatus("polling");
        }
      });
    }

    pollTimer = setInterval(() => {
      if (!navigator.onLine) {
        setStatus("offline");
        return;
      }
      if (statusRef.current !== "live") runRefresh();
    }, pollMs);

    const handleOffline = () => setStatus("offline");
    const handleOnline = () => {
      setStatus(isSupabaseConfigured ? "connecting" : "polling");
      runRefresh();
    };
    window.addEventListener("offline", handleOffline);
    window.addEventListener("online", handleOnline);

    if (runOnMount) runRefresh();

    return () => {
      cancelled = true;
      clearTimeout(debounceTimer);
      clearInterval(pollTimer);
      window.removeEventListener("offline", handleOffline);
      window.removeEventListener("online", handleOnline);
      if (channel) supabase.removeChannel(channel);
    };
    // tables kinahanglan stable (module-level constant)
  }, [channelName, debounceMs, pollMs, runOnMount]); // eslint-disable-line react-hooks/exhaustive-deps

  return { status, lastUpdated };
}