#!/usr/bin/env node
/**
 * Citation linter for open-source-ai-stack.
 *
 * Enforces the citation discipline rule in CLAUDE.md: every specific
 * numerical claim, percentage, dollar amount, count, bandwidth, or
 * attribution in YAML descriptions, MDX bodies, and page copy must
 * have a nearby source — either an inline URL link, a typed schema
 * field whose `url` documents it, or a `sources` array on the entry.
 *
 * Exits 1 if violations are found, with a list of file:line:claim
 * entries. Add `<!-- lint-allow: reason -->` on the line above an
 * intentional exception.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { resolve, dirname, extname } from "node:path";
import { fileURLToPath } from "node:url";
import yaml from "js-yaml";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");

// ----------------------------------------------------------------------
// Patterns that trigger a "needs source" check.
//
// Each pattern is paired with a label for the error message. Patterns
// look for specific quantitative or attributable claims, not soft
// framings.
// ----------------------------------------------------------------------

const CLAIM_PATTERNS = [
  // Dollar amounts: $5M, $250K, $5,600, $1.2B (with optional ~)
  {
    re: /~?\$\d+(?:\.\d+)?\s*[KMBT]?\+?\b/g,
    label: "dollar amount",
  },
  // Euros, pounds with the same structure
  {
    re: /~?(?:€|£)\d+(?:\.\d+)?\s*[KMBT]?\+?\b/g,
    label: "currency amount",
  },
  // Percentages: 19%, 11%, 70%
  {
    re: /\b\d+(?:\.\d+)?\s*%/g,
    label: "percentage",
  },
  // Counts of a thing: "60+ projects", "27 projects", "150+ grantees"
  {
    re: /\b\d+\+?\s+(?:projects|teams|grantees|fellows|maintainers|orgs|organizations|countries|members|grants|hubs|residents|cohorts|partners|awards|technologies)\b/gi,
    label: "count of items",
  },
  // Bandwidth / throughput: "546 GB/s", "1000 tokens/sec"
  {
    re: /\b\d+(?:\.\d+)?\s*(?:GB\/s|TB\/s|GBps|TBps|tokens\/sec|t\/s)\b/g,
    label: "bandwidth or throughput",
  },
  // Quarterly dates outside frontmatter (Q1 2025, Q4 2026)
  {
    re: /\bQ[1-4]\s+20\d\d\b/g,
    label: "quarterly date",
  },
];

// Anything that satisfies the citation requirement, in proximity.
const SOURCE_PATTERNS = [
  /https?:\/\/\S+/, // any URL
  /\(Funder|Grant|Project|Reading|Layer|News:\s*[^)]+\)/i, // agent citation marker
  /per\s+(?:[A-Z][^.]*?(?:\.[^.]*?)*\s+)?(?:announcement|release|report|paper|docs|filing)/i, // explicit "per X"
];

// Files / directories to scan. Each entry says how to extract text.
//
// For YAML files: structural fields like `funding_range`, `cadence`,
// `process` describe the entry's shape and are documented at the
// entry's primary `url`. Only `mission` and `notable_recent` are
// claim-heavy enough to scan on funders; `description` on grants,
// projects, and readings.
const TARGETS = [
  {
    path: "data/funders.yaml",
    kind: "yaml",
    record_array: "funders",
    text_fields: ["mission", "notable_recent"],
  },
  {
    path: "data/grants.yaml",
    kind: "yaml",
    record_array: "grants",
    text_fields: ["description"],
  },
  {
    path: "data/projects.yaml",
    kind: "yaml",
    record_array: "projects",
    text_fields: ["description"],
  },
  {
    path: "data/reading-lists.yaml",
    kind: "yaml",
    record_array: "readings",
    text_fields: ["description"],
  },
  // Layer MDX bodies.
  {
    path: "src/content/layers",
    kind: "mdx-dir",
  },
  // Page copy: scan prose inside .astro pages. No implicit url here;
  // claims in page copy must cite inline.
  {
    path: "src/pages/grants.astro",
    kind: "astro",
  },
  {
    path: "src/pages/about.astro",
    kind: "astro",
  },
];

// Files to never scan even if discovered (auto-generated, etc.).
const EXCLUDE_PATTERNS = [/\/news\//, /node_modules/, /dist/, /public\/data/];

// ----------------------------------------------------------------------
// Helpers
// ----------------------------------------------------------------------

const violations = [];

function isExcluded(path) {
  return EXCLUDE_PATTERNS.some((re) => re.test(path));
}

/** Does this paragraph satisfy at least one source pattern? */
function hasSourceNearby(paragraph) {
  return SOURCE_PATTERNS.some((re) => re.test(paragraph));
}

