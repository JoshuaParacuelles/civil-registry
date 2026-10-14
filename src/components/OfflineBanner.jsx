import useOnlineStatus from '../hooks/useOnlineStatus'
import useSyncStatus from '../hooks/useSyncStatus'
import './OfflineBanner.css'

export default function OfflineBanner() {
  const online = useOnlineStatus()
  const { waiting, syncing } = useSyncStatus()

  if (online && waiting === 0) return null

  const count = `${waiting} ${waiting === 1 ? 'change' : 'changes'}`

  let type = 'offline'
  let text = `You are offline. Your ${count} ${waiting === 1 ? 'is' : 'are'} saved on this device and will be uploaded when you reconnect.`

  if (online && syncing > 0) {
    type = 'syncing'
    text = `Uploading your saved changes now. ${count} left to upload.`
  } else if (online) {
    type = 'pending'
    text = `You are back online. ${count} saved on this device ${waiting === 1 ? 'is' : 'are'} being uploaded.`
  }

  return (
    <div className={`offline-banner offline-banner--${type}`} role="status">
      <span className="offline-banner__dot" />
      {text}
    </div>
  )
}