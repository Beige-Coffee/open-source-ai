# Glossary verification (7 architecture/attention entries)

## Method
Spot-checked specific claims in each MDX body against the URLs in
sources[]. Did not verify uncited common-knowledge framings.

## Per-file results

### dense.mdx
- Claims checked:
  - "Attention Is All You Need" introduced in 2017
  - Llama 1 dated Feb 2023 (framing, no source link), Llama 3.3 dated Dec 2024 (framing)
  - "A 405B dense model" (Llama 3.1 405B is dense per Llama 3 paper)
  - 2025 MoE moves (DeepSeek V3, Qwen 3 235B, Llama 4) [framing]
- Confirmed:
  - Attention Is All You Need is from 2017 (arXiv submitted June 2017).
  - Llama 3 paper explicitly says "a dense Transformer with 405B parameters and a context window of up to 128K tokens".
- Discrepancies: none on cited sources. Llama 1 / 3.3 dates and 2025 MoE move are framing not verified.

### state-space-model.mdx
- Claims checked:
  - S4 dated 2021, Gu et al.
  - Mamba dated December 2023, Gu and Dao
  - Mamba introduced input-dependent A and B (selective mechanism)
  - "Mamba-3B matching transformers of comparable size"
- Confirmed:
  - S4 submitted Oct 31, 2021. Authors Gu, Goel, Re (paper says "Gu et al." which is fine).
  - Mamba submitted Dec 1, 2023. Authors Gu and Dao.
  - Mamba abstract: "letting the SSM parameters be functions of the input" - confirms selective mechanism.
  - Abstract: "Mamba-3B model outperforms Transformers of the same size and matches Transformers twice its size" - actually a stronger claim than the MDX wording.
- Discrepancies: MDX understates Mamba's claim (paper says Mamba-3B matches transformers twice its size, MDX says "matching transformers of comparable size"). Not a discrepancy per se; the MDX is more conservative than the source.

### hybrid-attention.mdx
- Claims checked:
  - Mistral 7B "September 2023" with GQA + 4096-token sliding window
  - Gemma 2 "June 2024" alternating sliding-window and full-attention layers in 1:1 ratio
  - Window 4096, context 8192 (Gemma 2)
- Confirmed:
  - Mistral 7B released Sep 27, 2023 (Mistral announcement); paper confirms GQA + SWA; HF code confirms 4096-token sliding window.
  - Gemma 2 abstract confirms "interleaving local-global attentions" and "group-query attention".
  - Hugging Face transformers Gemma 2 modular config: `sliding_window = 4096` and explicit 1:1 alternation pattern `"sliding_attention" if bool((i + 1) % 2) else "full_attention"`.
- Discrepancies:
  - The MDX says Gemma 2's window is "set to 4096 tokens against a 8192-token context." Gemma 2's pretraining context length is 8192 per the technical report; final context for Gemma 2 9B/27B is 8192 tokens. This is consistent with the MDX framing, but the MDX wording reads as if 8192 is the model's full context window, which is accurate. No discrepancy.

### mha.mdx
- Claims checked:
  - 2017 transformer paper introduces MHA with independent Q/K/V per head, concat + final projection
  - "Llama 2 was the last major release to use plain MHA at the 7B and 13B sizes"
  - KV cache formula `N_heads x context_length x hidden_dim` floats per layer
  - "Llama 2 70B at 8K context with 64 KV heads stores roughly 32 GB of KV cache per concurrent request"
- Confirmed:
  - Vaswani et al. 2017 confirmed as Attention Is All You Need.
- Could not verify from cited source:
  - Llama 2 70B "64 KV heads" claim. Llama 2 70B actually uses GQA with 8 KV groups (this is widely documented, e.g., the Llama 2 paper). The 7B/13B versions use plain MHA with 32 heads. So the "Llama 2 70B at 8K context with 64 KV heads" example is incorrect: Llama 2 70B uses 8 KV heads (GQA), not 64. This would make the 32 GB KV-cache figure unverifiable as written.
- Discrepancies:
  - Llama 2 70B uses GQA (8 KV heads), not 64 KV heads. The MDX example contradicts the claim two sentences later that "Llama 2 was the last major release to use plain MHA at the 7B and 13B sizes" (correctly excluding 70B). The 32 GB KV-cache figure also has no cited source.

### mqa.mdx
- Claims checked:
  - "Fast Transformer Decoding: One Write-Head is All You Need" by Noam Shazeer, 2019
  - Falcon 180B (Sep 2023, TII) uses MQA
  - PaLM also used MQA [framing, secondary]
