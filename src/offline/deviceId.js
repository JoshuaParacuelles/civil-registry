import { db } from './db'

export async function getDeviceId() {
  const row = await db.meta.get('deviceId')
  if (row) return row.value
  const value = crypto.randomUUID()
  await db.meta.put({ key: 'deviceId', value })
  return value
}