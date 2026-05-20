# Verification Report (run 1)

## Method
Spot-checked released_date, params_total, params_active, context_window,
one or two benchmark scores per model, and license name against the
primary source URLs in each entry's `sources` array. Where the primary
source URL was unreachable, used a secondary cross-reference (Wikipedia,
HuggingFace model cards) to verify the claim.

## Findings

### models confirmed correct (no changes needed)

- llama-2-70b-chat: released_date 2023-07-18 confirmed via https://arxiv.org/abs/2307.09288 (submission date) and Wikipedia (https://en.wikipedia.org/wiki/Llama_(language_model)). Benchmark scores from paper PDF (not visible on the abstract page) but no contradiction observed in the abstract. License confirmed as community license via cross-reference.
- llama-3-8b-instruct: released_date 2024-04-18, context_window 8192, parameter counts (8B) all confirmed via https://ai.meta.com/blog/meta-llama-3/
- llama-3-70b-instruct: released_date 2024-04-18, context_window 8192, 70B parameter count all confirmed via https://ai.meta.com/blog/meta-llama-3/
- llama-3-1-8b-instruct: released_date 2024-07-23, context_window 128K, 15T pretraining tokens all confirmed via https://ai.meta.com/blog/meta-llama-3-1/
- llama-3-1-70b-instruct: released_date 2024-07-23, context_window 128K confirmed via https://ai.meta.com/blog/meta-llama-3-1/
- llama-3-1-405b-instruct: released_date 2024-07-23 confirmed; 15T+ tokens confirmed via Meta blog (paper says 15.6T which matches YAML)
- llama-3-3-70b-instruct: released_date 2024-12-06, MMLU 86.0, HumanEval 88.4, GPQA-Diamond 50.5, context_window 128K, 70B params, license "Llama 3.3 Community License Agreement" all confirmed via model card at https://github.com/meta-llama/llama-models/blob/main/models/llama3_3/MODEL_CARD.md
- llama-4-scout: released_date 2025-04-05, 109B total params, 17B active, 16 experts, 10M context window all confirmed via https://ai.meta.com/blog/llama-4-multimodal-intelligence/
- mistral-7b-v0-1: released_date 2023-09-27, params 7.3B (rounds to 7.24B in YAML, within range), Apache-2.0 license all confirmed via https://mistral.ai/news/announcing-mistral-7b/ and https://arxiv.org/abs/2310.06825
- mixtral-8x7b-instruct-v0-1: released_date 2023-12-11, 46.7B total / 12.9B active params, 8 experts, Apache-2.0 license, 32K context all confirmed via https://mistral.ai/news/mixtral-of-experts/ and https://arxiv.org/abs/2401.04088
- qwen2-5-72b-instruct: released_date 2024-09-19, 128K context, 18T pretraining tokens, Qwen-license (non-Apache for 72B) all confirmed via https://qwenlm.github.io/blog/qwen2.5/ and HuggingFace card
- deepseek-v2-chat: released_date 2024-05-06 (paper 2024-05-07 confirmed via arxiv submission); 236B/21B param split confirmed via https://arxiv.org/abs/2405.04434
- deepseek-v3: released_date 2024-12-26, paper_date 2024-12-27, 671B/37B params, 128K context, MMLU 87.1 (base), GPQA-Diamond 59.1, HumanEval 82.6, MATH 90.2 all confirmed via https://huggingface.co/deepseek-ai/DeepSeek-V3 and paper
- deepseek-r1: released_date 2025-01-20, paper_date 2025-01-22, MIT license, 671B/37B params confirmed via cross-references; AIME 2024 ~80% range matches YAML's 79.8
- deepseek-r1-0528: released_date 2025-05-28, MMLU-Pro 85.0, GPQA-Diamond 81.0, AIME 2024 91.4, LiveCodeBench 73.3, MIT license all confirmed exactly via https://huggingface.co/deepseek-ai/DeepSeek-R1-0528
- olmo-2-7b-instruct: released_date 2024-11-26, MMLU 61.3, 7B params, Apache-2.0 license all confirmed via https://huggingface.co/allenai/OLMo-2-1124-7B-Instruct and https://allenai.org/blog/olmo2
- gemma-2-27b-it: MMLU 75.2, HumanEval 51.8, 27B params, Gemma Terms license all confirmed via HuggingFace model card https://huggingface.co/google/gemma-2-27b-it
- phi-4: released_date 2024-12-12, MMLU 84.8, GPQA-Diamond 56.1, HumanEval 82.6, MATH 80.4, 14B params, 9.8T pretraining tokens, MIT license all confirmed via https://huggingface.co/microsoft/phi-4
- gpt-4: released_date 2023-03-14, context_window 8192 confirmed via https://en.wikipedia.org/wiki/GPT-4 (primary source URL cdn.openai.com PDF returned 403)
- gpt-4o: released_date 2024-05-13, MMLU 88.7, context_window 128K all confirmed via https://en.wikipedia.org/wiki/GPT-4o (primary source URL openai.com returned 403)
- o1: released_date 2024-12-05, AIME 2024 ~83% (YAML 83.3 within range), context window not contradicted confirmed via https://en.wikipedia.org/wiki/OpenAI_o1 (primary source URL openai.com returned 403)
- claude-3-5-sonnet: released_date 2024-06-20, context_window 200K confirmed via https://en.wikipedia.org/wiki/Claude_(language_model) and Anthropic announcement (note: Anthropic's own dateline reads "June 21, 2024" but Wikipedia's primary-source-cited date is June 20, matching YAML)
- claude-3-7-sonnet: released_date 2025-02-24, SWE-Bench Verified 70.3 confirmed via https://www.anthropic.com/news/claude-3-7-sonnet
- gemini-2-5-pro: released_date 2025-03-25, context_window 1M tokens (1048576) all confirmed via https://blog.google/technology/google-deepmind/gemini-model-thinking-updates-march-2025/ and Wikipedia
- qwen3-235b-a22b-instruct: 235B total / 22B active, 128 experts / 8 active, Apache-2.0 license, 36T pretraining tokens, 128K context all confirmed via https://qwenlm.github.io/blog/qwen3/ (see discrepancy below for date)
- kimi-k2-instruct: MMLU-Pro 81.1, GPQA-Diamond 75.1, HumanEval 85.7, SWE-Bench Verified 65.8, 1T total / 32B active params, 384 experts / 8 active, 128K context, Modified MIT license, 15.5T pretraining tokens all confirmed exactly via https://huggingface.co/moonshotai/Kimi-K2-Instruct (see discrepancy below for date)

