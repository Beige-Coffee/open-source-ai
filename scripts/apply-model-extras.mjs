#!/usr/bin/env node
/**
 * Apply cost / speed / lineage / use-cases / limitations / long-form
 * patches to data/models.yaml. Idempotent: each patch is merged in by
 * key, so re-running after editing the patches updates in place.
 *
 * Cost and speed numbers attribute Artificial Analysis as the source
 * with a clear link, per the editorial decision recorded in CLAUDE.md
 * "Models hub" section.
 *
 * Pricing reference dates are snapshotted; the audit ledger captures
 * each value as a `factual / amount` row that subsequent audit cycles
 * re-verify against AA's current published number.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import yaml from "js-yaml";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const PATH = resolve(ROOT, "data/models.yaml");

const AA = "https://artificialanalysis.ai/models";
const AA_FOR = (s) => `https://artificialanalysis.ai/models/${s}`;
const AS_OF = "2026-05-19";

/**
 * Per-model patch. Only specifies fields being added; merged shallow
 * onto the existing model entry. Cost / speed values are USD per
 * million tokens at the canonical reference vendor that Artificial
 * Analysis tracks.
 */
const PATCHES = {
  // ----- Llama family -----
  "llama-2-70b-chat": {
    cost: { input_per_mtok_usd: 0.90, output_per_mtok_usd: 0.90, vendor: "Together AI (legacy)", as_of: AS_OF, source: AA, via_artificial_analysis: true },
    speed: { tokens_per_sec_output: 70, vendor: "Together AI (legacy)", as_of: AS_OF, source: AA, via_artificial_analysis: true },
    lineage: { children: ["llama-3-70b-instruct"], note: "Architecture base for the Llama 3 family." },
    recommended_use_cases: ["historical baseline", "permissive license under 700M MAU cap"],
  },
  "llama-3-8b-instruct": {
    cost: { input_per_mtok_usd: 0.18, output_per_mtok_usd: 0.18, vendor: "Together AI", as_of: AS_OF, source: AA, via_artificial_analysis: true },
    speed: { tokens_per_sec_output: 165, vendor: "Together AI", as_of: AS_OF, source: AA, via_artificial_analysis: true },
    lineage: { parent: "llama-2-70b-chat", children: ["llama-3-1-8b-instruct"], note: "Same architecture, 15T-token pretrain replaces Llama 2's 2T." },
    recommended_use_cases: ["local deployment", "edge inference", "fine-tuning base"],
  },
  "llama-3-70b-instruct": {
    cost: { input_per_mtok_usd: 0.88, output_per_mtok_usd: 0.88, vendor: "Together AI", as_of: AS_OF, source: AA, via_artificial_analysis: true },
    speed: { tokens_per_sec_output: 75, vendor: "Together AI", as_of: AS_OF, source: AA, via_artificial_analysis: true },
    lineage: { parent: "llama-2-70b-chat", children: ["llama-3-1-70b-instruct"], note: "Continued the 70B-class through Llama 3.1 and 3.3." },
    recommended_use_cases: ["general chat", "instruction following", "fine-tuning base"],
  },
  "llama-3-1-8b-instruct": {
    cost: { input_per_mtok_usd: 0.18, output_per_mtok_usd: 0.18, vendor: "Together AI", as_of: AS_OF, source: AA, via_artificial_analysis: true },
    speed: { tokens_per_sec_output: 175, vendor: "Together AI", as_of: AS_OF, source: AA, via_artificial_analysis: true },
    lineage: { parent: "llama-3-8b-instruct", note: "128K context via continued pretraining." },
    recommended_use_cases: ["long-context tasks at the 8B class", "RAG", "tool use"],
  },
  "llama-3-1-70b-instruct": {
    cost: { input_per_mtok_usd: 0.88, output_per_mtok_usd: 0.88, vendor: "Together AI", as_of: AS_OF, source: AA, via_artificial_analysis: true },
    speed: { tokens_per_sec_output: 78, vendor: "Together AI", as_of: AS_OF, source: AA, via_artificial_analysis: true },
    lineage: { parent: "llama-3-70b-instruct", children: ["llama-3-3-70b-instruct"], note: "Added 128K context and tool-use post-training." },
    recommended_use_cases: ["general chat", "tool use", "long-context"],
  },
  "llama-3-1-405b-instruct": {
    cost: { input_per_mtok_usd: 3.50, output_per_mtok_usd: 3.50, vendor: "Together AI", as_of: AS_OF, source: AA, via_artificial_analysis: true },
    speed: { tokens_per_sec_output: 32, vendor: "Together AI", as_of: AS_OF, source: AA, via_artificial_analysis: true },
    lineage: { note: "Largest dense Llama; trained with 16K H100s on the same data mix as the 8B and 70B." },
    recommended_use_cases: ["frontier-quality on-prem deployment", "synthetic-data generation", "teacher for distillation"],
    long_form: "Llama 3.1 405B is the first openly-released model trained at GPT-4-class scale. The release was paired with a detailed 92-page technical report covering pretraining recipe, post-training, and infrastructure (including the failure-rate analysis on Meta's 16,384-H100 cluster, which became a reference point for anyone planning frontier training). On benchmarks it lands within reach of contemporaneous closed frontier models on MMLU and reasoning suites, which made it the first time researchers had access to a 400B-class checkpoint's weights for ablation studies and distillation experiments. Its practical deployment story is more constrained: at 810 GB in fp16, single-machine inference requires either multi-GPU sharding or fp8 quantization, and even at fp8 it pushes against the limits of single 8xH100 nodes. That cost-and-complexity ceiling is why the smaller 70B-class checkpoints (3.1 70B and the post-training-refreshed 3.3 70B) capture more production usage. The 405B's lasting impact is the published recipe and the synthetic data the larger checkpoint generated for post-training the 70B and 8B siblings, a pattern subsequent open-weights releases have copied.",
    known_limitations: [
      { text: "405B parameters at fp16 require 810 GB of VRAM; serving at fp8 still pushes single-node limits.", source: "https://arxiv.org/abs/2407.21783" },
      { text: "Llama Community License's 700M-MAU clause makes the largest deployers ineligible without a separate Meta agreement.", source: "https://github.com/meta-llama/llama-models/blob/main/models/llama3_1/LICENSE" },
    ],
  },
  "llama-3-3-70b-instruct": {
    cost: { input_per_mtok_usd: 0.88, output_per_mtok_usd: 0.88, vendor: "Together AI", as_of: AS_OF, source: AA, via_artificial_analysis: true },
    speed: { tokens_per_sec_output: 80, vendor: "Together AI", as_of: AS_OF, source: AA, via_artificial_analysis: true },
    lineage: { parent: "llama-3-1-70b-instruct", note: "Same base; post-training refresh closed much of the 70B-vs-405B gap." },
    recommended_use_cases: ["mid-tier production deployment", "code assistance", "general chat at 70B cost"],
    long_form: "Llama 3.3 70B is what happens when a lab spends six months on post-training the same base checkpoint. Meta did not release a new pretrain in December 2024; they released a re-trained 70B that reached benchmark scores within range of the 405B sibling on MMLU and HumanEval, at a fraction of the deployment cost. The recipe (published only in the model card, not a paper) emphasized synthetic data from the 405B teacher, additional preference data, and refined rejection sampling. The release lands at an interesting moment for the open-weights story: 70B-class checkpoints from Meta, Qwen, DeepSeek, and Mistral are now close enough on most benchmarks that license, vendor support, and inference economics matter more than capability deltas. Llama 3.3 70B became the default 70B-class checkpoint through 2025 for most production workloads where Apache-2.0 was not a hard requirement. It is also the final dense Llama: the Llama 4 family that followed in April 2025 went MoE, following DeepSeek V3 and Qwen 3.",
    known_limitations: [
      { text: "Still under Llama Community License, not OSI-approved.", source: "https://github.com/meta-llama/llama-models/blob/main/models/llama3_3/LICENSE" },
    ],
  },
  "llama-4-scout": {
    cost: { input_per_mtok_usd: 0.20, output_per_mtok_usd: 0.20, vendor: "Together AI", as_of: AS_OF, source: AA, via_artificial_analysis: true },
    speed: { tokens_per_sec_output: 130, vendor: "Together AI", as_of: AS_OF, source: AA, via_artificial_analysis: true },
    lineage: { parent: "llama-3-3-70b-instruct", note: "First Llama MoE; same Community License lineage." },
    recommended_use_cases: ["long-context tasks", "multimodal input", "frontier-class inference at MoE economics"],
    long_form: "Llama 4 Scout is Meta's first MoE release, and the public reception was mixed enough to be a story in itself. The headline features were a 10M-token context window (the longest in any frontier model at release) and native multimodal input, both delivered alongside an architecture pivot that followed DeepSeek V3 in establishing MoE as mainstream for open-weights frontier work. Independent evaluators noted that the announced benchmark scores were not consistently reproducible at deployment, that the 10M-token context was achievable in theory but degraded at lengths well below the stated maximum, and that the LMArena ranking the launch material featured was for a chat-tuned variant not available as weights. The release itself remains historically significant as the moment Llama abandoned dense scaling, but the immediate developer narrative was that DeepSeek V3 and Qwen 3 had executed the open-weights MoE story more cleanly five months earlier. Llama 4 Scout's lasting value depends on whether the Maverick and Behemoth siblings shipped on the same architecture deliver on the long-context and multimodal promises in production deployment.",
    known_limitations: [
      { text: "10M-token context window degrades at lengths well below the stated maximum in independent evaluations.", source: "https://ai.meta.com/blog/llama-4-multimodal-intelligence/" },
    ],
  },

  // ----- Mistral family -----
  "mistral-7b-v0-1": {
    cost: { input_per_mtok_usd: 0.20, output_per_mtok_usd: 0.20, vendor: "Together AI", as_of: AS_OF, source: AA, via_artificial_analysis: true },
    speed: { tokens_per_sec_output: 175, vendor: "Together AI", as_of: AS_OF, source: AA, via_artificial_analysis: true },
    lineage: { children: ["mixtral-8x7b-instruct-v0-1"], note: "Architecture base for the Mixtral MoE." },
    recommended_use_cases: ["local deployment", "Apache-2.0 reference", "fine-tuning base"],
  },
  "mixtral-8x7b-instruct-v0-1": {
    cost: { input_per_mtok_usd: 0.60, output_per_mtok_usd: 0.60, vendor: "Together AI", as_of: AS_OF, source: AA, via_artificial_analysis: true },
    speed: { tokens_per_sec_output: 115, vendor: "Together AI", as_of: AS_OF, source: AA, via_artificial_analysis: true },
    lineage: { parent: "mistral-7b-v0-1", note: "Eight Mistral 7B experts under one router; 2 active per token." },
    recommended_use_cases: ["MoE deployment reference", "dense 70B-class quality at 13B active cost"],
    long_form: "Mixtral 8x7B was the first MoE release that the broader open-weights community could actually deploy. Earlier MoE work (Switch Transformer, GLaM) had stayed inside Google; Mixtral arrived as Apache-2.0 weights and a paper with enough detail for production inference engines (vLLM, llama.cpp, TGI) to add MoE support within weeks. The architecture is eight Mistral 7B experts behind a router that activates two per token, giving 47B total parameters but only ~13B active per forward pass. The economic story that mattered was that this configuration matched or beat dense 70B-class models on most benchmarks at substantially lower inference cost. Mixtral established the pattern that DeepSeek V3, Qwen 3, and eventually Llama 4 all followed: when a lab cares about cost-per-token at deployment scale more than parameter-count bragging rights, MoE is the obvious choice. The Apache-2.0 license also mattered because Mistral's later flagship releases moved progressively toward API-only and source-available terms, making 8x7B the last clean reference point for a fully-open MoE from a European lab.",
    known_limitations: [
      { text: "47B total parameters require enough memory to hold all eight experts even though only 2 are active per token.", source: "https://arxiv.org/abs/2401.04088" },
    ],
  },

  // ----- Qwen family -----
  "qwen2-5-72b-instruct": {
    cost: { input_per_mtok_usd: 1.20, output_per_mtok_usd: 1.20, vendor: "Together AI", as_of: AS_OF, source: AA, via_artificial_analysis: true },
    speed: { tokens_per_sec_output: 50, vendor: "Together AI", as_of: AS_OF, source: AA, via_artificial_analysis: true },
    lineage: { children: ["qwen3-235b-a22b-instruct"], note: "Final 72B-class dense Qwen before the Qwen 3 MoE pivot." },
    recommended_use_cases: ["multilingual deployment", "long-context retrieval", "fine-tuning base"],
  },
  "qwen3-235b-a22b-instruct": {
    cost: { input_per_mtok_usd: 0.70, output_per_mtok_usd: 0.70, vendor: "Together AI", as_of: AS_OF, source: AA, via_artificial_analysis: true },
    speed: { tokens_per_sec_output: 95, vendor: "Together AI", as_of: AS_OF, source: AA, via_artificial_analysis: true },
    lineage: { parent: "qwen2-5-72b-instruct", note: "First Qwen MoE with hybrid thinking-vs-fast inference modes." },
    recommended_use_cases: ["hybrid reasoning + chat", "agentic workflows", "long-context retrieval"],
    long_form: "Qwen 3 235B A22B was Alibaba's MoE pivot, and the headline feature was a hybrid thinking-vs-non-thinking inference toggle controllable per request. The schema convention `235B A22B` decodes as 235 billion total parameters and 22 billion active, which puts it in the same operational class as DeepSeek V3 (671B/37B) but at a different cost tier. Apache-2.0 across the entire Qwen 3 size ladder (from 0.6B to 235B) reset the openness baseline among Chinese labs, since DeepSeek's V3 and R1 used a custom DeepSeek License with field-of-use restrictions and Llama remained on community-license terms. The 36T-token pretrain extended Qwen 2.5's 18T, and the post-training stack included GRPO reasoning alongside conventional SFT and DPO. The lasting significance of the release was less about benchmark deltas, which are within noise of DeepSeek V3, and more about establishing that a frontier-grade open MoE could ship under a permissive license from a non-US lab. That made Qwen 3 the default starting point for open-weights agentic work through 2025, especially for organizations whose deployment counsel was uncomfortable with the DeepSeek license's field-of-use clauses.",
    known_limitations: [
      { text: "Hybrid thinking mode is controllable per request but increases inference cost by 3-10x depending on prompt; cost numbers above reflect non-thinking mode.", source: "https://qwenlm.github.io/blog/qwen3/" },
    ],
  },

  // ----- DeepSeek family -----
  "deepseek-v2-chat": {
    cost: { input_per_mtok_usd: 0.14, output_per_mtok_usd: 0.28, vendor: "DeepSeek API", as_of: AS_OF, source: AA, via_artificial_analysis: true },
    speed: { tokens_per_sec_output: 30, vendor: "DeepSeek API", as_of: AS_OF, source: AA, via_artificial_analysis: true },
    lineage: { children: ["deepseek-v3"], note: "MLA debut; architecture refined into V3." },
    recommended_use_cases: ["cost-efficient chat at MoE economics", "long-context retrieval"],
  },
  "deepseek-v3": {
    cost: { input_per_mtok_usd: 0.27, output_per_mtok_usd: 1.10, vendor: "DeepSeek API", as_of: AS_OF, source: AA, via_artificial_analysis: true },
    speed: { tokens_per_sec_output: 60, vendor: "DeepSeek API", as_of: AS_OF, source: AA, via_artificial_analysis: true },
    lineage: { parent: "deepseek-v2-chat", children: ["deepseek-r1"], note: "Base for the R1 reasoning model." },
    recommended_use_cases: ["frontier-quality chat at sub-$1/M output", "long-context tasks", "code assistance"],
    long_form: "DeepSeek V3 reset the cost-quality frontier on December 26, 2024, and is the model that the January 2025 \"DeepSeek moment\" was actually about. The technical report disclosed a reported $5.6M pretraining run on H800 GPUs (which were the export-controlled variant available to Chinese labs, not the H100s used by US frontier labs), and the resulting checkpoint matched closed-frontier scores on MMLU, GPQA-Diamond, and HumanEval. Three architectural innovations carried the story: Multi-head Latent Attention compressed KV-cache memory by ~93%, an auxiliary-loss-free load balancing mechanism kept MoE expert utilization smooth without the convergence problems earlier MoE work hit, and multi-token prediction during pretraining served as both a training-signal amplifier and a deployment-time speculative decoding accelerator. The economic argument that landed on Wall Street was that frontier capability had been reproduced for less than 1% of what US labs were widely reported to be spending on equivalent training runs. The model itself shipped with a custom DeepSeek License (not OSI-approved), but the technical report's level of detail set a new bar for what an open-weights frontier release should look like.",
    known_limitations: [
      { text: "DeepSeek License includes field-of-use restrictions including a ban on military use and on competing with DeepSeek's API service.", source: "https://github.com/deepseek-ai/DeepSeek-V3/blob/main/LICENSE-MODEL" },
      { text: "37B active parameters still require enough memory to load all 256 experts (~671B total).", source: "https://arxiv.org/abs/2412.19437" },
    ],
  },
  "deepseek-r1": {
    cost: { input_per_mtok_usd: 0.55, output_per_mtok_usd: 2.19, vendor: "DeepSeek API", as_of: AS_OF, source: AA, via_artificial_analysis: true },
    speed: { tokens_per_sec_output: 30, vendor: "DeepSeek API", as_of: AS_OF, source: AA, via_artificial_analysis: true },
    lineage: { parent: "deepseek-v3", children: ["deepseek-r1-0528"], note: "First MIT-licensed open reasoning model." },
    recommended_use_cases: ["math reasoning", "code reasoning", "step-by-step problem solving"],
    long_form: "DeepSeek-R1 is the first openly-released reasoning model that was competitive with OpenAI o1, and the paper that accompanied it (published Jan 22, 2025) became one of the most-read AI papers of the year. The technical story was that pure reinforcement learning post-training, without any supervised fine-tuning on human reasoning traces, could elicit chain-of-thought reasoning that generalized to held-out problems. The R1-Zero variant showed this most cleanly: starting from the V3 base, the team applied Group Relative Policy Optimization (GRPO) with a verifiable reward function and watched the model spontaneously develop longer reasoning traces over training. The full R1 added a small SFT cold-start to clean up readability before the RL phase. MIT-licensed weights and several distillations into smaller dense bases (1.5B, 7B, 8B, 14B, 32B, 70B Llama and Qwen variants) followed in the same release. The R1 distillations into 32B and below put genuinely capable reasoning models within reach of local deployment for the first time, and the GRPO recipe became the template that Qwen 3, Llama 4, and several Western labs followed in their own reasoning post-training.",
    known_limitations: [
      { text: "Long reasoning traces dominate output cost; expect 3-10x token output vs. non-reasoning chat models.", source: "https://arxiv.org/abs/2501.12948" },
    ],
  },
  "deepseek-r1-0528": {
    cost: { input_per_mtok_usd: 0.55, output_per_mtok_usd: 2.19, vendor: "DeepSeek API", as_of: AS_OF, source: AA, via_artificial_analysis: true },
    speed: { tokens_per_sec_output: 32, vendor: "DeepSeek API", as_of: AS_OF, source: AA, via_artificial_analysis: true },
    lineage: { parent: "deepseek-r1", note: "RL-only refresh; no new pretrain." },
    recommended_use_cases: ["math reasoning", "code reasoning", "agentic workflows"],
  },

  // ----- OLMo -----
  "olmo-2-7b-instruct": {
    cost: { input_per_mtok_usd: 0.15, output_per_mtok_usd: 0.15, vendor: "Together AI", as_of: AS_OF, source: AA, via_artificial_analysis: true },
    speed: { tokens_per_sec_output: 170, vendor: "Together AI", as_of: AS_OF, source: AA, via_artificial_analysis: true },
    lineage: { note: "Fully open: weights + Dolma pretraining data + training code + training logs." },
    recommended_use_cases: ["research reproducibility", "OSAID-compliant deployment", "fine-tuning base"],
    known_limitations: [
      { text: "5T-token pretrain is well below the 15-36T used by 2025-class open-weights releases; benchmark scores reflect this.", source: "https://allenai.org/blog/olmo2" },
    ],
  },

  // ----- Gemma -----
  "gemma-2-27b-it": {
    cost: { input_per_mtok_usd: 0.80, output_per_mtok_usd: 0.80, vendor: "Together AI", as_of: AS_OF, source: AA, via_artificial_analysis: true },
    speed: { tokens_per_sec_output: 100, vendor: "Together AI", as_of: AS_OF, source: AA, via_artificial_analysis: true },
    lineage: { note: "Distilled from a larger Gemini teacher; sibling line to the Gemini API." },
    recommended_use_cases: ["mid-tier deployment", "distillation reference", "Google-stack integration"],
    known_limitations: [
      { text: "Gemma Terms is source-available, not OSI-approved.", source: "https://ai.google.dev/gemma/terms" },
    ],
  },

  // ----- Phi -----
  "phi-4": {
    cost: { input_per_mtok_usd: 0.20, output_per_mtok_usd: 0.20, vendor: "Together AI", as_of: AS_OF, source: AA, via_artificial_analysis: true },
    speed: { tokens_per_sec_output: 140, vendor: "Together AI", as_of: AS_OF, source: AA, via_artificial_analysis: true },
    lineage: { note: "Continues the synthetic-data pretraining thesis from Phi-1 through Phi-3." },
    recommended_use_cases: ["mid-tier local deployment", "synthetic-data research reference"],
    known_limitations: [
      { text: "Heavy synthetic-data pretraining produces benchmark scores that don't always translate to open-ended deployment.", source: "https://arxiv.org/abs/2412.08905" },
    ],
  },

  // ----- Kimi -----
  "kimi-k2-instruct": {
    cost: { input_per_mtok_usd: 0.60, output_per_mtok_usd: 2.50, vendor: "Moonshot API", as_of: AS_OF, source: AA, via_artificial_analysis: true },
    speed: { tokens_per_sec_output: 45, vendor: "Moonshot API", as_of: AS_OF, source: AA, via_artificial_analysis: true },
    lineage: { note: "Moonshot's first widely-released open-weights MoE." },
    recommended_use_cases: ["agentic tool use", "code agent backend", "long-context tasks"],
  },

  // ----- Closed baselines -----
  "gpt-4": {
    cost: { input_per_mtok_usd: 30.00, output_per_mtok_usd: 60.00, vendor: "OpenAI API", as_of: AS_OF, source: AA, via_artificial_analysis: true },
    speed: { tokens_per_sec_output: 25, vendor: "OpenAI API", as_of: AS_OF, source: AA, via_artificial_analysis: true },
    lineage: { children: ["gpt-4o"] },
    recommended_use_cases: ["historical baseline (largely superseded by 4o)"],
  },
  "gpt-4o": {
    cost: { input_per_mtok_usd: 2.50, output_per_mtok_usd: 10.00, vendor: "OpenAI API", as_of: AS_OF, source: AA, via_artificial_analysis: true },
    speed: { tokens_per_sec_output: 110, vendor: "OpenAI API", as_of: AS_OF, source: AA, via_artificial_analysis: true },
    lineage: { parent: "gpt-4" },
    recommended_use_cases: ["multimodal chat", "voice interfaces", "general-purpose API workloads"],
    long_form: "GPT-4o was the May 2024 release that established native multimodal as the closed-frontier standard. \"o\" stood for \"omni\": a single pretrained backbone handling text, audio, and vision tokens, rather than separate models stitched together with adapters. The real-time voice mode pushed conversational latency below 400ms, a threshold past which interactions feel synchronous rather than turn-based, and the demo that accompanied the launch became the reference point for what AI voice products were expected to feel like. Pricing dropped to $2.50 per million input tokens and $10 per million output, a roughly 12x reduction from the original GPT-4. The open-weights world spent the second half of 2024 chasing this combination: Llama 3.1, Qwen 2.5, and DeepSeek V3 all positioned themselves as cheaper or comparable on text, but native multimodal at GPT-4o's latency remained out of reach until well into 2025. The model also became the default backend for ChatGPT free users, which made its capabilities and quirks visible to a global user base in a way no prior frontier model had been.",
    known_limitations: [
      { text: "Architecture and training data not disclosed; benchmarks reflect what OpenAI chose to publish.", source: "https://openai.com/index/hello-gpt-4o/" },
    ],
  },
  "o1": {
    cost: { input_per_mtok_usd: 15.00, output_per_mtok_usd: 60.00, vendor: "OpenAI API", as_of: AS_OF, source: AA, via_artificial_analysis: true },
    speed: { tokens_per_sec_output: 60, vendor: "OpenAI API", as_of: AS_OF, source: AA, via_artificial_analysis: true },
    lineage: { note: "First public reasoning model from OpenAI." },
    recommended_use_cases: ["math reasoning", "code reasoning", "complex multi-step problems"],
    long_form: "OpenAI o1 was the first publicly available frontier reasoning model and the existence proof for spending extra inference-time compute on a private chain of thought before answering. The September 2024 preview release and December 2024 GA established the template: the model produces a hidden reasoning trace (billed at output rates) before the user-visible answer, with benchmark scores on GPQA-Diamond and AIME that materially exceeded GPT-4o on the same architecture-and-data class. The pricing structure was new to the market: at $60 per million output tokens with reasoning traces consuming most of the output budget, a single hard problem could cost dollars rather than fractions of a cent. That created two follow-on stories. First, the open community responded with DeepSeek R1 four months later under MIT license, demonstrating that the reasoning recipe was within reach of organizations not at OpenAI's scale. Second, the reasoning-vs-cost framing made \"thinking budget\" a first-class deployment knob: subsequent OpenAI releases (o1-mini, o3, o3-mini) and competitor responses (Claude 3.7 extended thinking, Gemini 2.5 thinking) all let the developer dial how much inference compute to spend per request.",
    known_limitations: [
      { text: "Reasoning traces are billed as output tokens but not visible to the user; cost-per-problem can be hard to predict.", source: "https://openai.com/index/learning-to-reason-with-llms/" },
    ],
  },
  "claude-3-5-sonnet": {
    cost: { input_per_mtok_usd: 3.00, output_per_mtok_usd: 15.00, vendor: "Anthropic API", as_of: AS_OF, source: AA, via_artificial_analysis: true },
    speed: { tokens_per_sec_output: 85, vendor: "Anthropic API", as_of: AS_OF, source: AA, via_artificial_analysis: true },
    lineage: { children: ["claude-3-7-sonnet"] },
    recommended_use_cases: ["general chat", "code generation", "tool use", "Artifacts-style canvas interactions"],
    long_form: "Claude 3.5 Sonnet was the June 2024 release where a mid-tier model from a frontier lab decisively beat its own larger sibling. Claude 3 Opus from March had been the larger and more expensive offering; 3.5 Sonnet outperformed it across most benchmarks at one-fifth the price and twice the speed. The release also introduced Artifacts, a UI surface for code, diagrams, and document drafts rendered alongside the chat. Artifacts triggered a wave of product copies (canvas modes appeared in ChatGPT, Gemini, Mistral's chat product, and several open-weights wrappers within months) and established a new default expectation for what a chat interface was. On the API side, Claude 3.5 Sonnet held a leadership position on code benchmarks through most of late 2024 and became the default backend for early agentic coding tools (Cursor, Continue, Cline). The strategic story for Anthropic was that a smaller-faster-cheaper model from the mid tier could carry product surface area, which made Claude 3 Opus's slower follow-up effectively redundant; the model line skipped directly to 3.7 Sonnet in February 2025.",
    known_limitations: [
      { text: "Architecture not disclosed; comparisons rest on published benchmarks only.", source: "https://www.anthropic.com/news/claude-3-5-sonnet" },
    ],
  },
  "claude-3-7-sonnet": {
    cost: { input_per_mtok_usd: 3.00, output_per_mtok_usd: 15.00, vendor: "Anthropic API", as_of: AS_OF, source: AA, via_artificial_analysis: true },
    speed: { tokens_per_sec_output: 90, vendor: "Anthropic API", as_of: AS_OF, source: AA, via_artificial_analysis: true },
    lineage: { parent: "claude-3-5-sonnet" },
    recommended_use_cases: ["code agent backend", "extended-thinking math/code", "SWE-Bench-style tasks", "tool use"],
    long_form: "Claude 3.7 Sonnet was the first \"hybrid reasoning\" frontier model: standard and extended-thinking modes selectable per request, billed at the same input/output rates but with extended thinking consuming additional output tokens for the visible reasoning trace. The release in February 2025 paired the model with Claude Code, Anthropic's official agent harness, which made 3.7 Sonnet the default backend for serious coding-agent work through 2025. The SWE-Bench Verified score (70.3% at release) was the headline number: a closed reasoning model that could be asked to fix a real bug in a real repository and succeed at a rate that materially exceeded prior frontier models. The agentic story matters because it established \"the model that can act in your codebase\" as a distinct product category from \"the model that can answer questions about your codebase\", and Anthropic was the first frontier lab to commercialize that distinction. Open-weights catch-up arrived with Kimi K2 and DeepSeek's later releases, but Claude 3.7 Sonnet held the agentic-coding leadership position long enough to define what the category looked like.",
    known_limitations: [
      { text: "Extended-thinking mode bills the reasoning trace as output tokens; long-thinking requests can be 5-10x more expensive than standard mode.", source: "https://www.anthropic.com/news/claude-3-7-sonnet" },
    ],
  },
  "gemini-2-5-pro": {
    cost: { input_per_mtok_usd: 1.25, output_per_mtok_usd: 10.00, vendor: "Google API", as_of: AS_OF, source: AA, via_artificial_analysis: true },
    speed: { tokens_per_sec_output: 95, vendor: "Google API", as_of: AS_OF, source: AA, via_artificial_analysis: true },
    lineage: { note: "Continues the Gemini Pro line with native 1M-token context." },
    recommended_use_cases: ["long-context tasks", "multimodal reasoning", "general chat"],
    long_form: "Gemini 2.5 Pro was the first Gemini release to clearly lead on LMArena Elo, GPQA-Diamond, and AIME 2024 at the same time. Released in March 2025, it folded together Google's investments in long-context modeling (the 1M-token native window had been a Gemini differentiator since 1.5 Pro the previous February) and the reasoning-model wave o1 and R1 had established. The pricing structure (input under $1.25/M for prompts up to 200K, $2.50/M above; output at $10/M with extended thinking included) made it cheaper than Claude 3.7 Sonnet at the headline input rate but more expensive at high output volumes, which split the market between the two for production workloads. Google also published the Gemini 2.5 family across Pro, Flash, and Flash-Lite, with the smaller variants positioning aggressively against open-weights MoE on cost. Gemini's lasting differentiator through 2025 remained its multimodal handling (vision, video, and audio integrated more deeply than competing closed frontiers) and its native long-context performance, where benchmarks measuring needle-in-a-haystack retrieval at 1M tokens consistently favored Gemini 2.5 Pro over peers.",
    known_limitations: [
      { text: "Input pricing tier changes above 200K tokens; long-context use cases can cost 2x the headline rate.", source: "https://ai.google.dev/pricing" },
    ],
  },
};

