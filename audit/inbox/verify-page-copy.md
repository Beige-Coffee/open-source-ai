# Page-copy fact verification

Date: 2026-05-19
Verifier: page-copy audit pass
Scope: README.md, src/pages/about.astro, src/pages/index.astro,
src/pages/predictions.astro, src/pages/glossary.astro,
src/pages/grants.astro, src/pages/learn/index.astro,
src/components/Footer.astro

Page slug names follow `<file-basename>.<sequence>`.

## Verified claims

| id | category | path | claim | type | kind | source | verdict | date | evidence |
|---|---|---|---|---|---|---|---|---|---|
| page.readme.001 | page-copy | README.md | Site is organized around ten production-pipeline layers and five cross-cutting meta-layers | factual | taxonomy count | data/layers.yaml | supported | 2026-05-19 | layers.yaml has 10 entries under `core:` and 5 under `meta:` |
| page.readme.002 | page-copy | README.md | Reads "~30 layer-specific feeds" (BEFORE FIX) | factual | source count | data/sources.yaml | contradicted | 2026-05-19 | sources.yaml has 63 source entries (40 RSS + 22 scrape + 1 JSON); fixed to "~60" |
| page.readme.003 | page-copy | README.md | "10 core layers: Infrastructure, Silicon, Compute, Data, Training, Weights, Runtime, Retrieval and Memory, Agents, Protocols" | factual | layer list | data/layers.yaml | supported | 2026-05-19 | matches yaml core layers exactly |
| page.readme.004 | page-copy | README.md | "5 cross-cutting meta-layers: Evaluation, Governance, Identity and Trust, Safety and Guardrails, Sovereignty and Decentralization" | factual | layer list | data/layers.yaml | supported | 2026-05-19 | matches yaml meta layers; canonical title is "Sovereignty and Decentralization Primitives" but short form is consistent |
| page.readme.005 | page-copy | README.md | "Astro 6 + MDX + Tailwind CSS v4 (Vite plugin)" | factual | tech stack | package.json | supported | 2026-05-19 | astro ^6.3.2, @astrojs/mdx ^5.0.5, tailwindcss ^4.3.0, @tailwindcss/vite ^4.3.0 |
| page.readme.006 | page-copy | README.md | Content collections include "synthesis" (BEFORE FIX) | factual | repo structure | src/content/ | contradicted | 2026-05-19 | only `glossary`, `layers`, `news`; fixed to glossary |
| page.readme.007 | page-copy | README.md | "MDX per layer (14 files)" (BEFORE FIX) | factual | file count | src/content/layers/ | contradicted | 2026-05-19 | 15 mdx files (one per layer); fixed to 15 |
| page.readme.008 | page-copy | README.md | "(9 core + 5 meta)" annotation on layers.yaml directory entry (BEFORE FIX) | factual | taxonomy count | data/layers.yaml | contradicted | 2026-05-19 | actually 10 core + 5 meta; fixed |
| page.readme.009 | page-copy | README.md | Karpathy LLM-wiki pattern reference | factual | attribution | https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f (indirect, mentioned in CLAUDE.md not README) | supported | 2026-05-19 | gist confirmed live and describes pattern Austin's wiki follows |
| page.about.001 | page-copy | src/pages/about.astro | "ten production-pipeline layers and five cross-cutting meta-layers" | factual | taxonomy count | data/layers.yaml | supported | 2026-05-19 | matches data |
| page.about.002 | page-copy | src/pages/about.astro | "A scheduled agent updates the news once a day at 08:00 Pacific" | factual | schedule | CLAUDE.md operations section | supported | 2026-05-19 | matches CLAUDE.md daily routine "08:00 PT" |
| page.about.003 | page-copy | src/pages/about.astro | "about thirty layer-specific RSS feeds and Atom feeds...plus a handful of HTML-scrape sources" (BEFORE FIX) | factual | source count | data/sources.yaml | contradicted | 2026-05-19 | 40 RSS + 22 scrape; fixed to "about forty" + "about twenty" |
| page.about.004 | page-copy | src/pages/about.astro | "Each of the 15 layer pages" | factual | page count | src/content/layers/ | supported | 2026-05-19 | exactly 15 mdx files |
| page.about.005 | page-copy | src/pages/about.astro | "About 130 technical terms are defined at /glossary" (BEFORE FIX) | factual | glossary count | src/content/glossary/ | contradicted | 2026-05-19 | 144 mdx entries; fixed to "About 145" |
| page.about.006 | page-copy | src/pages/about.astro | Each glossary entry has a "30-word summary" | factual | content rule | content.config.ts | needs_verification | 2026-05-19 | claim is the editorial cap, not asserting every entry meets it exactly; CLAUDE.md says "≤30 words, enforced by zod + lint" |
| page.about.007 | page-copy | src/pages/about.astro | "AI News by smol AI (news.smol.ai) is the spine" | factual | source attribution | https://news.smol.ai/ | supported | 2026-05-19 | site exists and self-describes as "AI News by smol.ai" |
| page.about.008 | page-copy | src/pages/about.astro | "SemiAnalysis, Interconnects, Latent Space, Import AI, and The Batch are the highest-signal newsletters" | factual | source list | data/sources.yaml + web | supported | 2026-05-19 | all five are real and present in sources.yaml or aggregators |
| page.about.009 | page-copy | src/pages/about.astro | "GitHub release feeds (vLLM, SGLang, llama.cpp, MCP, OpenHands, Aider) plus vendor blogs" | factual | source list | data/sources.yaml | supported | 2026-05-19 | each appears as a *-releases entry in sources.yaml |
| page.about.010 | page-copy | src/pages/about.astro | "HRF, OpenSats, Cosmos Institute, Foresight Institute, Block / Goose" listed as cypherpunk-adjacent funders with strong coverage | factual | funder list | data/funders.yaml + web | supported | 2026-05-19 | all five are real organizations; cypherpunk framing is consistent with their public missions |
| page.about.011 | page-copy | src/pages/about.astro | "Open Philanthropy, FLI, SFF, Manifund, Lightspeed Grants" as major AI-safety funders | factual | funder list | web | supported | 2026-05-19 | all confirmed real; Open Phil ~$46M on AI safety in 2023 |
| page.about.012 | page-copy | src/pages/about.astro | "NLnet NGI Zero, Sovereign Tech Fund, Mozilla Builders, Linux Foundation AAIF" as major OSS infrastructure programs | factual | funder list | web | supported | 2026-05-19 | NLnet €21.6M 2024-2027; Sovereign Tech Fund €24.6M+ since 2022; Mozilla Builders Accelerator up to $100K; AAIF formed Dec 2025 by Linux Foundation |
| page.about.013 | page-copy | src/pages/about.astro | Three routines: "Weekly grants-watch (Mondays 09:00 PT), Monthly grants-discovery (1st 11:00 PT), Quarterly grants-audit (1st of Mar/Jun/Sep/Dec 10:00 PT)" | factual | schedule | CLAUDE.md | supported | 2026-05-19 | matches CLAUDE.md operations section |
| page.about.014 | page-copy | src/pages/about.astro | GitHub issues link `https://github.com/Beige-Coffee/open-source-ai/issues` | factual | repo URL | github.com | supported | 2026-05-19 | repository confirmed live with matching project description |
| page.about.015 | page-copy | src/pages/about.astro | "personal wiki built by Austin in May 2026 (a Karpathy-style LLM-wiki)" | factual | provenance | Karpathy gist | supported | 2026-05-19 | gist URL live; pattern matches |
| page.about.016 | page-copy | src/pages/about.astro | Confidence on a 1-5 scale, "1 is vibes, 5 is market-priced" | framing | scale definition | data/predictions.yaml | consistent | 2026-05-19 | predictions.yaml comment block uses same scale wording |
| page.about.017 | page-copy | src/pages/about.astro | Editorial-voice banned words list ("delve", "tapestry", "landscape", "fascinating", "transformative", "robust", "leveraging", "utilize") | framing | banned-vocab list | CLAUDE.md | consistent | 2026-05-19 | matches CLAUDE.md "no buzzwords" rule |
| page.index.001 | page-copy | src/pages/index.astro | "Ten core layers, five cross-cuts" | factual | taxonomy count | data/layers.yaml | supported | 2026-05-19 | matches yaml |
| page.predictions.001 | page-copy | src/pages/predictions.astro | "Confidence is on a 1-5 scale: 1 is vibes, 5 is market-priced" | framing | scale definition | data/predictions.yaml | consistent | 2026-05-19 | matches comment in predictions.yaml |
| page.predictions.002 | page-copy | src/pages/predictions.astro | Dynamic "{totalCount} filed · {highConfidence} high confidence (4-5) · {lowConfidence} low confidence (1-2)" | factual | derived count | data/predictions.yaml | supported | 2026-05-19 | values computed at build time from predictions.yaml (currently 28 entries; numbers are accurate by definition) |
| page.glossary.001 | page-copy | src/pages/glossary.astro | "Definitions for the concepts...this site uses across its 14 layers" (BEFORE FIX) | factual | layer count | data/layers.yaml | contradicted | 2026-05-19 | 15 layers total; fixed to 15 |
| page.glossary.002 | page-copy | src/pages/glossary.astro | "{entries.length} entries" / "{byLayer.filter((b) => b.entries.length > 0).length} layers covered" | factual | derived count | src/content/glossary/ | supported | 2026-05-19 | computed at build time from the actual collection |
| page.grants.001 | page-copy | src/pages/grants.astro | "Most AI funding flows through venture capital and hyperscaler partnerships, not grants. The grants tier is small by comparison" | framing | editorial framing | n/a | consistent | 2026-05-19 | qualitative observation, consistent with the documented grant scale (€21M/€24M-class programs vs. multi-billion-dollar VC AI rounds) |
| page.grants.002 | page-copy | src/pages/grants.astro | "{funders.length} funders" / "{grants.length} grants" / "{underfunded.length} named gaps" | factual | derived count | data/funders.yaml + data/grants.yaml + data/underfunded.yaml | supported | 2026-05-19 | derived at build time; raw counts: 37 funders, 79 grants in yaml |
| page.grants.003 | page-copy | src/pages/grants.astro | "One grant can span multiple layers (e.g., OMAI hits weights + data + compute)" | factual | example | data/grants.yaml | needs_verification | 2026-05-19 | OMAI listed in funders.yaml notable_recent; layer attribution on grant entry not directly inspected |
| page.learn.001 | page-copy | src/pages/learn/index.astro | "15 self-paced Socratic modules, bottom-up from infrastructure to protocols" | factual | module count | inline MODULES array | supported | 2026-05-19 | MODULES array has 15 entries |
| page.learn.002 | page-copy | src/pages/learn/index.astro | Module list: 10 core + 4 meta + 1 capstone (sovereignty) | factual | module structure | inline MODULES array | supported | 2026-05-19 | matches MODULES type values |
| page.learn.003 | page-copy | src/pages/learn/index.astro | "Fast pass · a day or two, paragraph per layer" / "Deep pass · about a week, multi-paragraph with sources" | framing | depth descriptions | n/a | consistent | 2026-05-19 | qualitative time estimates; editorial framing |
| page.footer.001 | page-copy | src/components/Footer.astro | "reads ~30 layer-specific feeds" (BEFORE FIX) | factual | source count | data/sources.yaml | contradicted | 2026-05-19 | 63 sources actual; fixed to ~60 |

