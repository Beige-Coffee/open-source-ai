/**
 * Node-only loaders for the hardware catalog and the empirical benchmark
 * anchors. Read the YAML source of truth at build time for the Astro
 * pages. Do NOT import this from the React island (it uses node:fs); the
 * island fetches public/data/*.json instead.
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import yaml from "js-yaml";
import type { Hardware, HardwareBenchmark } from "./hardware";

let _hw: Hardware[] | null = null;
let _bench: HardwareBenchmark[] | null = null;

function toISO(v: unknown): string {
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  return typeof v === "string" ? v : "";
}

export function loadHardware(): Hardware[] {
  if (_hw) return _hw;
  const path = resolve(process.cwd(), "data/hardware.yaml");
  if (!existsSync(path)) {
    _hw = [];
    return _hw;
  }
  const parsed = yaml.load(readFileSync(path, "utf-8")) as { hardware?: any[] };
  _hw = (parsed?.hardware ?? []).map((h) => ({
    ...h,
    release_date: toISO(h.release_date),
  })) as Hardware[];
  return _hw;
}

export function loadHardwareBySlug(slug: string): Hardware | null {
  return loadHardware().find((h) => h.slug === slug) ?? null;
}

export function loadHardwareBenchmarks(): HardwareBenchmark[] {
  if (_bench) return _bench;
  const path = resolve(process.cwd(), "data/hardware-benchmarks.yaml");
  if (!existsSync(path)) {
    _bench = [];
    return _bench;
  }
  const parsed = yaml.load(readFileSync(path, "utf-8")) as { benchmarks?: any[] };
  _bench = (parsed?.benchmarks ?? []).map((b) => ({
    ...b,
    as_of: toISO(b.as_of),
  })) as HardwareBenchmark[];
  return _bench;
}

/** Hardware ordered for the spec table: by class, then bandwidth desc. */
const CLASS_ORDER: Record<string, number> = {
  datacenter: 0,
  workstation: 1,
  "apple-unified": 2,
  "x86-unified": 3,
  "ai-pc": 4,
};

export function loadHardwareSorted(): Hardware[] {
  return loadHardware()
    .slice()
    .sort((a, b) => {
      const c = (CLASS_ORDER[a.class] ?? 9) - (CLASS_ORDER[b.class] ?? 9);
      if (c !== 0) return c;
      return b.memory_bandwidth_gbs - a.memory_bandwidth_gbs;
    });
}
