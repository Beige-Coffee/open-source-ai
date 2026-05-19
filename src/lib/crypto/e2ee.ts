/**
 * WebCrypto wrappers for the course E2EE pipeline.
 *
 * Two-level key hierarchy:
 *   password ─PBKDF2(salt, iter)─▶ KEK ─AES-GCM-unwrap─▶ DK ─AES-GCM─▶ ciphertext
 *
 * Server stores: wrapped DK + wrap nonce + KDF salt + KDF params. Never
 * sees the password, the KEK, the DK, or the plaintext.
 *
 * All public functions return raw bytes or JSON-serializable blobs. Base64
 * encoding happens at the wire boundary (in lib/crypto/keystore and the
 * /api routes), not here.
 */

const KDF_ALG = "PBKDF2";
const KDF_HASH = "SHA-256";
const KDF_DEFAULT_ITER = 600_000;
const KDF_KEY_BITS = 256;

const CIPHER_ALG = "AES-GCM";
const CIPHER_KEY_BITS = 256;
const NONCE_BYTES = 12;
const SALT_BYTES = 16;

export const E2EE_VERSION = 1;

export interface EncBlob {
  v: number;
  n: string; // base64url nonce
  c: string; // base64url ciphertext (includes GCM auth tag)
}

export interface WrappedKey {
  wrapped: Uint8Array;
  nonce: Uint8Array;
}

// ---------------------------------------------------------------------------
// Random bytes
// ---------------------------------------------------------------------------

export function randomBytes(n: number): Uint8Array {
  const buf = new Uint8Array(n);
  crypto.getRandomValues(buf);
  return buf;
}

export function newSalt(): Uint8Array {
  return randomBytes(SALT_BYTES);
}

export function newNonce(): Uint8Array {
  return randomBytes(NONCE_BYTES);
}

// ---------------------------------------------------------------------------
// KDF: password + salt -> KEK (key-encryption-key)
// ---------------------------------------------------------------------------

export async function deriveKEK(
  password: string,
  salt: Uint8Array,
  iterations: number = KDF_DEFAULT_ITER,
): Promise<CryptoKey> {
  const baseKey = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    { name: KDF_ALG },
    false,
    ["deriveKey"],
  );
  return crypto.subtle.deriveKey(
    {
      name: KDF_ALG,
      hash: KDF_HASH,
      salt,
      iterations,
    },
    baseKey,
    { name: CIPHER_ALG, length: KDF_KEY_BITS },
    true, // extractable so we can wrap/unwrap with it
    ["wrapKey", "unwrapKey"],
  );
}

// ---------------------------------------------------------------------------
// DK: per-user random data key. Generated on signup, wrapped by KEK,
// stored on server. Unwrapped at login and cached in sessionStorage.
// ---------------------------------------------------------------------------

export async function generateDK(): Promise<CryptoKey> {
  return crypto.subtle.generateKey(
    { name: CIPHER_ALG, length: CIPHER_KEY_BITS },
    true,
    ["encrypt", "decrypt"],
  );
}

export async function wrapDK(dk: CryptoKey, kek: CryptoKey): Promise<WrappedKey> {
  const nonce = newNonce();
  const wrapped = await crypto.subtle.wrapKey(
    "raw",
    dk,
    kek,
    { name: CIPHER_ALG, iv: nonce },
  );
  return { wrapped: new Uint8Array(wrapped), nonce };
}

export async function unwrapDK(
  wrapped: Uint8Array,
  nonce: Uint8Array,
  kek: CryptoKey,
): Promise<CryptoKey> {
  return crypto.subtle.unwrapKey(
    "raw",
    wrapped,
    kek,
    { name: CIPHER_ALG, iv: nonce },
    { name: CIPHER_ALG, length: CIPHER_KEY_BITS },
    true,
    ["encrypt", "decrypt"],
  );
}

// ---------------------------------------------------------------------------
// Symmetric encrypt / decrypt with DK
// ---------------------------------------------------------------------------

export async function encrypt(plaintext: string, dk: CryptoKey): Promise<EncBlob> {
  const nonce = newNonce();
  const ciphertext = await crypto.subtle.encrypt(
    { name: CIPHER_ALG, iv: nonce },
    dk,
    new TextEncoder().encode(plaintext),
  );
  return {
    v: E2EE_VERSION,
    n: b64urlEncode(nonce),
    c: b64urlEncode(new Uint8Array(ciphertext)),
  };
}

export async function decrypt(blob: EncBlob, dk: CryptoKey): Promise<string> {
  if (blob.v !== E2EE_VERSION) {
    throw new Error(`Unsupported E2EE blob version: ${blob.v}`);
  }
  const nonce = b64urlDecode(blob.n);
  const ciphertext = b64urlDecode(blob.c);
  const plaintext = await crypto.subtle.decrypt(
    { name: CIPHER_ALG, iv: nonce },
    dk,
    ciphertext,
  );
  return new TextDecoder().decode(plaintext);
}

// ---------------------------------------------------------------------------
// base64url codec for the wire format
// ---------------------------------------------------------------------------

export function b64urlEncode(bytes: Uint8Array): string {
  let s = "";
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function b64urlDecode(s: string): Uint8Array {
  const pad = s.length % 4 === 0 ? "" : "=".repeat(4 - (s.length % 4));
  const std = s.replace(/-/g, "+").replace(/_/g, "/") + pad;
  const bin = atob(std);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
