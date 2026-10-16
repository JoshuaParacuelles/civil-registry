import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useOffline } from '../../context/OfflineContext';
import { usePermissions } from '../../context/PermissionContext';
import { listAll, subscribeOutbox, requeueOne, removeOp } from '../../offline/outboxQueue';
import { getAllowedEntities } from '../../offline/syncScope';
import { useRegisterRefresh } from "../../context/RefreshContext";
import './SyncCenter.css';

const TABS = [
  { key: 'unsynced', label: 'Not yet synced', match: (s) => ['pending', 'syncing', 'failed', 'conflict'].includes(s) },
  { key: 'failed',   label: 'Failed',         match: (s) => s === 'failed' },
  { key: 'conflict', label: 'Conflicts',      match: (s) => s === 'conflict' },
  { key: 'synced',   label: 'Synced',         match: (s) => s === 'synced' },
];

const ENTITY_LABEL = { birth: 'Birth', death: 'Death', marriage: 'Marriage', tracking: 'Document Tracking' };
const STATUS_LABEL = {
  pending: 'Waiting to sync',
  syncing: 'Syncing',
  failed: 'Failed',
  conflict: 'Conflict',
  synced: 'Synced',
};

const fmt = (ms) => (ms ? new Date(ms).toLocaleString() : '—');
const currentUser = () => {
  try { return sessionStorage.getItem('username') || ''; } catch { return ''; }
};

