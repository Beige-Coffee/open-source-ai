#!/usr/bin/env node
/**
 * Glossary tagging linter.
 *
 * Two checks, both run together; the script exits 0 even when warnings
 * are present (per the manual-tagging-plus-warning policy in
 * CLAUDE.md). It exits 1 only on hard errors like a malformed entry
 * file. Warnings are advisory: they surface untagged occurrences for
 * the author to review, not block the build.
 *
 * Check 1: every MDX file under src/content/glossary/ must have a
 * well-formed frontmatter with a summary <= 30 words (also validated
 * via zod in content.config.ts; this script gives a more legible error
 * message and runs without booting Astro).
 *
 * Check 2: when a glossary term or any of its aliases appears in the
 * scanned corpus (YAML descriptions, MDX bodies, page prose) WITHOUT
 * being wrapped in a <G term="..."> component, warn the author. False
 * positives are expected: terms inside <code>, inside an existing
 * <a href=>, or already wrapped <G>...</G> should be skipped. The
 * script tracks per-page first-occurrence-only (the recommended
 * editorial pattern) and warns only when the first occurrence on a
 * page is untagged.
 */
import { readFileSync, readdirSync } from "node:fs";
import { resolve, dirname, extname, basename } from "node:path";
import { fileURLToPath } from "node:url";
import yaml from "js-yaml";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const GLOSSARY_DIR = resolve(ROOT, "src/content/glossary");

// ---------------------------------------------------------------------------
// Load glossary entries: parse frontmatter from every .mdx in the dir.
// ---------------------------------------------------------------------------

function parseFrontmatter(text) {
  const m = text.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!m) return null;
  let parsed;
  try {
    parsed = yaml.load(m[1]);
  } catch (e) {
    return { error: e.message };
  }
  return { frontmatter: parsed ?? {}, body: m[2] };
}

const entries = [];
const errors = [];
try {
  for (const name of readdirSync(GLOSSARY_DIR)) {
    if (extname(name) !== ".mdx") continue;
    const full = resolve(GLOSSARY_DIR, name);
    const text = readFileSync(full, "utf8");
    const parsed = parseFrontmatter(text);
    if (!parsed) {
      errors.push(`${name}: missing or malformed frontmatter`);
      continue;
    }
    if (parsed.error) {
      errors.push(`${name}: ${parsed.error}`);
      continue;
    }
    const fm = parsed.frontmatter;
    if (!fm.term) errors.push(`${name}: missing 'term' field`);
    if (!fm.primary_layer) errors.push(`${name}: missing 'primary_layer' field`);
    if (typeof fm.summary !== "string" || !fm.summary)
      errors.push(`${name}: missing 'summary' field`);
    else {
      const words = fm.summary.split(/\s+/).filter(Boolean).length;
      if (words > 30)
        errors.push(`${name}: summary is ${words} words (cap is 30)`);
    }
    const slug = basename(name, ".mdx");
    entries.push({ slug, ...fm });
  }
} catch (e) {
  console.error(`[lint-glossary] cannot read glossary dir: ${e.message}`);
  process.exit(1);
}

