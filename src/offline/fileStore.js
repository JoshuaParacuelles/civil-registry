<<<<<<< HEAD
export async function sha256(blob) {
  const buf = await blob.arrayBuffer()
  const hash = await crypto.subtle.digest('SHA-256', buf)
  return [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, '0')).join('')
=======
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
>>>>>>> 0550160 (Asdasd)
}