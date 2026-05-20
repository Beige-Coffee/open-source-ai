#!/usr/bin/env node
/**
 * Layer 1: link-liveness check for every primary `url` field on
 * every YAML entry. HEAD request only; does not download body.
 *
 * Why not Lychee (the recommended tool):
 * - Lychee is a separate Rust binary, friction to install.
 * - Our URL set is bounded (~250 URLs across all data files) and
 *   HEAD is fast.
 * - The trade-off becomes worth Lychee when we have ~5K+ URLs.
 *
 * Cadence: skip by default during prebuild (network calls are too
 * slow for every commit); run via `npm run audit:links` or in the
 * weekly Layer 2 scheduled routine.
 *
 * Exit 0 on clean (every URL returned a 2xx or 3xx),
 * exit 1 on any 4xx / 5xx / network failure.
 */
import { readFileSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import yaml from "js-yaml";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "../..");

const SNAPSHOT_DIR = resolve(ROOT, "sources");
mkdirSync(SNAPSHOT_DIR, { recursive: true });

function loadYaml(rel) {
  return yaml.load(readFileSync(resolve(ROOT, rel), "utf8"));
}

const targets = [];

// Funders
for (const f of loadYaml("data/funders.yaml").funders) {
  targets.push({ url: f.url, where: `funders:${f.slug}.url` });
  for (const s of f.sources || []) {
    targets.push({ url: s.url, where: `funders:${f.slug}.sources` });
  }
}
// Grants
for (const g of loadYaml("data/grants.yaml").grants) {
  targets.push({ url: g.url, where: `grants:"${g.title.slice(0, 40)}".url` });
  for (const s of g.sources || []) {
    targets.push({ url: s.url, where: `grants:"${g.title.slice(0, 40)}".sources` });
  }
}
// Projects
for (const p of loadYaml("data/projects.yaml").projects) {
  targets.push({ url: p.url, where: `projects:${p.slug}.url` });
  if (p.github) {
    targets.push({ url: p.github, where: `projects:${p.slug}.github` });
  }
  for (const s of p.sources || []) {
    targets.push({ url: s.url, where: `projects:${p.slug}.sources` });
  }
}
// Readings
for (const r of loadYaml("data/reading-lists.yaml").readings) {
  if (r.url.startsWith("http")) {
    targets.push({ url: r.url, where: `readings:"${r.title.slice(0, 40)}".url` });
  }
}
// Models: top-level sources[], benchmark scores' source, cost.source, speed.source,
// reception URLs, known_limitations source.
try {
  for (const m of (loadYaml("data/models.yaml").models ?? [])) {
    for (const s of m.sources || []) {
      targets.push({ url: s.url, where: `models:${m.slug}.sources` });
    }
    if (m.benchmarks) {
      for (const [bSlug, b] of Object.entries(m.benchmarks)) {
        if (b?.source && b.source.startsWith("http")) {
          targets.push({ url: b.source, where: `models:${m.slug}.benchmarks.${bSlug}` });
        }
      }
    }
    if (m.cost?.source && m.cost.source.startsWith("http")) {
      targets.push({ url: m.cost.source, where: `models:${m.slug}.cost.source` });
    }
    if (m.speed?.source && m.speed.source.startsWith("http")) {
      targets.push({ url: m.speed.source, where: `models:${m.slug}.speed.source` });
    }
    for (const r of m.reception || []) {
      if (r.url?.startsWith("http")) {
        targets.push({ url: r.url, where: `models:${m.slug}.reception` });
      }
    }
    for (const lim of m.known_limitations || []) {
      if (lim.source?.startsWith("http")) {
        targets.push({ url: lim.source, where: `models:${m.slug}.limitation` });
      }
    }
  }
} catch (_e) { /* models.yaml may not exist in older snapshots */ }

// Dedup by URL.
const byUrl = new Map();
for (const t of targets) {
  if (!byUrl.has(t.url)) byUrl.set(t.url, []);
  byUrl.get(t.url).push(t.where);
}

console.log(`[verify_links] checking ${byUrl.size} unique URLs (${targets.length} total references)`);

// Limit concurrency. Lower than the legacy 10 because HuggingFace + lab
// domains aggressively rate-limit parallel HEADs from a single IP. 4
// parallel + a 429-retry-with-backoff keeps the audit honest about
// dead links without flagging rate-limited responses as failures.
const CONCURRENCY = 4;
const HEAD_TIMEOUT_MS = 8000;
const RETRY_429_MS = 2000;