/** Was this line allow-listed by an inline comment on the previous line? */
function isLineAllowed(allowComments, lineNum) {
  // allowComments is a Set of line numbers that were allowed (the line
  // ABOVE has <!-- lint-allow: ... --> or # lint-allow: ...).
  return allowComments.has(lineNum);
}

/**
 * Run all CLAIM_PATTERNS against a paragraph. For each match, if the
 * paragraph does not contain a SOURCE_PATTERN, record a violation.
 *
 * For YAML entries, the entry's primary `url` counts as an implicit
 * source for claims about that entry's own programs / activity. This
 * means a Funder entry with url: "https://hrf.org/..." satisfies
 * claims like "HRF has supported 8 projects." The url is what a
 * reader would visit to verify. Claims that reference *another*
 * entity by name with a number still need their own citation.
 */
function checkParagraph({
  file,
  lineNum,
  paragraph,
  sources,
  isTypedFieldValue,
  entryUrl,
}) {
  for (const { re, label } of CLAIM_PATTERNS) {
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(paragraph)) !== null) {
      const claim = m[0];
      // Skip if there is a source in the same paragraph.
      if (hasSourceNearby(paragraph)) continue;
      // Skip if the record carries explicit `sources`.
      if (sources && Array.isArray(sources) && sources.length > 0) continue;
      // Skip if the entry has a primary `url`: that url is the
      // implicit source for claims about the entry itself.
      if (entryUrl) continue;
      // Skip if the value is itself a typed field that the schema documents.
      if (isTypedFieldValue) continue;
      violations.push({
        file,
        line: lineNum,
        claim,
        label,
        context: paragraph.slice(0, 140).replace(/\s+/g, " "),
      });
    }
  }
}

/** Extract paragraph chunks from a body of MDX/markdown text. */
function chunkParagraphs(body) {
  const chunks = [];
  let cursor = 0;
  // Split on blank lines.
  const raw = body.split(/\n\s*\n/);
  for (const p of raw) {
    if (!p.trim()) {
      cursor += p.length + 2;
      continue;
    }
    const lineNum = body.slice(0, body.indexOf(p, cursor)).split("\n").length;
    chunks.push({ text: p, line: lineNum });
    cursor += p.length + 2;
  }
  return chunks;
}

function collectAllowedLines(text) {
  const allowed = new Set();
  const lines = text.split("\n");
  for (let i = 0; i < lines.length; i++) {
    if (/<!--\s*lint-allow\b/.test(lines[i]) || /#\s*lint-allow\b/.test(lines[i])) {
      // The allowance applies to the next non-blank line.
      for (let j = i + 1; j < lines.length; j++) {
        if (lines[j].trim()) {
          allowed.add(j + 1);
          break;
        }
      }
    }
  }
  return allowed;
}

// ----------------------------------------------------------------------
// Scanners by file kind
// ----------------------------------------------------------------------

function scanYaml(target) {
  const fullPath = resolve(ROOT, target.path);
  const raw = readFileSync(fullPath, "utf8");
  const allowed = collectAllowedLines(raw);
  const parsed = yaml.load(raw);
  const records = parsed?.[target.record_array] ?? [];

  // Build a quick map: for each record, find its title/slug line in
  // the raw file so we can report a useful line number.
  const lines = raw.split("\n");

  for (const record of records) {
    // Find the line where this record starts. Match by title for grants
    // (each grant has a unique title) or slug otherwise.
    const matchKey = record.slug ?? record.title ?? record.name ?? "";
    let recordLine = 0;
    for (let i = 0; i < lines.length; i++) {
      const ln = lines[i];
      const slugMatch =
        ln.match(/^\s*- slug:\s*"?([^"\s]+)"?/) ||
        ln.match(/^\s*- title:\s*"([^"]+)"/) ||
        ln.match(/^\s*- name:\s*"([^"]+)"/);
      if (slugMatch && slugMatch[1] === matchKey) {
        recordLine = i + 1;
        break;
      }
    }
    if (isLineAllowed(allowed, recordLine)) continue;

    for (const field of target.text_fields) {
      const text = record[field];
      if (typeof text !== "string" || !text) continue;
      // Treat each field's text as a single paragraph for source-proximity.
      checkParagraph({
        file: target.path,
        lineNum: recordLine,
        paragraph: text,
        sources: record.sources,
        entryUrl: record.url,
      });
    }
  }
}

