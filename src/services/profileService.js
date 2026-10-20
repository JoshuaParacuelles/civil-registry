const API_BASE = import.meta.env.VITE_API_BASE_URL || "";
const PROFILE_URL = `${API_BASE}/api/profile`;

// Only parse the body as JSON when the server says it is JSON, so errors show
// the real status and content type.
const readJson = async (res) => {
  const type = res.headers.get("content-type") || "";
  const body = type.includes("application/json")
    ? await res.json().catch(() => null)
    : null;

  if (!res.ok) {
    throw new Error(body?.error || `Request failed (${res.status})`);
  }
  if (body === null) {
    throw new Error(
      `Expected JSON from ${res.url} but got "${type || "no content type"}" (status ${res.status}).`
    );
  }
  return body;
};

export const fetchProfile = () =>
  fetch(PROFILE_URL, { credentials: "include" }).then(readJson);

export const updateDisplayName = (displayName) =>
  fetch(PROFILE_URL, {
    method: "PUT",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ display_name: displayName }),
  }).then(readJson);

export const uploadAvatar = (file) => {
  const form = new FormData();
  form.append("avatar", file);
  return fetch(`${PROFILE_URL}/avatar`, {
    method: "POST",
    credentials: "include",
    body: form,
  }).then(readJson);
};

export const removeAvatar = () =>
  fetch(`${PROFILE_URL}/avatar`, {
    method: "DELETE",
    credentials: "include",
  }).then(readJson);

// Administrators only. Maps each username to { display_name, has_avatar, avatar_version }.
export const fetchMemberProfiles = () =>
  fetch(`${PROFILE_URL}/users`, { credentials: "include" }).then(readJson);

// Adds the cache-busting version so a changed picture is fetched again.
const withVersion = (summary, url) =>
  summary?.has_avatar
    ? `${url}?v=${encodeURIComponent(summary.avatar_version)}`
    : null;

// Returns null when there is no picture, so callers fall back to initials.
export const avatarUrl = (profile) => withVersion(profile, `${PROFILE_URL}/avatar`);

export const memberAvatarUrl = (username, summary) =>
  withVersion(summary, `${PROFILE_URL}/users/${encodeURIComponent(username)}/avatar`);