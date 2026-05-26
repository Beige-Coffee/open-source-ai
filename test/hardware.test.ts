import { test } from "node:test";
import assert from "node:assert/strict";
import {
  bytesPerParam,
  kvBytesPerToken,
  fitCheck,
  decodeRoofline,
  prefillTTFT,
  effectiveBandwidthBytesPerS,
  type Hardware,
} from "../src/lib/hardware.ts";
import type { Model } from "../src/lib/models.ts";

// Minimal model fixtures. Only the fields the calculator reads matter;
// the rest are cast away.
function model(partial: Partial<Model>): Model {
  return {
    slug: "x",
    display_name: "X",
    family: "x",
    developer: "x",
    developer_country: "US",
    type: "instruct",
    released_date: "2024-01-01",
    openness: "open-weights",
    license: "x",
    osi_approved: false,
    data_released: false,
    training_code_released: false,
    training_logs_released: false,
    architecture: "dense",
    params_total: 0,
    params_active: 0,
    context_window: 8192,
    attention_variant: "gqa",
    position_encoding: "rope",
    post_training: [],
    sources: [],
    ...partial,
  } as Model;
}

function hw(partial: Partial<Hardware>): Hardware {
  return {
    slug: "x",
    name: "X",
    vendor: "X",
    class: "workstation",
    memory_capacity_gb: 24,
    memory_type: "gddr6",
    memory_bandwidth_gbs: 1000,
    form_factor: "pcie",
    power_w: 300,
    interconnect: "pcie",
    multi_unit_default: 1,
    release_date: "2024-01",
    url: "https://example.com",
    sources: [],
    ...partial,
  } as Hardware;
}

const llama70b = model({
  params_total: 70e9,
  params_active: 70e9,
  architecture: "dense",
  attention_variant: "gqa",
  layers_count: 80,
  kv_heads: 8,
  head_dim: 128,
  hidden_size: 8192,
});

const rtx5090 = hw({ slug: "rtx-5090", memory_capacity_gb: 32, memory_bandwidth_gbs: 1792, memory_type: "gddr7", compute: { fp16_dense_tflops: 209.5 } });
const rtxPro6000 = hw({ slug: "rtx-pro-6000", memory_capacity_gb: 96, memory_bandwidth_gbs: 1792, memory_type: "gddr7" });
const h100sxm = hw({ slug: "h100", class: "datacenter", memory_capacity_gb: 80, memory_bandwidth_gbs: 3350, memory_type: "hbm3", interconnect: "nvlink", compute: { fp16_dense_tflops: 989, fp8_dense_tflops: 1979 } });
const h200sxm = hw({ slug: "h200", class: "datacenter", memory_capacity_gb: 141, memory_bandwidth_gbs: 4800, memory_type: "hbm3e", interconnect: "nvlink", compute: { fp16_dense_tflops: 989, fp8_dense_tflops: 1979 } });

test("bytesPerParam: format table", () => {
  assert.equal(bytesPerParam("fp16"), 2.0);
  assert.equal(bytesPerParam("fp8"), 1.0);
  assert.equal(bytesPerParam("q4_k_m"), 0.56);
  assert.equal(bytesPerParam("q2_k"), 0.33);
});

test("kvBytesPerToken: Llama-2-7B MHA is ~0.5 MiB/token at FP16", () => {
  const m = model({ params_total: 7e9, params_active: 7e9, attention_variant: "mha", layers_count: 32, kv_heads: 32, head_dim: 128 });
  const kv = kvBytesPerToken(m, 2);
  assert.equal(kv.bytes_per_token, 524288); // 0.5 MiB
  assert.equal(kv.estimated, false);
});

test("kvBytesPerToken: FP8 KV halves the FP16 figure", () => {
  const m = model({ attention_variant: "mha", layers_count: 32, kv_heads: 32, head_dim: 128 });
  assert.equal(kvBytesPerToken(m, 1).bytes_per_token, 262144);
});