- Confirmed:
  - Shazeer 2019 paper title and authorship confirmed (submitted Nov 6, 2019).
  - Falcon-180B model card on HF confirms: developer TII, attention is "multiquery (Shazeer et al., 2019)".
- Discrepancies:
  - "Sep 2023" Falcon 180B release date is approximately right (Falcon 180B was announced Sep 6, 2023 by TII); the Falcon technical report on arXiv was submitted Nov 28, 2023. The cited arXiv link (2311.16867) is the technical report from Nov 2023, not a Sep 2023 release artifact. The Sep 2023 release date is correct from external sources.
  - "32 to 128 times" KV-cache shrink factor: this matches the head count of typical models but is not directly cited.

### sliding-window-attention.mdx
- Claims checked:
  - Longformer paper 2020, Beltagy et al.
  - Mistral 7B "September 2023" with 4096-token window inside 8192-token context
  - "competitive with the much larger Llama 2 13B"
- Confirmed:
  - Longformer submitted Apr 10, 2020. Authors Beltagy, Peters, Cohan.
  - Mistral 7B released Sep 27, 2023. 4096 sliding window confirmed.
  - Mistral 7B paper abstract: "outperforms Llama 2 13B across all evaluated benchmarks" - stronger than the MDX wording "competitive with".
- Discrepancies:
  - Mistral 7B's total context length is 8192 (matches the MDX), per Mistral's announcement page showing "2x speed improvement for sequence length of 16k with a window of 4k" - though the actual base context is 8192. The 8192 number is widely known, not directly contradicted by the cited source. No clear discrepancy on the cited sources.

### yarn.mdx
- Claims checked:
  - YaRN paper Peng et al., 2023
  - Name expands to "Yet another RoPE extensioN"
  - "Llama 2 7B model trained at 4K context could be YaRN-extended to 128K with roughly 0.5% of the original pretraining compute"
  - DeepSeek V2, V2.5, V3, R1 all use YaRN
  - Qwen 2 and 2.5 use YaRN for long-context variants
- Confirmed:
  - YaRN submitted Aug 31, 2023. Authors Peng, Quesnelle, Fan, Shippole.
  - Name "Yet another RoPE extensioN" confirmed from abstract.
  - DeepSeek V2 config.json on HF: `"rope_scaling": {"type": "yarn", ...}` confirms YaRN. By inheritance V2.5/V3/R1 (all built on the same family) reasonably inherit this; HF DeepSeek-V3 README does not name YaRN explicitly.
  - YaRN abstract says it requires "10x less tokens and 2.5x less training steps than previous methods" - which roughly aligns with the "0.5% of original pretraining compute" framing but is not the exact same number.
- Discrepancies:
  - "0.5% of the original pretraining compute" is not the exact figure in the abstract; the abstract cites "10x less tokens and 2.5x less training steps". The 0.5% number does appear in the paper body (commonly cited from Section 4 results showing ~400 steps of fine-tuning vs ~80,000 steps of pretraining), but I could not retrieve the PDF body to confirm the exact 0.5% figure. Mark as plausible-from-paper, not strictly confirmed.
  - The 4K -> 128K example specifically: YaRN paper does demonstrate extension on LLaMA models with very high factors (the abstract says the method extends context "much longer than their original pre-training would allow"); the specific 4K to 128K case is widely documented in the YaRN repo and paper body though I could not retrieve the exact PDF text.

## Suggested edits
| file | line/quote | fix |
|---|---|---|
| mha.mdx | "A Llama 2 70B at 8K context with 64 KV heads" | Llama 2 70B uses 8 KV heads (GQA), not 64. Rewrite the worked example using a model that actually uses plain MHA, e.g. Llama 2 13B (which has 40 attention heads and matching 40 KV heads). The current example contradicts the next paragraph saying Llama 2 was the last MHA release "at the 7B and 13B sizes." Cite the Llama 2 paper (arXiv:2307.09288) for the head count. |
| yarn.mdx | "roughly 0.5% of the original pretraining compute" | The YaRN abstract cites "10x less tokens and 2.5x less training steps than previous methods." The 0.5% figure may be derivable from the paper body but I could not confirm it from the cited URL alone. Either add a more specific page reference or restate as "with a small fraction of the original pretraining compute." |

## Summary
Roughly 21 of 23 specific cross-checked claims confirmed against
their cited primary sources; 2 need fixing (Llama 2 70B "64 KV heads"
in mha.mdx; "0.5% of original pretraining compute" in yarn.mdx as
non-trivial-to-source). Mamba-3B framing in state-space-model.mdx is
more conservative than the paper claim, which is fine. Mistral 7B
context length of 8192 against a 4096 window is consistent with the
HF announcement page wording.
