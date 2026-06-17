import { useState } from "react";
import {
  RUNTIME_PROFILES,
  QUANT_FORMATS,
  bytesPerParam,
  quantLabel,
  kvBytesPerToken,
  formatGB,
  type Runtime,
} from "../lib/hardware";
import type { Model } from "../lib/models";

/**
 * The Recipe Strip: a hardware-independent educational panel that sits below
 * the explorer's shared controls and recomputes the model's memory recipe and
 * the meaning of each knob as the learner changes a selection.
 *
 * Every number is bound to the same helpers the hardware cards use, so the
 * strip and the cards can never disagree. Nothing here references a specific
 * box: weights, KV, and overhead depend only on model + quant + context + KV
 * precision + runtime. Whether a config fits a given box stays on the cards.
 *
 * Accuracy rules honored here: the recipe line branches on the runtime's fit
 * model (additive vs capacity-capped); the KV figure carries an "(est)" tag
 * when the model's attention geometry is estimated; quant alternates bind to
 * total params; decode/stream size uses active params only for MoE; FP8 KV is
 * described as freeing memory, not as speeding decode.
 */

const GB = 1e9;

// Runtime id -> glossary slug, where an entry exists.
const RT_GLOSSARY: Record<string, string> = {
  "llama.cpp": "llama-cpp",
  vllm: "vllm",
  sglang: "sglang",
  mlx: "mlx",
};

function fmtCtx(n: number): string {
  return n >= 1000 ? `${Math.round(n / 1000)}K` : `${n}`;
}

// Per-token KV is sub-MB, so formatGB (which floors to "0 MB") is wrong here.
function perToken(bytes: number): string {
  return bytes >= 1e6 ? `${(bytes / 1e6).toFixed(1)} MB` : `${Math.round(bytes / 1e3)} KB`;
}

interface Props {
  model: Model;
  quant: string;
  ctx: number;
  kvBytes: number; // 1 (FP8) or 2 (FP16)
  runtime: Runtime;
}

function Glossary({ slug, children }: { slug: string; children: string }) {
  return (
    <a href={`/glossary/${slug}`} className="text-[var(--color-text-muted)] underline decoration-dotted hover:text-[var(--color-text)] no-underline hover:underline">
      {children}
    </a>
  );
}

