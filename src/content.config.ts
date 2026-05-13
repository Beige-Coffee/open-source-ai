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
  }),
});

/**
 * Synthesis content collection. Cross-cutting arguments, panel framings,
 * load-bearing claims. Adapted from the wiki's `wiki/synthesis/`.
 */
const synthesis = defineCollection({
  loader: glob({
    pattern: "**/*.mdx",
    base: "./src/content/synthesis",
  }),
  schema: z.object({
    slug: z.string(),
    title: z.string(),
    summary: z.string(),
    related_layers: z.array(z.string()).default([]),
    tags: z.array(z.string()).default([]),
    updated: z.coerce.date(),
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

export const collections = {
  layers,
  synthesis,
  news,
};