test("example 1: 70B FP16 does NOT fit a 32GB RTX 5090; ceiling ~12.8 tok/s", () => {
  const fit = fitCheck(llama70b, rtx5090, { quant: "fp16", contextLength: 512, kvPrecisionBytes: 2, numUnits: 1, runtime: "llama.cpp", concurrency: 1 });
  assert.equal(fit.fits, false);
  assert.ok(fit.weightsBytes === 140e9, `weights should be 140 GB, got ${fit.weightsBytes}`);

  const dec = decodeRoofline(llama70b, rtx5090, { quant: "fp16", contextLength: 512, kvPrecisionBytes: 2, numUnits: 1, runtime: "llama.cpp" });
  assert.ok(dec.ceilingTokS > 11.5 && dec.ceilingTokS < 13.5, `ceiling ~12.8, got ${dec.ceilingTokS}`);
});

test("example 2: 70B Q4 fits a 96GB RTX PRO 6000; ceiling in a plausible band", () => {
  const fit = fitCheck(llama70b, rtxPro6000, { quant: "q4_k_m", contextLength: 4096, kvPrecisionBytes: 2, numUnits: 1, runtime: "llama.cpp", concurrency: 1 });
  assert.equal(fit.fits, true);
  // Same Q4 weights (~39 GB) do NOT fit a 32GB 5090.
  const fit5090 = fitCheck(llama70b, rtx5090, { quant: "q4_k_m", contextLength: 4096, kvPrecisionBytes: 2, numUnits: 1, runtime: "llama.cpp", concurrency: 1 });
  assert.equal(fit5090.fits, false);

  const dec = decodeRoofline(llama70b, rtxPro6000, { quant: "q4_k_m", contextLength: 4096, kvPrecisionBytes: 2, numUnits: 1, runtime: "llama.cpp" });
  assert.ok(dec.ceilingTokS > 38 && dec.ceilingTokS < 55, `ceiling ~44, got ${dec.ceilingTokS}`);
  // Realistic band is ceiling * llama.cpp MBU [0.5, 0.75].
  assert.ok(dec.lowTokS < dec.ceilingTokS && dec.highTokS < dec.ceilingTokS);
});

test("example 3: DeepSeek-V3 MoE fit uses total params; decode uses active", () => {
  const dsv3 = model({
    params_total: 671e9,
    params_active: 37e9,
    architecture: "moe",
    attention_variant: "mla",
    layers_count: 61,
    kv_bytes_per_token_fp16: 61 * 576 * 2, // compressed MLA latent
  });
  // Fit uses TOTAL (671 GB at FP8): fails on 8x H100 (640 GB), passes on 8x H200 (1128 GB).
  const onH100 = fitCheck(dsv3, h100sxm, { quant: "fp8", contextLength: 4096, kvPrecisionBytes: 2, numUnits: 8, runtime: "vllm", concurrency: 1 });
  const onH200 = fitCheck(dsv3, h200sxm, { quant: "fp8", contextLength: 4096, kvPrecisionBytes: 2, numUnits: 8, runtime: "vllm", concurrency: 1 });
  assert.equal(onH100.fits, false, "671 GB should not fit 8x H100 (640 GB)");
  assert.equal(onH200.fits, true, "671 GB should fit 8x H200 (1128 GB)");

  // Decode uses ACTIVE (37B), so bytes_per_step is far smaller than a
  // dense 671B would be. Compare against a hypothetical dense 671B.
  const dec = decodeRoofline(dsv3, h200sxm, { quant: "fp8", contextLength: 4096, kvPrecisionBytes: 2, numUnits: 8, runtime: "vllm" });
  assert.ok(dec.activeWeightsBytes === 37e9, `active weights 37 GB, got ${dec.activeWeightsBytes}`);
  // active-driven ceiling is much higher than a total-driven one would be.
  const totalDriven = dec.effectiveBandwidthBytesPerS / (671e9);
  assert.ok(dec.ceilingTokS > 10 * totalDriven, "active-param decode should be ~18x faster than total-param");
});

test("effectiveBandwidth: single unit unchanged; multi-unit scaled by interconnect", () => {
  assert.equal(effectiveBandwidthBytesPerS(h100sxm, 1), 3350e9);
  // 8x over NVLink (0.9 efficiency).
  assert.ok(Math.abs(effectiveBandwidthBytesPerS(h100sxm, 8) - 3350e9 * 8 * 0.9) < 1);
});

