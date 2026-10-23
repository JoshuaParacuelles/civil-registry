import { cachedGetJson } from '../offlineRepository';
// Dashboard is read-only. Offline it shows the last numbers saved on this device.
export const getDashboardData = (url, opts = {}) => cachedGetJson(url, { entity: 'dashboard', ...opts });
