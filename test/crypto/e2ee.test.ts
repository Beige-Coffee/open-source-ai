import { test } from "node:test";
import assert from "node:assert/strict";
import {
  E2EE_VERSION,
  b64urlDecode,
  b64urlEncode,
  decrypt,
  deriveKEK,
  encrypt,
  generateDK,
  newNonce,
  newSalt,
  randomBytes,
  unwrapDK,
  wrapDK,
} from "../../src/lib/crypto/e2ee.ts";

test("randomBytes returns the requested length", () => {
  assert.equal(randomBytes(0).length, 0);
  assert.equal(randomBytes(16).length, 16);
  assert.equal(randomBytes(48).length, 48);
});

test("newSalt is 16 bytes; newNonce is 12 bytes", () => {
  assert.equal(newSalt().length, 16);
  assert.equal(newNonce().length, 12);
});

test("base64url round-trip preserves bytes including non-ASCII", () => {
  const bytes = new Uint8Array([0, 1, 2, 250, 251, 252, 253, 254, 255]);
  assert.deepEqual(b64urlDecode(b64urlEncode(bytes)), bytes);
});

test("base64url has no padding or URL-unsafe chars", () => {
  // Random 17-byte payload makes encoding produce padding pre-strip.
  const s = b64urlEncode(randomBytes(17));
  assert.ok(!s.includes("="));
  assert.ok(!s.includes("+"));
  assert.ok(!s.includes("/"));
});

test("DK encrypt -> decrypt round-trips arbitrary text", async () => {
  const dk = await generateDK();
  for (const plaintext of ["", "hello", "🔑 with emoji and ünïcödé"]) {
    const blob = await encrypt(plaintext, dk);
    assert.equal(blob.v, E2EE_VERSION);
    assert.equal(await decrypt(blob, dk), plaintext);
  }
});

test("two encrypts of same plaintext produce different nonces and ciphertexts", async () => {
  const dk = await generateDK();
  const a = await encrypt("same plaintext", dk);
  const b = await encrypt("same plaintext", dk);
  assert.notEqual(a.n, b.n);
  assert.notEqual(a.c, b.c);
});

test("decrypt with wrong DK throws", async () => {
  const dk1 = await generateDK();
  const dk2 = await generateDK();
  const blob = await encrypt("secret", dk1);
  await assert.rejects(() => decrypt(blob, dk2));
});

test("decrypt rejects tampered ciphertext", async () => {
  const dk = await generateDK();
  const blob = await encrypt("important", dk);
  // Flip one byte in the ciphertext.
  const bytes = b64urlDecode(blob.c);
  bytes[0] ^= 0xff;
  const tampered = { ...blob, c: b64urlEncode(bytes) };
  await assert.rejects(() => decrypt(tampered, dk));
});

test("decrypt rejects unknown blob version", async () => {
  const dk = await generateDK();
  const blob = await encrypt("hello", dk);
  await assert.rejects(() => decrypt({ ...blob, v: 999 }, dk));
});

test("KEK derives deterministically from same password + salt + iter", async () => {
  // Use 1k iter for the test so it doesn't take all day.
  const salt = newSalt();
  const k1 = await deriveKEK("hunter2", salt, 1000);
  const k2 = await deriveKEK("hunter2", salt, 1000);
  // Two CryptoKeys can't be compared directly; wrap+unwrap a known key with k1
  // and confirm k2 unwraps to the same bytes.
  const dk = await generateDK();
  const { wrapped, nonce } = await wrapDK(dk, k1);
  const dk2 = await unwrapDK(wrapped, nonce, k2);
  const raw1 = new Uint8Array(await crypto.subtle.exportKey("raw", dk));
  const raw2 = new Uint8Array(await crypto.subtle.exportKey("raw", dk2));
  assert.deepEqual(raw1, raw2);
});

test("KEK derived from wrong password fails to unwrap DK", async () => {
  const salt = newSalt();
  const kekRight = await deriveKEK("hunter2", salt, 1000);
  const kekWrong = await deriveKEK("hunter3", salt, 1000);
  const dk = await generateDK();
  const { wrapped, nonce } = await wrapDK(dk, kekRight);
  await assert.rejects(() => unwrapDK(wrapped, nonce, kekWrong));
});

test("DK survives full wrap -> unwrap -> encrypt -> decrypt cycle", async () => {
  // Simulates the real flow: signup wraps DK, login unwraps it,
  // app encrypts with the unwrapped DK, app decrypts later.
  const password = "correct horse battery staple";
  const salt = newSalt();
  const kek = await deriveKEK(password, salt, 1000);
  const originalDK = await generateDK();
  const { wrapped, nonce } = await wrapDK(originalDK, kek);

  // Simulate persisting wrapped+nonce+salt to server and reloading.
  const reloadedKEK = await deriveKEK(password, salt, 1000);
  const reloadedDK = await unwrapDK(wrapped, nonce, reloadedKEK);

  const blob = await encrypt("course note body", originalDK);
  assert.equal(await decrypt(blob, reloadedDK), "course note body");
});
