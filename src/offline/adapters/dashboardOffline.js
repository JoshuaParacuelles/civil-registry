import { cachedGetJson } from '../offlineRepository';
import { buildAnalyticsFromSnapshot } from './analyticsFromSnapshot';

// Dashboard is read-only. Online: fresh data (and saved to this device).
// Offline with no saved response: compute from the local records snapshot.
export const getDashboardData = async (url, opts = {}) => {
  try {
    return await cachedGetJson(url, { entity: 'dashboard', ...opts });
  } catch (err) {
    if (navigator.onLine) throw err;
    const snapshot = await loadLocalSnapshot();
    if (!snapshot) throw err;
    return buildAnalyticsFromSnapshot(snapshot)[url.split('/').pop()] ?? {};
  }
};