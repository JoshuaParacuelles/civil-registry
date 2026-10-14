// Gipadala ang session cookie sa matag request padung sa Flask backend.
export const apiFetch = (url, options = {}) =>
  fetch(url, { credentials: "include", ...options });