#!/usr/bin/env node
/**
 * Extract checkable claims from glossary MDX entries into
 * CLAIMS_LEDGER.md rows. Idempotent: IDs already present are skipped.
 *
 * Claim ID convention:
 *   glossary.<slug>.summary
 *   glossary.<slug>.source.<i>
 *   glossary.<slug>.claim.<i>  // numbered prose claims
 *
 * The prose-claim extraction is conservative: each paragraph becomes
 * one framing-lane row (consistency check, not strict factual verify),
 * because glossary prose mixes definitions with examples.
 *
 * Run after adding new glossary entries:
 *   node audit/extract-glossary.mjs
 *
 * Usage:
 *   node audit/extract-glossary.mjs            # all entries
 *   node audit/extract-glossary.mjs <slug...>  # only the named entries
 */
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { resolve, dirname, basename, extname } from "node:path";
import { fileURLToPath } from "node:url";
import yaml from "js-yaml";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const GLOSSARY_DIR = resolve(ROOT, "src/content/glossary");
const LEDGER_PATH = resolve(ROOT, "audit/CLAIMS_LEDGER.md");

const onlySlugs = process.argv.slice(2);

function parseFrontmatter(text) {
  const m = text.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!m) return { frontmatter: {}, body: text };
  return { frontmatter: yaml.load(m[1]) ?? {}, body: m[2].trim() };
}

function stripMdx(body) {
  return body
    .replace(/^import .+ from .+;$/gm, "")
    .replace(/<G [^>]*>([^<]*)<\/G>/g, "$1")
    .replace(/<[^>]+>/g, "")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .trim();
}

function row(id, location, claim, lane, type, source, notes = "") {
  const safe = (s) => String(s ?? "").replace(/\|/g, "\\|").replace(/\n/g, " ");
  return `| ${id} | yaml-glossary | ${location} | ${safe(claim)} | ${lane} | ${type} | ${source} | needs_verification |  | ${safe(notes)} |`;
}

function rowsFor(slug, fm, body) {
  const location = `src/content/glossary/${slug}.mdx`;
  const primary = fm.sources?.[0]?.url ?? "";
  const rows = [];

  // Summary as a definitional / framing-lane claim.
  if (fm.summary) {
    rows.push(row(
      `glossary.${slug}.summary`,
      location,
      `${fm.term} is defined as: "${fm.summary}"`,
      "framing", "attribution", primary,
      "summary schema field, ≤30 words",
    ));
  }

  // Each source URL existence is a checkable claim (does the source
  // actually back the term as described).
  if (Array.isArray(fm.sources)) {
    fm.sources.forEach((s, i) => {
      rows.push(row(
        `glossary.${slug}.source.${i}`,
        location,
        `${fm.term} cites: "${s.title}"`,
        "factual", "attribution", s.url,
        "sources schema field",
      ));
    });
  }

  // Each body paragraph becomes one framing-lane row (paragraph-level
  // consistency check). The body's specific named-entity / number
  // claims (dates, sizes, paper titles) get spot-checked in
  // verification by the next agent.
  const paras = stripMdx(body).split(/\n\n+/).map((p) => p.trim()).filter(Boolean);
  paras.forEach((p, i) => {
    rows.push(row(
      `glossary.${slug}.paragraph.${i}`,
      location,
      `${fm.term} paragraph ${i + 1}: "${p.slice(0, 110)}${p.length > 110 ? "..." : ""}"`,
      "framing", "attribution", primary,
      "body paragraph; framing-lane consistency check against sources[]",
    ));
  });

  return rows;
}

function main() {
  const ledger = readFileSync(LEDGER_PATH, "utf-8");

  const files = readdirSync(GLOSSARY_DIR)
    .filter((f) => extname(f) === ".mdx")
    .filter((f) => !onlySlugs.length || onlySlugs.includes(basename(f, ".mdx")));

  const newRows = [];
  for (const file of files) {
    const slug = basename(file, ".mdx");
    const text = readFileSync(resolve(GLOSSARY_DIR, file), "utf-8");
    const { frontmatter, body } = parseFrontmatter(text);
    for (const r of rowsFor(slug, frontmatter, body)) {
      const id = r.split("|")[1].trim();
      if (ledger.includes(`| ${id} |`)) continue;
      newRows.push(r);
    }
  }

  if (newRows.length === 0) {
    console.log("[extract-glossary] no new rows to add");
    return;
  }
  const out = ledger.replace(/\n+$/, "") + "\n" + newRows.join("\n") + "\n";
  writeFileSync(LEDGER_PATH, out);
  console.log(`[extract-glossary] appended ${newRows.length} rows`);
}

main();
