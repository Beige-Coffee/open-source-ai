# The Open-Source AI Stack

A public educational website organized around ten production-pipeline layers
and five cross-cutting meta-layers of the open-source AI stack. Updated daily
by a scheduled Claude agent that reads ~60 layer-specific feeds, dedupes via
SimHash, classifies each item by layer, and publishes a per-layer roundup.

Live: https://open-source-ai.tech (once deployed; Week 1 in progress)

## What's here today (Week 1 foundations)

- **The Stack** (`/stack`): canonical diagram + 15 per-layer pages
  - 10 core layers: Infrastructure, Silicon, Compute, Data, Training, Weights,
    Runtime, Retrieval and Memory, Agents, Protocols
  - 5 cross-cutting meta-layers: Evaluation, Governance, Identity and Trust,
    Safety and Guardrails, Sovereignty and Decentralization
- **Today** (`/today`): daily news roundup landing page (automation wires up
  in Week 2)
- **News** (`/news`): archive of past issues (populates from Week 2 onward)
- **Learn** (`/learn`): per-layer reading list landing (curated content lands
  in Week 4)
- **Grants** (`/grants`): grants ecosystem map (data lands in Week 3)
- **About** (`/about`): methodology, agent design, source list
- **RSS** (`/rss`): subscription directory (full feed at `/rss/news.xml`)

## Build phases

| Week | Scope |
| --- | --- |
| 1 (in progress) | Foundations: brand, taxonomy, per-layer pages, nav, RSS scaffold, deploy. |
| 2 | News routine: scheduled Anthropic agent, fetch / dedupe / route / summarize / publish pipeline. |
| 3 | Grants section: schema, seed data, per-funder profiles, funded-vs-underfunded map. |
| 4 | Learn section: per-layer reading lists, daily concept hook, predictions baseline. |

See `/Users/austinv2/code/sovereign-ai-wiki/deliverables/open-source-ai-stack-plan.md`
for the full plan, research findings (similar sites, grants ecosystem, news
sources), and design decisions.

## Tech stack

- **Astro 6** + **MDX** + **Tailwind CSS v4** (Vite plugin)
- TypeScript strict mode
- Content collections for layer pages, glossary, news
- Layer taxonomy in `data/layers.yaml` (15 layers total: 10 core + 5 meta;
  single source of truth for the diagram and per-layer routing)
- RSS via `@astrojs/rss`
- Sitemap via `@astrojs/sitemap`
- Deploy: Vercel (static output)

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
├── data/
│   └── layers.yaml             # Canonical taxonomy (10 core + 5 meta)
├── public/                     # Static assets, favicon, diagrams
├── scripts/                    # Automation helpers (Week 2 onward)
├── src/
│   ├── components/             # Nav, Footer, StackDiagram
│   ├── content/
│   │   ├── layers/             # MDX per layer (15 files)
│   │   ├── glossary/           # Per-term MDX entries
│   │   └── news/               # Daily issues (Week 2 onward)
│   ├── content.config.ts       # Content collection schemas
│   ├── layouts/
│   │   └── BaseLayout.astro    # Shell + nav + footer
│   ├── lib/
│   │   └── layers.ts           # YAML loader for the taxonomy
│   ├── pages/                  # Routes
│   │   ├── index.astro         # Homepage
│   │   ├── stack/              # Stack overview + dynamic /[slug]
│   │   ├── news/               # News archive
│   │   ├── rss/                # RSS feed endpoints
│   │   └── ...                 # today, learn, grants, about
│   └── styles/
│       └── global.css          # Tailwind + brand tokens
└── tsconfig.json
```

## Editorial rules

- **No em dashes anywhere.** Use commas, colons, semicolons, parens, or two
  sentences. Hard rule.
- Avoid AI-slop vocabulary: delve, tapestry, landscape, journey, nuanced,
  multifaceted, realm, paradigm, fascinating.
- Avoid marketing slop: transformative, robust, leveraging, utilize.
- Neutral-observational voice for all agent-generated content. Editorial
  letter is observational ("today the runtime layer saw 4 releases"), not
  opinion.
- Names, dates, versions, and license tiers are first-class. Specific over
  abstract.

## Methodology

The site exists to be a living, layer-organized view of open-source AI. Its
differentiators (verified against ~12 comparable sites in the planning
research):

1. **Daily news automatically routed to a stack layer.** Existing sites
   (AINews, HuggingFace Daily Papers, TLDR AI, The Batch) tag by company or
   by theme; none tag by stack layer.
2. **Grants tracking with layer attribution.** Existing trackers (NLnet,
   Mozilla Builders) list grants but do not roll them up to "Q1 went $4M to
   inference."
3. **Per-layer pages that are taxonomy + curriculum + news + grants in one
   URL.** Existing sites do at most two of those per page.

## Provenance

The stack taxonomy and the initial per-layer prose started from a personal
LLM-wiki at `/Users/austinv2/code/sovereign-ai-wiki/` built in May 2026,
itself modeled on Karpathy's LLM-wiki pattern. The wiki carries the working
research; this site is the polished, daily-updated, public-facing form.

## License

Content: CC BY 4.0 (attribute "The Open-Source AI Stack" with a backlink).
Code: MIT.