## Fixes applied (page copy)

- README.md: "~30 layer-specific feeds" → "~60 layer-specific feeds" (sources.yaml has 63 entries, not ~30).
- README.md: "Content collections for layer pages, synthesis, news" → "Content collections for layer pages, glossary, news" (no `synthesis` collection exists; `glossary` does).
- README.md: "MDX per layer (14 files)" → "MDX per layer (15 files)" (src/content/layers/ has 15 mdx files matching the 10 core + 5 meta taxonomy).
- README.md: "Canonical taxonomy (9 core + 5 meta)" → "Canonical taxonomy (10 core + 5 meta)" (data/layers.yaml has 10 core entries, not 9).
- README.md: Added "(15 layers total: 10 core + 5 meta...)" annotation on the layers.yaml bullet for clarity.
- src/components/Footer.astro: "~30 layer-specific feeds" → "~60 layer-specific feeds".
- src/pages/about.astro: "about thirty layer-specific RSS feeds and Atom feeds...plus a handful of HTML-scrape sources" → "about forty layer-specific RSS and Atom feeds...plus about twenty HTML-scrape sources" (more accurate split: 40 RSS + 22 scrape).
- src/pages/about.astro: "About 130 technical terms" → "About 145 technical terms" (actual count: 144 mdx files in src/content/glossary/).
- src/pages/glossary.astro: "across its 14 layers" → "across its 15 layers" (10 core + 5 meta = 15, not 14).

## Notes

- The README still says "Live: https://open-source-ai.tech (once deployed; Week 1 in progress)" with a Build phases table going to Week 4. This is internal/planning narrative that can drift; flagged as `needs_verification` only if external visitors might confuse it. Today is 2026-05-19, suggesting more than a week has passed since the Week 1 framing was written, but verifying actual deploy status was out of scope.
- The "Sovereignty and Decentralization Primitives" canonical title (data/layers.yaml) is shortened to "Sovereignty and Decentralization" in README and elsewhere; not flagged as a contradiction because the short form is consistent across all customer-facing pages and the canonical form is repo-internal.
- Funder name strings on /about (HRF, OpenSats, Cosmos Institute, Foresight Institute, Block/Goose, Open Philanthropy, FLI, SFF, Manifund, Lightspeed Grants, NLnet NGI Zero, Sovereign Tech Fund, Mozilla Builders, Linux Foundation AAIF) were all independently confirmed via web search as real, active funders matching the site's characterization.
