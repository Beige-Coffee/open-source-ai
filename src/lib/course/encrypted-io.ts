/**
 * Encrypt-before-write / decrypt-after-read helpers for the three
 * E2EE course tables: chat_turns, synthesize_notes, why_open_notes.
 *
 * All functions pull the data key from sessionStorage via the keystore.
 * Callers that hit these helpers without a cached DK get a thrown
 * Error, which surfaces in the UI as "your session is locked, please
 * log in again" rather than silently writing cleartext.
 */

import type { EncBlob } from "../crypto/e2ee";
import { decrypt, encrypt } from "../crypto/e2ee";
import { loadDK } from "../crypto/keystore";

async function requireDK() {
  const dk = await loadDK();
  if (!dk) {
    throw new Error("E2EE_LOCKED: no data key cached. Log in again to unlock.");
  }
  return dk;
}

/**
 * Encrypt a plaintext string for storage in a JSONB *_enc column.
 * The shape matches the EncBlob wire format from src/lib/crypto/e2ee.ts.
 */
export async function encryptForStorage(plaintext: string): Promise<EncBlob> {
  const dk = await requireDK();
  return encrypt(plaintext, dk);
}

/**
 * Decrypt a JSONB *_enc row value back to plaintext. Pass through null /
 * undefined unchanged so callers can use a single code path for legacy
 * cleartext rows that haven't been migrated yet (Phase 7).
 */
export async function decryptFromStorage(
  blob: EncBlob | null | undefined,
): Promise<string | null> {
  if (blob == null) return null;
  const dk = await requireDK();
  return decrypt(blob, dk);
}

/**
 * Dual-path read: takes a row that has both the legacy cleartext field
 * and the new ciphertext field, returns whichever is present. Prefers
 * ciphertext when both are set (transitional state during Phase 7
 * migration), falls back to cleartext for unmigrated rows.
 */
export async function readEncOrPlain(
  cipher: EncBlob | null | undefined,
  plain: string | null | undefined,
): Promise<string> {
  if (cipher != null) {
    const decrypted = await decryptFromStorage(cipher);
    if (decrypted !== null) return decrypted;
  }
  return plain ?? "";
}
