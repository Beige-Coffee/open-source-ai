import { useEffect, useMemo, useState } from "react";
import {
  QUANT_FORMATS,
  RUNTIME_PROFILES,
  bytesPerParam,
  quantLabel,
  fitCheck,
  decodeRoofline,
  prefillTTFT,
  kvBytesPerToken,
  formatGB,
  formatTokS,
  formatBandwidth,
  HARDWARE_CLASS_LABEL,
  MEMORY_TYPE_LABEL,
  type Hardware,
  type HardwareBenchmark,
  type Runtime,
} from "../lib/hardware";
import type { Model } from "../lib/models";

type VerifMap = Record<string, Record<string, string>>;
const PASS = new Set(["supported", "consistent", "still_supported", "pending_horizon"]);

interface Props {
  hardware: Hardware[];
  hardwareVerif: VerifMap;
  models: Model[];
  modelVerif: VerifMap;
  benchmarks: HardwareBenchmark[];
  benchVerif: VerifMap;
}

interface HwSel {
  slug: string;
  units: number;
}

const CTX_PRESETS = [2048, 4096, 8192, 16384, 32768, 65536, 131072];

function fmtParams(n: number): string {
  if (n >= 1e12) return `${(n / 1e12).toFixed(1)}T`;
  if (n >= 1e9) return `${(n / 1e9).toFixed(n % 1e9 === 0 ? 0 : 0)}B`;
  return `${(n / 1e6).toFixed(0)}M`;
}
function fmtCtx(n: number): string {
  if (n >= 1000) return `${Math.round(n / 1000)}K`;
  return `${n}`;
}

