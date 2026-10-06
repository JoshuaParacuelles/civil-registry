import useConnectivity from '../hooks/useConnectivity'
import useSyncStatus from '../hooks/useSyncStatus'
import './OfflineBanner.css'

export default function OfflineBanner() {
  const { online } = useConnectivity()
  const { waiting, syncing } = useSyncStatus()

  if (online && waiting === 0) return null

  let type = 'offline'
  let text = `Offline Mode · ${waiting} record${waiting === 1 ? '' : 's'} waiting to sync`

  if (online && syncing > 0) {
    type = 'syncing'
    text = `Syncing... ${waiting} record${waiting === 1 ? '' : 's'} left`
  } else if (online) {
    type = 'pending'
    text = `Back online · ${waiting} record${waiting === 1 ? '' : 's'} waiting to sync`
  }

  return (
    <div className={`offline-banner offline-banner--${type}`} role="status">
      <span className="offline-banner__dot" />
      {text}
    </div>
  )
}