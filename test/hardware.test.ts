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
