// OPTIONAL local encryption (AES-GCM). Uses a non-extractable key kept in IndexedDB.
// Protects data copied off the disk; it does NOT protect against someone using
// an already-logged-in browser profile. Use it for sensitive payload fields.
import { getMeta, setMeta } from './db';

async function getKey() {
  let key = await getMeta('cryptoKey');
  if (!key) {
    key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
    await setMeta('cryptoKey', key); // CryptoKey objects are storable in IndexedDB
  }
  return key;
}

export async function encryptJSON(value) {
  const key = await getKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const data = new TextEncoder().encode(JSON.stringify(value));
  const buf = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, data);
  return { iv: Array.from(iv), data: Array.from(new Uint8Array(buf)) };
}

export async function decryptJSON({ iv, data }) {
  const key = await getKey();
  const buf = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: new Uint8Array(iv) }, key, new Uint8Array(data));
  return JSON.parse(new TextDecoder().decode(buf));
}