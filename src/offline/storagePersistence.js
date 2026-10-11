// Ask the browser not to evict our data under storage pressure.
// Important for staying offline for weeks or months.
export async function requestPersistence() {
  if (!navigator.storage?.persist) return false;
  if (await navigator.storage.persisted()) return true;
  return navigator.storage.persist();
}

export async function getStorageInfo() {
  if (!navigator.storage?.estimate) return null;
  const { usage = 0, quota = 0 } = await navigator.storage.estimate();
  return { usage, quota, percent: quota ? Math.round((usage / quota) * 100) : 0 };
}