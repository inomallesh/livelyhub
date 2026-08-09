// js/crypto.js
//
// Content-level encryption for future rooms. The document text and chat
// message text are encrypted in the browser before they're written to
// Firebase, and decrypted after they're read back — Firebase only ever
// stores ciphertext for these two fields.
//
// Key derivation: the room's 6-digit code is run through PBKDF2 (built into
// the browser's Web Crypto API, no library needed) to produce an AES-256
// key. This is intentionally NOT high-security — a 6-digit code is only
// ~900,000 possibilities, trivial to brute-force for anyone motivated. It
// protects against casual exposure (e.g. someone browsing raw Firebase data
// without trying codes), not a targeted attacker. See project notes for the
// full tradeoff discussion.

const keyCache = new Map(); // roomCode -> Promise<CryptoKey>

function getKeyForRoom(code) {
  if (!keyCache.has(code)) {
    keyCache.set(code, deriveKey(code));
  }
  return keyCache.get(code);
}

async function deriveKey(code) {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    enc.encode(code),
    "PBKDF2",
    false,
    ["deriveKey"]
  );

  // Salt is derived from the code itself (not random) so every participant's
  // browser independently derives the exact same key from the exact same
  // room code — there's no separate channel to share a random salt over.
  return crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: enc.encode(`livelyhub-room-${code}`),
      iterations: 100000,
      hash: "SHA-256",
    },
    keyMaterial,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

function bufToBase64(buf) {
  let binary = "";
  const bytes = new Uint8Array(buf);
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function base64ToBuf(base64) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

/**
 * Encrypts plaintext for storage. Returns a base64 string packing the
 * random IV + ciphertext together (IV doesn't need to be secret, just
 * unique per encryption — AES-GCM requires this).
 */
export async function encryptText(code, plaintext) {
  if (!plaintext) return "";
  const key = await getKeyForRoom(code);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const enc = new TextEncoder();
  const ciphertextBuf = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    enc.encode(plaintext)
  );

  const combined = new Uint8Array(iv.length + ciphertextBuf.byteLength);
  combined.set(iv, 0);
  combined.set(new Uint8Array(ciphertextBuf), iv.length);
  return bufToBase64(combined.buffer);
}

/**
 * Decrypts a value produced by encryptText. Throws if decryption fails
 * (wrong key, corrupted data, or plaintext that was never encrypted) —
 * callers should catch this and show a "couldn't decrypt" notice rather
 * than displaying garbled text.
 */
export async function decryptText(code, packedBase64) {
  if (!packedBase64) return "";
  const key = await getKeyForRoom(code);
  const combined = base64ToBuf(packedBase64);
  const iv = combined.slice(0, 12);
  const data = combined.slice(12);
  const plainBuf = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, data);
  return new TextDecoder().decode(plainBuf);
}
