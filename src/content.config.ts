import { defineCollection, z } from "astro:content";
import { glob } from "astro/loaders";

/**
 * Layer content collection.
 *
 * Each layer of the open-source AI stack gets one MDX file in
 * `src/content/layers/<slug>.mdx`. The frontmatter typed by the schema
 * below; the body is the editorial "What this layer is" prose adapted
 * from the wiki at `/Users/austinv2/code/sovereign-ai-wiki/wiki/layers/`.
 *
 * `tier` distinguishes the 9 core (production-pipeline) layers from the 5
 * cross-cutting meta-layers (which observe rather than sit in the
 * pipeline). `order` is the canonical display order within each tier.
 */
const layers = defineCollection({
  loader: glob({
    pattern: "**/*.mdx",
    base: "./src/content/layers",
  }),
  schema: z.object({
    slug: z.string(),
    title: z.string(),
    short_description: z.string(),
    tier: z.enum(["core", "meta"]),
    order: z.number().int(),
    lock_in_vector: z
      .enum([
        "infrastructure",
        "silicon",
        "runtime",
        "agents",
        "weights",
        "data",
        "governance",
        "training",
        "retrieval",
        "protocols",
        "compute",
        "evaluation",
        "identity",
        "safety",
        "sovereignty",
        "none",
      ])
      .default("none"),
    sovereignty_relevance: z.number().int().min(1).max(5),
    related_layers: z.array(z.string()).default([]),
    updated: z.coerce.date(),
    /**
     * Probe primer: 3-5 concrete claims about this layer that the
     * course agent is allowed to ask Socratic questions about. The
     * agent system prompt explicitly constrains questions to claims
     * the learner could plausibly answer from the Read content;
     * primer bullets are also surfaced from the Read prose. Empty
     * array means the agent falls back to the short_description.
     */
    probe_primer: z.array(z.string()).default([]),
  }),
});

/**
 * News content collection. One MDX file per published day, ingested by
 * the daily scheduled agent in Week 2. Each item inside a day has a
 * layer tag so per-layer feeds can filter.
 */
const news = defineCollection({
  loader: glob({
    pattern: "**/*.mdx",
    base: "./src/content/news",
  }),
  schema: z.object({
    date: z.coerce.date(),
    editorial_letter: z.string(),
    item_count: z.number().int().nonnegative().default(0),
    layer_buckets: z.record(z.string(), z.number().int()).default({}),
  }),
});

/**
 * Glossary content collection. One MDX file per canonical term in
 * `src/content/glossary/<slug>.mdx`. Body is a soft 4-part senior-
 * engineer-voice paragraph (what / how / where / related) read by the
 * full entry page; frontmatter's `summary` field is the 30-word hover-
 * card definition. Aliases resolve via the <G> component's lookup
 * (e.g. <G term="moe"> resolves to the "mixture-of-experts" entry).
 *
 * Cross-layer terms declare primary_layer plus secondary_layers; the
 * entry surfaces under primary on the /glossary index but cross-
 * references show on each secondary layer page.
 */
const LAYER_SLUGS = [
  "infrastructure", "silicon", "compute", "data", "training", "weights", "runtime",
  "retrieval-memory", "agents", "protocols",
  "evaluation", "governance", "identity-trust",
  "safety-guardrails", "sovereignty-decentralization",
] as const;

const glossary = defineCollection({
  loader: glob({
    pattern: "**/*.mdx",
    base: "./src/content/glossary",
  }),
  schema: z.object({
    term: z.string(),
    aliases: z.array(z.string()).default([]),
    primary_layer: z.enum(LAYER_SLUGS),
    secondary_layers: z.array(z.enum(LAYER_SLUGS)).default([]),
    summary: z.string().refine(
      (s) => s.split(/\s+/).filter(Boolean).length <= 30,
      { message: "summary must be 30 words or fewer (hover-card cap)" },
    ),
    sources: z.array(z.object({ title: z.string(), url: z.string().url() })).default([]),
    updated: z.coerce.date(),
  }),
});

/**
 * Self-host learn track. A parallel course to the stack-walk modules,
 * focused on practical "how do I actually run this locally / in
 * production?" topics: VRAM math, memory bandwidth tiers, quantization
 * formats, inference engines, hardware strategy, production serving,
 * benchmarking. Each module is a single MDX file in
 * src/content/self-host-modules/.
 */
const self_host_modules = defineCollection({
  loader: glob({
    pattern: "**/*.mdx",
    base: "./src/content/self-host-modules",
  }),
  schema: z.object({
    slug: z.string(),
    order: z.number().int().min(1),
    title: z.string(),
    one_liner: z.string(),
    sources: z.array(z.object({ title: z.string(), url: z.string().url() })).default([]),
    updated: z.coerce.date(),
  }),
});

export const collections = {
  layers,
  news,
  glossary,
  self_host_modules,
};