test("prefillTTFT: returns null when the chip has no sourced compute", () => {
  assert.equal(prefillTTFT(llama70b, rtxPro6000, { quant: "q4_k_m", promptTokens: 4096, numUnits: 1 }), null);
  const p = prefillTTFT(llama70b, h100sxm, { quant: "fp8", promptTokens: 4096, numUnits: 8 });
  assert.ok(p && p.ttftMs > 0);
});

// ---------------------------------------------------------------------------
// Calibration regression: measured anchors on Strix Halo (256 GB/s).
// ---------------------------------------------------------------------------

const strixHalo = hw({ slug: "strix-halo", class: "x86-unified", memory_capacity_gb: 128, memory_bandwidth_gbs: 256, memory_type: "unified-lpddr5x", interconnect: "none" });
const rtx4090 = hw({ slug: "rtx-4090", class: "workstation", memory_capacity_gb: 24, memory_bandwidth_gbs: 1008, memory_type: "gddr6x", interconnect: "pcie", compute: { fp16_dense_tflops: 165.2 } });

const gemma26ba4b = model({ params_total: 26e9, params_active: 3.8e9, architecture: "moe", attention_variant: "gqa", layers_count: 48, head_dim: 256, kv_heads: 4, kv_bytes_per_token_fp16: 60000 });
const dense31 = model({ params_total: 31e9, params_active: 31e9, architecture: "dense", attention_variant: "gqa", layers_count: 48, head_dim: 256, kv_heads: 4, kv_bytes_per_token_fp16: 60000 });
const qwen35ba3b = model({ params_total: 35e9, params_active: 3e9, architecture: "moe", attention_variant: "gqa", layers_count: 48, head_dim: 128, kv_heads: 4 });
const qwen122ba10b = model({ params_total: 122e9, params_active: 10e9, architecture: "moe", attention_variant: "gqa", layers_count: 62, head_dim: 128, kv_heads: 4 });
const llama8b = model({ params_total: 8.03e9, params_active: 8.03e9, architecture: "dense", attention_variant: "gqa", layers_count: 32, head_dim: 128, kv_heads: 8 });

test("Measured anchor: Gemma 4 26B-A4B Q8 on Strix Halo decodes mid-50s, not single digits", () => {
  const d = decodeRoofline(gemma26ba4b, strixHalo, { quant: "q8_0", contextLength: 512, kvPrecisionBytes: 2, numUnits: 1, runtime: "llama.cpp" });
  // measured ~57 tok/s; the optimistic end of the band must land within ~20%.
  assert.ok(d.highTokS >= 46 && d.highTokS <= 68, `Gemma 26B-A4B high ~57, got ${d.highTokS.toFixed(1)}`);
  assert.ok(d.lowTokS >= 35, `low end should be sane, got ${d.lowTokS.toFixed(1)}`);
  // The headline bug: the dense 31B it was confused with is single digits.
  const dd = decodeRoofline(dense31, strixHalo, { quant: "q8_0", contextLength: 512, kvPrecisionBytes: 2, numUnits: 1, runtime: "llama.cpp" });
  assert.ok(dd.highTokS < 10, `dense 31B Q8 should be single digits, got ${dd.highTokS.toFixed(1)}`);
  assert.ok(d.highTokS > 5 * dd.highTokS, "MoE must decode ~order-of-magnitude faster than the dense 31B");
});

test("Measured anchor: Qwen3.5 35B-A3B Q8 on Strix Halo decodes ~68 tok/s", () => {
  const d = decodeRoofline(qwen35ba3b, strixHalo, { quant: "q8_0", contextLength: 512, kvPrecisionBytes: 2, numUnits: 1, runtime: "llama.cpp" });
  assert.ok(d.highTokS >= 54 && d.highTokS <= 82, `Qwen 35B-A3B high ~68, got ${d.highTokS.toFixed(1)}`);
});

test("Anchor: Llama 3 8B Q4 on RTX 4090 band brackets the measured 127.7 tok/s", () => {
  const d = decodeRoofline(llama8b, rtx4090, { quant: "q4_k_m", contextLength: 1024, kvPrecisionBytes: 2, numUnits: 1, runtime: "llama.cpp" });
  assert.ok(127.7 >= d.lowTokS && 127.7 <= d.highTokS, `band should bracket 127.7, got ${d.lowTokS.toFixed(0)}-${d.highTokS.toFixed(0)}`);
});

