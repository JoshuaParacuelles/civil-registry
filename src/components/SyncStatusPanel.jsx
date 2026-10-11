import { Link } from 'react-router-dom';
import { useOffline } from '../context/OfflineContext';
import './SyncStatusPanel.css';

export default function SyncStatusPanel() {
  const { online, sync, counts, syncNow } = useOffline();
  if (counts.total === 0 && !sync.syncing) return null;
  const pct = sync.total ? Math.round((sync.done / sync.total) * 100) : 0;
  return (
    <div className="sync-panel">
      <div className="sync-row">
        <strong>{counts.total} change(s) not yet synced</strong>
        <button disabled={!online || sync.syncing} onClick={() => syncNow()}>
          {sync.syncing ? 'Syncing…' : 'Sync now'}
        </button>
      </div>
      {sync.syncing && <div className="sync-bar"><div style={{ width: `${pct}%` }} /></div>}
      <div className="sync-meta">
        Pending {counts.pending} · Failed {counts.failed} · Conflicts {counts.conflict}
        {!online && ' · Will sync automatically when internet returns'}
      </div>
      {sync.lastError && <div className="sync-error">{sync.lastError}</div>}
      {(counts.failed > 0 || counts.conflict > 0) && <Link to="/offline-sync">Review in Offline Data &amp; Sync</Link>}
    </div>
  );
}