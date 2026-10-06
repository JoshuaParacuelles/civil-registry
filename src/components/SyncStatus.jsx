import useConnectivity from '../hooks/useConnectivity'
import useSyncStatus from '../hooks/useSyncStatus'
import './SyncStatus.css'

export default function SyncStatus({ onClick }) {
  const { online } = useConnectivity()
  const { pending, syncing, failed, conflict } = useSyncStatus()

  return (
    <button
      type="button"
      className="sync-status"
      onClick={onClick}
      title="Open Sync Center"
    >
      <span className={`sync-status__light ${online ? 'is-online' : 'is-offline'}`} />
      <span className="sync-status__label">{online ? 'Online' : 'Offline'}</span>

      {pending > 0 && <span className="sync-chip chip-pending">{pending} pending</span>}
      {syncing > 0 && <span className="sync-chip chip-syncing">{syncing} syncing</span>}
      {failed > 0 && <span className="sync-chip chip-failed">{failed} failed</span>}
      {conflict > 0 && <span className="sync-chip chip-conflict">{conflict} conflict</span>}
    </button>
  )
}