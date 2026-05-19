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
 * browser before signup-init completed), initialize fresh keys. This
 * single function is the migration on-ramp for Phase 7: existing users
 * pick up E2EE on their next login without a dedicated migration step.
 */
export async function unlockOrInit(
  supabase: CourseSupabase,
  password: string,
): Promise<{ kind: "unlocked" | "initialized" }> {
  const { data: existing } = await supabase
    .from("user_keys")
    .select("user_id")
    .maybeSingle();
  if (existing) {
    await unlockKeys(supabase, password);
    return { kind: "unlocked" };
  }
  await initKeys(supabase, password);
  return { kind: "initialized" };
}

/** Logout / tab close. Removes the DK from sessionStorage. */
export function clearKeys(): void {
  clearSessionDK();
}
