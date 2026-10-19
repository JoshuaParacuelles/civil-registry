// src/services/demographicsService.js
//
// Residents are loaded through the Flask API (GET /api/residents), not directly
// from Supabase. This keeps the database closed to the anon key and enforces
// the login check on the server.

const API = import.meta.env.VITE_API_BASE_URL || "";

export async function fetchResidents() {
  const res = await fetch(`${API}/api/residents`, {
    method: "GET",
    credentials: "include",
    cache: "no-store",
    headers: { Accept: "application/json" },
  });

  let body = null;
  try {
    body = await res.json();
  } catch {
    /* non-JSON response */
  }

  if (res.status === 401) {
    throw new Error("Your session has expired. Please log in again.");
  }
  if (!res.ok) {
    throw new Error(body?.error || `Could not load residents (${res.status}).`);
  }

  return Array.isArray(body) ? body : [];
}