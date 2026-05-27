#!/usr/bin/env node
/**
 * Internal-link verifier (companion to verify_links.mjs, which checks
 * external citation URLs). Crawls the built static output and checks that
 * every internal <a href> / asset src resolves to a real generated page or
 * asset, and that every same-page #fragment matches an id in its target.
 *
 * Ground truth is the actually-generated files, so a link to a dynamic
 * route that did not generate (e.g. /projects/<slug> for a project without
 * an explainer) is correctly reported as broken.
 *
 * Server-rendered routes (prerender = false) are absent from the static
 * build by design. They are discovered by scanning src/pages for the
 * `prerender = false` marker, so this list stays correct as routes change,
 * and links into them are reported separately, never as broken.
 *
 * Run AFTER a build (needs dist/). Exit 0 clean, 1 if anything is broken.
 *   npm run build && npm run audit:internal-links
 */
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { resolve, join, relative, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT_REPO = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

// The Vercel adapter nests static output under dist/client; a plain static
// build emits to dist. Accept an explicit arg, else autodetect.
const DIST = (() => {
  if (process.argv[2]) return resolve(process.argv[2]);
  for (const c of ["dist/client", "dist"]) {
    const p = resolve(ROOT_REPO, c);
    if (existsSync(join(p, "index.html"))) return p;
  }
  return resolve(ROOT_REPO, "dist/client");
})();
if (!existsSync(DIST)) {
  console.error(`No build output at ${DIST}. Run "npm run build" first.`);
  process.exit(2);
}

const REDIRECTS = new Set(Object.keys(loadRedirects())); // from astro.config.mjs
function loadRedirects() {
  try {
    const cfg = readFileSync(resolve(ROOT_REPO, "astro.config.mjs"), "utf8");
    const block = cfg.match(/redirects\s*:\s*\{([^}]*)\}/s)?.[1] ?? "";
    const out = {};
    for (const m of block.matchAll(/["']([^"']+)["']\s*:/g)) out[m[1]] = true;
    return out;
  } catch { return {}; }
}

// Discover SSR (prerender = false) routes by scanning src/pages.
const ssrExact = new Set();
const ssrPrefixes = [];
(function scanPages(dir, base = "") {
  if (!existsSync(dir)) return;
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) { scanPages(p, base + "/" + name); continue; }
    if (!/\.(astro|ts|js|mdx)$/.test(name)) continue;
    const body = readFileSync(p, "utf8");
    if (!/export\s+const\s+prerender\s*=\s*false/.test(body)) continue;
    let route = base + "/" + name.replace(/\.(astro|ts|js|mdx)$/, "");
    if (route.endsWith("/index")) route = route.slice(0, -"/index".length) || "/";
    if (route.includes("[")) {
      // dynamic route -> any path under its static parent is SSR
      ssrPrefixes.push(route.slice(0, route.indexOf("[")));
    } else {
      ssrExact.add(route);
    }
  }
})(resolve(ROOT_REPO, "src/pages"));
const isSSR = (p) => ssrExact.has(p) || ssrPrefixes.some((pre) => p === pre.replace(/\/$/, "") || p.startsWith(pre));

// ---- crawl the build ----
const allFiles = [];
(function walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    statSync(p).isDirectory() ? walk(p) : allFiles.push(p);
  }
})(DIST);
const htmlFiles = allFiles.filter((f) => f.endsWith(".html"));

const relUrl = (abs) => "/" + relative(DIST, abs).split("\\").join("/");
const norm = (p) => (p.length > 1 && p.endsWith("/") ? p.slice(0, -1) : p);
function pagePathFor(abs) {
  let u = relUrl(abs);
  if (u.endsWith("/index.html")) u = u.slice(0, -"/index.html".length) || "/";
  else if (u.endsWith(".html")) u = u.slice(0, -".html".length);
  return u;
}
const validPages = new Set();
const pageFileByPath = new Map();
for (const f of htmlFiles) { const pp = norm(pagePathFor(f)); validPages.add(pp); pageFileByPath.set(pp, f); }
const validFiles = new Set(allFiles.map((f) => norm(relUrl(f))));

