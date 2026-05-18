#!/usr/bin/env node
/**
 * Source snapshotter.
 *
 * For each URL we want to verify against, fetch the page, extract the
 * main content (so navbar/footer churn does not trip future diffs),
 * hash the extracted text, and store the snapshot at:
 *
 *   sources/{sha256-of-canonical-url}/{ISO-timestamp}.json
 *
 * The latest snapshot is also symlinked to `latest.json` for easy
 * verifier access.
 *
 * Each snapshot record:
 * {
 *   url: original url (post-canonicalization),
 *   fetched_at: ISO timestamp,
 *   http: { status, last_modified, etag, content_type },
 *   wayback_url: archive.org snapshot of the same content (best effort),
 *   content_hash: sha256 of extracted_text,
 *   extracted_text: trafilatura-style main content (string),
 *   raw_html_bytes: byte length of original HTML (not stored)
 * }
 *
 * Usage:
 *   node audit/snapshot/snapshot.mjs <url>
 *   node audit/snapshot/snapshot.mjs --all       (every URL in the data files)
 *   node audit/snapshot/snapshot.mjs --stale     (URLs whose snapshot is older than 30 days)
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync, statSync, symlinkSync, rmSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import yaml from "js-yaml";
import { extractMainContent } from "./extract.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "../..");
const STORE = resolve(ROOT, "sources");
const FETCH_TIMEOUT_MS = 25000;
const STALE_AFTER_DAYS = 30;

mkdirSync(STORE, { recursive: true });

function canonicalize(url) {
  try {
    const u = new URL(url);
    // Strip query strings except for ones that change content; for
    // our purposes, drop them all. Strip fragment. Lowercase host.
    u.search = "";
    u.hash = "";
    u.hostname = u.hostname.toLowerCase();
    // Remove trailing slash from path.
    if (u.pathname.endsWith("/") && u.pathname.length > 1) {
      u.pathname = u.pathname.replace(/\/+$/, "");
    }
    return u.toString();
  } catch {
    return url;
  }
}

function urlHash(url) {
  return createHash("sha256").update(url).digest("hex");
}

function contentHash(text) {
  return createHash("sha256").update(text).digest("hex");
}

function urlDir(url) {
  return resolve(STORE, urlHash(canonicalize(url)));
}

function isStale(url) {
  const dir = urlDir(url);
  const latest = resolve(dir, "latest.json");
  if (!existsSync(latest)) return true;
  const st = statSync(latest);
  const ageMs = Date.now() - st.mtimeMs;
  return ageMs > STALE_AFTER_DAYS * 24 * 60 * 60 * 1000;
}

async function fetchPage(url) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      redirect: "follow",
      signal: ctrl.signal,
      headers: { "User-Agent": "open-source-ai-stack-audit/1.0" },
    });
    const html = await res.text();
    return {
      status: res.status,
      last_modified: res.headers.get("last-modified"),
      etag: res.headers.get("etag"),
      content_type: res.headers.get("content-type"),
      html,
      finalUrl: res.url,
    };
  } finally {
    clearTimeout(t);
  }
}

async function requestWaybackSnapshot(url) {
  // The Wayback Save API: POST https://web.archive.org/save/<url>
  // returns the snapshot URL in the Content-Location header on success.
  // We do this best-effort; if it fails (rate limit, archive
  // unavailable), we skip the wayback field rather than blocking.
  try {
    const res = await fetch(`https://web.archive.org/save/${url}`, {
      method: "GET",
      headers: { "User-Agent": "open-source-ai-stack-audit/1.0" },
      redirect: "manual",
    });
    const loc = res.headers.get("content-location");
    if (loc) return `https://web.archive.org${loc}`;
    // Fallback: construct the likely snapshot URL.
    return `https://web.archive.org/web/*/${url}`;
  } catch {
    return null;
  }
}

export async function snapshotOne(url) {
  const canon = canonicalize(url);
  const dir = urlDir(canon);
  mkdirSync(dir, { recursive: true });

  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  let record;
  try {
    const page = await fetchPage(canon);
    if (page.status >= 400) {
      record = {
        url: canon,
        fetched_at: new Date().toISOString(),
        http: {
          status: page.status,
          last_modified: page.last_modified,
          etag: page.etag,
          content_type: page.content_type,
        },
        wayback_url: null,
        content_hash: null,
        extracted_text: null,
        error: `HTTP ${page.status}`,
        raw_html_bytes: page.html.length,
      };
    } else {
      const extracted = extractMainContent(page.html, page.finalUrl);
      record = {
        url: canon,
        fetched_at: new Date().toISOString(),
        http: {
          status: page.status,
          last_modified: page.last_modified,
          etag: page.etag,
          content_type: page.content_type,
        },
        wayback_url: await requestWaybackSnapshot(canon),
        content_hash: contentHash(extracted),
        extracted_text: extracted,
        raw_html_bytes: page.html.length,
      };
    }
  } catch (e) {
    record = {
      url: canon,
      fetched_at: new Date().toISOString(),
      http: null,
      wayback_url: null,
      content_hash: null,
      extracted_text: null,
      error: String(e.message ?? e),
      raw_html_bytes: 0,
    };
  }

  const filePath = resolve(dir, `${ts}.json`);
  writeFileSync(filePath, JSON.stringify(record, null, 2));
  // Update the latest pointer.
  const latestPath = resolve(dir, "latest.json");
  if (existsSync(latestPath)) rmSync(latestPath);
  // Use a copy rather than symlink for portability across git.
  writeFileSync(latestPath, JSON.stringify(record, null, 2));

  return record;
}

function listAllUrls() {
  function loadYaml(rel) {
    return yaml.load(readFileSync(resolve(ROOT, rel), "utf8"));
  }
  const urls = new Set();
  for (const f of loadYaml("data/funders.yaml").funders) {
    urls.add(f.url);
    for (const s of f.sources || []) urls.add(s.url);
  }
  for (const g of loadYaml("data/grants.yaml").grants) {
    urls.add(g.url);
    for (const s of g.sources || []) urls.add(s.url);
  }
  for (const p of loadYaml("data/projects.yaml").projects) {
    urls.add(p.url);
    if (p.github) urls.add(p.github);
    for (const s of p.sources || []) urls.add(s.url);
  }
  for (const r of loadYaml("data/reading-lists.yaml").readings) {
    if (r.url.startsWith("http")) urls.add(r.url);
  }
  return Array.from(urls);
}

// CLI
if (import.meta.url === `file://${process.argv[1]}`) {
  const arg = process.argv[2];
  if (!arg) {
    console.error("Usage: node audit/snapshot/snapshot.mjs <url|--all|--stale>");
    process.exit(1);
  }
  if (arg === "--all" || arg === "--stale") {
    const urls = listAllUrls();
    const targets = arg === "--all" ? urls : urls.filter(isStale);
    console.log(`[snapshot] ${arg}: ${targets.length} URL(s) to snapshot (of ${urls.length} total)`);
    let done = 0;
    let failed = 0;
    const CONCURRENCY = 4; // gentler than verify_links because we are doing GETs
    async function pool() {
      const queue = [...targets];
      const workers = Array.from({ length: CONCURRENCY }, async () => {
        while (queue.length) {
          const url = queue.shift();
          if (!url) continue;
          try {
            await snapshotOne(url);
          } catch (e) {
            failed++;
            console.error(`[snapshot] ${url} FAILED: ${e.message ?? e}`);
          }
          done++;
          if (done % 10 === 0) {
            console.log(`[snapshot] ${done}/${targets.length} done (${failed} failed)`);
          }
        }
      });
      await Promise.all(workers);
    }
    await pool();
    console.log(`[snapshot] done: ${done} attempted, ${failed} failed`);
  } else {
    const rec = await snapshotOne(arg);
    console.log(JSON.stringify(rec, null, 2));
  }
}