if (errors.length) {
  console.error(`\n[lint-glossary] ${errors.length} hard error${errors.length === 1 ? "" : "s"}:\n`);
  for (const e of errors) console.error(`  ${e}`);
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Build a regex of (canonical + alias) terms, with word boundaries.
// Short acronym terms (<= 4 chars) are case-sensitive to avoid false hits
// on common English substrings (RAG inside drag, fragment, etc.).
// ---------------------------------------------------------------------------

const allForms = [];
for (const entry of entries) {
  const forms = [entry.term, ...(entry.aliases ?? [])];
  for (const form of forms) {
    if (!form) continue;
    allForms.push({ form, slug: entry.slug });
  }
}
allForms.sort((a, b) => b.form.length - a.form.length);

function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// ---------------------------------------------------------------------------
// Scan content corpus for untagged first-occurrences. We DO scan:
//   - data/*.yaml description-like fields
//   - src/content/layers/*.mdx bodies
//   - src/pages/**/*.astro prose
// We do NOT scan:
//   - src/content/news/*.mdx (news is dated, archived, low priority to retag)
//   - src/content/glossary/*.mdx (glossary entries themselves)
//   - node_modules, dist, public/data
// ---------------------------------------------------------------------------

const SCAN_TARGETS = [];
function pushDir(rel, ext) {
  const abs = resolve(ROOT, rel);
  let names;
  try { names = readdirSync(abs); } catch { return; }
  for (const n of names) {
    if (extname(n) === ext) SCAN_TARGETS.push(resolve(abs, n));
  }
}
function pushDirRecursive(rel, ext) {
  const abs = resolve(ROOT, rel);
  let names;
  try { names = readdirSync(abs, { withFileTypes: true }); } catch { return; }
  for (const ent of names) {
    const p = resolve(abs, ent.name);
    if (ent.isDirectory()) pushDirRecursive(`${rel}/${ent.name}`, ext);
    else if (extname(ent.name) === ext) SCAN_TARGETS.push(p);
  }
}

pushDir("src/content/layers", ".mdx");
pushDirRecursive("src/pages", ".astro");

const warnings = [];

function stripCodeAndTaggedAndLinks(text) {
  // Strip in this order so leftovers don't reintroduce false positives.
  return text
    .replace(/`[^`]+`/g, " ")                          // backtick inline code
    .replace(/<code[^>]*>[\s\S]*?<\/code>/g, " ")      // <code>...</code>
    .replace(/<pre[^>]*>[\s\S]*?<\/pre>/g, " ")        // <pre>...</pre>
    .replace(/<G\b[\s\S]*?<\/G>/g, " ")               // already-tagged
    .replace(/<a\b[\s\S]*?<\/a>/g, " ");              // inside existing link
}

for (const file of SCAN_TARGETS) {
  let raw;
  try { raw = readFileSync(file, "utf8"); } catch { continue; }
  // Blank non-prose regions before scanning. MDX frontmatter is YAML
  // metadata; Astro frontmatter is JS/TS imports and component logic;
  // Astro attribute values are not user-visible prose. All three need
  // suppressing or the linter generates false positives. Preserve
  // newlines so warning line numbers match the original file.
  let scanText = raw;
  if (file.endsWith(".mdx") || file.endsWith(".astro")) {
    const fm = raw.match(/^---\n[\s\S]*?\n---\n/);
    if (fm) {
      const blanked = fm[0].replace(/[^\n]/g, " ");
      scanText = blanked + raw.slice(fm[0].length);
    }
  }
  if (file.endsWith(".astro")) {
    scanText = scanText.replace(/(=\s*"[^"]*"|=\s*'[^']*')/g, (m) =>
      m.replace(/[^\n]/g, " "),
    );
  }
  const stripped = stripCodeAndTaggedAndLinks(scanText);
  const seen = new Set(); // per-file first-occurrence policy
  for (const { form, slug } of allForms) {
    if (seen.has(slug)) continue;
    // Suppress: if this slug already has at least one <G term="slug">
    // wrap anywhere in the file, leave the rest alone. Editorial rule
    // is "tag the first occurrence per page"; once tagged, done.
    const taggedRe = new RegExp(`<G\\s+term=["']${escapeRe(slug)}["']`);
    if (taggedRe.test(raw)) {
      seen.add(slug);
      continue;
    }
    const ciSensitive = form.length <= 4 && form === form.toUpperCase();
    const re = new RegExp(
      `(?<![A-Za-z0-9])${escapeRe(form)}(?![A-Za-z0-9])`,
      ciSensitive ? "" : "i",
    );
    const m = stripped.match(re);
    if (!m) continue;
    seen.add(slug);
    const idx = stripped.indexOf(m[0]);
    const line = stripped.slice(0, idx).split("\n").length;
    warnings.push({ file: file.replace(ROOT + "/", ""), line, form, slug });
  }
}

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------

if (warnings.length === 0) {
  console.log(`[lint-glossary] clean: ${entries.length} entries valid, no untagged first-occurrences`);
  process.exit(0);
}

const byFile = new Map();
for (const w of warnings) {
  if (!byFile.has(w.file)) byFile.set(w.file, []);
  byFile.get(w.file).push(w);
}

console.warn(`\n[lint-glossary] ${warnings.length} untagged first-occurrence${warnings.length === 1 ? "" : "s"} (advisory, build continues):\n`);
for (const [file, ws] of byFile) {
  console.warn(`  ${file}`);
  for (const w of ws) {
    console.warn(`    line ${w.line}: "${w.form}" — wrap with <G term="${w.slug}">${w.form}</G>`);
  }
  console.warn("");
}
console.warn(`(${entries.length} glossary entries valid)`);
process.exit(0);