// Only <script> bodies need exclusion: CSS in <style> carries no href=/src=
// page link (it uses url(...)), and Astro emits unbalanced scoped-<style>
// markers that would mispair. Inline scripts always escape a literal
// </script>, so indexOf-pairing is reliable.
function scriptSpans(html) {
  const spans = [];
  const re = /<script\b[^>]*>/gi;
  let m;
  while ((m = re.exec(html))) {
    const close = html.indexOf("</script>", re.lastIndex);
    const end = close < 0 ? html.length : close + "</script>".length;
    spans.push([m.index, end]);
    re.lastIndex = end;
  }
  return spans;
}
const inSpan = (spans, i) => spans.some(([s, e]) => i >= s && i < e);
const attrRe = /(?:href|src)\s*=\s*("([^"]*)"|'([^']*)')/gi;
const idRe = /\b(?:id|name)\s*=\s*("([^"]+)"|'([^']+)')/gi;
const decode = (s) => s.replace(/&amp;/g, "&").replace(/&#x2F;/g, "/").replace(/&#47;/g, "/");

const idCache = new Map();
function idsIn(abs) {
  if (idCache.has(abs)) return idCache.get(abs);
  const ids = new Set(); let m; idRe.lastIndex = 0;
  const html = readFileSync(abs, "utf8");
  while ((m = idRe.exec(html))) ids.add(m[2] ?? m[3]);
  idCache.set(abs, ids); return ids;
}

const broken = [], brokenFragments = [], ssrLinks = [];
const externalHosts = new Map();
let internalChecked = 0;

for (const file of htmlFiles) {
  const srcPath = pagePathFor(file);
  const html = readFileSync(file, "utf8");
  const spans = scriptSpans(html);
  let m; attrRe.lastIndex = 0;
  const seen = new Set();
  while ((m = attrRe.exec(html))) {
    if (inSpan(spans, m.index)) continue;
    const raw = decode((m[2] ?? m[3] ?? "").trim());
    if (!raw) continue;
    if (/^(mailto:|tel:|data:|javascript:|blob:)/i.test(raw)) continue;
    if (/^https?:\/\//i.test(raw) || raw.startsWith("//")) {
      try { const h = new URL(raw.startsWith("//") ? "https:" + raw : raw).host; externalHosts.set(h, (externalHosts.get(h) ?? 0) + 1); } catch {}
      continue;
    }
    if (raw.startsWith("#")) {
      const frag = raw.slice(1);
      if (frag && !idsIn(file).has(frag)) brokenFragments.push({ target: srcPath, hash: frag, source: srcPath });
      continue;
    }
    let path = raw, hash = "";
    const hi = path.indexOf("#"); if (hi >= 0) { hash = path.slice(hi + 1); path = path.slice(0, hi); }
    const qi = path.indexOf("?"); if (qi >= 0) path = path.slice(0, qi);
    if (!path) continue;
    let absPath;
    try { absPath = new URL(path, "http://x" + (srcPath === "/" ? "/" : srcPath + "/")).pathname; } catch { absPath = path; }
    const target = norm(path.startsWith("/") ? path : absPath);
    const key = target + "##" + hash;
    if (seen.has(key)) continue; seen.add(key);
    internalChecked++;

    if (isSSR(target)) { ssrLinks.push({ target, source: srcPath }); continue; }
    const ok = validPages.has(target) || validFiles.has(target) || REDIRECTS.has(target) || target === "/";
    if (!ok) { broken.push({ target, hash, source: srcPath }); continue; }
    if (hash && pageFileByPath.has(target) && !idsIn(pageFileByPath.get(target)).has(hash)) {
      brokenFragments.push({ target, hash, source: srcPath });
    }
  }
}

function group(list) {
  const by = new Map();
  for (const b of list) {
    const k = b.target + (b.hash ? "#" + b.hash : "");
    if (!by.has(k)) by.set(k, new Set());
    by.get(k).add(b.source);
  }
  return [...by.entries()].sort((a, b) => b[1].size - a[1].size);
}

console.log(`[verify_internal_links] ${relative(ROOT_REPO, DIST)}: ${htmlFiles.length} pages, ${internalChecked} internal links checked`);
console.log(`[verify_internal_links] SSR routes (prerender=false, served at runtime): ${ssrExact.size} static + ${ssrPrefixes.length} dynamic; ${ssrLinks.length} link(s) into them, not statically checkable`);
console.log(`[verify_internal_links] external hosts referenced: ${externalHosts.size} (checked by audit:links, not here)`);

if (broken.length === 0) console.log("[verify_internal_links] clean: no broken internal page/asset links");
else {
  console.error(`\n[verify_internal_links] ${broken.length} broken link instance(s) -> ${group(broken).length} dead target(s):`);
  for (const [target, sources] of group(broken)) {
    console.error(`  DEAD  ${target}`);
    console.error(`        from ${sources.size}: ${[...sources].slice(0, 10).join(", ")}${sources.size > 10 ? `, +${sources.size - 10} more` : ""}`);
  }
}
if (brokenFragments.length === 0) console.log("[verify_internal_links] clean: no broken #fragment anchors");
else {
  console.error(`\n[verify_internal_links] ${brokenFragments.length} broken #fragment(s) -> ${group(brokenFragments).length} distinct:`);
  for (const [target, sources] of group(brokenFragments)) {
    console.error(`  NO-ID ${target}`);
    console.error(`        from: ${[...sources].slice(0, 8).join(", ")}`);
  }
}

process.exit(broken.length + brokenFragments.length > 0 ? 1 : 0);
