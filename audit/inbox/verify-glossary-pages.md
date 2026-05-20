# Glossary page templates fact verification

Date: 2026-05-19
Verifier: glossary-page audit pass
Scope: src/pages/glossary.astro (index), src/pages/glossary/[slug].astro (detail template)

ID convention: `glossary-page.<file>.<NNN>`.

## Fixes applied

None. Both templates render dynamic counts via `{entries.length}` and
filtered length, so the on-page numbers track the MDX file count
automatically (currently 144 entries, 15 layers all covered). Static
chrome text checks out:

- "across its 15 layers" matches data/layers.yaml (10 core + 5 meta).
- "Each entry has a short hover summary and a deeper page. Most show
  up inline in the prose as dotted underlines you can hover or tap"
  matches src/components/G.astro behavior; the trigger style in
  src/styles/global.css is `text-decoration: underline dotted
  var(--color-text-muted)`.
- All detail-template field accesses (`entry.data.term`, `summary`,
  `primary_layer`, `secondary_layers`, `aliases`, `sources`) match
  the glossary schema in src/content.config.ts.
- No em dashes, no banned vocabulary in either template's prose.

## Verified claims

| id | category | path | claim | type | kind | source | verdict | date | evidence |
|---|---|---|---|---|---|---|---|---|---|
| glossary-page.index.001 | glossary-page | src/pages/glossary.astro | "Definitions for the concepts, protocols, and projects this site uses across its 15 layers" | factual | layer count | data/layers.yaml | supported | 2026-05-19 | data/layers.yaml has 10 core + 5 meta = 15 layers; matches CLAUDE.md taxonomy section |
| glossary-page.index.002 | glossary-page | src/pages/glossary.astro | Renders `{entries.length} entries` chrome stat | factual | entry count | src/content/glossary/*.mdx | supported | 2026-05-19 | dynamic count from getCollection("glossary"); ls src/content/glossary/ shows 144 mdx files; renders as "144 entries" at build time |
| glossary-page.index.003 | glossary-page | src/pages/glossary.astro | Renders `{byLayer.filter(b => b.entries.length > 0).length} layers covered` | factual | layer coverage | src/content/glossary/*.mdx primary/secondary layers | supported | 2026-05-19 | dynamic; verified all 15 layers have entries (primary_layer distribution: runtime 24, training 17, weights 12, infrastructure 12, silicon 10, retrieval-memory 10, agents 10, compute 8, governance 7, data 7, safety-guardrails 6, identity-trust 6, evaluation 6, protocols 5, sovereignty-decentralization 4) so renders as "15 layers covered" |
| glossary-page.index.004 | glossary-page | src/pages/glossary.astro | "Each entry has a short hover summary and a deeper page" | factual | feature description | src/content.config.ts glossary schema + [slug].astro | supported | 2026-05-19 | schema requires `summary` field (≤30 words enforced via zod refine); [slug].astro renders a per-entry page at /glossary/<slug> |
| glossary-page.index.005 | glossary-page | src/pages/glossary.astro | "Most show up inline in the prose as dotted underlines you can hover or tap" | factual | UI behavior | src/components/G.astro + src/styles/global.css | supported | 2026-05-19 | G.astro trigger styled in global.css as `text-decoration: underline dotted var(--color-text-muted)`; hover/tap triggers native popover via popovertarget; lint-glossary.mjs auto-tags first-occurrence per page per CLAUDE.md |
| glossary-page.index.006 | glossary-page | src/pages/glossary.astro | "By layer" tab is the default view (aria-selected="true") | factual | UI default | src/pages/glossary.astro line 75 | supported | 2026-05-19 | hardcoded aria-selected="true" on by-layer tab; a-z tab starts aria-selected="false"; only flips if URL hash is "#a-z" |
| glossary-page.index.007 | glossary-page | src/pages/glossary.astro | A-Z tab shows `{entries.length}` count badge | factual | UI count | dynamic | supported | 2026-05-19 | line 88 renders entries.length inline (144 at build) |
| glossary-page.index.008 | glossary-page | src/pages/glossary.astro | Per-layer section renders `{layerEntries.length} {"term"|"terms"}` | factual | UI count | dynamic | supported | 2026-05-19 | line 104 pluralizes correctly; uses singular "term" iff length===1 |
| glossary-page.index.009 | glossary-page | src/pages/glossary.astro | Per-entry "also in {primary_layer}" label appears only when layer != primary_layer | factual | UI logic | line 118 | supported | 2026-05-19 | conditional `e.data.primary_layer !== layer.slug`; correctly distinguishes cross-listed entries by secondary_layers from the primary listing |
| glossary-page.index.010 | glossary-page | src/pages/glossary.astro | Tab state persists in URL hash | factual | UI behavior | lines 188-196 | supported | 2026-05-19 | script reads window.location.hash on load, replaces state via history.replaceState on click |
| glossary-page.detail.001 | glossary-page | src/pages/glossary/[slug].astro | getStaticPaths emits one page per glossary entry | factual | route generation | lines 6-12 | supported | 2026-05-19 | maps every collection entry to params.slug=entry.id; with 144 mdx files, 144 detail pages are generated |
| glossary-page.detail.002 | glossary-page | src/pages/glossary/[slug].astro | Renders `entry.data.term` as h1 | factual | template field | content.config.ts schema | supported | 2026-05-19 | `term: z.string()` exists on glossary schema; required field |
| glossary-page.detail.003 | glossary-page | src/pages/glossary/[slug].astro | Renders `entry.data.summary` as lead paragraph | factual | template field | content.config.ts schema | supported | 2026-05-19 | `summary: z.string().refine(≤30 words)` exists on schema; required field |
| glossary-page.detail.004 | glossary-page | src/pages/glossary/[slug].astro | Renders `entry.data.primary_layer` as primary layer chip linking to /stack/<slug> | factual | template field | content.config.ts schema | supported | 2026-05-19 | `primary_layer: z.enum(LAYER_SLUGS)` on schema; LAYER_SLUGS includes all 15 canonical slugs; href `/stack/${primary.slug}` matches /stack route layout |
| glossary-page.detail.005 | glossary-page | src/pages/glossary/[slug].astro | Renders `entry.data.secondary_layers` as "also: {title}" chips | factual | template field | content.config.ts schema | supported | 2026-05-19 | `secondary_layers: z.array(z.enum(LAYER_SLUGS)).default([])` on schema; template uses `entry.data.secondary_layers ?? []` with same default fallback |
| glossary-page.detail.006 | glossary-page | src/pages/glossary/[slug].astro | Renders `entry.data.aliases` as "aka {a, b, c}" pill if non-empty | factual | template field | content.config.ts schema | supported | 2026-05-19 | `aliases: z.array(z.string()).default([])` on schema; template guards with `entry.data.aliases.length > 0` |
| glossary-page.detail.007 | glossary-page | src/pages/glossary/[slug].astro | Renders `entry.data.sources` as bottom Sources section if non-empty | factual | template field | content.config.ts schema | supported | 2026-05-19 | `sources: z.array(z.object({ title, url: z.string().url() })).default([])` on schema; template iterates `entry.data.sources` rendering each `{s.title}` with `href={s.url}` |
| glossary-page.detail.008 | glossary-page | src/pages/glossary/[slug].astro | Backlinks scan layer + glossary collection bodies for `<G term="<slug>">` wraps | factual | feature behavior | lines 28-68 | supported | 2026-05-19 | regex constructed against entry.id with proper escaping; matches G.astro tagging convention documented in CLAUDE.md; scans both `layers` and `glossary` collections via `.body` |
| glossary-page.detail.009 | glossary-page | src/pages/glossary/[slug].astro | Backlinks render with layer prefix label when kind==="layer" | factual | UI logic | lines 164-168 | supported | 2026-05-19 | conditional renders `<span>layer</span>` prefix only for layer-kind backlinks; glossary-kind backlinks render bare |
| glossary-page.detail.010 | glossary-page | src/pages/glossary/[slug].astro | "Chat about this" button dispatches chat-trigger event with read_glossary tool hint | factual | feature behavior | lines 218-234 | supported | 2026-05-19 | matches CLAUDE.md chat-trigger event spec; prompt includes `read_glossary("<slug>")` call hint per CLAUDE.md tool table |
| glossary-page.detail.011 | glossary-page | src/pages/glossary/[slug].astro | Renders MDX body via `<Content />` | factual | content rendering | line 124 | supported | 2026-05-19 | uses Astro content collection render() helper per Astro docs; .prose-glossary wrapper styles match per CLAUDE.md "soft 4-part senior-engineer-voice paragraph" body convention |
| glossary-page.detail.012 | glossary-page | src/pages/glossary/[slug].astro | BaseLayout receives `title={entry.data.term}` and `description={entry.data.summary}` | factual | template field | content.config.ts schema | supported | 2026-05-19 | both schema fields are required strings; valid feed into BaseLayout meta tags |
| glossary-page.detail.013 | glossary-page | src/pages/glossary/[slug].astro | Detail template references no schema field that doesn't exist | factual | schema alignment | content.config.ts vs [slug].astro | supported | 2026-05-19 | full field-by-field cross-check: term, summary, primary_layer, secondary_layers, aliases, sources all present on schema; `entry.id` is Astro built-in; no reference to `updated` or other absent fields |
| glossary-page.index.011 | glossary-page | src/pages/glossary.astro | Index template references no schema field that doesn't exist | factual | schema alignment | content.config.ts vs glossary.astro | supported | 2026-05-19 | references term, summary, primary_layer, secondary_layers; all on schema; no reference to absent fields |
| glossary-page.index.012 | glossary-page | src/pages/glossary.astro | "What the terms mean" h1 | framing | page title | n/a | consistent | 2026-05-19 | neutral observational title; no banned vocab; no em dashes |
| glossary-page.index.013 | glossary-page | src/pages/glossary.astro | Description meta: "Plain-English definitions for the technical concepts, protocols, and projects that show up across the open-source AI stack" | framing | page meta | n/a | consistent | 2026-05-19 | matches CLAUDE.md glossary-collection purpose statement; no banned vocab; no em dashes |
