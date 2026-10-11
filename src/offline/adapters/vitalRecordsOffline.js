import { cachedGetJson, mutate, queueUpload } from '../offlineRepository';

// type: 'birth' | 'death' | 'marriage'. Paths are your existing endpoints.
export const getVitalList = (type, url, opts = {}) => cachedGetJson(url, { entity: `${type}-list`, ...opts });
export const getVitalPdf = (type, url, opts = {}) => cachedGetJson(url, { entity: `${type}-pdf`, maxEntries: 100, ...opts });
export const uploadVitalRecord = (type, url, file) => queueUpload({ entity: type, label: `Upload ${file.name}`, url, file });
export const completeVitalTransaction = (type, url, json, who = '') =>
  mutate({ entity: type, label: `Transaction: ${who}`, method: 'POST', url, json });
export const deleteVitalRecord = (type, url, who = '') =>
  mutate({ entity: type, label: `Delete ${who}`, method: 'DELETE', url });