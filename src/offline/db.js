import { openDB } from 'idb';

const DB_NAME = 'civil-registry-offline';
const DB_VERSION = 1;

let dbPromise;

export function getDB() {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db) {
        // Read-through cache of server records: key = "entity:id"
        const cache = db.createObjectStore('cache', { keyPath: 'key' });
        cache.createIndex('entity', 'entity');

        // Pending writes made while offline
        const outbox = db.createObjectStore('outbox', { keyPath: 'opId' });
        outbox.createIndex('status', 'status');
        outbox.createIndex('createdAt', 'createdAt');

        // Offline attachments (PDF blobs) uploaded during sync
        db.createObjectStore('files', { keyPath: 'fileId' });

        // Misc: lastSyncAt, cached auth, etc.
        db.createObjectStore('meta', { keyPath: 'key' });
      },
    });
  }
  return dbPromise;
}

export async function getMeta(key) {
  const db = await getDB();
  return (await db.get('meta', key))?.value;
}

export async function setMeta(key, value) {
  const db = await getDB();
  await db.put('meta', { key, value });
}