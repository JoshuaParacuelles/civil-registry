import { getMeta, setMeta } from './db';

// How long a user may keep using the app offline after the LAST successful
// online session check. Counted from lastOnlineAt, so it renews every time
// the app talks to the server.
export const OFFLINE_GRACE_DAYS = 365;
const DAY = 86400000;

export async function cacheSession({ user, role, permissions, isAdmin }) {
  await setMeta('auth', {
    user, role, permissions, isAdmin: !!isAdmin,
    cachedAt: Date.now(), lastOnlineAt: Date.now(),
  });
}

export async function getCachedSession() {
  const a = await getMeta('auth');
  if (!a) return null;
  const ageDays = (Date.now() - a.lastOnlineAt) / DAY;
  if (ageDays > OFFLINE_GRACE_DAYS) return null;
  return { ...a, daysLeft: Math.ceil(OFFLINE_GRACE_DAYS - ageDays) };
}

export async function clearSession() {
  await setMeta('auth', null);
}