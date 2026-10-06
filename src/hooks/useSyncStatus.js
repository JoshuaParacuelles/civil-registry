import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../offline/db'

const EMPTY = { pending: 0, syncing: 0, failed: 0, conflict: 0 }

export default function useSyncStatus() {
  const counts = useLiveQuery(async () => {
    const count = (s) => db.outbox.where('status').equals(s).count()
    const [pending, syncing, failed, conflict] = await Promise.all([
      count('pending'), count('syncing'), count('failed'), count('conflict'),
    ])
    return { pending, syncing, failed, conflict }
  }, [], EMPTY)

  return { ...counts, waiting: counts.pending + counts.failed + counts.syncing }
}