test("fit uses TOTAL params, decode uses ACTIVE: 26B-A4B MoE vs dense 26B", () => {
  const dense26 = model({ params_total: 26e9, params_active: 26e9, architecture: "dense", attention_variant: "gqa", layers_count: 48, head_dim: 256, kv_heads: 4, kv_bytes_per_token_fp16: 60000 });
  const args = { quant: "q8_0", contextLength: 4096, kvPrecisionBytes: 2, numUnits: 1, runtime: "llama.cpp" } as const;
  const fitMoE = fitCheck(gemma26ba4b, strixHalo, { ...args, concurrency: 1 });
  const fitDense = fitCheck(dense26, strixHalo, { ...args, concurrency: 1 });
  // Same total params -> same weight footprint -> same fit.
  assert.ok(Math.abs(fitMoE.weightsBytes - fitDense.weightsBytes) < 1, "MoE and dense 26B have the same memory footprint");
  assert.equal(fitMoE.fits, fitDense.fits);
  // But decode is much faster for the MoE (3.8B vs 26B active).
  const decMoE = decodeRoofline(gemma26ba4b, strixHalo, args);
  const decDense = decodeRoofline(dense26, strixHalo, args);
  assert.ok(decMoE.highTokS > 4 * decDense.highTokS, `MoE decode should be >4x dense, got ${decMoE.highTokS.toFixed(1)} vs ${decDense.highTokS.toFixed(1)}`);
});

test("monotonicity: decode falls as quant precision, context, and active params rise", () => {
  const base = { contextLength: 4096, kvPrecisionBytes: 2, numUnits: 1, runtime: "llama.cpp" } as const;
  // quant precision up -> slower
  const q4 = decodeRoofline(gemma26ba4b, strixHalo, { ...base, quant: "q4_k_m" });
  const fp16 = decodeRoofline(gemma26ba4b, strixHalo, { ...base, quant: "fp16" });
  assert.ok(q4.highTokS > fp16.highTokS, "lower precision must be faster");
  // context up -> slower
  const ctxLow = decodeRoofline(gemma26ba4b, strixHalo, { quant: "q8_0", contextLength: 2048, kvPrecisionBytes: 2, numUnits: 1, runtime: "llama.cpp" });
  const ctxHigh = decodeRoofline(gemma26ba4b, strixHalo, { quant: "q8_0", contextLength: 131072, kvPrecisionBytes: 2, numUnits: 1, runtime: "llama.cpp" });
  assert.ok(ctxLow.highTokS > ctxHigh.highTokS, "longer context must be slower");
  // active params up -> slower (122B-A10B slower than 35B-A3B at same quant)
  const a10 = decodeRoofline(qwen122ba10b, strixHalo, { ...base, quant: "q4_k_m" });
  const a3 = decodeRoofline(qwen35ba3b, strixHalo, { ...base, quant: "q4_k_m" });
  assert.ok(a3.highTokS > a10.highTokS, "fewer active params must be faster");
});

test("compute-bound cap is computed when the chip has dense FLOPS and never below the memory bound's spirit", () => {
  // On a high-FLOPS chip, decode stays memory-bound (compute bound is far higher).
  const d = decodeRoofline(qwen35ba3b, h100sxm, { quant: "q2_k", contextLength: 512, kvPrecisionBytes: 1, numUnits: 1, runtime: "vllm" });
  assert.ok(d.computeBoundTokS !== undefined, "compute bound should be defined when the chip has FLOPS");
  assert.ok(d.ceilingTokS <= (d.computeBoundTokS as number) + 1e-6, "ceiling never exceeds the compute bound");
  // Strix Halo has no sourced compute -> no cap.
  const noCap = decodeRoofline(qwen35ba3b, strixHalo, { quant: "q2_k", contextLength: 512, kvPrecisionBytes: 1, numUnits: 1, runtime: "llama.cpp" });
  assert.equal(noCap.computeBoundTokS, undefined);
});
