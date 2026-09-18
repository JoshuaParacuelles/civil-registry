// externalIndividualsService.js
//
// Talks ONLY to your own Flask backend (/api/external/...). No API key or
// token is ever needed here — the SCIMS masterlist endpoint turned out to
// be public, so this stays a plain, credential-free fetch.
//
// NOTE: Vite project — env vars must use import.meta.env with a VITE_ prefix,
// not process.env.REACT_APP_* (that was the earlier white-screen bug).
//
// IMPORTANT FIX: previously this defaulted to "http://localhost:5000".
// When the frontend is loaded through a tunnel/remote host (e.g. a
// devtunnels.ms URL, ngrok, or any deployed environment), "localhost:5000"
// resolves to port 5000 on whichever machine is running the BROWSER, not
// your backend machine — so the request never reaches Flask at all and
// the browser reports it as a CORS/network failure. To fix this without
// breaking local dev:
//   - If VITE_API_BASE_URL is set, use it (explicit override, e.g. for a
//     backend on a different host/port than the frontend).
//   - Otherwise, default to a same-origin RELATIVE path (""), so requests
//     go to whatever host is currently serving the page. This works
//     automatically through devtunnels/ngrok/prod as long as the backend
//     is reachable on that same host (e.g. via a dev proxy or reverse
//     proxy in front of both frontend and backend), and still works for
//     plain "npm run dev" + "flask run" on the same machine when paired
//     with a Vite proxy for /api (see note below).
//
// If your backend is NOT reachable on the same host/port as the frontend
// (common in local dev: Vite on 5173, Flask on 5000), set
// VITE_API_BASE_URL explicitly in civil-registry/.env, e.g.:
//   VITE_API_BASE_URL=http://localhost:5000
// for local dev, and leave it unset (or point it at the correct backend
// tunnel URL) when accessing through a tunnel like devtunnels.ms.
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "";

async function handleResponse(res, context = "") {
  let body;
  const raw = await res.text(); // read as text first so we can debug bad JSON

  try {
    body = raw ? JSON.parse(raw) : {};
  } catch {
    console.error(`[externalIndividualsService] Non-JSON response${context ? ` (${context})` : ""}:`, raw);
    throw new Error(`Server returned an unreadable response (status ${res.status}).`);
  }

  if (!res.ok) {
    console.error(`[externalIndividualsService] Request failed${context ? ` (${context})` : ""}:`, res.status, body);
    throw new Error(body?.error || body?.message || `Request failed (${res.status}).`);
  }

  return body;
}

/**
 * Browse one page of the full SCIMS masterlist.
 */
export async function browseExternalIndividuals(page = 1, perPage) {
  const url = new URL(`${API_BASE_URL}/api/external/entities`, window.location.origin);
  url.searchParams.set("page", page);
  if (perPage) url.searchParams.set("per_page", perPage);

  console.log("[externalIndividualsService] GET", url.toString());

  let res;
  try {
    res = await fetch(url.toString(), { credentials: "include" });
  } catch (err) {
    console.error("[externalIndividualsService] Network error on browse:", err);
    throw new Error("Could not reach the server. Check your connection or the backend URL.");
  }
  return handleResponse(res, "browse");
}

/**
 * Search ALL matching individuals.
 */
export async function searchExternalIndividuals(search) {
  const url = new URL(`${API_BASE_URL}/api/external/entities`, window.location.origin);
  url.searchParams.set("search", search.trim());

  console.log("[externalIndividualsService] GET", url.toString());

  let res;
  try {
    res = await fetch(url.toString(), { credentials: "include" });
  } catch (err) {
    console.error("[externalIndividualsService] Network error on search:", err);
    throw new Error("Could not reach the server. Check your connection or the backend URL.");
  }
  return handleResponse(res, "search");
}

/**
 * Convenience wrapper: search if a term is given, otherwise browse page 1.
 */
export async function fetchExternalIndividuals(search = "") {
  return search.trim()
    ? searchExternalIndividuals(search)
    : browseExternalIndividuals(1);
}

/**
 * Fetch a single external individual by SCIMS ID / entity_no.
 */
export async function fetchExternalIndividual(id) {
  if (!id) {
    console.error("[externalIndividualsService] fetchExternalIndividual called with empty id");
    throw new Error("No entity ID provided.");
  }

  const url = new URL(
    `${API_BASE_URL}/api/external/entities/${encodeURIComponent(id)}`,
    window.location.origin
  );
  console.log("[externalIndividualsService] GET", url.toString());

  let res;
  try {
    res = await fetch(url.toString(), { credentials: "include" });
  } catch (err) {
    console.error("[externalIndividualsService] Network error on detail fetch:", err);
    throw new Error("Could not reach the server. Check your connection or the backend URL.");
  }
  return handleResponse(res, `detail:${id}`);
}