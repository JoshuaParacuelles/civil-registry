import { getDB } from './db';

// Stores PDFs/attachments chosen while offline. They upload during sync.
export async function saveFile(file) {
  const db = await getDB();
  const fileId = crypto.randomUUID();
  await db.put('files', { fileId, name: file.name, type: file.type, size: file.size, blob: file, savedAt: Date.now() });
  return fileId;
}
export async function getFile(fileId) {
  const db = await getDB();
  return db.get('files', fileId);
}
export async function deleteFile(fileId) {
  const db = await getDB();
  return db.delete('files', fileId);
}
export async function countFiles() {
  const db = await getDB();
  return db.count('files');
}