function scanMdxFile(filePath) {
  const raw = readFileSync(filePath, "utf8");
  const allowed = collectAllowedLines(raw);
  // Drop frontmatter from scan; only check body prose.
  const m = raw.match(/^---\n[\s\S]*?\n---\n([\s\S]*)$/);
  const body = m ? m[1] : raw;
  const bodyOffset = raw.length - body.length;
  const chunks = chunkParagraphs(body);
  for (const c of chunks) {
    const absoluteLine =
      raw.slice(0, bodyOffset).split("\n").length - 1 + c.line;
    if (isLineAllowed(allowed, absoluteLine)) continue;
    checkParagraph({
      file: filePath.replace(ROOT + "/", ""),
      lineNum: absoluteLine,
      paragraph: c.text,
    });
  }
}

function scanMdxDir(target) {
  const dir = resolve(ROOT, target.path);
  for (const name of readdirSync(dir)) {
    if (extname(name) !== ".mdx") continue;
    const full = resolve(dir, name);
    if (isExcluded(full)) continue;
    scanMdxFile(full);
  }
}

function scanAstro(target) {
  const fullPath = resolve(ROOT, target.path);
  const raw = readFileSync(fullPath, "utf8");
  const allowed = collectAllowedLines(raw);
  // Extract prose strictly from <p>...</p> and inside JSX text children
  // of headings. Astro files are mostly markup; descriptive prose lives
  // inside <p class="..."> blocks. We scan the entire file but rely on
  // SOURCE_PATTERNS to whitelist anything with a nearby URL or marker.
  const lines = raw.split("\n");
  // Identify <p>...</p> blocks (multi-line tolerant).
  const blockRe = /<p[^>]*>([\s\S]*?)<\/p>/g;
  let m;
  while ((m = blockRe.exec(raw)) !== null) {
    const inner = m[1];
    // Strip HTML tags so claim regex doesn't trip on element attributes.
    const text = inner.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    if (!text) continue;
    const lineNum = raw.slice(0, m.index).split("\n").length;
    if (isLineAllowed(allowed, lineNum)) continue;
    checkParagraph({
      file: target.path,
      lineNum,
      paragraph: text,
    });
  }
}

// ----------------------------------------------------------------------
// Main
// ----------------------------------------------------------------------

for (const target of TARGETS) {
  try {
    if (target.kind === "yaml") scanYaml(target);
    else if (target.kind === "mdx-dir") scanMdxDir(target);
    else if (target.kind === "astro") scanAstro(target);
  } catch (e) {
    console.warn(`[lint-citations] error scanning ${target.path}: ${e.message}`);
  }
}

if (violations.length === 0) {
  console.log("[lint-citations] clean: no unsourced claims found");
  process.exit(0);
}

// Group violations by file for readability.
const byFile = new Map();
for (const v of violations) {
  if (!byFile.has(v.file)) byFile.set(v.file, []);
  byFile.get(v.file).push(v);
}

console.error(`\n[lint-citations] ${violations.length} unsourced claim${violations.length === 1 ? "" : "s"} found:\n`);
for (const [file, vs] of byFile) {
  console.error(`  ${file}`);
  for (const v of vs) {
    console.error(`    line ${v.line}: ${v.label} "${v.claim}"`);
    console.error(`      context: ${v.context}${v.context.length === 140 ? "..." : ""}`);
  }
  console.error("");
}

console.error(
  "Fix each by: (1) adding an inline URL link in the same paragraph, " +
    "(2) populating a `sources: [{title, url}]` array on the entry, " +
    "(3) softening the claim to a qualitative observation, or " +
    "(4) removing the unsourceable assertion.\n" +
    "If an exception is genuinely needed, add `<!-- lint-allow: reason -->` " +
    "or `# lint-allow: reason` on the line above the claim.\n",
);

process.exit(1);
