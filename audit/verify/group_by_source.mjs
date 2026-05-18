#!/usr/bin/env node
/**
 * Group stale_pending_review (or other status) rows by their primary
 * cited source URL, then print one prompt per source with the snapshot
 * text + all attached claims. The in-session agent can then verify all
 * claims for one source in a single pass.
 *
 * Usage:
 *   node audit/verify/group_by_source.mjs <status> [--limit N] [--offset M]
 *
 * Example:
 *   node audit/verify/group_by_source.mjs stale_pending_review --limit 3
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "../..");
const LEDGER = resolve(ROOT, "audit/CLAIMS_LEDGER.md");
const STORE = resolve(ROOT, "sources");

function canonicalize(url) {
  try {
    const u = new URL(url);
    u.search = "";
    u.hash = "";
    u.hostname = u.hostname.toLowerCase();
    if (u.pathname.endsWith("/") && u.pathname.length > 1) {
      u.pathname = u.pathname.replace(/\/+$/, "");
    }
    return u.toString();
  } catch {
    return url;
  }
}
function urlHash(url) {
  return createHash("sha256").update(canonicalize(url)).digest("hex");
}
function loadSnapshot(url) {
  const path = resolve(STORE, urlHash(url), "latest.json");
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return null;
  }
}

const args = process.argv.slice(2);
const status = args[0] || "stale_pending_review";
const limitIdx = args.indexOf("--limit");
const limit = limitIdx >= 0 ? Number(args[limitIdx + 1]) : 10;
const offsetIdx = args.indexOf("--offset");
const offset = offsetIdx >= 0 ? Number(args[offsetIdx + 1]) : 0;

const ledger = readFileSync(LEDGER, "utf8");
const byUrl = new Map();
for (const line of ledger.split("\n")) {
  if (!line.startsWith("|")) continue;
  const cells = line.split("|").slice(1, -1).map((c) => c.trim());
  if (cells.length < 10) continue;
  const [id, surface, location, claim, lane, type, citedSources, verdict] = cells;
  if (verdict !== status) continue;
  if (lane !== "factual") continue; // skip framing/prediction at this layer
  const urls = citedSources.split(",").map((s) => s.trim()).filter((s) => s.startsWith("http"));
  if (urls.length === 0) continue;
  const primary = urls[0]; // pick first URL as primary
  if (!byUrl.has(primary)) byUrl.set(primary, []);
  byUrl.get(primary).push({ id, claim, type, allUrls: urls });
}

// Sort URLs by claim count descending (biggest leverage first), then alpha.
const sorted = [...byUrl.entries()].sort((a, b) => {
  if (b[1].length !== a[1].length) return b[1].length - a[1].length;
  return a[0].localeCompare(b[0]);
});

console.error(`[group-by-source] total URLs: ${sorted.length}, claims: ${[...byUrl.values()].reduce((a, b) => a + b.length, 0)}`);
console.error(`[group-by-source] emitting offset=${offset} limit=${limit}`);

const slice = sorted.slice(offset, offset + limit);

const PROMPT_HEADER = `# Verifier task

For each ROW below, decide whether the SNAPSHOT entails the CLAIM.

Output one verdict per ROW. Persist via:
  node audit/verify/verify_entailment.mjs update <row-id> --verdict <V> [--evidence "<span>"] [--notes "<note>"]

Verdict enum:
  - supported       : snapshot directly entails the specific quantity/date/attribution
  - unsupported     : snapshot is relevant but does NOT entail (need better source or soften claim)
  - contradicted    : snapshot directly contradicts the claim
  - verifier_unable : snapshot missing relevant section or claim is ambiguous

Rules:
  - "supported" REQUIRES verbatim evidence_span from the snapshot.
  - Bias toward "unsupported" when entailment is not crisp.
  - "Topically related" is NOT supported. Source must explicitly state the fact.

`;

console.log(PROMPT_HEADER);
for (const [url, claims] of slice) {
  const snapshot = loadSnapshot(url);
  if (!snapshot || !snapshot.extracted_text) {
    console.log(`\n## SOURCE: ${url}`);
    console.log(`(NO SNAPSHOT - mark all rows as source_unreachable)`);
    for (const c of claims) {
      console.log(`  ROW ${c.id}: ${c.claim}`);
    }
    continue;
  }
  console.log(`\n## SOURCE: ${url}`);
  console.log(`Fetched: ${snapshot.fetched_at}`);
  console.log(`\nSnapshot content (truncated to 8000 chars):`);
  console.log("```");
  console.log((snapshot.extracted_text || "").slice(0, 8000));
  console.log("```");
  console.log(`\nVerify these ${claims.length} claim(s) against the snapshot:\n`);
  for (const c of claims) {
    console.log(`### ROW ${c.id} (type=${c.type})`);
    console.log(`CLAIM: ${c.claim}`);
    console.log();
  }
}

console.error(`[group-by-source] emitted ${slice.length} source group(s)`);