/* ─── Reusable confirm modal ─────────────────────────────────────────── */
function ConfirmModal({
  open,
  title,
  message,
  detail,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  danger = false,
  busy = false,
  onConfirm,
  onCancel,
}) {
  const dialogRef = useRef(null);
  const onCancelRef = useRef(onCancel);
  onCancelRef.current = onCancel;

  // Focus the cancel button when opened and lock background scroll.
  useEffect(() => {
    if (!open) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    dialogRef.current?.querySelector('[data-autofocus]')?.focus();
    return () => { document.body.style.overflow = prevOverflow; };
  }, [open]);

  // Escape closes the modal (unless an action is in progress).
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => {
      if (e.key === 'Escape' && !busy) onCancelRef.current();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, busy]);

  if (!open) return null;

  return (
    <div
      className="sc-modal-overlay"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !busy) onCancel();
      }}
    >
      <div
        className="sc-modal"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="sc-modal-title"
        aria-describedby="sc-modal-message"
        ref={dialogRef}
      >
        <div className={`sc-modal__icon${danger ? ' sc-modal__icon--danger' : ''}`} aria-hidden="true">
          {danger ? '!' : '?'}
        </div>

        <h3 id="sc-modal-title" className="sc-modal__title">{title}</h3>

        <p id="sc-modal-message" className="sc-modal__message">{message}</p>

        {detail && <div className="sc-modal__detail">{detail}</div>}

        <div className="sc-modal__footer">
          <button
            type="button"
            className="sc-btn"
            data-autofocus
            onClick={onCancel}
            disabled={busy}
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            className={`sc-btn ${danger ? 'sc-btn--danger-solid' : 'sc-btn--primary'}`}
            onClick={onConfirm}
            disabled={busy}
          >
            {busy ? 'Please wait…' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function SyncCenter() {
  const { online, sync, syncNow } = useOffline();
  const { permissions, is_admin } = usePermissions();

  const [rows, setRows] = useState([]);
  const [tab, setTab] = useState('unsynced');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState(null);

  // Discard modal state
  const [discardTarget, setDiscardTarget] = useState(null);
  const [discarding, setDiscarding] = useState(false);

  const user = currentUser();

  // null = admin (sees everything); a Set = only those entities.
  const allowed = useMemo(
    () => getAllowedEntities(permissions, is_admin),
    [permissions, is_admin]
  );

  const load = useCallback(async () => {
    const all = await listAll();
    all.sort((a, b) => b.createdAt - a.createdAt);
    setRows(all);
  }, []);

  useEffect(() => {
    load();
    return subscribeOutbox(load);
  }, [load]);

  useRegisterRefresh(load);

  // Only the rows this user is allowed to see.
  const scopedRows = useMemo(
    () => (allowed ? rows.filter((r) => allowed.has(r.entity)) : rows),
    [rows, allowed]
  );

  // Counts come from the scoped rows, so the cards match what the user sees.
  const counts = useMemo(() => ({
    pending:  scopedRows.filter((r) => r.status === 'pending').length,
    waiting:  scopedRows.filter((r) => r.status === 'pending' && r.username && user && r.username !== user).length,
    synced:   scopedRows.filter((r) => r.status === 'synced').length,
    failed:   scopedRows.filter((r) => r.status === 'failed').length,
    conflict: scopedRows.filter((r) => r.status === 'conflict').length,
  }), [scopedRows, user]);

  const activeTab = TABS.find((t) => t.key === tab);
  const visible = useMemo(
    () => scopedRows.filter((r) => activeTab.match(r.status)),
    [scopedRows, activeTab]
  );
  const tabCount = (t) => scopedRows.filter((r) => t.match(r.status)).length;

  const finish = (res, label) => {
    if (!res) {
      setNotice({ type: 'info', text: online ? 'Nothing to sync.' : 'You are offline. Changes will sync when the connection returns.' });
    } else if (res.error) {
      setNotice({
        type: 'error',
        text: `${label} stopped before finishing: ${res.error}. The changes are still queued and will retry automatically.`,
      });
    } else {
      setNotice({
        type: res.failed ? 'warn' : 'ok',
        text: `${label}: ${res.succeeded} synced, ${res.failed} failed.`,
      });
    }
  };

  const handleSyncNow = async () => {
    setBusy(true);
    setNotice(null);
    try {
      finish(await syncNow(), 'Sync finished');
    } catch (e) {
      setNotice({ type: 'error', text: e.message });
    } finally {
      setBusy(false);
    }
  };

  // Re-queue only this user's failed/conflict rows, then sync.
  const handleRetryAll = async () => {
    setBusy(true);
    setNotice(null);
    try {
      const retryable = scopedRows.filter((r) => r.status === 'failed' || r.status === 'conflict');
      for (const r of retryable) await requeueOne(r.opId);
      finish(await syncNow(), 'Retry finished');
    } catch (e) {
      setNotice({ type: 'error', text: e.message });
    } finally {
      setBusy(false);
    }
  };

  const handleRetryOne = async (row) => {
    await requeueOne(row.opId);
    if (online) handleSyncNow();
  };

  // Opens the modal instead of window.confirm.
  const requestDiscard = (row) => setDiscardTarget(row);

  const closeDiscardModal = useCallback(() => {
    if (!discarding) setDiscardTarget(null);
  }, [discarding]);

  const confirmDiscard = async () => {
    if (!discardTarget) return;
    setDiscarding(true);
    try {
      await removeOp(discardTarget.opId);
      setNotice({ type: 'ok', text: `Discarded "${discardTarget.label}".` });
    } catch (e) {
      setNotice({ type: 'error', text: `Could not discard: ${e.message}` });
    } finally {
      setDiscarding(false);
      setDiscardTarget(null);
    }
  };

  const pct = sync.total ? Math.round((sync.done / sync.total) * 100) : 0;

  return (
    <div className="sc-page">
      <div className="sc-sticky">
        <div className="sc-header">
          <div>
            <h2 className="sc-title">Offline Data &amp; Sync</h2>
            <p className="sc-sub">Changes made while offline are kept here until the server confirms them.</p>
          </div>
          <div className="sc-header__right">
            <span className={`sc-pill ${online ? 'on' : 'off'}`}>{online ? 'Online' : 'Offline'}</span>
            <span className="sc-last">Last successful sync: {fmt(sync.lastSyncAt)}</span>
            {counts.failed + counts.conflict > 0 && (
              <button className="sc-btn" disabled={busy || sync.syncing || !online} onClick={handleRetryAll}>
                Retry failed
              </button>
            )}
            <button className="sc-btn sc-btn--primary" disabled={!online || busy || sync.syncing} onClick={handleSyncNow}>
              {sync.syncing ? 'Syncing…' : 'Sync Now'}
            </button>
          </div>
        </div>

        <div className="sc-cards">
          <Card label="Waiting to sync" value={counts.pending} />
          <Card label="Waiting for login" value={counts.waiting} />
          <Card label="Synced" value={counts.synced} tone="ok" />
          <Card label="Failed" value={counts.failed} tone={counts.failed ? 'bad' : ''} />
          <Card label="Conflicts" value={counts.conflict} tone={counts.conflict ? 'warn' : ''} />
        </div>
      </div>

      {sync.syncing && (
        <div className="sc-progress">
          <div className="sc-progress__text">
            Syncing {sync.done} of {sync.total} · {sync.succeeded} succeeded · {sync.failedRun} failed
          </div>
          <div className="sc-bar"><div style={{ width: `${pct}%` }} /></div>
        </div>
      )}

      {sync.authRequired && (
        <div className="sc-notice sc-notice--warn">Session expired. Log in again to continue syncing.</div>
      )}
      {notice && <div className={`sc-notice sc-notice--${notice.type}`}>{notice.text}</div>}

      <div className="sc-tabs" role="tablist">
        {TABS.map((t) => (
          <button
            key={t.key}
            role="tab"
            aria-selected={tab === t.key}
            className={`sc-tab${tab === t.key ? ' active' : ''}`}
            onClick={() => setTab(t.key)}
          >
            {t.label} <span className="sc-tab__count">{tabCount(t)}</span>
          </button>
        ))}
      </div>

      {visible.length === 0 ? (
        <div className="sc-empty">Nothing in this list.</div>
      ) : (
        <div className="sc-table-wrap">
          <table className="sc-table">
            <thead>
              <tr>
                <th>Module</th>
                <th>Action</th>
                <th>Created</th>
                <th>Status</th>
                <th>Details</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((r) => {
                const canAct = r.status === 'failed' || r.status === 'conflict';
                return (
                  <tr key={r.opId} className={`sc-row sc-row--${r.status}`}>
                    <td>{ENTITY_LABEL[r.entity] || r.entity}</td>
                    <td className="sc-label">{r.label}</td>
                    <td>{fmt(r.createdAt)}</td>
                    <td>
                      {r.status === 'pending' && r.username && user && r.username !== user
                        ? `Waiting for login as ${r.username}`
                        : STATUS_LABEL[r.status] || r.status}
                    </td>
                    <td>
                      {r.status === 'synced' && <>Synced {fmt(r.syncedAt)}</>}
                      {r.lastError && <span className="sc-err">{r.lastError}</span>}
                      {!r.lastError && r.status !== 'synced' && '—'}
                    </td>
                    <td>
                      {canAct ? (
                        <div className="sc-actions">
                          <button
                            className="sc-btn"
                            disabled={busy || sync.syncing}
                            onClick={() => handleRetryOne(r)}
                          >
                            Retry
                          </button>
                          <button
                            className="sc-btn sc-btn--danger"
                            disabled={busy || sync.syncing || discarding}
                            onClick={() => requestDiscard(r)}
                          >
                            Discard
                          </button>
                        </div>
                      ) : (
                        '—'
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <ConfirmModal
        open={!!discardTarget}
        title="Discard this item?"
        message="The local copy will be removed and it will NOT be sent to the server. This action cannot be undone."
        detail={discardTarget && (
          <>
            <div><strong>Module:</strong> {ENTITY_LABEL[discardTarget.entity] || discardTarget.entity}</div>
            <div><strong>Item:</strong> {discardTarget.label}</div>
            {discardTarget.lastError && (
              <div className="sc-modal__error"><strong>Last error:</strong> {discardTarget.lastError}</div>
            )}
          </>
        )}
        confirmLabel="Discard"
        cancelLabel="Keep it"
        danger
        busy={discarding}
        onConfirm={confirmDiscard}
        onCancel={closeDiscardModal}
      />
    </div>
  );
}

function Card({ label, value, tone = '' }) {
  return (
    <div className={`sc-card${tone ? ` sc-card--${tone}` : ''}`}>
      <div className="sc-card__value">{value}</div>
      <div className="sc-card__label">{label}</div>
    </div>
  );
}