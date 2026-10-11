// src/context/OfflineContext.jsx
import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { startConnectivityMonitor, isOnline, subscribeConnectivity } from '../offline/connectivityService';
import { startSyncEngine, runSync, retryAllFailed, getSyncState, subscribeSyncState } from '../offline/syncEngine';
import { subscribeOutbox, getCounts } from '../offline/outboxQueue';
import { refreshAllOfflineCredentials } from '../offline/archivePassword';
import { warmBirthCache } from '../offline/birthOffline';
import { warmVitalCache } from '../offline/vitalOffline';
import { refreshTrackingPersonnel } from '../offline/adapters/documentTrackingOffline';
import { pushToast } from '../services/toastService';

const OfflineContext = createContext(null);
const API_BASE = import.meta.env.VITE_API_BASE_URL || '';

const EMPTY_COUNTS = { pending: 0, syncing: 0, failed: 0, conflict: 0, synced: 0, waiting: 0, total: 0 };
const WARMUP_INTERVAL_MS = 10 * 60 * 1000;
const LOGIN_POLL_MS = 1000;

async function requestPersistence() {
  try {
    return (await navigator.storage?.persist?.()) ?? false;
  } catch {
    return false;
  }
}

// True once the user has logged in on this tab. Reads sessionStorage only,
// so it makes no network request. Login pages must not call protected APIs.
function hasLoginSession() {
  try {
    return Boolean((sessionStorage.getItem('username') || '').trim());
  } catch {
    return false;
  }
}

export function OfflineProvider({ children }) {
  const [online, setOnline] = useState(isOnline());
  const [sync, setSync] = useState(getSyncState());
  const [counts, setCounts] = useState(EMPTY_COUNTS);
  const lastNotified = useRef(null);

  const refreshCounts = useCallback(async () => {
    try {
      setCounts(await getCounts());
    } catch (err) {
      console.warn('[OfflineContext] could not read outbox counts:', err);
    }
  }, []);

  const notify = useCallback((nowOnline) => {
    if (lastNotified.current === nowOnline) return;
    const firstCheck = lastNotified.current === null;
    lastNotified.current = nowOnline;
    if (firstCheck && nowOnline) return;

    if (nowOnline) {
      pushToast({
        title: 'Back online',
        message: 'Connection restored. Saved changes will sync now.',
        success: true,
        duration: 4000,
      });
    } else {
      pushToast({
        title: "You're offline",
        message: 'Changes are saved on this device and will sync when the connection returns.',
        success: false,
        duration: 6000,
      });
    }
  }, []);

  useEffect(() => {
    startConnectivityMonitor();
    startSyncEngine();
    requestPersistence();
    refreshCounts();

    const unsubConnectivity = subscribeConnectivity((v) => {
      setOnline(v);
      notify(v);
    });
    const unsubSync = subscribeSyncState(setSync);
    const unsubOutbox = subscribeOutbox(refreshCounts);

    notify(isOnline());

    return () => {
      unsubConnectivity();
      unsubSync();
      unsubOutbox();
    };
  }, [refreshCounts, notify]);

  // Keeps the offline copies fresh while online: Document Tracking personnel,
  // archive credentials, and the birth / marriage / death caches.
  // Waits for a login first, so the login page never calls protected endpoints.
  useEffect(() => {
    if (!online) return undefined;

    let alive = true;
    let cancels = [];
    let timer = null;
    let loginPoll = null;

    const stopDownloads = () => {
      cancels.forEach((c) => c?.());
      cancels = [];
    };

    const run = async () => {
      if (!alive || !hasLoginSession()) return;
      stopDownloads();

      await refreshTrackingPersonnel(); // saves personnel + stage holders to localStorage
      if (!alive) return;

      await refreshAllOfflineCredentials();
      if (!alive) return;

      const birthCancel = await warmBirthCache(`${API_BASE}/api/birth`);
      if (!alive) { birthCancel?.(); return; }
      if (birthCancel) cancels.push(birthCancel);

      for (const entity of ['marriage', 'death']) {
        if (!alive) return;
        const c = await warmVitalCache(entity, `${API_BASE}/api/${entity}`);
        if (c) cancels.push(c);
      }
    };

    const safeRun = () => {
      run().catch((err) => console.warn('[OfflineContext] warm-up failed:', err));
    };

    const startPeriodic = () => {
      timer = setInterval(safeRun, WARMUP_INTERVAL_MS);
    };

    if (hasLoginSession()) {
      safeRun();
      startPeriodic();
    } else {
      // Not logged in yet: check the local login marker until it appears.
      // This is a sessionStorage read only, with no network request.
      loginPoll = setInterval(() => {
        if (!hasLoginSession()) return;
        clearInterval(loginPoll);
        loginPoll = null;
        safeRun();
        startPeriodic();
      }, LOGIN_POLL_MS);
    }

    return () => {
      alive = false;
      clearInterval(loginPoll);
      clearInterval(timer);
      stopDownloads();
    };
  }, [online]);

  return (
    <OfflineContext.Provider
      value={{
        online,
        sync,
        counts,
        syncNow: runSync,
        retryFailed: retryAllFailed,
        refreshCounts,
      }}
    >
      {children}
    </OfflineContext.Provider>
  );
}

export const useOffline = () => {
  const ctx = useContext(OfflineContext);
  if (!ctx) throw new Error('useOffline must be used inside <OfflineProvider>');
  return ctx;
};