import Dexie from 'dexie'

export const db = new Dexie('civilRegistryOffline')

db.version(1).stores({
  outbox: 'opId, status, createdAt, entity, entityId',
  files: 'fileId, opId, sha256',
  cache: 'key, updatedAt',
  meta: 'key',
})