export default function RecipeStrip({ model, quant, ctx, kvBytes, runtime }: Props) {
  const [open, setOpen] = useState(true);

  const bpp = bytesPerParam(quant);
  const fmt = QUANT_FORMATS.find((f) => f.id === quant);
  const profile = RUNTIME_PROFILES[runtime];
  const additive = profile.kind === "additive";

  const weightsBytes = model.params_total * bpp;
  const kv = kvBytesPerToken(model, kvBytes);
  const est = kv.estimated;
  const kvBytesTotal = kv.bytes_per_token * ctx;
  const overheadBytes = additive
    ? profile.fixed_gb * GB + profile.weight_fraction * weightsBytes
    : profile.fixed_gb * GB;
  const requiredBytes = weightsBytes + kvBytesTotal + overheadBytes;

  const isMoE = model.params_active > 0 && model.params_active < model.params_total;
  const streamBytes = isMoE ? model.params_active * bpp : weightsBytes;

  // Quant teaching reference points (always meaningful regardless of the
  // current pick): the FP16 baseline and the aggressive Q2_K floor.
  const ratio = bpp < 2.0 ? (2.0 / bpp).toFixed(1) : null;
  const fp16Bytes = model.params_total * 2.0;
  const q2Bytes = model.params_total * 0.33;

  // KV at a long context, to show how the KV term can grow past the weights.
  const longCtx = Math.min(131072, model.context_window || 131072);
  const kvAtLong = kv.bytes_per_token * longCtx;
  const showLong = longCtx > ctx;

  const estTag = est ? " (est)" : "";
  const w = (requiredBytes > 0 ? weightsBytes / requiredBytes : 0) * 100;
  const k = (requiredBytes > 0 ? kvBytesTotal / requiredBytes : 0) * 100;
  const o = (requiredBytes > 0 ? overheadBytes / requiredBytes : 0) * 100;

  const cell = "border border-[var(--color-border)] rounded-md bg-[var(--color-surface)] p-3";
  const cellLabel = "font-mono text-[10px] uppercase tracking-wider text-[var(--color-text-subtle)]";
  const pill = "font-mono text-[11px] text-[var(--color-text)] mb-1.5";
  const body = "text-[12px] text-[var(--color-text-muted)] leading-relaxed";
  const delta = "font-mono text-[10px] text-[var(--color-text-subtle)] mt-2 tabular-nums";

  return (
    <div className="px-4 py-3 border-b border-[var(--color-border)] bg-[var(--color-surface-warm)]">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="font-mono text-[10px] uppercase tracking-wider text-[var(--color-text-subtle)] hover:text-[var(--color-text)] cursor-pointer flex items-center gap-1.5"
      >
        <span>{open ? "▾" : "▸"}</span> Reading your setup
      </button>

      {open && (
        <div className="mt-3 space-y-3">
          {/* Recipe line */}
          <div>
            {additive ? (
              <p className="text-sm text-[var(--color-text)] flex flex-wrap items-baseline gap-x-1.5 gap-y-1">
                <span className="font-medium">Needs about {formatGB(requiredBytes)} to load</span>
                <span className="text-[var(--color-text-subtle)]">=</span>
                <span className="font-mono text-xs px-1.5 py-0.5 rounded" style={{ backgroundColor: "#4a6fa522", color: "#4a6fa5" }} data-popover="Model weights: total parameters times bytes-per-weight at this quantization. All of it stays resident.">{formatGB(weightsBytes)} weights</span>
                <span className="text-[var(--color-text-subtle)]">+</span>
                <span className="font-mono text-xs px-1.5 py-0.5 rounded" style={{ backgroundColor: "#ba8b4b22", color: "#9a6f33" }} data-popover="KV cache: per-token attention memory that grows with context length.">{formatGB(kvBytesTotal)} KV{estTag}</span>
                <span className="text-[var(--color-text-subtle)]">+</span>
                <span className="font-mono text-xs px-1.5 py-0.5 rounded" style={{ backgroundColor: "#a7a4a022", color: "#76736f" }} data-popover="Framework overhead: runtime scratch and bookkeeping beyond weights and KV.">{formatGB(overheadBytes)} overhead</span>
              </p>
            ) : (
              <p className="text-sm text-[var(--color-text)]">
                <span className="font-medium">Weights about {formatGB(weightsBytes)} plus a fixed activation floor must fit under about {Math.round(profile.utilization * 100)}% of the box's memory.</span>
              </p>
            )}
            <p className="text-[11px] text-[var(--color-text-subtle)] mt-1 leading-relaxed">
              {additive
                ? "This is what the model asks for, before any box. Each card below checks it against that box's usable memory."
                : "The rest of that budget becomes the KV pool, which decides how much context and how many parallel streams the box can hold."}
            </p>
          </div>

          {/* Proportion bar (relative sizes of the three terms) */}
          <div className="h-1.5 w-full rounded-full overflow-hidden flex bg-[var(--color-surface)]" aria-hidden="true">
            <div style={{ width: `${w}%`, backgroundColor: "#4a6fa5" }} />
            <div style={{ width: `${k}%`, backgroundColor: "#ba8b4b" }} />
            <div style={{ width: `${o}%`, backgroundColor: "#a7a4a0" }} />
          </div>

          {/* Knob cells */}
          <div className="grid gap-3 md:grid-cols-2">
            {/* Quantization */}
            <div className={cell}>
              <div className={cellLabel}>Quantization</div>
              <div className={pill}>{quantLabel(quant)} · {bpp} bytes/param</div>
              <p className={body}>
                <Glossary slug="quantization">Quantization</Glossary> stores each weight in fewer bits.{fmt?.note ? ` ${fmt.note}` : ""}{" "}
                At {bpp} bytes per weight{ratio ? `, versus 2.0 at FP16, this model's weights shrink from ${formatGB(fp16Bytes)} to ${formatGB(weightsBytes)}, a ${ratio}x cut` : ", the uncompressed baseline"}. Lower precision is the biggest fit lever and it also speeds decode a little, since each token streams fewer bytes; the KV cache and per-token overhead are why the gain is less than the raw ratio. The aggressive floor, Q2_K, would be about {formatGB(q2Bytes)} but quality drops.
              </p>
              <div className={delta}>weights {ratio ? `${formatGB(fp16Bytes)} → ${formatGB(weightsBytes)}` : formatGB(weightsBytes)}</div>
            </div>

            {/* Runtime */}
            <div className={cell}>
              <div className={cellLabel}>Runtime</div>
              <div className={pill}>{profile.label} · {additive ? "additive" : "capacity-capped"}</div>
              <p className={body}>
                The {RT_GLOSSARY[runtime] ? <Glossary slug={RT_GLOSSARY[runtime]}>runtime</Glossary> : "runtime"} is the engine that serves tokens from the weights, and its memory model decides how the recipe adds up.{" "}
                {additive
                  ? `${profile.label} is additive: required memory is weights plus KV plus a small modeled overhead (here about ${formatGB(overheadBytes)}, a ${profile.fixed_gb} GB fixed floor plus ${Math.round(profile.weight_fraction * 100)}% of weight bytes for scratch), so usage tracks real context. `
                  : `${profile.label} is capacity-capped: it reserves about ${Math.round(profile.utilization * 100)}% of memory as one paged pool up front, fits the weights plus a fixed activation floor inside it, and lets the KV cache fill the rest. `}
                {additive
                  ? "Capacity-capped engines like vLLM instead reserve about 90% of memory as one pool and let KV fill the rest."
                  : "Additive engines like llama.cpp instead sum weights plus KV plus a small overhead."}
              </p>
              <div className={delta}>{additive ? `overhead +${formatGB(overheadBytes)}` : `pool ${Math.round(profile.utilization * 100)}% of memory`}</div>
            </div>

            {/* Context / KV */}
            <div className={cell}>
              <div className={cellLabel}>Context and KV</div>
              <div className={pill}>{fmtCtx(ctx)} tokens · {kvBytes === 2 ? "FP16" : "FP8"} KV</div>
              <p className={body}>
                The <Glossary slug="kv-cache">KV cache</Glossary> holds the attention keys and values for the tokens in the window, so it grows with context length, unlike the weights, which are fixed.{" "}
                {est ? "This entry does not list exact layer and head counts, so the calculator estimates the geometry: " : ""}about {perToken(kv.bytes_per_token)} per token{estTag}, so {fmtCtx(ctx)} costs about {formatGB(kvBytesTotal)}{estTag}{showLong ? `, and ${fmtCtx(longCtx)} would cost about ${formatGB(kvAtLong)}${estTag}` : ""}.{" "}
                {kvBytes === 2
                  ? "Switching KV to FP8 halves it, freeing memory or context headroom; it barely changes decode speed here, since the weights dominate the bytes per token."
                  : "FP16 KV would double this."}
              </p>
              <div className={delta}>KV {perToken(kv.bytes_per_token)}/tok → {formatGB(kvBytesTotal)}{estTag}</div>
            </div>

            {/* Model */}
            <div className={cell}>
              <div className={cellLabel}>Model</div>
              <div className={pill}>{model.display_name} · {isMoE ? "MoE" : "dense"}</div>
              <p className={body}>
                {isMoE ? (
                  <>A <Glossary slug="mixture-of-experts">Mixture-of-Experts</Glossary> model keeps all {formatGB(weightsBytes)} of experts resident to fit, but routes each token through only about {formatGB(streamBytes)} of active experts, so decode streams far less than it stores. Fit size and speed size split apart.</>
                ) : (
                  <>A <Glossary slug="dense">dense</Glossary> model activates every parameter on every token, so all {formatGB(weightsBytes)} of weights are both resident to fit and streamed to decode. Fit size and speed size are the same number, which is why decode is bound by how fast the box reads about {formatGB(streamBytes)} per token.</>
                )}
              </p>
              <div className={delta}>streams about {formatGB(streamBytes)}/token</div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