export default function HardwareExplorer({
  hardware,
  hardwareVerif,
  models,
  modelVerif,
  benchmarks,
  benchVerif,
}: Props) {
  const hwBySlug = useMemo(() => Object.fromEntries(hardware.map((h) => [h.slug, h])), [hardware]);
  const modelBySlug = useMemo(() => Object.fromEntries(models.map((m) => [m.slug, m])), [models]);

  // ---- initial state from URL ----
  const initial = useMemo(() => readUrl(), []);
  const [modelSlug, setModelSlug] = useState<string>(
    initial.model && modelBySlug[initial.model] ? initial.model : defaultModel(models),
  );
  const [quant, setQuant] = useState<string>(initial.quant ?? "q4_k_m");
  const [ctx, setCtx] = useState<number>(initial.ctx ?? 4096);
  const [kvBytes, setKvBytes] = useState<number>(initial.kv === "fp8" ? 1 : 2);
  const [runtime, setRuntime] = useState<Runtime>(
    (initial.rt && RUNTIME_PROFILES[initial.rt as Runtime] ? initial.rt : "llama.cpp") as Runtime,
  );
  const [sel, setSel] = useState<HwSel[]>(
    initial.hw && initial.hw.length ? initial.hw.filter((s) => hwBySlug[s.slug]) : defaultHw(hardware),
  );
  const [addSlug, setAddSlug] = useState<string>("");

  // ---- reflect state into the URL for sharing ----
  useEffect(() => {
    const p = new URLSearchParams();
    p.set("model", modelSlug);
    p.set("quant", quant);
    p.set("ctx", String(ctx));
    p.set("kv", kvBytes === 1 ? "fp8" : "fp16");
    p.set("rt", runtime);
    p.set("hw", sel.map((s) => `${s.slug}:${s.units}`).join(","));
    const url = `${window.location.pathname}?${p.toString()}`;
    window.history.replaceState(null, "", url);
  }, [modelSlug, quant, ctx, kvBytes, runtime, sel]);

  const model = modelBySlug[modelSlug];
  // Fit and dense-model decode are driven by params_total (verified).
  // Only MoE decode depends on params_active, so only MoE requires that
  // row to be verified too.
  const modelOk = model
    ? PASS.has(modelVerif[model.slug]?.params_total ?? "") &&
      (model.architecture !== "moe" ||
        PASS.has(modelVerif[model.slug]?.params_active ?? ""))
    : false;

  function hwOk(slug: string): boolean {
    return (
      PASS.has(hardwareVerif[slug]?.memory_bandwidth_gbs ?? "") &&
      PASS.has(hardwareVerif[slug]?.memory_capacity_gb ?? "")
    );
  }

  function findAnchor(hwSlug: string): HardwareBenchmark | null {
    // Match model + hardware + quant, prefer same num_units; require the
    // bench row to be verified.
    const candidates = benchmarks.filter(
      (b) => b.model_slug === modelSlug && b.hardware_slug === hwSlug && b.quant === quant,
    );
    for (const b of candidates) {
      const key = `${b.model_slug}__${b.hardware_slug}__${b.quant}__${b.runtime}`;
      if (PASS.has(benchVerif[key]?.decode_tok_s ?? "")) return b;
    }
    return null;
  }

  const profile = RUNTIME_PROFILES[runtime];

  return (
    <div className="border border-[var(--color-border)] rounded-lg bg-[var(--color-surface)] overflow-hidden">
      <div className="px-4 py-3 border-b border-[var(--color-border)] bg-[var(--color-surface-warm)]">
        <p className="font-mono text-xs uppercase tracking-wider text-[var(--color-text-subtle)]">
          Fit and speed explorer
        </p>
      </div>

      {/* Controls */}
      <div className="px-4 py-4 grid gap-4 md:grid-cols-2 border-b border-[var(--color-border)]">
        <label className="block">
          <span className="font-mono text-[10px] uppercase tracking-wider text-[var(--color-text-subtle)]">Model (self-hostable)</span>
          <select
            value={modelSlug}
            onChange={(e) => setModelSlug(e.target.value)}
            className="mt-1 w-full px-2 py-1.5 border border-[var(--color-border)] rounded bg-[var(--color-surface)] text-sm"
          >
            {models.map((m) => (
              <option key={m.slug} value={m.slug}>
                {m.display_name} ({fmtParams(m.params_total)}{m.architecture === "moe" ? `, ${fmtParams(m.params_active)} active` : ""})
              </option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="font-mono text-[10px] uppercase tracking-wider text-[var(--color-text-subtle)]">Quantization</span>
          <select
            value={quant}
            onChange={(e) => setQuant(e.target.value)}
            className="mt-1 w-full px-2 py-1.5 border border-[var(--color-border)] rounded bg-[var(--color-surface)] text-sm"
          >
            {QUANT_FORMATS.map((q) => (
              <option key={q.id} value={q.id}>
                {q.label} ({q.bytes_per_param} B/param)
              </option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="font-mono text-[10px] uppercase tracking-wider text-[var(--color-text-subtle)]">
            Context length: {fmtCtx(ctx)} tokens
          </span>
          <input
            type="range"
            min={0}
            max={CTX_PRESETS.length - 1}
            step={1}
            value={Math.max(0, CTX_PRESETS.indexOf(ctx))}
            onChange={(e) => setCtx(CTX_PRESETS[Number(e.target.value)])}
            className="mt-2 w-full"
          />
          <span className="font-mono text-[10px] text-[var(--color-text-subtle)]">
            {model && ctx > model.context_window
              ? `above this model's ${fmtCtx(model.context_window)} native window`
              : "drag to watch the KV cache grow"}
          </span>
        </label>

        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="font-mono text-[10px] uppercase tracking-wider text-[var(--color-text-subtle)]">KV precision</span>
            <select
              value={kvBytes}
              onChange={(e) => setKvBytes(Number(e.target.value))}
              className="mt-1 w-full px-2 py-1.5 border border-[var(--color-border)] rounded bg-[var(--color-surface)] text-sm"
            >
              <option value={2}>FP16 KV</option>
              <option value={1}>FP8 KV</option>
            </select>
          </label>
          <label className="block">
            <span className="font-mono text-[10px] uppercase tracking-wider text-[var(--color-text-subtle)]">Runtime</span>
            <select
              value={runtime}
              onChange={(e) => setRuntime(e.target.value as Runtime)}
              className="mt-1 w-full px-2 py-1.5 border border-[var(--color-border)] rounded bg-[var(--color-surface)] text-sm"
            >
              {Object.values(RUNTIME_PROFILES).map((r) => (
                <option key={r.id} value={r.id}>{r.label}</option>
              ))}
            </select>
          </label>
        </div>
      </div>

      {/* Hardware add row */}
      <div className="px-4 py-3 border-b border-[var(--color-border)] flex flex-wrap items-center gap-2">
        <span className="font-mono text-[10px] uppercase tracking-wider text-[var(--color-text-subtle)]">Add hardware</span>
        <select
          value={addSlug}
          onChange={(e) => {
            const s = e.target.value;
            if (s && !sel.some((x) => x.slug === s)) {
              setSel([...sel, { slug: s, units: hwBySlug[s]?.multi_unit_default ?? 1 }]);
            }
            setAddSlug("");
          }}
          className="px-2 py-1 border border-[var(--color-border)] rounded bg-[var(--color-surface)] text-sm"
        >
          <option value="">choose a box…</option>
          {hardware.map((h) => (
            <option key={h.slug} value={h.slug} disabled={sel.some((x) => x.slug === h.slug)}>
              {h.name} — {HARDWARE_CLASS_LABEL[h.class]}
            </option>
          ))}
        </select>
        <span className="font-mono text-[10px] text-[var(--color-text-subtle)]">
          {profile.label} overhead model: {profile.kind === "capacity-capped" ? `caps usable memory at ${Math.round(profile.utilization * 100)}%` : "weights + KV + framework overhead"}
        </span>
      </div>

      {/* Result cards */}
      <div className="p-4 grid gap-4 md:grid-cols-2">
        {sel.length === 0 && (
          <p className="text-sm text-[var(--color-text-subtle)] col-span-full">Add a box above to compare.</p>
        )}
        {sel.map((s) => {
          const hw = hwBySlug[s.slug];
          if (!hw || !model) return null;
          return (
            <HardwareCard
              key={s.slug}
              hw={hw}
              units={s.units}
              model={model}
              quant={quant}
              ctx={ctx}
              kvBytes={kvBytes}
              runtime={runtime}
              canCompute={modelOk && hwOk(s.slug)}
              anchor={findAnchor(s.slug)}
              onUnits={(u) => setSel(sel.map((x) => (x.slug === s.slug ? { ...x, units: u } : x)))}
              onRemove={() => setSel(sel.filter((x) => x.slug !== s.slug))}
            />
          );
        })}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------

function HardwareCard({
  hw,
  units,
  model,
  quant,
  ctx,
  kvBytes,
  runtime,
  canCompute,
  anchor,
  onUnits,
  onRemove,
}: {
  hw: Hardware;
  units: number;
  model: Model;
  quant: string;
  ctx: number;
  kvBytes: number;
  runtime: Runtime;
  canCompute: boolean;
  anchor: HardwareBenchmark | null;
  onUnits: (u: number) => void;
  onRemove: () => void;
}) {
  const fit = fitCheck(model, hw, { quant, contextLength: ctx, kvPrecisionBytes: kvBytes, numUnits: units, runtime, concurrency: 1 });
  const dec = decodeRoofline(model, hw, { quant, contextLength: ctx, kvPrecisionBytes: kvBytes, numUnits: units, runtime });
  const pre = prefillTTFT(model, hw, { quant, promptTokens: Math.min(ctx, 4096), numUnits: units });

  // Memory bar fractions (against usable capacity).
  const usable = fit.usableBytes;
  const wFrac = fit.weightsBytes / usable;
  const kFrac = fit.kvBytes / usable;
  const oFrac = fit.overheadBytes / usable;
  const used = wFrac + kFrac + oFrac;

  return (
    <div className="border border-[var(--color-border)] rounded-md p-3 bg-[var(--color-surface-warm)]">
      <div className="flex items-start justify-between mb-2">
        <div>
          <a href={`/hardware/${hw.slug}`} className="text-sm text-[var(--color-text)] no-underline hover:underline">{hw.name}</a>
          <p className="font-mono text-[10px] text-[var(--color-text-subtle)]">
            {HARDWARE_CLASS_LABEL[hw.class]} · {formatBandwidth(hw.memory_bandwidth_gbs)} · {hw.memory_capacity_gb} GB {MEMORY_TYPE_LABEL[hw.memory_type]}
          </p>
        </div>
        <button onClick={onRemove} className="font-mono text-[10px] text-[var(--color-text-subtle)] hover:text-[var(--color-text)] cursor-pointer" title="Remove">✕</button>
      </div>

      {/* Unit stepper */}
      <div className="flex items-center gap-2 mb-3">
        <span className="font-mono text-[10px] uppercase tracking-wider text-[var(--color-text-subtle)]">Units</span>
        {[1, 2, 4, 8].map((u) => (
          <button
            key={u}
            onClick={() => onUnits(u)}
            className={`font-mono text-xs px-1.5 py-0.5 rounded border cursor-pointer ${units === u ? "border-[var(--color-text)] text-[var(--color-text)]" : "border-[var(--color-border)] text-[var(--color-text-subtle)]"}`}
          >
            {u}
          </button>
        ))}
        {units > 1 && hw.interconnect !== "none" && (
          <span className="font-mono text-[9px] text-[var(--color-text-subtle)]">{hw.interconnect}</span>
        )}
      </div>

      {!canCompute ? (
        <p className="text-xs text-[var(--color-text-subtle)] italic py-4">
          Spec unverified, cannot compute. The memory bandwidth, capacity, or model
          parameter counts have not passed the verification gate yet, so no estimate
          is shown.
        </p>
      ) : (
        <>
          {/* Fit bar */}
          <div className="mb-1 flex items-center justify-between">
            <span className={`font-mono text-xs ${fit.fits ? "text-[var(--color-focus-open,#117a60)]" : "text-[var(--color-focus-source-available,#ba5b4b)]"}`}>
              {fit.fits ? "Fits" : `Does not fit (needs ${formatGB(fit.requiredBytes)} of ${formatGB(usable)} usable)`}
            </span>
            <span className="font-mono text-[10px] text-[var(--color-text-subtle)]">{units} × {hw.memory_capacity_gb} GB</span>
          </div>
          <div className="h-4 w-full rounded bg-[var(--color-surface)] border border-[var(--color-border)] overflow-hidden flex mb-1" title="weights / KV cache / overhead vs usable memory">
            <div style={{ width: `${Math.min(100, wFrac * 100)}%`, backgroundColor: "#4a6fa5" }} className="h-full" title={`weights ${formatGB(fit.weightsBytes)}`} />
            <div style={{ width: `${Math.min(100, kFrac * 100)}%`, backgroundColor: "#ba8b4b" }} className="h-full" title={`KV cache ${formatGB(fit.kvBytes)}`} />
            <div style={{ width: `${Math.min(100, oFrac * 100)}%`, backgroundColor: "#a7a4a0" }} className="h-full" title={`overhead ${formatGB(fit.overheadBytes)}`} />
          </div>
          <div className="flex gap-3 mb-1 font-mono text-[9px] text-[var(--color-text-subtle)]">
            <span><span style={{ color: "#4a6fa5" }}>■</span> weights</span>
            <span><span style={{ color: "#ba8b4b" }}>■</span> KV</span>
            <span><span style={{ color: "#a7a4a0" }}>■</span> overhead</span>
          </div>
          <p className="font-mono text-[9px] text-[var(--color-text-subtle)] mb-3">
            weights {formatGB(fit.weightsBytes)} · KV {formatGB(fit.kvBytes)}{fit.kvEstimated ? " (est)" : ""} · overhead {formatGB(fit.overheadBytes)}
            {used > 1 ? ` · over by ${Math.round((used - 1) * 100)}%` : ""}
          </p>

          {/* Decode hybrid view */}
          <div className="mb-2">
            <div className="flex items-baseline justify-between">
              <span className="font-mono text-[10px] uppercase tracking-wider text-[var(--color-text-subtle)]">Decode tokens/sec</span>
              <span className="font-mono text-[9px] text-[var(--color-text-subtle)]">ceiling {formatTokS(dec.ceilingTokS)}</span>
            </div>
            <div className="flex items-baseline gap-2">
              <span className="font-mono text-2xl text-[var(--color-text)] tabular-nums">
                {formatTokS(dec.lowTokS)}–{formatTokS(dec.highTokS)}
              </span>
              <span className="font-mono text-[10px] text-[var(--color-text-subtle)]">est. realistic ({runtime})</span>
            </div>
            {anchor && (
              <p className="font-mono text-[10px] text-[var(--color-text)] mt-1">
                measured: <span className="tabular-nums">{anchor.decode_tok_s}</span> tok/s
                <a href={anchor.source} target="_blank" rel="noopener" className="text-[var(--color-text-subtle)] hover:text-[var(--color-text)] ml-1 no-underline hover:underline">({anchor.runtime}, {anchor.as_of}) ↗</a>
              </p>
            )}
          </div>

          {/* Prefill */}
          {pre && (
            <p className="font-mono text-[10px] text-[var(--color-text-subtle)] mb-2">
              prefill TTFT (rough): ~{pre.ttftMs < 1000 ? `${Math.round(pre.ttftMs)} ms` : `${(pre.ttftMs / 1000).toFixed(1)} s`} for a {fmtCtx(Math.min(ctx, 4096))}-token prompt
            </p>
          )}

          {/* Why */}
          <p className="text-xs text-[var(--color-text-muted)] leading-relaxed border-t border-[var(--color-border)] pt-2">
            {whyText({ hw, units, model, quant, fit, dec })}
          </p>
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------

function whyText({
  hw,
  units,
  model,
  quant,
  fit,
  dec,
}: {
  hw: Hardware;
  units: number;
  model: Model;
  quant: string;
  fit: ReturnType<typeof fitCheck>;
  dec: ReturnType<typeof decodeRoofline>;
}): string {
  const cap = `${units > 1 ? `${units}× ` : ""}${hw.name}`;
  const moe = model.architecture === "moe";
  if (!fit.fits) {
    return `This model needs ${formatGB(fit.requiredBytes)} at ${quantLabel(quant)}, but ${cap} offers ${formatGB(fit.usableBytes)} of usable memory, so it does not fit. A higher-capacity box, more units, or a smaller quantization would. Capacity is the binding constraint here, not speed.`;
  }
  const bwTb = (dec.effectiveBandwidthBytesPerS / 1e12).toFixed(2);
  const perStep = formatGB(dec.bytesPerStep);
  const moeNote = moe
    ? ` Because this is a mixture-of-experts model, decode streams only the ${formatGB(dec.activeWeightsBytes)} of active weights per token even though all ${formatGB(fit.weightsBytes)} must stay resident, which is why it feels faster than its size.`
    : "";
  return `It fits. Decode is bound by the ${bwTb} TB/s effective memory bus: each token streams about ${perStep}, so the ceiling is ${formatTokS(dec.ceilingTokS)} tok/s and realistic output lands in the band shown.${moeNote}`;
}

// ---------------------------------------------------------------------------

function defaultModel(models: Model[]): string {
  const pref = models.find((m) => m.slug === "llama-3-3-70b-instruct") ?? models.find((m) => m.slug === "llama-3-1-8b-instruct");
  return pref?.slug ?? models[0]?.slug ?? "";
}
function defaultHw(hardware: Hardware[]): HwSel[] {
  const picks = ["nvidia-rtx-5090", "apple-mac-studio-m3-ultra"].filter((s) => hardware.some((h) => h.slug === s));
  const slugs = picks.length ? picks : hardware.slice(0, 2).map((h) => h.slug);
  return slugs.map((slug) => ({ slug, units: hardware.find((h) => h.slug === slug)?.multi_unit_default ?? 1 }));
}

function readUrl(): { model?: string; quant?: string; ctx?: number; kv?: string; rt?: string; hw?: HwSel[] } {
  if (typeof window === "undefined") return {};
  const p = new URLSearchParams(window.location.search);
  const hw = p.get("hw");
  return {
    model: p.get("model") ?? undefined,
    quant: p.get("quant") ?? undefined,
    ctx: p.get("ctx") ? Number(p.get("ctx")) : undefined,
    kv: p.get("kv") ?? undefined,
    rt: p.get("rt") ?? undefined,
    hw: hw
      ? hw.split(",").map((tok) => {
          const [slug, units] = tok.split(":");
          return { slug, units: Number(units) || 1 };
        })
      : undefined,
  };
}
