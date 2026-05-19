/**
 * sessionStorage-backed cache for the per-user data key (DK).
 *
 * Scope: lives for the lifetime of the tab. Cleared on close. New tab or
 * refresh after close means re-unlocking with the user's password.
 *
 * Storage shape: base64url-encoded raw AES-256 key bytes, plus a fingerprint
 * of the wrapped DK so we can detect stale caches after a password change
 * on another device.
 *
 * This module is the only place that touches sessionStorage for the DK; the
 * rest of the app talks through cacheDK / loadDK / clearDK.
 */

import { b64urlDecode, b64urlEncode } from "./e2ee";

const STORAGE_KEY = "oas-dk-v1";

interface CachedDK {
  raw: string; // base64url-encoded raw AES-256 key
  fp: string; // base64url-encoded SHA-256 of wrapped-DK bytes; cache invalidation hint
}

async function fingerprint(wrapped: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", wrapped);
  return b64urlEncode(new Uint8Array(digest));
}

export async function cacheDK(dk: CryptoKey, wrapped: Uint8Array): Promise<void> {
  if (typeof sessionStorage === "undefined") return;
  const raw = await crypto.subtle.exportKey("raw", dk);
  const entry: CachedDK = {
    raw: b64urlEncode(new Uint8Array(raw)),
    fp: await fingerprint(wrapped),
  };
  sessionStorage.setItem(STORAGE_KEY, JSON.stringify(entry));
}

export async function loadDK(currentWrapped?: Uint8Array): Promise<CryptoKey | null> {
  if (typeof sessionStorage === "undefined") return null;
  const raw = sessionStorage.getItem(STORAGE_KEY);
  if (!raw) return null;
  let parsed: CachedDK;
  try {
    parsed = JSON.parse(raw);
  } catch {
    clearDK();
    return null;
  }
  // If caller passed the current wrapped DK and it doesn't match the cached
  // fingerprint, the user re-keyed elsewhere (password change on another
  // device). Drop the stale cache and force a fresh unlock.
  if (currentWrapped) {
    const fp = await fingerprint(currentWrapped);
    if (fp !== parsed.fp) {
      clearDK();
      return null;
    }
  }
  const keyBytes = b64urlDecode(parsed.raw);
  return crypto.subtle.importKey(
    "raw",
    keyBytes,
    { name: "AES-GCM", length: 256 },
    true,
    ["encrypt", "decrypt"],
  );
}

export function clearDK(): void {
  if (typeof sessionStorage === "undefined") return;
  sessionStorage.removeItem(STORAGE_KEY);
}

export function hasDK(): boolean {
  if (typeof sessionStorage === "undefined") return false;
  return sessionStorage.getItem(STORAGE_KEY) !== null;
}
