#!/usr/bin/env node
/**
 * One-shot bulk-tagger.
 *
 * For each MDX file in src/content/layers/, finds the first untagged
 * occurrence of each known glossary term (canonical form or alias) in
 * the body, wraps it with <G term="slug">match</G>, and ensures the
 * file has `import G from "../../components/G.astro";` right after the
 * frontmatter. Idempotent: re-running wraps additional first-occurrences
 * if new glossary entries have been added.
 *
 * Safety guards:
 *   - Skips frontmatter entirely.
 *   - Skips matches inside backtick-quoted code (`...`).
 *   - Skips matches inside <code>...</code> and <pre>...</pre> blocks.
 *   - Skips matches inside an existing <G>...</G> wrap.
 *   - Skips matches inside an inline markdown link [text](href).
 *   - Wraps ONE occurrence per term per file (the "first occurrence on
 *     this page" editorial pattern).
 */
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { resolve, dirname, extname, basename } from "node:path";
import { fileURLToPath } from "node:url";
import yaml from "js-yaml";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const GLOSSARY_DIR = resolve(ROOT, "src/content/glossary");
const LAYERS_DIR = resolve(ROOT, "src/content/layers");

function parseFrontmatter(text) {
  const m = text.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!m) return null;
  let fm;
  try {
    fm = yaml.load(m[1]);
  } catch {
    return null;
  }
  return { frontmatter: fm ?? {}, body: m[2], headerLen: m[0].length - m[2].length };
}

const entries = [];
for (const name of readdirSync(GLOSSARY_DIR)) {
  if (extname(name) !== ".mdx") continue;
  const text = readFileSync(resolve(GLOSSARY_DIR, name), "utf8");
  const p = parseFrontmatter(text);
  if (!p) continue;
  entries.push({ slug: basename(name, ".mdx"), ...p.frontmatter });
}

// Build form list: each form maps to its slug. Sort longest first so
// "mixture of experts" matches before "experts" if both were terms.
const forms = [];
for (const e of entries) {
  const all = [e.term, ...(e.aliases ?? [])];
  for (const f of all) {
    if (!f) continue;
    forms.push({ form: f, slug: e.slug });
  }
}
forms.sort((a, b) => b.form.length - a.form.length);

function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Find the first untagged occurrence of `form` in `body`. Return its
 * [start, end] character offsets, or null if not found / not safe.
 * Skips matches inside code, links, or already-tagged spans.
 */
function findSafeOccurrence(body, form) {
  const ciSensitive = form.length <= 4 && form === form.toUpperCase();
  const re = new RegExp(
    `(?<![A-Za-z0-9])${escapeRe(form)}(?![A-Za-z0-9])`,
    "g" + (ciSensitive ? "" : "i"),
  );
  // Build a forbidden-mask over the body that marks positions inside
  // code/links/G-wraps. Match must not start inside a masked region.
  const forbidden = new Uint8Array(body.length);
  function mask(re2) {
    let m;
    while ((m = re2.exec(body)) !== null) {
      for (let i = m.index; i < m.index + m[0].length; i++) {
        forbidden[i] = 1;
      }
    }
  }
  mask(/`[^`]+`/g);                       // inline code
  mask(/<code[^>]*>[\s\S]*?<\/code>/g);   // <code>...</code>
  mask(/<pre[^>]*>[\s\S]*?<\/pre>/g);     // <pre>...</pre>
  mask(/<G\b[\s\S]*?<\/G>/g);             // already-tagged
  mask(/\[[^\]]+\]\([^)]+\)/g);           // markdown links
  // Code fence blocks ```...```
  mask(/```[\s\S]*?```/g);

  let m;
  while ((m = re.exec(body)) !== null) {
    if (!forbidden[m.index]) {
      return [m.index, m.index + m[0].length];
    }
  }
  return null;
}

let totalWrapped = 0;
let totalFiles = 0;
const IMPORT_LINE = `\nimport G from "../../components/G.astro";\n`;

function tagDir({ dir, ownSlugOf, label }) {
  for (const name of readdirSync(dir)) {
    if (extname(name) !== ".mdx") continue;
    const filePath = resolve(dir, name);
    const raw = readFileSync(filePath, "utf8");
    const p = parseFrontmatter(raw);
    if (!p) continue;
    const ownSlug = ownSlugOf(name, p.frontmatter);

    let body = p.body;
    const wrappedSlugs = new Set();
    let wraps = 0;

    for (const { form, slug } of forms) {
      if (wrappedSlugs.has(slug)) continue;
      // Never self-link: a glossary entry should not tag its own term
      // or any of its own aliases. Likewise a layer page should not
      // link its own title back to itself.
      if (ownSlug && slug === ownSlug) continue;
      if (
        p.frontmatter.title &&
        form.toLowerCase() === String(p.frontmatter.title).toLowerCase()
      ) continue;
      const hit = findSafeOccurrence(body, form);
      if (!hit) continue;
      const [start, end] = hit;
      const matched = body.slice(start, end);
      body = body.slice(0, start) + `<G term="${slug}">${matched}</G>` + body.slice(end);
      wrappedSlugs.add(slug);
      wraps++;
    }

    if (wraps === 0) continue;

    const header = raw.slice(0, raw.length - p.body.length);
    if (
      !/import\s+G\s+from\s+["']/.test(body) &&
      !/import\s+G\s+from\s+["']/.test(header)
    ) {
      body = IMPORT_LINE + body;
    }

    writeFileSync(filePath, header + body, "utf8");
    totalWrapped += wraps;
    totalFiles++;
    console.log(`[bulk-tag] ${label}/${name}: wrapped ${wraps} terms`);
  }
}

// Layer pages: never link the layer's own title to itself.
tagDir({
  dir: LAYERS_DIR,
  label: "layers",
  ownSlugOf: () => null,
});

// Glossary entries: never link to oneself.
tagDir({
  dir: GLOSSARY_DIR,
  label: "glossary",
  ownSlugOf: (filename) => basename(filename, ".mdx"),
});

console.log(`\n[bulk-tag] done: ${totalWrapped} wraps across ${totalFiles} files`);
