import { useOffline } from '../context/OfflineContext';
import './ConnectionStatusBadge.css';

export default function ConnectionStatusBadge() {
  const { online, sync, counts } = useOffline();
  const mode = !online ? 'offline' : sync.syncing ? 'syncing' : 'online';
  const label = { online: 'Online', offline: 'Offline Mode', syncing: `Syncing ${sync.done}/${sync.total}` }[mode];
  return (
    <span className={`conn-badge conn-${mode}`} title={`${counts.total} change(s) waiting to sync`}>
      <span className="conn-dot" />
      {label}
      {counts.total > 0 && mode !== 'syncing' && <span className="conn-count">{counts.total}</span>}
    </span>
  );
}