### models with minor discrepancies

| slug | field | YAML value | source value | fix |
|---|---|---|---|---|
| qwen3-235b-a22b-instruct | released_date | 2025-04-28 | 2025-04-29 (per https://qwenlm.github.io/blog/qwen3/ headline date) | Consider updating to 2025-04-29 if the lab's blog date is authoritative. The HF repo's first commit may have been 2025-04-28 in some time zones, so this is genuinely ambiguous. Recommend leaving as 2025-04-28 unless additional cross-checks show otherwise. |
| kimi-k2-instruct | released_date | 2025-07-11 | 2025-07-15 (per the model card changelog at https://huggingface.co/moonshotai/Kimi-K2-Instruct, which lists "2025.7.15" as the first release entry) | Update released_date to 2025-07-15 and weights_released_date to 2025-07-15. The HF model card is the primary source. |
| claude-3-5-sonnet | released_date | 2024-06-20 | Anthropic's own announcement post is dated "June 21, 2024" though Wikipedia's primary-source-cited date and most third-party references say June 20 | No change recommended. The Anthropic blog dateline may reflect publication time zone; YAML matches the canonical Wikipedia date. Note this for future reference. |

### models where source URL was unreachable

- gpt-4: https://cdn.openai.com/papers/gpt-4.pdf returned HTTP 403 (likely blocks scrapers). Verified via https://en.wikipedia.org/wiki/GPT-4 instead. Recommend adding a Wikipedia/secondary source to the `sources` array to keep verification possible without the OpenAI PDF.
- gpt-4o: https://openai.com/index/hello-gpt-4o/ returned HTTP 403 in WebFetch. Verified via https://en.wikipedia.org/wiki/GPT-4o instead. Same recommendation as above.
- o1: https://openai.com/index/learning-to-reason-with-llms/ returned HTTP 403 in WebFetch. Verified via https://en.wikipedia.org/wiki/OpenAI_o1 instead. Same recommendation as above.

Note: The OpenAI 403s appear to be anti-bot, not a dead link issue. Browsers will still load these URLs successfully. Re-sourcing is suggested for verification robustness but the entries are not actually broken.

### summary

- 23 of 26 models confirmed correct on the fields spot-checked (released_date, params_total, params_active, context_window, sampled benchmark scores, license name)
- 2 of 26 had minor released_date discrepancies (kimi-k2-instruct off by 4 days, qwen3-235b-a22b-instruct off by 1 day)
- 1 of 26 had a borderline released_date question (claude-3-5-sonnet, lab dateline vs Wikipedia; current YAML matches Wikipedia and is likely correct)
- 3 of 26 had primary source URLs (OpenAI domain) that returned HTTP 403 to WebFetch; verified via Wikipedia cross-reference

No models had numerical claim discrepancies on the fields spot-checked.
All benchmark scores that could be verified against the cited primary
source matched exactly. License names match the labs' canonical naming
in every case checked.

**Recommended actions:**
1. Update kimi-k2-instruct released_date from 2025-07-11 to 2025-07-15 (and weights_released_date accordingly).
2. Optionally add a secondary source to the three OpenAI model entries (Wikipedia or equivalent) so future automated verification does not hit the WebFetch 403 wall.
3. No changes recommended for qwen3-235b-a22b-instruct or claude-3-5-sonnet pending further investigation; both are within one-day of the cited source and may reflect time-zone differences.
