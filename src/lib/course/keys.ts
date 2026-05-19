/**
 * Per-user key lifecycle for the course E2EE pipeline.
 *
 * Flow:
 *   signup -> initKeys(password): generate DK, derive KEK, wrap DK,
 *             insert into user_keys, cache DK in sessionStorage.
 *   login  -> unlockKeys(password): fetch user_keys row, derive KEK,
 *             unwrap DK, cache.
 *   logout -> clearKeys(): drop the sessionStorage cache.
 *
 * The browser-side supabase client is used directly (RLS limits access to
 * the user's own row); no API route needed.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  b64urlDecode,
  b64urlEncode,
  deriveKEK,
  generateDK,
  newSalt,
  unwrapDK,
  wrapDK,
} from "../crypto/e2ee";
import { cacheDK, clearDK as clearSessionDK } from "../crypto/keystore";
import type { Database } from "./supabase";

const KDF_ITER = 600_000;

export type CourseSupabase = SupabaseClient<Database>;

/**
 * Called from the signup flow once Supabase auth has issued a session.
 * Idempotent: if a user_keys row already exists (re-running signup, edge
 * case) this skips re-init and unlocks instead.
 */
export async function initKeys(
  supabase: CourseSupabase,
  password: string,
): Promise<{ kind: "initialized" | "already-exists" }> {
  // If a row already exists, treat the call as an unlock attempt rather
  // than a re-init, since re-init would rotate the DK and orphan any
  // existing ciphertexts.
  const { data: existing } = await supabase
    .from("user_keys")
    .select("user_id")
    .maybeSingle();
  if (existing) {
    await unlockKeys(supabase, password);
    return { kind: "already-exists" };
  }

  const salt = newSalt();
  const kek = await deriveKEK(password, salt, KDF_ITER);
  const dk = await generateDK();
  const { wrapped, nonce } = await wrapDK(dk, kek);

  const { data: userData } = await supabase.auth.getUser();
  if (!userData?.user) {
    throw new Error("initKeys called without an authenticated session");
  }

  const { error } = await supabase.from("user_keys").insert({
    user_id: userData.user.id,
    wrapped_dk: b64urlEncode(wrapped),
    wrap_nonce: b64urlEncode(nonce),
    kdf_salt: b64urlEncode(salt),
    kdf_iterations: KDF_ITER,
    kdf_alg: "pbkdf2-sha256",
  });
  if (error) {
    throw new Error(`initKeys: ${error.message}`);
  }

  await cacheDK(dk, wrapped);
  return { kind: "initialized" };
}

/**
 * Called from the login flow once Supabase auth has issued a session.
 * Reads the user_keys row, derives the KEK from the password + stored
 * salt, unwraps the DK, caches it in sessionStorage.
 *
 * Throws on missing key row (signup flow never ran) or wrong password
 * (unwrap fails the AES-GCM auth tag check).
 */
export async function unlockKeys(
  supabase: CourseSupabase,
  password: string,
): Promise<void> {
  const { data, error } = await supabase
    .from("user_keys")
    .select("wrapped_dk, wrap_nonce, kdf_salt, kdf_iterations")
    .maybeSingle();
  if (error) {
    throw new Error(`unlockKeys: ${error.message}`);
  }
  if (!data) {
    throw new Error("unlockKeys: no user_keys row (account never had keys initialized)");
  }
  const wrapped = b64urlDecode(data.wrapped_dk);
  const nonce = b64urlDecode(data.wrap_nonce);
  const salt = b64urlDecode(data.kdf_salt);
  const kek = await deriveKEK(password, salt, data.kdf_iterations);
  const dk = await unwrapDK(wrapped, nonce, kek);
  await cacheDK(dk, wrapped);
}

/**
 * Login flow entry point. If the user has a user_keys row, unlock it.
 * If they don't (existing pre-E2EE account, or first login on a new
 * browser before signup-init completed), initialize fresh keys AND
 * migrate any existing cleartext rows in chat_turns / synthesize_notes
 * / why_open_notes to ciphertext. This is the on-ramp for existing
 * users — no dedicated migration step required.
 */
export async function unlockOrInit(
  supabase: CourseSupabase,
  password: string,
): Promise<{
  kind: "unlocked" | "initialized";
  migrated?: { chat_turns: number; synthesize_notes: number; why_open_notes: number };
}> {
  const { data: existing } = await supabase
    .from("user_keys")
    .select("user_id")
    .maybeSingle();
  if (existing) {
    await unlockKeys(supabase, password);
    return { kind: "unlocked" };
  }
  await initKeys(supabase, password);
  const migrated = await migrateCleartextRowsToCipher(supabase);
  return { kind: "initialized", migrated };
}

/**
 * One-time migration: walks existing rows that have cleartext set and
 * no ciphertext, encrypts the cleartext with the freshly-unlocked DK,
 * writes it back. Safe to re-run: rows where body/content is already
 * NULL or body_enc/content_enc is already set are skipped.
 *
 * Called automatically by unlockOrInit when initKeys runs. The intent
 * is that existing users land on /learn after login and find their
 * prior writing intact, now encrypted.
 */