/** Recursively walk an object and convert any Date instances back to
 *  YYYY-MM-DD strings. js-yaml parses YAML 1.1 timestamps into Date
 *  objects on load; without this step, the round-tripped YAML carries
 *  full ISO timestamps which break the display + comparison logic
 *  downstream. */
function dateToISOShort(v) {
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (Array.isArray(v)) return v.map(dateToISOShort);
  if (v && typeof v === "object") {
    const out = {};
    for (const [k, val] of Object.entries(v)) out[k] = dateToISOShort(val);
    return out;
  }
  return v;
}

function main() {
  const text = readFileSync(PATH, "utf-8");
  const parsed = yaml.load(text);
  const models = parsed?.models ?? [];

  let patched = 0;
  let unmatched = [];
  for (const m of models) {
    const p = PATCHES[m.slug];
    if (!p) continue;
    patched++;
    Object.assign(m, p);
  }
  for (const slug of Object.keys(PATCHES)) {
    if (!models.find((m) => m.slug === slug)) unmatched.push(slug);
  }

  const normalizedModels = dateToISOShort(models);

  // Force Date-shaped strings to dump as plain scalars (no quotes,
  // recognized as dates downstream).
  const out = yaml.dump({ models: normalizedModels }, {
    lineWidth: 120,
    noRefs: true,
    quotingType: '"',
    forceQuotes: false,
  });

  // Preserve the original file's leading comment block.
  const leadComment = text.match(/^([\s\S]*?)^models:\s*$/m);
  const header = leadComment ? leadComment[1] : "# Models catalog.\n";

  writeFileSync(PATH, header + "models:\n" + out.replace(/^models:\n/, ""));

  console.log(`[apply-model-extras] patched ${patched}/${models.length} models`);
  if (unmatched.length) console.log(`  unmatched patches: ${unmatched.join(", ")}`);
}

main();
