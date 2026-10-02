// src/services/requestSnapshotService.js
// Loads the LATEST request row from the same session-gated backend endpoint
// that Home.jsx already used (GET /api/requests/:id).

export const fetchSnapshot = async (notification) => {
  const stored = notification?.request_snapshot || {};

  // Only online requests have a row behind /api/requests/:id.
  // Everything else just shows the stored snapshot.
  if (!notification?.record_id || stored.source !== "online_request") return stored;

  const res = await fetch(`/api/requests/${notification.record_id}`, {
    credentials: "include",
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);

  const data = await res.json();
  if (!data || typeof data !== "object") throw new Error("Invalid response");

  // Merge so fields that only exist in the stored snapshot survive.
  return { ...stored, ...data };
};