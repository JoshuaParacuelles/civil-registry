// src/hooks/useSyncStatus.js
import { useCallback, useEffect, useState } from 'react'
import { getSyncState, subscribeSyncState } from '../offline/syncEngine'
import { listByStatus } from '../offline/outboxQueue'

const EMPTY = { pending: 0, syncing: 0, failed: 0, conflict: 0 }

export default function useSyncStatus() {
  const [counts, setCounts] = useState(EMPTY)
  const [sync, setSync] = useState(() => getSyncState())

  // Count queued changes by status from the outbox.
  const refreshCounts = useCallback(async () => {
    try {
      const [pending, syncing, failed, conflict] = await Promise.all([
        listByStatus('pending'),
        listByStatus('syncing'),
        listByStatus('failed'),
        listByStatus('conflict'),
      ])
      setCounts({
        pending: pending.length,
        syncing: syncing.length,
        failed: failed.length,
        conflict: conflict.length,
      })
    } catch {
      /* outbox not ready yet; keep the last counts */
    }
  }, [])

  useEffect(() => {
    refreshCounts()

    // Recount whenever the sync engine reports a change.
    const unsub = subscribeSyncState((next) => {
      setSync(next)
      refreshCounts()
    })

    // Fallback refresh in case a change happens outside the engine.
    const timer = setInterval(refreshCounts, 5000)

    return () => {
      unsub()
      clearInterval(timer)
    }
  }, [refreshCounts])

  return {
    ...counts,
    waiting: counts.pending + counts.failed + counts.syncing,
    isSyncing: sync.syncing,
    authRequired: sync.authRequired,
    lastError: sync.lastError,
    lastSyncAt: sync.lastSyncAt,
  }
}