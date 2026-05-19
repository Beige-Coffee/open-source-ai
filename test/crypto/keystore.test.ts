import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";

// Polyfill sessionStorage so the module under test (which is browser-targeted)
// can run in Node. A plain object backed by a Map is enough for the contract
// we need: getItem / setItem / removeItem.
class MemoryStorage {
  store = new Map<string, string>();
  getItem(k: string): string | null {
    return this.store.has(k) ? this.store.get(k)! : null;
  }
  setItem(k: string, v: string): void {
    this.store.set(k, String(v));
  }
  removeItem(k: string): void {
    this.store.delete(k);
  }
  clear(): void {
    this.store.clear();
  }
}

(globalThis as any).sessionStorage = new MemoryStorage();

// Import AFTER polyfilling so the module sees a defined sessionStorage.
const { cacheDK, clearDK, hasDK, loadDK } = await import("../../src/lib/crypto/keystore.ts");
const { generateDK, randomBytes, encrypt, decrypt } = await import(
  "../../src/lib/crypto/e2ee.ts"
);

beforeEach(() => {
  (globalThis as any).sessionStorage.clear();
});

test("hasDK is false when nothing is cached", () => {
  assert.equal(hasDK(), false);
});

test("cacheDK -> loadDK round-trips the key and preserves encrypt/decrypt", async () => {
  const dk = await generateDK();
  const wrapped = randomBytes(48); // simulate wrapped-DK bytes for fingerprint
  await cacheDK(dk, wrapped);
  assert.equal(hasDK(), true);

  const loaded = await loadDK();
  assert.ok(loaded);

  // Verify the loaded key is functionally equivalent to the original.
  const blob = await encrypt("test", dk);
  assert.equal(await decrypt(blob, loaded!), "test");
});

test("loadDK with matching wrapped fingerprint returns the key", async () => {
  const dk = await generateDK();
  const wrapped = randomBytes(48);
  await cacheDK(dk, wrapped);

  const loaded = await loadDK(wrapped);
  assert.ok(loaded);
});

test("loadDK with mismatched wrapped fingerprint drops the cache and returns null", async () => {
  const dk = await generateDK();
  const wrappedOld = randomBytes(48);
  await cacheDK(dk, wrappedOld);

  // Simulate fetching a different wrapped DK (e.g., password changed elsewhere).
  const wrappedNew = randomBytes(48);
  const loaded = await loadDK(wrappedNew);
  assert.equal(loaded, null);
  assert.equal(hasDK(), false, "stale cache should be cleared");
});

test("clearDK removes the cache", async () => {
  const dk = await generateDK();
  await cacheDK(dk, randomBytes(48));
  assert.equal(hasDK(), true);
  clearDK();
  assert.equal(hasDK(), false);
  assert.equal(await loadDK(), null);
});

test("loadDK with corrupt JSON in sessionStorage clears and returns null", async () => {
  sessionStorage.setItem("oas-dk-v1", "{not valid json");
  const loaded = await loadDK();
  assert.equal(loaded, null);
  assert.equal(hasDK(), false);
});
