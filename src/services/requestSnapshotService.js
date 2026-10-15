// src/services/requestSnapshotService.js
const API = import.meta.env.VITE_API_BASE_URL || "";

const REQUEST_TYPES = new Set(["birth", "death", "marriage"]);

/** Latest request row from the session-gated backend. */
export const fetchSnapshot = async (notification) => {
  const stored = notification?.request_snapshot || {};

  if (!notification?.record_id || !REQUEST_TYPES.has(notification?.record_type)) {
    return stored;
  }

  const res = await fetch(`${API}/api/requests/${notification.record_id}`, {
    credentials: "include",
    cache: "no-store",
  });

  if (res.status === 404) return stored;
  if (!res.ok) throw new Error(`HTTP ${res.status}`);

  const data = await res.json();
  if (!data || typeof data !== "object") throw new Error("Invalid response");

  return { ...stored, ...data };
};

/**
 * Save a status change. Uses the same API base as fetchSnapshot so the
 * PATCH and the GET always hit the same server.
 * Throws with the server's error message on failure.
 */
export const saveRequestStatus = async (notification, status, { note, notifyVia = "email" } = {}) => {
  const res = await fetch(`${API}/api/requests/${notification.record_id}/status`, {
    method: "PATCH",
    credentials: "include",
    cache: "no-store",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      status,
      note: note || undefined,
      notify_via: notifyVia,
    }),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok || data?.error) {
    throw new Error(data?.error || `HTTP ${res.status}`);
  }
  return data;
};