async function migrateCleartextRowsToCipher(
  supabase: CourseSupabase,
): Promise<{ chat_turns: number; synthesize_notes: number; why_open_notes: number }> {
  const { encryptForStorage } = await import("./encrypted-io");
  const { data: userData } = await supabase.auth.getUser();
  const userId = userData?.user?.id;
  if (!userId) {
    return { chat_turns: 0, synthesize_notes: 0, why_open_notes: 0 };
  }

  let chat = 0;
  let synth = 0;
  let why = 0;

  // chat_turns
  const { data: chatRows } = await supabase
    .from("chat_turns")
    .select("id, content, content_enc")
    .eq("user_id", userId)
    .is("content_enc", null)
    .not("content", "is", null);
  for (const row of chatRows ?? []) {
    if (!row.content) continue;
    const content_enc = await encryptForStorage(row.content);
    const { error } = await supabase
      .from("chat_turns")
      .update({ content_enc, content: null })
      .eq("id", row.id);
    if (!error) chat += 1;
  }

  // synthesize_notes
  const { data: synthRows } = await supabase
    .from("synthesize_notes")
    .select("module_slug, body, body_enc")
    .eq("user_id", userId)
    .is("body_enc", null)
    .not("body", "is", null);
  for (const row of synthRows ?? []) {
    if (!row.body) continue;
    const body_enc = await encryptForStorage(row.body);
    const { error } = await supabase
      .from("synthesize_notes")
      .update({ body_enc, body: null })
      .eq("user_id", userId)
      .eq("module_slug", row.module_slug);
    if (!error) synth += 1;
  }

  // why_open_notes
  const { data: whyRows } = await supabase
    .from("why_open_notes")
    .select("module_slug, body, body_enc")
    .eq("user_id", userId)
    .is("body_enc", null)
    .not("body", "is", null);
  for (const row of whyRows ?? []) {
    if (!row.body) continue;
    const body_enc = await encryptForStorage(row.body);
    const { error } = await supabase
      .from("why_open_notes")
      .update({ body_enc, body: null })
      .eq("user_id", userId)
      .eq("module_slug", row.module_slug);
    if (!error) why += 1;
  }

  return { chat_turns: chat, synthesize_notes: synth, why_open_notes: why };
}

/**
 * Change the user's password. Unwraps the DK with the old password,
 * re-wraps it under a new KEK derived from the new password, then
 * updates both the Supabase auth password and the user_keys row.
 *
 * Order: rewrap user_keys FIRST, then call auth.updateUser. If the order
 * were reversed and the rewrap failed mid-flight, the user would be
 * locked out of their encrypted data with a now-orphan auth credential.
 */
export async function changePassword(
  supabase: CourseSupabase,
  oldPassword: string,
  newPassword: string,
): Promise<void> {
  if (newPassword.length < 8) {
    throw new Error("New password must be at least 8 characters.");
  }
  const { data: row, error: selErr } = await supabase
    .from("user_keys")
    .select("wrapped_dk, wrap_nonce, kdf_salt, kdf_iterations")
    .maybeSingle();
  if (selErr) throw new Error(`changePassword: ${selErr.message}`);
  if (!row) throw new Error("changePassword: no user_keys row to rewrap");

  const oldWrapped = b64urlDecode(row.wrapped_dk);
  const oldNonce = b64urlDecode(row.wrap_nonce);
  const oldSalt = b64urlDecode(row.kdf_salt);
  const oldKEK = await deriveKEK(oldPassword, oldSalt, row.kdf_iterations);
  const dk = await unwrapDK(oldWrapped, oldNonce, oldKEK);

  const newSaltBytes = newSalt();
  const newKEK = await deriveKEK(newPassword, newSaltBytes, KDF_ITER);
  const { wrapped: newWrapped, nonce: newWrapNonce } = await wrapDK(dk, newKEK);

  const { data: userData } = await supabase.auth.getUser();
  const userId = userData?.user?.id;
  if (!userId) throw new Error("changePassword: no authenticated session");

  const { error: upErr } = await supabase
    .from("user_keys")
    .update({
      wrapped_dk: b64urlEncode(newWrapped),
      wrap_nonce: b64urlEncode(newWrapNonce),
      kdf_salt: b64urlEncode(newSaltBytes),
      kdf_iterations: KDF_ITER,
    })
    .eq("user_id", userId);
  if (upErr) throw new Error(`changePassword (rewrap): ${upErr.message}`);

  const { error: authErr } = await supabase.auth.updateUser({
    password: newPassword,
  });
  if (authErr) {
    throw new Error(
      `Encryption rewrapped, but Supabase password change failed: ${authErr.message}. Retry; the new password is what your encrypted data is now tied to.`,
    );
  }

  await cacheDK(dk, newWrapped);
}

/** Logout / tab close. Removes the DK from sessionStorage. */
export function clearKeys(): void {
  clearSessionDK();
}
