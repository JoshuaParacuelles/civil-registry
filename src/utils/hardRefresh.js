const REFRESH_FLAG = 'cr:hard-refresh';

/**
 * Performs a genuine browser reload (same as F5 / Ctrl+R).
 * Offline data in IndexedDB/localStorage is preserved because nothing is cleared here.
 *
 * Returns true if a reload was started, or false if the user cancelled.
 */
export function hardRefresh({ force = false } = {}) {
  if (!force && window.__crHasUnsavedChanges) {
    const proceed = window.confirm(
      'You have unsaved changes that will be lost. Refresh anyway?'
    );
    if (!proceed) return false;
  }

  // Let modules flush pending state if they choose to listen.
  window.dispatchEvent(new Event('cr:before-refresh'));

  try {
    sessionStorage.setItem(REFRESH_FLAG, '1');
  } catch (e) { /* ignore */ }

  window.crRefreshSkeleton?.show();
  console.info('[Refresh] Full page reload requested');

  window.location.reload();
  return true;
}