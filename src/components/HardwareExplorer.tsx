import { useEffect, useMemo, useState } from "react";
import {
  QUANT_FORMATS,
  RUNTIME_PROFILES,
  quantLabel,
  fitCheck,
  decodeRoofline,
  prefillTTFT,
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

type Mode = "compare" | "find-hw" | "what-fits";

const CTX_PRESETS = [2048, 4096, 8192, 16384, 32768, 65536, 131072];
// A precision ladder that spans 2.0 -> 0.33 bytes/param without the
// near-duplicate quants (q4_0 vs q4_k_m), so the "what fits" matrix shows
// every meaningful configuration without redundant rows.
const QUANT_LADDER = ["fp16", "fp8", "q8_0", "q6_k", "q5_k_m", "q4_k_m", "q3_k_m", "q2_k"];

function fmtParams(n: number): string {
  if (n >= 1e12) return `${(n / 1e12).toFixed(1)}T`;
  if (n >= 1e9) return `${(n / 1e9).toFixed(0)}B`;
  return `${(n / 1e6).toFixed(0)}M`;
}
function fmtCtx(n: number): string {
  if (n >= 1000) return `${Math.round(n / 1000)}K`;
  return `${n}`;
}

// ---- shared verification helpers ----
function isHwOk(v: VerifMap, slug: string): boolean {
  return PASS.has(v[slug]?.memory_bandwidth_gbs ?? "") && PASS.has(v[slug]?.memory_capacity_gb ?? "");
}
function isModelOk(v: VerifMap, m: Model): boolean {
  return (
    PASS.has(v[m.slug]?.params_total ?? "") &&
    (m.architecture !== "moe" || PASS.has(v[m.slug]?.params_active ?? ""))
  );
}
function anchorFor(
  benchmarks: HardwareBenchmark[],
  benchVerif: VerifMap,
  modelSlug: string,
  hwSlug: string,
  quant: string,
): HardwareBenchmark | null {
  for (const b of benchmarks) {
    if (b.model_slug !== modelSlug || b.hardware_slug !== hwSlug || b.quant !== quant) continue;
    const key = `${b.model_slug}__${b.hardware_slug}__${b.quant}__${b.runtime}`;
    if (PASS.has(benchVerif[key]?.decode_tok_s ?? "")) return b;
  }
  return null;
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

  const initial = useMemo(() => readUrl(), []);
  const [mode, setMode] = useState<Mode>(
    initial.mode === "find-hw" || initial.mode === "what-fits" ? initial.mode : "compare",
  );
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
  const [units, setUnits] = useState<number>(initial.u ?? 1);
  const [boxSlug, setBoxSlug] = useState<string>(
    initial.box && hwBySlug[initial.box] ? initial.box : defaultBox(hardware),
  );
  const [addSlug, setAddSlug] = useState<string>("");

  useEffect(() => {
    const p = new URLSearchParams();
    p.set("mode", mode);
    p.set("model", modelSlug);
    p.set("quant", quant);
    p.set("ctx", String(ctx));
    p.set("kv", kvBytes === 1 ? "fp8" : "fp16");
    p.set("rt", runtime);
    if (mode === "compare") p.set("hw", sel.map((s) => `${s.slug}:${s.units}`).join(","));
    if (mode === "what-fits") p.set("box", boxSlug);
    if (mode !== "compare") p.set("u", String(units));
    window.history.replaceState(null, "", `${window.location.pathname}?${p.toString()}`);
  }, [mode, modelSlug, quant, ctx, kvBytes, runtime, sel, units, boxSlug]);

  const model = modelBySlug[modelSlug];
  const modelOk = model ? isModelOk(modelVerif, model) : false;
  const profile = RUNTIME_PROFILES[runtime];

  const MODES: { id: Mode; label: string }[] = [
    { id: "compare", label: "Compare boxes" },
    { id: "find-hw", label: "Which hardware fits" },
    { id: "what-fits", label: "What runs on a box" },
  ];

  return (
    <div className="border border-[var(--color-border)] rounded-lg bg-[var(--color-surface)] overflow-hidden">
      <div className="px-4 py-3 border-b border-[var(--color-border)] bg-[var(--color-surface-warm)] flex flex-wrap items-center justify-between gap-3">
        <p className="font-mono text-xs uppercase tracking-wider text-[var(--color-text-subtle)]">
          Fit and speed explorer
        </p>
        <div className="flex items-center gap-1 flex-wrap">
          {MODES.map((m) => (
            <button
              key={m.id}
              onClick={() => setMode(m.id)}
              className={`font-mono text-[11px] px-2.5 py-1 rounded border cursor-pointer transition-colors ${
                mode === m.id
                  ? "border-[var(--color-text)] text-[var(--color-text)] bg-[var(--color-surface)]"
                  : "border-[var(--color-border)] text-[var(--color-text-subtle)] hover:text-[var(--color-text)]"
              }`}
            >
              {m.label}
            </button>
          ))}
        </div>
      </div>

      {/* Shared config */}
      <div className="px-4 py-4 grid gap-4 md:grid-cols-2 border-b border-[var(--color-border)]">
        {mode !== "what-fits" ? (
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
        ) : (
          <label className="block">
            <span className="font-mono text-[10px] uppercase tracking-wider text-[var(--color-text-subtle)]">Hardware</span>
            <select
              value={boxSlug}
              onChange={(e) => setBoxSlug(e.target.value)}
              className="mt-1 w-full px-2 py-1.5 border border-[var(--color-border)] rounded bg-[var(--color-surface)] text-sm"
            >
              {hardware.map((h) => (
                <option key={h.slug} value={h.slug}>
                  {h.name} — {HARDWARE_CLASS_LABEL[h.class]} ({h.memory_capacity_gb} GB)
                </option>
              ))}
            </select>
          </label>
        )}

        <label className="block">
          <span className="font-mono text-[10px] uppercase tracking-wider text-[var(--color-text-subtle)]">Quantization{mode === "what-fits" ? " (matrix uses a ladder)" : ""}</span>
          <select
            value={quant}
            onChange={(e) => setQuant(e.target.value)}
            disabled={mode === "what-fits"}
            className="mt-1 w-full px-2 py-1.5 border border-[var(--color-border)] rounded bg-[var(--color-surface)] text-sm disabled:opacity-50"
          >
            {QUANT_FORMATS.map((q) => (
              <option key={q.id} value={q.id}>{q.label} ({q.bytes_per_param} B/param)</option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="font-mono text-[10px] uppercase tracking-wider text-[var(--color-text-subtle)]">Context length: {fmtCtx(ctx)} tokens</span>
          <input
            type="range" min={0} max={CTX_PRESETS.length - 1} step={1}
            value={Math.max(0, CTX_PRESETS.indexOf(ctx))}
            onChange={(e) => setCtx(CTX_PRESETS[Number(e.target.value)])}
            className="mt-2 w-full"
          />
        </label>

        <div className="grid grid-cols-3 gap-3">
          <label className="block">
            <span className="font-mono text-[10px] uppercase tracking-wider text-[var(--color-text-subtle)]">KV</span>
            <select value={kvBytes} onChange={(e) => setKvBytes(Number(e.target.value))} className="mt-1 w-full px-2 py-1.5 border border-[var(--color-border)] rounded bg-[var(--color-surface)] text-sm">
              <option value={2}>FP16</option>
              <option value={1}>FP8</option>
            </select>
          </label>
          <label className="block">
            <span className="font-mono text-[10px] uppercase tracking-wider text-[var(--color-text-subtle)]">Runtime</span>
            <select value={runtime} onChange={(e) => setRuntime(e.target.value as Runtime)} className="mt-1 w-full px-2 py-1.5 border border-[var(--color-border)] rounded bg-[var(--color-surface)] text-sm">
              {Object.values(RUNTIME_PROFILES).map((r) => (<option key={r.id} value={r.id}>{r.label}</option>))}
            </select>
          </label>
          {mode !== "compare" && (
            <label className="block">
              <span className="font-mono text-[10px] uppercase tracking-wider text-[var(--color-text-subtle)]">Units</span>
              <select value={units} onChange={(e) => setUnits(Number(e.target.value))} className="mt-1 w-full px-2 py-1.5 border border-[var(--color-border)] rounded bg-[var(--color-surface)] text-sm">
                {[1, 2, 4, 8].map((u) => (<option key={u} value={u}>{u}×</option>))}
              </select>
            </label>
          )}
        </div>
      </div>

      {/* Mode body */}
      {mode === "compare" && (
        <CompareView
          {...{ hardware, hwBySlug, model, modelOk, quant, ctx, kvBytes, runtime, sel, setSel, addSlug, setAddSlug, hardwareVerif, benchmarks, benchVerif, profile }}
        />
      )}
      {mode === "find-hw" && (
        <FindHardwareView
          {...{ hardware, model, modelOk, quant, ctx, kvBytes, runtime, units, hardwareVerif, benchmarks, benchVerif }}
        />
      )}
      {mode === "what-fits" && (
        <WhatFitsView
          {...{ box: hwBySlug[boxSlug], hwOk: isHwOk(hardwareVerif, boxSlug), models, modelVerif, ctx, kvBytes, runtime, units, benchmarks, benchVerif }}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Compare mode (pre-select boxes; detailed cards)
// ---------------------------------------------------------------------------

function CompareView({
  hardware, hwBySlug, model, modelOk, quant, ctx, kvBytes, runtime, sel, setSel, addSlug, setAddSlug,
  hardwareVerif, benchmarks, benchVerif, profile,
}: any) {
  return (
    <>
      <div className="px-4 py-3 border-b border-[var(--color-border)] flex flex-wrap items-center gap-2">
        <span className="font-mono text-[10px] uppercase tracking-wider text-[var(--color-text-subtle)]">Add hardware</span>
        <select
          value={addSlug}
          onChange={(e) => {
            const s = e.target.value;
            if (s && !sel.some((x: HwSel) => x.slug === s)) setSel([...sel, { slug: s, units: hwBySlug[s]?.multi_unit_default ?? 1 }]);
            setAddSlug("");
          }}
          className="px-2 py-1 border border-[var(--color-border)] rounded bg-[var(--color-surface)] text-sm"
        >
          <option value="">choose a box…</option>
          {hardware.map((h: Hardware) => (
            <option key={h.slug} value={h.slug} disabled={sel.some((x: HwSel) => x.slug === h.slug)}>{h.name} — {HARDWARE_CLASS_LABEL[h.class]}</option>
          ))}
        </select>
        <span className="font-mono text-[10px] text-[var(--color-text-subtle)]">
          {profile.label}: {profile.kind === "capacity-capped" ? `usable memory capped at ${Math.round(profile.utilization * 100)}%` : "weights + KV + framework overhead"}
        </span>
      </div>
      <div className="p-4 grid gap-4 md:grid-cols-2">
        {sel.length === 0 && <p className="text-sm text-[var(--color-text-subtle)] col-span-full">Add a box above to compare.</p>}
        {sel.map((s: HwSel) => {
          const hw = hwBySlug[s.slug];
          if (!hw || !model) return null;
          return (
            <HardwareCard
              key={s.slug} hw={hw} units={s.units} model={model} quant={quant} ctx={ctx} kvBytes={kvBytes} runtime={runtime}
              canCompute={modelOk && isHwOk(hardwareVerif, s.slug)}
              anchor={anchorFor(benchmarks, benchVerif, model.slug, s.slug, quant)}
              onUnits={(u: number) => setSel(sel.map((x: HwSel) => (x.slug === s.slug ? { ...x, units: u } : x)))}
              onRemove={() => setSel(sel.filter((x: HwSel) => x.slug !== s.slug))}
            />
          );
        })}
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// Find-hardware mode (one model -> the whole catalog ranked)
// ---------------------------------------------------------------------------

function FindHardwareView({
  hardware, model, modelOk, quant, ctx, kvBytes, runtime, units, hardwareVerif, benchmarks, benchVerif,
}: any) {
  const rows = useMemo(() => {
    if (!model) return [];
    return (hardware as Hardware[])
      .map((hw) => {
        const ok = isHwOk(hardwareVerif, hw.slug) && modelOk;
        const fit = fitCheck(model, hw, { quant, contextLength: ctx, kvPrecisionBytes: kvBytes, numUnits: units, runtime, concurrency: 1 });
        const dec = decodeRoofline(model, hw, { quant, contextLength: ctx, kvPrecisionBytes: kvBytes, numUnits: units, runtime });
        const anchor = anchorFor(benchmarks, benchVerif, model.slug, hw.slug, quant);
        return { hw, ok, fit, dec, anchor };
      })
      .sort((a, b) => {
        if (a.fit.fits !== b.fit.fits) return a.fit.fits ? -1 : 1;
        return b.dec.highTokS - a.dec.highTokS;
      });
  }, [hardware, model, modelOk, quant, ctx, kvBytes, runtime, units, hardwareVerif, benchmarks, benchVerif]);

  const nFit = rows.filter((r) => r.ok && r.fit.fits).length;
  if (!model) return null;

  return (
    <div className="p-4">
      <p className="text-sm text-[var(--color-text-muted)] mb-3">
        {model.display_name} at {quantLabel(quant)}, {fmtCtx(ctx)} context, {units}× per box.
        <span className="text-[var(--color-text)] font-medium"> Fits on {nFit} of {rows.length}</span> in the catalog.
      </p>
      <div className="border border-[var(--color-border)] rounded-md overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="border-b border-[var(--color-border)] bg-[var(--color-surface-warm)]">
            <tr className="text-left font-mono text-[10px] uppercase tracking-wider text-[var(--color-text-subtle)]">
              <th className="px-3 py-2">Hardware</th>
              <th className="px-3 py-2 text-right">Memory</th>
              <th className="px-3 py-2 text-right">Fits?</th>
              <th className="px-3 py-2 text-right">Realistic tok/s</th>
              <th className="px-3 py-2 text-right">Measured</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ hw, ok, fit, dec, anchor }) => (
              <tr key={hw.slug} className={`border-t border-[var(--color-border)] ${!fit.fits ? "opacity-55" : ""}`}>
                <td className="px-3 py-1.5">
                  <a href={`/hardware/${hw.slug}`} className="text-[var(--color-text)] no-underline hover:underline">{hw.name}</a>
                  <span className="font-mono text-[10px] text-[var(--color-text-subtle)] ml-1">{units > 1 ? `${units}× · ` : ""}{HARDWARE_CLASS_LABEL[hw.class]}</span>
                </td>
                <td className="px-3 py-1.5 text-right font-mono text-xs text-[var(--color-text-subtle)] tabular-nums">{units * hw.memory_capacity_gb} GB</td>
                <td className="px-3 py-1.5 text-right font-mono text-xs">
                  {!ok ? <span className="text-[var(--color-text-subtle)]">—</span>
                    : fit.fits ? <span style={{ color: "#117a60" }}>yes</span>
                    : <span style={{ color: "#ba5b4b" }} title={`needs ${formatGB(fit.requiredBytes)}`}>no</span>}
                </td>
                <td className="px-3 py-1.5 text-right font-mono text-xs text-[var(--color-text)] tabular-nums">
                  {ok && fit.fits ? `${formatTokS(dec.lowTokS)}–${formatTokS(dec.highTokS)}` : "—"}
                </td>
                <td className="px-3 py-1.5 text-right font-mono text-[10px] text-[var(--color-text-muted)] tabular-nums">
                  {anchor ? <a href={anchor.source} target="_blank" rel="noopener" className="no-underline hover:underline" title={`${anchor.runtime}, ${anchor.as_of}`}>{anchor.decode_tok_s} ↗</a> : ""}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="font-mono text-[10px] text-[var(--color-text-subtle)] mt-2">
        Realistic range is the per-runtime band over the theoretical ceiling; raise units to see multi-GPU nodes hold larger models. Decode shown only where it fits.
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// What-fits mode (one box -> every model x quant that fits)
// ---------------------------------------------------------------------------

function WhatFitsView({
  box, hwOk, models, modelVerif, ctx, kvBytes, runtime, units, benchmarks, benchVerif,
}: any) {
  const [family, setFamily] = useState<string>("");
  const [minTokS, setMinTokS] = useState<number>(0);

  const all = useMemo(() => {
    if (!box || !hwOk) return [];
    const out: { model: Model; quant: string; dec: ReturnType<typeof decodeRoofline>; anchor: HardwareBenchmark | null }[] = [];
    for (const m of models as Model[]) {
      if (!isModelOk(modelVerif, m)) continue;
      for (const q of QUANT_LADDER) {
        const fit = fitCheck(m, box, { quant: q, contextLength: ctx, kvPrecisionBytes: kvBytes, numUnits: units, runtime, concurrency: 1 });
        if (!fit.fits) continue;
        const dec = decodeRoofline(m, box, { quant: q, contextLength: ctx, kvPrecisionBytes: kvBytes, numUnits: units, runtime });
        out.push({ model: m, quant: q, dec, anchor: anchorFor(benchmarks, benchVerif, m.slug, box.slug, q) });
      }
    }
    out.sort((a, b) => (b.model.params_total - a.model.params_total) || (b.dec.highTokS - a.dec.highTokS));
    return out;
  }, [box, hwOk, models, modelVerif, ctx, kvBytes, runtime, units, benchmarks, benchVerif]);

  const families = useMemo(() => Array.from(new Set(all.map((r) => r.model.family))).sort(), [all]);
  const rows = all.filter((r) => (!family || r.model.family === family) && r.dec.highTokS >= minTokS);

  if (!box) return null;
  if (!hwOk) return <div className="p-4 text-sm text-[var(--color-text-subtle)] italic">Spec unverified for this box, cannot compute.</div>;

  return (
    <div className="p-4">
      <p className="text-sm text-[var(--color-text-muted)] mb-3">
        Everything that fits on <span className="text-[var(--color-text)] font-medium">{units}× {box.name}</span> ({units * box.memory_capacity_gb} GB) at {fmtCtx(ctx)} context, across the precision ladder.
        <span className="text-[var(--color-text)] font-medium"> {all.length} configurations fit</span> ({rows.length} shown).
      </p>
      <div className="flex flex-wrap items-center gap-3 mb-3">
        <label className="font-mono text-[10px] uppercase tracking-wider text-[var(--color-text-subtle)]">
          Family
          <select value={family} onChange={(e) => setFamily(e.target.value)} className="ml-2 px-2 py-1 border border-[var(--color-border)] rounded bg-[var(--color-surface)] text-xs normal-case tracking-normal">
            <option value="">all</option>
            {families.map((f) => (<option key={f} value={f}>{f}</option>))}
          </select>
        </label>
        <label className="font-mono text-[10px] uppercase tracking-wider text-[var(--color-text-subtle)]">
          Min tok/s
          <input type="number" min={0} value={minTokS} onChange={(e) => setMinTokS(Number(e.target.value) || 0)} className="ml-2 w-16 px-2 py-1 border border-[var(--color-border)] rounded bg-[var(--color-surface)] text-xs" />
        </label>
      </div>
      <div className="border border-[var(--color-border)] rounded-md overflow-x-auto max-h-[640px] overflow-y-auto">
        <table className="w-full text-sm">
          <thead className="border-b border-[var(--color-border)] bg-[var(--color-surface-warm)] sticky top-0">
            <tr className="text-left font-mono text-[10px] uppercase tracking-wider text-[var(--color-text-subtle)]">
              <th className="px-3 py-2">Model</th>
              <th className="px-3 py-2 text-right">Quant</th>
              <th className="px-3 py-2 text-right">Realistic tok/s</th>
              <th className="px-3 py-2 text-right">Measured</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={`${r.model.slug}-${r.quant}`} className="border-t border-[var(--color-border)]">
                <td className="px-3 py-1.5">
                  <a href={`/models/${r.model.slug}`} className="text-[var(--color-text)] no-underline hover:underline">{r.model.display_name}</a>
                  <span className="font-mono text-[10px] text-[var(--color-text-subtle)] ml-1">{fmtParams(r.model.params_total)}{r.model.architecture === "moe" ? `·${fmtParams(r.model.params_active)}a` : ""}</span>
                </td>
                <td className="px-3 py-1.5 text-right font-mono text-xs text-[var(--color-text-muted)]">{quantLabel(r.quant)}</td>
                <td className="px-3 py-1.5 text-right font-mono text-xs text-[var(--color-text)] tabular-nums">{formatTokS(r.dec.lowTokS)}–{formatTokS(r.dec.highTokS)}</td>
                <td className="px-3 py-1.5 text-right font-mono text-[10px] text-[var(--color-text-muted)] tabular-nums">
                  {r.anchor ? <a href={r.anchor.source} target="_blank" rel="noopener" className="no-underline hover:underline" title={`${r.anchor.runtime}, ${r.anchor.as_of}`}>{r.anchor.decode_tok_s} ↗</a> : ""}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="font-mono text-[10px] text-[var(--color-text-subtle)] mt-2">
        Ladder: FP16, FP8, Q8_0, Q6_K, Q5_K_M, Q4_K_M, Q3_K_M, Q2_K. Sorted by model size, then speed. Realistic range is the per-runtime band.
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Detailed card (compare mode)
// ---------------------------------------------------------------------------

function HardwareCard({
  hw, units, model, quant, ctx, kvBytes, runtime, canCompute, anchor, onUnits, onRemove,
}: {
  hw: Hardware; units: number; model: Model; quant: string; ctx: number; kvBytes: number; runtime: Runtime;
  canCompute: boolean; anchor: HardwareBenchmark | null; onUnits: (u: number) => void; onRemove: () => void;
}) {
  const fit = fitCheck(model, hw, { quant, contextLength: ctx, kvPrecisionBytes: kvBytes, numUnits: units, runtime, concurrency: 1 });
  const dec = decodeRoofline(model, hw, { quant, contextLength: ctx, kvPrecisionBytes: kvBytes, numUnits: units, runtime });
  const pre = prefillTTFT(model, hw, { quant, promptTokens: Math.min(ctx, 4096), numUnits: units });
  const usable = fit.usableBytes;
  const wFrac = fit.weightsBytes / usable, kFrac = fit.kvBytes / usable, oFrac = fit.overheadBytes / usable;
  const used = wFrac + kFrac + oFrac;

  return (
    <div className="border border-[var(--color-border)] rounded-md p-3 bg-[var(--color-surface-warm)]">
      <div className="flex items-start justify-between mb-2">
        <div>
          <a href={`/hardware/${hw.slug}`} className="text-sm text-[var(--color-text)] no-underline hover:underline">{hw.name}</a>
          <p className="font-mono text-[10px] text-[var(--color-text-subtle)]">{HARDWARE_CLASS_LABEL[hw.class]} · {formatBandwidth(hw.memory_bandwidth_gbs)} · {hw.memory_capacity_gb} GB {MEMORY_TYPE_LABEL[hw.memory_type]}</p>
        </div>
        <button onClick={onRemove} className="font-mono text-[10px] text-[var(--color-text-subtle)] hover:text-[var(--color-text)] cursor-pointer" title="Remove">✕</button>
      </div>
      <div className="flex items-center gap-2 mb-3">
        <span className="font-mono text-[10px] uppercase tracking-wider text-[var(--color-text-subtle)]">Units</span>
        {[1, 2, 4, 8].map((u) => (
          <button key={u} onClick={() => onUnits(u)} className={`font-mono text-xs px-1.5 py-0.5 rounded border cursor-pointer ${units === u ? "border-[var(--color-text)] text-[var(--color-text)]" : "border-[var(--color-border)] text-[var(--color-text-subtle)]"}`}>{u}</button>
        ))}
        {units > 1 && hw.interconnect !== "none" && <span className="font-mono text-[9px] text-[var(--color-text-subtle)]">{hw.interconnect}</span>}
      </div>
      {!canCompute ? (
        <p className="text-xs text-[var(--color-text-subtle)] italic py-4">Spec unverified, cannot compute. The memory bandwidth, capacity, or model parameter counts have not passed the verification gate yet, so no estimate is shown.</p>
      ) : (
        <>
          <div className="mb-1 flex items-center justify-between">
            <span className={`font-mono text-xs`} style={{ color: fit.fits ? "#117a60" : "#ba5b4b" }}>{fit.fits ? "Fits" : `Does not fit (needs ${formatGB(fit.requiredBytes)} of ${formatGB(usable)} usable)`}</span>
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
          <p className="font-mono text-[9px] text-[var(--color-text-subtle)] mb-3">weights {formatGB(fit.weightsBytes)} · KV {formatGB(fit.kvBytes)}{fit.kvEstimated ? " (est)" : ""} · overhead {formatGB(fit.overheadBytes)}{used > 1 ? ` · over by ${Math.round((used - 1) * 100)}%` : ""}</p>
          <div className="mb-2">
            <div className="flex items-baseline justify-between">
              <span className="font-mono text-[10px] uppercase tracking-wider text-[var(--color-text-subtle)]">Decode tokens/sec</span>
              <span className="font-mono text-[9px] text-[var(--color-text-subtle)]">ceiling {formatTokS(dec.ceilingTokS)}</span>
            </div>
            <div className="flex items-baseline gap-2">
              <span className="font-mono text-2xl text-[var(--color-text)] tabular-nums">{formatTokS(dec.lowTokS)}–{formatTokS(dec.highTokS)}</span>
              <span className="font-mono text-[10px] text-[var(--color-text-subtle)]">est. realistic ({runtime})</span>
            </div>
            {anchor && (
              <p className="font-mono text-[10px] text-[var(--color-text)] mt-1">measured: <span className="tabular-nums">{anchor.decode_tok_s}</span> tok/s
                <a href={anchor.source} target="_blank" rel="noopener" className="text-[var(--color-text-subtle)] hover:text-[var(--color-text)] ml-1 no-underline hover:underline">({anchor.runtime}, {anchor.as_of}) ↗</a></p>
            )}
          </div>
          {pre && <p className="font-mono text-[10px] text-[var(--color-text-subtle)] mb-2">prefill TTFT (rough): ~{pre.ttftMs < 1000 ? `${Math.round(pre.ttftMs)} ms` : `${(pre.ttftMs / 1000).toFixed(1)} s`} for a {fmtCtx(Math.min(ctx, 4096))}-token prompt</p>}
          <p className="text-xs text-[var(--color-text-muted)] leading-relaxed border-t border-[var(--color-border)] pt-2">{whyText({ hw, units, model, quant, fit, dec })}</p>
        </>
      )}
    </div>
  );
}

function whyText({ hw, units, model, quant, fit, dec }: { hw: Hardware; units: number; model: Model; quant: string; fit: ReturnType<typeof fitCheck>; dec: ReturnType<typeof decodeRoofline>; }): string {
  const cap = `${units > 1 ? `${units}× ` : ""}${hw.name}`;
  const moe = model.architecture === "moe";
  if (!fit.fits) {
    return `This model needs ${formatGB(fit.requiredBytes)} at ${quantLabel(quant)}, but ${cap} offers ${formatGB(fit.usableBytes)} of usable memory, so it does not fit. A higher-capacity box, more units, or a smaller quantization would. Capacity is the binding constraint here, not speed.`;
  }
  const bwTb = (dec.effectiveBandwidthBytesPerS / 1e12).toFixed(2);
  const perStep = formatGB(dec.bytesPerStep);
  const moeNote = moe ? ` Because this is a mixture-of-experts model, decode streams only the ${formatGB(dec.activeWeightsBytes)} of active weights per token even though all ${formatGB(fit.weightsBytes)} must stay resident, which is why it feels faster than its size.` : "";
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
function defaultBox(hardware: Hardware[]): string {
  return hardware.find((h) => h.slug === "nvidia-rtx-5090")?.slug ?? hardware[0]?.slug ?? "";
}

function readUrl(): { mode?: string; model?: string; quant?: string; ctx?: number; kv?: string; rt?: string; hw?: HwSel[]; box?: string; u?: number } {
  if (typeof window === "undefined") return {};
  const p = new URLSearchParams(window.location.search);
  const hw = p.get("hw");
  return {
    mode: p.get("mode") ?? undefined,
    model: p.get("model") ?? undefined,
    quant: p.get("quant") ?? undefined,
    ctx: p.get("ctx") ? Number(p.get("ctx")) : undefined,
    kv: p.get("kv") ?? undefined,
    rt: p.get("rt") ?? undefined,
    box: p.get("box") ?? undefined,
    u: p.get("u") ? Number(p.get("u")) : undefined,
    hw: hw ? hw.split(",").map((tok) => { const [slug, units] = tok.split(":"); return { slug, units: Number(units) || 1 }; }) : undefined,
  };
}
