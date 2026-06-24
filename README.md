# The Open-Source AI Stack

A public reference site organized around ten production-pipeline layers and
five cross-cutting meta-layers of the open-source AI stack. Each layer page
collects the projects, grants, and reading at that layer; the data is
hand-maintained and kept honest by a set of scheduled audit routines.

Live: https://open-source-ai.tech

## What's here

- **The Stack** (`/stack`): canonical diagram + 15 per-layer pages
  - 10 core layers: Infrastructure, Silicon, Compute, Data, Training, Weights,
    Runtime, Retrieval and Memory, Agents, Protocols
  - 5 cross-cutting meta-layers: Evaluation, Governance, Identity and Trust,
    Safety and Guardrails, Sovereignty and Decentralization
- **Models** (`/models`): one row per checkpoint since Feb 2023, with a
  timeline, a sortable spec/benchmark table, and per-model pages
- **Hardware** (`/hardware`): the hardware that runs open models, plus a
  fit-and-tokens/sec explorer
- **Tool-calling** (`/tool-calling`): how open models call tools, across the
  runtime, agents, protocols, and evaluation layers
- **Grants** (`/grants`): grants ecosystem map with per-funder profiles and
  layer attribution
- **Glossary** (`/glossary`): ~145 technical terms, cross-referenced by alias
- **Learn** (`/learn`): a self-paced course over the stack
- **About** (`/about`): methodology and data posture

## Tech stack

- **Astro 6** + **MDX** + **Tailwind CSS v4** (Vite plugin)
- TypeScript strict mode
- Content collections for layer pages and glossary
- Layer taxonomy in `data/layers.yaml` (15 layers total: 10 core + 5 meta;
  single source of truth for the diagram and per-layer routing)
- Sitemap via `@astrojs/sitemap`
- Deploy: Vercel

## Local development

```bash
# Install dependencies
npm install

# Start the dev server (http://localhost:4321)
npm run dev

# Type-check + build for production
npm run build

# Preview the production build locally
npm run preview
```

## Directory structure

```
open-source-ai-stack/
├── astro.config.mjs            # Astro + integrations
├── data/                       # YAML data, source of truth
├── public/                     # Static assets + generated JSON for the chat agent
├── scripts/                    # Build + audit + automation helpers
├── src/
│   ├── components/             # Nav, Footer, StackDiagram, chat island, etc.
│   ├── content/
│   │   ├── layers/             # MDX per layer (15 files)
│   │   └── glossary/           # Per-term MDX entries
│   ├── content.config.ts       # Content collection schemas
│   ├── layouts/
│   │   └── BaseLayout.astro    # Shell + nav + footer
│   ├── lib/                    # Loaders, chat agent, calculators
│   ├── pages/                  # Routes
│   └── styles/
│       └── global.css          # Tailwind + brand tokens
└── tsconfig.json
```

See `CLAUDE.md` for the canonical schema, editorial rules, and operations.

## Editorial rules

- **No em dashes anywhere.** Use commas, colons, semicolons, parens, or two
  sentences. Hard rule.
- Avoid AI-slop vocabulary: delve, tapestry, landscape, journey, nuanced,
  multifaceted, realm, paradigm, fascinating.
- Avoid marketing slop: transformative, robust, leveraging, utilize.
- Neutral-observational voice for all generated content.
- Names, dates, versions, and license tiers are first-class. Specific over
  abstract.

## Methodology

The site is a living, layer-organized view of open-source AI. Its
differentiators (verified against ~12 comparable sites in the planning
research):

1. **Grants tracking with layer attribution.** Existing trackers (NLnet,
   Mozilla Builders) list grants but do not roll them up to "Q1 went $4M to
   inference."
2. **Per-layer pages that are taxonomy, catalog, and grants in one URL.**
   Existing sites do at most two of those per page.
3. **A claims-audit system** that snapshots primary sources and tracks a
   verdict per checkable claim, so curated content does not silently drift.

## Provenance

The stack taxonomy and the initial per-layer prose started from a personal
LLM-wiki at `/Users/austinv2/code/sovereign-ai-wiki/` built in May 2026,
itself modeled on Karpathy's LLM-wiki pattern. The wiki carries the working
research; this site is the polished, public-facing form.

## License

Content: CC BY 4.0 (attribute "The Open-Source AI Stack" with a backlink).
Code: MIT.
