#!/usr/bin/env node
/**
 * Bulk-snapshot URLs from a newline-delimited file.
 * Usage: node /tmp/bulk-snapshot.mjs /tmp/audit-new-urls.txt
 */
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

const path = process.argv[2];
if (!path) { console.error("usage: bulk-snapshot.mjs <urls.txt>"); process.exit(1); }
const urls = readFileSync(path, "utf8").split("\n").map((s) => s.trim()).filter((s) => s.startsWith("http"));
console.log(`[bulk-snapshot] snapshotting ${urls.length} URLs in parallel (concurrency 6)...`);

let done = 0;
let failed = 0;
const CONCURRENCY = 6;
const queue = [...urls];

async function worker() {
  while (queue.length) {
    const url = queue.shift();
    if (!url) continue;
    const res = spawnSync("node", ["audit/snapshot/snapshot.mjs", url], {
      cwd: "/Users/austinv2/code/open-source-ai-stack",
      timeout: 60000,
      stdio: ["ignore", "ignore", "pipe"],
    });
    if (res.status !== 0) {
      failed++;
      const stderr = res.stderr ? res.stderr.toString().slice(0, 200) : String(res.error || "unknown");
      console.error(`[bulk-snapshot] FAIL ${url}: ${stderr}`);
    }
    done++;
    if (done % 10 === 0) console.log(`[bulk-snapshot] ${done}/${urls.length} done (${failed} failed)`);
  }
}

await Promise.all(Array.from({ length: CONCURRENCY }, worker));
console.log(`[bulk-snapshot] done: ${done} attempted, ${failed} failed`);
