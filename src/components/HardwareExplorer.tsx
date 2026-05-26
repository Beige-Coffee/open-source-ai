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

type HeadlineBench = { label: string; score: number };
/** Model plus the scorecard fields the page attaches (best-at tags and
 *  one verified headline benchmark per category). */
type ExModel = Model & {
  best_at?: string[];
  headline?: { general?: HeadlineBench; code?: HeadlineBench; math?: HeadlineBench };
};

const OPENNESS_SHORT: Record<string, string> = {
  open: "open",
  "open-weights": "open-weights",
  "source-available": "source-available",
  proprietary: "proprietary",
};

interface Props {
  hardware: Hardware[];
  hardwareVerif: VerifMap;
  models: ExModel[];
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
// Sortable header + search input shared by the table views
// ---------------------------------------------------------------------------

type Sort = { key: string; dir: number };

function SortTh({ label, sortKey, popover, align, type, sort, setSort }: {
  label: string; sortKey: string; popover: string; align?: string; type?: "text" | "num";
  sort: Sort; setSort: (f: (s: Sort) => Sort) => void;
}) {
  const active = sort.key === sortKey;
  return (
    <th
      className={`px-3 py-2 th-sortable ${align ?? ""}`}
      onClick={() => setSort((s) => ({ key: sortKey, dir: s.key === sortKey ? -s.dir : (type === "text" ? 1 : -1) }))}
    >
      <span className="has-tip" data-popover={popover}>{label}</span>{active ? (sort.dir > 0 ? " ▲" : " ▼") : ""}
    </th>
  );
}

function SearchBox({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
  return (
    <input
      type="search"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className="px-2 py-1 border border-[var(--color-border)] rounded bg-[var(--color-surface)] text-sm w-56"
    />
  );
}

const TIP = {
  hardware: "The accelerator or machine, at the unit count set above.",
  memory: "Total memory across the selected units. Capacity decides whether the model fits.",
  fits: "Whether the model weights, KV cache, and runtime overhead fit in usable memory.",
  speed: "Estimated decode speed: the per-runtime realistic band over the theoretical roofline ceiling. Shown only where it fits.",
  measured: "A real measured decode number for this model and box, where a sourced benchmark exists. Click to view the source.",
  model: "An open-weights checkpoint. Size shown as total parameters, plus active parameters for mixture-of-experts.",
  quant: "Quantization: bytes-per-weight precision. Lower precision shrinks the model so more fits, with some quality loss.",
};

// ---------------------------------------------------------------------------
// Find-hardware mode (one model -> the whole catalog ranked)
// ---------------------------------------------------------------------------

function FindHardwareView({
  hardware, model, modelOk, quant, ctx, kvBytes, runtime, units, hardwareVerif, benchmarks, benchVerif,
}: any) {
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<Sort>({ key: "default", dir: -1 });

  const base = useMemo(() => {
    if (!model) return [];
    return (hardware as Hardware[]).map((hw) => {
      const ok = isHwOk(hardwareVerif, hw.slug) && modelOk;
      const fit = fitCheck(model, hw, { quant, contextLength: ctx, kvPrecisionBytes: kvBytes, numUnits: units, runtime, concurrency: 1 });
      const dec = decodeRoofline(model, hw, { quant, contextLength: ctx, kvPrecisionBytes: kvBytes, numUnits: units, runtime });
      const anchor = anchorFor(benchmarks, benchVerif, model.slug, hw.slug, quant);
      return { hw, ok, fit, dec, anchor, mem: units * hw.memory_capacity_gb };
    });
  }, [hardware, model, modelOk, quant, ctx, kvBytes, runtime, units, hardwareVerif, benchmarks, benchVerif]);

  if (!model) return null;
  const q = query.trim().toLowerCase();
  const rows = (q ? base.filter((r) => `${r.hw.name} ${r.hw.vendor} ${HARDWARE_CLASS_LABEL[r.hw.class]}`.toLowerCase().includes(q)) : base.slice());
  rows.sort((a, b) => {
    if (sort.key === "default") {
      if (a.fit.fits !== b.fit.fits) return a.fit.fits ? -1 : 1;
      return b.dec.highTokS - a.dec.highTokS;
    }
    const d = sort.dir;
    if (sort.key === "name") return a.hw.name.localeCompare(b.hw.name) * d;
    if (sort.key === "mem") return (a.mem - b.mem) * d;
    if (sort.key === "fits") return ((a.fit.fits ? 1 : 0) - (b.fit.fits ? 1 : 0)) * d;
    if (sort.key === "speed") return (a.dec.highTokS - b.dec.highTokS) * d;
    if (sort.key === "measured") return ((a.anchor?.decode_tok_s ?? -1) - (b.anchor?.decode_tok_s ?? -1)) * d;
    return 0;
  });
  const nFit = base.filter((r) => r.ok && r.fit.fits).length;

  return (
    <div className="p-4">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
        <p className="text-sm text-[var(--color-text-muted)]">
          {model.display_name} at {quantLabel(quant)}, {fmtCtx(ctx)} context, {units}× per box.
          <span className="text-[var(--color-text)] font-medium"> Fits on {nFit} of {base.length}</span> in the catalog.
        </p>
        <SearchBox value={query} onChange={setQuery} placeholder="Search hardware…" />
      </div>
      <div className="border border-[var(--color-border)] rounded-md overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="border-b border-[var(--color-border)] bg-[var(--color-surface-warm)]">
            <tr className="text-left font-mono text-[10px] uppercase tracking-wider text-[var(--color-text-subtle)]">
              <SortTh label="Hardware" sortKey="name" type="text" popover={TIP.hardware} sort={sort} setSort={setSort} />
              <SortTh label="Memory" sortKey="mem" align="text-right" popover={TIP.memory} sort={sort} setSort={setSort} />
              <SortTh label="Fits?" sortKey="fits" align="text-right" popover={TIP.fits} sort={sort} setSort={setSort} />
              <SortTh label="Realistic tok/s" sortKey="speed" align="text-right" popover={TIP.speed} sort={sort} setSort={setSort} />
              <SortTh label="Measured" sortKey="measured" align="text-right" popover={TIP.measured} sort={sort} setSort={setSort} />
            </tr>
          </thead>
          <tbody>
            {rows.map(({ hw, ok, fit, dec, anchor, mem }) => (
              <tr key={hw.slug} className={`border-t border-[var(--color-border)] ${!fit.fits ? "opacity-55" : ""}`}>
                <td className="px-3 py-1.5">
                  <a href={`/hardware/${hw.slug}`} className="text-[var(--color-text)] no-underline hover:underline">{hw.name}</a>
                  <span className="font-mono text-[10px] text-[var(--color-text-subtle)] ml-1">{units > 1 ? `${units}× · ` : ""}{HARDWARE_CLASS_LABEL[hw.class]}</span>
                </td>
                <td className="px-3 py-1.5 text-right font-mono text-xs text-[var(--color-text-subtle)] tabular-nums">{mem} GB</td>
                <td className="px-3 py-1.5 text-right font-mono text-xs">
                  {!ok ? <span className="text-[var(--color-text-subtle)]">—</span>
                    : fit.fits ? <span style={{ color: "#117a60" }}>yes</span>
                    : <span style={{ color: "#ba5b4b" }} data-popover={`Does not fit: needs ${formatGB(fit.requiredBytes)} of ${formatGB(fit.usableBytes)} usable.`}>no</span>}
                </td>
                <td className="px-3 py-1.5 text-right font-mono text-xs text-[var(--color-text)] tabular-nums">
                  {ok && fit.fits ? `${formatTokS(dec.lowTokS)}–${formatTokS(dec.highTokS)}` : "—"}
                </td>
                <td className="px-3 py-1.5 text-right font-mono text-[10px] text-[var(--color-text-muted)] tabular-nums">
                  {anchor ? <a href={anchor.source} target="_blank" rel="noopener" className="no-underline hover:underline" data-popover={`Measured ${anchor.decode_tok_s} tok/s (${anchor.runtime}, ${anchor.as_of}). Click for the source.`}>{anchor.decode_tok_s} ↗</a> : ""}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="font-mono text-[10px] text-[var(--color-text-subtle)] mt-2">
        Single-stream (solo) decode estimate, calibrated to measured tokens/sec. Click a column to sort. The realistic range is a per-runtime efficiency band plus a fixed per-token overhead; raise units (GPUs) to see multi-GPU nodes hold larger models. Decode shown only where it fits.
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// What-fits mode (one box -> every model x quant that fits)
// ---------------------------------------------------------------------------

function quantShort(id: string): string {
  return quantLabel(id).replace(/^GGUF /, "").replace(/ \/ BF16$/, "");
}

type FitRow = {
  m: ExModel;
  quants: { quant: string; dec: ReturnType<typeof decodeRoofline>; anchor: HardwareBenchmark | null }[];
  ref: { quant: string; dec: ReturnType<typeof decodeRoofline>; anchor: HardwareBenchmark | null };
  anchor: HardwareBenchmark | null;
};

function WhatFitsView({
  box, hwOk, models, modelVerif, ctx, kvBytes, runtime, units, benchmarks, benchVerif,
}: any) {
  const [family, setFamily] = useState<string>("");
  const [arch, setArch] = useState<"" | "moe" | "dense">("");
  const [openness, setOpenness] = useState<string>("");
  const [minTokS, setMinTokS] = useState<number>(0);
  const [query, setQuery] = useState<string>("");
  const [sort, setSort] = useState<Sort>({ key: "size", dir: -1 });

  // One row per model: the quants that fit (ladder order) plus the reference
  // quant whose speed we headline — Q4_K_M where it fits, otherwise the
  // highest-precision quant that does.
  const rows = useMemo<FitRow[]>(() => {
    if (!box || !hwOk) return [];
    const out: FitRow[] = [];
    for (const m of models as ExModel[]) {
      if (!isModelOk(modelVerif, m)) continue;
      const quants: FitRow["quants"] = [];
      for (const qq of QUANT_LADDER) {
        const fit = fitCheck(m, box, { quant: qq, contextLength: ctx, kvPrecisionBytes: kvBytes, numUnits: units, runtime, concurrency: 1 });
        if (!fit.fits) continue;
        const dec = decodeRoofline(m, box, { quant: qq, contextLength: ctx, kvPrecisionBytes: kvBytes, numUnits: units, runtime });
        quants.push({ quant: qq, dec, anchor: anchorFor(benchmarks, benchVerif, m.slug, box.slug, qq) });
      }
      if (quants.length === 0) continue;
      const ref = quants.find((x) => x.quant === "q4_k_m") ?? quants[0];
      out.push({ m, quants, ref, anchor: quants.find((x) => x.anchor)?.anchor ?? null });
    }
    return out;
  }, [box, hwOk, models, modelVerif, ctx, kvBytes, runtime, units, benchmarks, benchVerif]);

  const families = useMemo(() => Array.from(new Set(rows.map((r) => r.m.family))).sort(), [rows]);
  const opennesses = useMemo(() => Array.from(new Set(rows.map((r) => r.m.openness))).sort(), [rows]);
  const isMoE = (m: ExModel) => m.params_active > 0 && m.params_active < m.params_total;
  const bench = (r: FitRow, cat: "general" | "code" | "math") => r.m.headline?.[cat]?.score ?? -1;

  const q = query.trim().toLowerCase();
  const filtered = rows.filter((r) =>
    (!family || r.m.family === family) &&
    (!arch || (arch === "moe" ? isMoE(r.m) : !isMoE(r.m))) &&
    (!openness || r.m.openness === openness) &&
    r.ref.dec.highTokS >= minTokS &&
    (!q || `${r.m.display_name} ${r.m.family} ${(r.m.best_at ?? []).join(" ")}`.toLowerCase().includes(q)),
  );
  const sorted = filtered.slice().sort((a, b) => {
    const d = sort.dir;
    switch (sort.key) {
      case "name": return a.m.display_name.localeCompare(b.m.display_name) * d;
      case "ctx": return (a.m.context_window - b.m.context_window) * d;
      case "open": return a.m.openness.localeCompare(b.m.openness) * d;
      case "speed": return (a.ref.dec.highTokS - b.ref.dec.highTokS) * d;
      case "general": return (bench(a, "general") - bench(b, "general")) * d;
      case "code": return (bench(a, "code") - bench(b, "code")) * d;
      case "math": return (bench(a, "math") - bench(b, "math")) * d;
      default: return (a.m.params_total - b.m.params_total) * d; // size
    }
  });
  const filteredConfigs = filtered.reduce((s, r) => s + r.quants.length, 0);

  if (!box) return null;
  if (!hwOk) return <div className="p-4 text-sm text-[var(--color-text-subtle)] italic">Spec unverified for this box, cannot compute.</div>;

  const speedTip = (r: FitRow) =>
    "Decode tok/s by quant — " + r.quants.map((x) => `${quantShort(x.quant)} ${formatTokS(x.dec.lowTokS)}–${formatTokS(x.dec.highTokS)}${x.anchor ? ` (measured ${x.anchor.decode_tok_s})` : ""}`).join(" · ");
  const benchCell = (b?: HeadlineBench) =>
    b ? <span data-popover={`${b.label}: ${Math.round(b.score)}. Verified and dated on the model's page.`}>{Math.round(b.score)}</span> : <span className="text-[var(--color-text-subtle)]">—</span>;
  const selCls = "ml-2 px-2 py-1 border border-[var(--color-border)] rounded bg-[var(--color-surface)] text-xs normal-case tracking-normal";

  return (
    <div className="p-4">
      <p className="text-sm text-[var(--color-text-muted)] mb-3">
        Everything that fits on <span className="text-[var(--color-text)] font-medium">{units}× {box.name}</span> ({units * box.memory_capacity_gb} GB) at {fmtCtx(ctx)} context, across the precision ladder.
        <span className="text-[var(--color-text)] font-medium"> {filtered.length} models</span> fit ({filteredConfigs} configurations). Click a column to sort; hover a speed for the per-quant breakdown.
      </p>
      <div className="flex flex-wrap items-center gap-3 mb-3">
        <SearchBox value={query} onChange={setQuery} placeholder="Search models…" />
        <label className="font-mono text-[10px] uppercase tracking-wider text-[var(--color-text-subtle)]">Family
          <select value={family} onChange={(e) => setFamily(e.target.value)} className={selCls}>
            <option value="">all</option>{families.map((f) => (<option key={f} value={f}>{f}</option>))}
          </select>
        </label>
        <label className="font-mono text-[10px] uppercase tracking-wider text-[var(--color-text-subtle)]">Arch
          <select value={arch} onChange={(e) => setArch(e.target.value as "" | "moe" | "dense")} className={selCls}>
            <option value="">all</option><option value="moe">MoE</option><option value="dense">dense</option>
          </select>
        </label>
        <label className="font-mono text-[10px] uppercase tracking-wider text-[var(--color-text-subtle)]">Open
          <select value={openness} onChange={(e) => setOpenness(e.target.value)} className={selCls}>
            <option value="">all</option>{opennesses.map((o) => (<option key={o} value={o}>{OPENNESS_SHORT[o] ?? o}</option>))}
          </select>
        </label>
        <label className="font-mono text-[10px] uppercase tracking-wider text-[var(--color-text-subtle)]">Min tok/s
          <input type="number" min={0} value={minTokS} onChange={(e) => setMinTokS(Number(e.target.value) || 0)} className="ml-2 w-16 px-2 py-1 border border-[var(--color-border)] rounded bg-[var(--color-surface)] text-xs" />
        </label>
      </div>
      <div className="border border-[var(--color-border)] rounded-md overflow-x-auto max-h-[640px] overflow-y-auto">
        <table className="w-full text-sm">
          <thead className="border-b border-[var(--color-border)] bg-[var(--color-surface-warm)] sticky top-0">
            <tr className="text-left font-mono text-[10px] uppercase tracking-wider text-[var(--color-text-subtle)]">
              <SortTh label="Model" sortKey="name" type="text" popover={TIP.model} sort={sort} setSort={setSort} />
              <SortTh label="Params" sortKey="size" align="text-right" popover="Total parameters. Mixture-of-experts also lists the active parameters used per token, which set decode speed." sort={sort} setSort={setSort} />
              <SortTh label="Ctx" sortKey="ctx" align="text-right" popover="Maximum context window the model supports." sort={sort} setSort={setSort} />
              <SortTh label="Open" sortKey="open" type="text" popover="Weight-release terms: open, open-weights, or source-available." sort={sort} setSort={setSort} />
              <SortTh label="tok/s" sortKey="speed" align="text-right" popover={`${TIP.speed} Shown at the reference quant; hover for every quant.`} sort={sort} setSort={setSort} />
              <SortTh label="General" sortKey="general" align="text-right" popover="Best verified general-knowledge score (MMLU-Pro, MMLU, or GPQA). Hover a cell for which benchmark." sort={sort} setSort={setSort} />
              <SortTh label="Code" sortKey="code" align="text-right" popover="Best verified coding score (SWE-Bench, LiveCodeBench, or HumanEval)." sort={sort} setSort={setSort} />
              <SortTh label="Math" sortKey="math" align="text-right" popover="Best verified math score (AIME or MATH)." sort={sort} setSort={setSort} />
            </tr>
          </thead>
          <tbody>
            {sorted.map((r) => {
              const m = r.m;
              return (
                <tr key={m.slug} className="border-t border-[var(--color-border)]">
                  <td className="px-3 py-1.5 whitespace-nowrap">
                    <a href={`/models/${m.slug}`} className="text-[var(--color-text)] no-underline hover:underline" data-popover={m.best_at && m.best_at.length ? `Best at: ${m.best_at.join(", ")}` : undefined}>{m.display_name}</a>
                    <span className="font-mono text-[10px] text-[var(--color-text-subtle)] ml-1">{m.family}</span>
                  </td>
                  <td className="px-3 py-1.5 text-right font-mono text-xs text-[var(--color-text-muted)] tabular-nums whitespace-nowrap">
                    {fmtParams(m.params_total)}<span className="text-[var(--color-text-subtle)]"> · {isMoE(m) ? `${fmtParams(m.params_active)} act` : "dense"}</span>
                  </td>
                  <td className="px-3 py-1.5 text-right font-mono text-xs text-[var(--color-text-muted)] tabular-nums">{fmtCtx(m.context_window)}</td>
                  <td className="px-3 py-1.5 font-mono text-[10px] text-[var(--color-text-subtle)] whitespace-nowrap">{OPENNESS_SHORT[m.openness] ?? m.openness}</td>
                  <td className="px-3 py-1.5 text-right font-mono text-xs text-[var(--color-text)] tabular-nums whitespace-nowrap">
                    <span data-popover={speedTip(r)}>{formatTokS(r.ref.dec.lowTokS)}–{formatTokS(r.ref.dec.highTokS)}</span>
                    <span className="block text-[9px] text-[var(--color-text-subtle)]">
                      {quantShort(r.ref.quant)} · {r.quants.length} fit{r.anchor && <> · <a href={r.anchor.source} target="_blank" rel="noopener" className="no-underline hover:underline" data-popover={`Measured ${r.anchor.decode_tok_s} tok/s (${r.anchor.runtime}, ${r.anchor.as_of}).`}>measured ↗</a></>}
                    </span>
                  </td>
                  <td className="px-3 py-1.5 text-right font-mono text-xs text-[var(--color-text)] tabular-nums">{benchCell(m.headline?.general)}</td>
                  <td className="px-3 py-1.5 text-right font-mono text-xs text-[var(--color-text)] tabular-nums">{benchCell(m.headline?.code)}</td>
                  <td className="px-3 py-1.5 text-right font-mono text-xs text-[var(--color-text)] tabular-nums">{benchCell(m.headline?.math)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="font-mono text-[10px] text-[var(--color-text-subtle)] mt-2">
        One row per model. Single-stream (solo) decode at the reference quant — Q4_K_M where it fits, otherwise the highest-precision quant that does — calibrated to measured tokens/sec; hover a speed for every quant. Benchmark columns show each model's best verified score per category; unverified values render as —. Click a column to sort.
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
          <div className="h-4 w-full rounded bg-[var(--color-surface)] border border-[var(--color-border)] overflow-hidden flex mb-1">
            <div style={{ width: `${Math.min(100, wFrac * 100)}%`, backgroundColor: "#4a6fa5" }} className="h-full" data-popover={`Model weights: ${formatGB(fit.weightsBytes)}. Total parameters times bytes-per-weight at this quantization; all of it must stay resident in memory.`} />
            <div style={{ width: `${Math.min(100, kFrac * 100)}%`, backgroundColor: "#ba8b4b" }} className="h-full" data-popover={`KV cache: ${formatGB(fit.kvBytes)}. Per-token attention memory that grows with context length and concurrency.`} />
            <div style={{ width: `${Math.min(100, oFrac * 100)}%`, backgroundColor: "#a7a4a0" }} className="h-full" data-popover={`Framework overhead: ${formatGB(fit.overheadBytes)}. Runtime scratch, CUDA graphs, and bookkeeping beyond weights and KV.`} />
          </div>
          <div className="flex gap-3 mb-1 font-mono text-[9px] text-[var(--color-text-subtle)]">
            <span data-popover="Model weights: total parameters times bytes-per-weight at this quantization. Must all stay resident."><span style={{ color: "#4a6fa5" }}>■</span> weights</span>
            <span data-popover="KV cache: per-token attention memory that grows with context length and concurrency."><span style={{ color: "#ba8b4b" }}>■</span> KV</span>
            <span data-popover="Framework overhead: runtime scratch, CUDA graphs, and bookkeeping beyond weights and KV."><span style={{ color: "#a7a4a0" }}>■</span> overhead</span>
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