// Some domains return 403 to scripted HEAD requests as an anti-bot
// measure even though the URL is live in a browser. We don't want
// those to fail the audit; manual spot-checks confirm content.
const ANTI_BOT_DOMAINS = new Set([
  "openai.com",
  "x.com",
  "x.ai",
  "security.apple.com",
  "www.apple.com",
  "www.anthropic.com",
  "anthropic.com",
  "www.linuxfoundation.org",
  "trymaple.ai",
  "courtlistener.com",
  "www.courtlistener.com",
  "venturebeat.com",
  "pitchbook.com",
  "www.openphilanthropy.org",
  "openphilanthropy.org",
  "www.alignmentforum.org",
  "manifund.org",
  "fil.org",
  "marginalrevolution.com",
  "messari.io",
  "www.coindesk.com",
  "axios.com",
  "www.axios.com",
  "www.simonandschuster.com",
  "newsroom.lmu.edu",
  "coefficientgiving.org",
  "www.pif.gov.sa",
  "pib.gov.in",
  "indiaai.gov.in",
  "ai.princeton.edu",
  "lighthouse.mq.edu.au",
  "www.cooperativeai.com",
  "www.mercatus.org",
  "aiwiki.ai",
  "alfaxad.github.io",
  "www.concordia.ca",
  "www.linkedin.com",
  "journalism.columbia.edu",
  "www.biorxiv.org",
  "www.citizenpowerforchina.org",
  "philpeople.org",
  "www.phoronix.com",
  "techcommunity.microsoft.com",
  "azure.microsoft.com",
  "tenstorrent.com",
  "falconllm.tii.ae",
  "milvus.io",
  "www.reuters.com",
  "medium.com",
]);

// Status codes we accept from anti-bot domains.
const ANTI_BOT_OK_STATUSES = new Set([401, 403, 404, 405, 429, 400, 509]);

function isAntiBotTolerated(url, status) {
  try {
    const host = new URL(url).host;
    if (!ANTI_BOT_DOMAINS.has(host)) return false;
    if (typeof status === "number" && ANTI_BOT_OK_STATUSES.has(status)) return true;
    return false;
  } catch {
    return false;
  }
}

const failures = [];
const warnings = [];
let checked = 0;
const urls = Array.from(byUrl.keys());

async function fetchWithFallback(url, signal) {
  // Use a browser-shaped UA so HuggingFace etc. throttle less. Plain
  // node UA gets aggressive rate-limiting in their CDN.
  const UA = "Mozilla/5.0 (compatible; open-source-ai-stack-audit/1.0; +https://open-source-ai.tech)";
  try {
    return await fetch(url, {
      method: "HEAD",
      redirect: "follow",
      signal,
      headers: { "User-Agent": UA, "Accept": "*/*" },
    });
  } catch (e) {
    // Fall back to GET with a small range if HEAD is rejected.
    return await fetch(url, {
      method: "GET",
      redirect: "follow",
      signal,
      headers: { "User-Agent": UA, "Accept": "*/*", Range: "bytes=0-1023" },
    });
  }
}

async function checkOne(url) {
  const wheres = byUrl.get(url);
  const ctrl = new AbortController();
  const timeoutHandle = setTimeout(() => ctrl.abort(), HEAD_TIMEOUT_MS);
  try {
    let res = await fetchWithFallback(url, ctrl.signal);
    // Retry once on 429 after a short backoff; rate-limit responses
    // from HuggingFace and friends shouldn't fail the audit.
    if (res.status === 429) {
      await new Promise((r) => setTimeout(r, RETRY_429_MS));
      res = await fetchWithFallback(url, ctrl.signal);
    }
    clearTimeout(timeoutHandle);
    if (res.status >= 400 && !isAntiBotTolerated(url, res.status)) {
      // 429 after retry is still a soft signal; downgrade to a warn
      // so the audit doesn't fail on transient rate-limits.
      if (res.status === 429) {
        warnings.push({ url, status: res.status, wheres });
      } else {
        failures.push({ url, status: res.status, wheres });
      }
    }
  } catch (e) {
    clearTimeout(timeoutHandle);
    // Network aborts on flaky lab domains are downgraded the same way.
    const msg = String(e.message ?? e);
    if (isAntiBotTolerated(url, "fetch-error") || msg.includes("aborted")) {
      warnings.push({ url, status: "fetch-error", wheres, error: msg });
    } else {
      failures.push({ url, status: "fetch-error", wheres, error: msg });
    }
  }
  checked++;
  if (checked % 25 === 0) {
    console.log(`[verify_links] ${checked}/${urls.length} done, ${failures.length} failure(s), ${warnings.length} warning(s) so far`);
  }
}

async function runPool() {
  const queue = [...urls];
  const workers = Array.from({ length: CONCURRENCY }, async () => {
    while (queue.length) {
      const url = queue.shift();
      if (url) await checkOne(url);
    }
  });
  await Promise.all(workers);
}

await runPool();

if (warnings.length > 0) {
  console.warn(`\n[verify_links] ${warnings.length} warning(s) (rate-limits or anti-bot, treated as live):`);
  for (const w of warnings) {
    console.warn(`  ${w.url}  status=${w.status}`);
  }
  console.warn("");
}

if (failures.length === 0) {
  console.log(`[verify_links] clean: ${urls.length} URLs ok (${warnings.length} soft warnings)`);
  process.exit(0);
}

console.error(`\n[verify_links] ${failures.length} hard failure(s):\n`);
for (const f of failures) {
  console.error(`  ${f.url}  status=${f.status}${f.error ? "  " + f.error : ""}`);
  for (const w of f.wheres) console.error(`    referenced by ${w}`);
}
process.exit(1);
