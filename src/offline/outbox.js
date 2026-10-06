import { db } from './db'
import { getDeviceId } from './deviceId'
import { sha256 } from './fileStore'
import { runSync } from './syncEngine'

export async function enqueue({ entity, entityId, action, payload, baseVersion, file }) {
  const opId = crypto.randomUUID()
  const id = entityId ?? crypto.randomUUID()
  const deviceId = await getDeviceId()
  const hash = file ? await sha256(file) : null

  await db.transaction('rw', db.outbox, db.files, async () => {
    if (file) await db.files.add({ fileId: crypto.randomUUID(), opId, blob: file, sha256: hash })
    await db.outbox.add({
      opId, entity, entityId: id, action, payload, baseVersion,
      status: 'pending', attempts: 0, createdAt: Date.now(), deviceId,
    })
  })
  runSync() // mo-sync dayon kung online
  return id
}