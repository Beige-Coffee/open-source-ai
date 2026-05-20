/**
 * /search — full-page faceted search.
 *
 * Mirrors the grants-browser visual language: input + facet sidebar
 * left, results right. Results are grouped by content type with
 * section headers. URL `?q=` is the canonical state so any search
 * can be shared as a link.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ensureIndex,
  searchAll,
  groupByType,
  snippetFor,
  TYPE_LABEL_PLURAL,
  TYPE_LABEL,
  type SearchHit,
  type SearchType,
} from "../lib/search";

const ALL_TYPES: SearchType[] = [
  "layer",
  "glossary",
  "project",
  "grant",
  "funder",
  "news",
  "reading",
];

interface Props {
  initialQuery?: string;
}

export default function SearchPage({ initialQuery = "" }: Props) {
  const [query, setQuery] = useState(initialQuery);
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [activeTypes, setActiveTypes] = useState<Set<SearchType>>(
    new Set(ALL_TYPES),
  );
  const [loading, setLoading] = useState(false);
  const [ready, setReady] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Warm the index on mount so the first keystroke is instant.
  useEffect(() => {
    ensureIndex().then(() => setReady(true));
  }, []);

  // Reflect URL changes (back/forward navigation) into the input.
  useEffect(() => {
    const onPop = () => {
      const params = new URLSearchParams(window.location.search);
      setQuery(params.get("q") ?? "");
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  // Reflect input changes into the URL (replace, not push, so the
  // back button steps out of /search instead of through every
  // keystroke).
  useEffect(() => {
    const url = new URL(window.location.href);
    const cur = url.searchParams.get("q") ?? "";
    if (cur !== query) {
      if (query) url.searchParams.set("q", query);
      else url.searchParams.delete("q");
      window.history.replaceState(null, "", url.toString());
    }
  }, [query]);

  // Run search on query changes. 80ms debounce keeps fast typists
  // from triggering a search per keystroke.
  useEffect(() => {
    if (!query.trim()) {
      setHits([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const t = setTimeout(async () => {
      // Permissive threshold on the dedicated search page (0.08):
      // browsing context, user wants to see secondary mentions
      // ("which layer discusses Prime Intellect?", not just the
      // canonical project page). The popover uses 0.25 for the
      // opposite reason.
      const r = await searchAll(query, { limit: 100, thresholdRatio: 0.08 });
      setHits(r);
      setLoading(false);
    }, 80);
    return () => clearTimeout(t);
  }, [query]);

  // Focus the input on mount and on slash-key. Skip when the user
  // is typing into another field.
  useEffect(() => {
    inputRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "/") return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA")) return;
      e.preventDefault();
      inputRef.current?.focus();
      inputRef.current?.select();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const filtered = useMemo(
    () => hits.filter((h) => activeTypes.has(h.type)),
    [hits, activeTypes],
  );
  const grouped = useMemo(() => groupByType(filtered), [filtered]);

  const totalByType = useMemo(() => {
    const c: Partial<Record<SearchType, number>> = {};
    for (const h of hits) c[h.type] = (c[h.type] ?? 0) + 1;
    return c;
  }, [hits]);

  const toggle = (t: SearchType) => {
    setActiveTypes((prev) => {
      const next = new Set(prev);
      if (next.has(t)) next.delete(t);
      else next.add(t);
      return next;
    });
  };

  return (
    <div className="max-w-5xl mx-auto px-6 pt-12 pb-16">
      <div className="mb-6">
        <h1 className="font-serif text-3xl font-semibold mb-1">Search</h1>
        <p className="text-sm text-[var(--color-text-muted)]">
          Search across layers, glossary, projects, grants, funders, news,
          and readings.
        </p>
      </div>

      <div className="relative mb-8">
        <svg
          aria-hidden="true"
          className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--color-text-subtle)]"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <circle cx="11" cy="11" r="7" />
          <path d="M21 21l-4.3-4.3" strokeLinecap="round" />
        </svg>
        <input
          ref={inputRef}
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Try: MoE, vLLM, sovereignty, OpenSats, mixture of experts…"
          aria-label="Search the site"
          className="w-full pl-10 pr-4 py-3 text-base rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] focus:outline-none focus:border-[var(--color-accent)] placeholder:text-[var(--color-text-subtle)]"
        />
        {!ready && (
          <span className="absolute right-3 top-1/2 -translate-y-1/2 font-mono text-[10px] text-[var(--color-text-subtle)]">
            indexing…
          </span>
        )}
      </div>

      <div className="grid gap-8 md:grid-cols-[200px_1fr] items-start">
        <aside className="md:sticky md:top-20 md:self-start border border-[var(--color-border)] rounded-md bg-[var(--color-surface)] p-4 text-sm">
          <p className="font-mono text-[10px] uppercase tracking-wider text-[var(--color-text-subtle)] mb-3">
            Filter by type
          </p>
          <ul className="space-y-2">
            {ALL_TYPES.map((t) => {
              const count = totalByType[t] ?? 0;
              const checked = activeTypes.has(t);
              return (
                <li key={t}>
                  <label className="flex items-center gap-2 cursor-pointer text-[var(--color-text-muted)] hover:text-[var(--color-text)]">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggle(t)}
                      className="accent-[var(--color-accent)]"
                    />
                    <span className="flex-1">{TYPE_LABEL_PLURAL[t]}</span>
                    {query.trim() && (
                      <span className="font-mono text-[10px] text-[var(--color-text-subtle)] tabular-nums">
                        {count}
                      </span>
                    )}
                  </label>
                </li>
              );
            })}
          </ul>
          <div className="mt-4 pt-3 border-t border-[var(--color-border)]">
            <button
              type="button"
              onClick={() => setActiveTypes(new Set(ALL_TYPES))}
              className="font-mono text-[10px] uppercase tracking-wider text-[var(--color-text-subtle)] hover:text-[var(--color-accent)] cursor-pointer"
            >
              Reset filters
            </button>
          </div>
        </aside>

        <div>
          {!query.trim() ? (
            <EmptyState />
          ) : loading && hits.length === 0 ? (
            <p className="text-sm text-[var(--color-text-subtle)]">Searching…</p>
          ) : filtered.length === 0 ? (
            <p className="text-sm text-[var(--color-text-subtle)]">
              No results for <strong>{query}</strong>.
            </p>
          ) : (
            <>
              <p className="font-mono text-[10px] uppercase tracking-wider text-[var(--color-text-subtle)] mb-4">
                {filtered.length} result{filtered.length === 1 ? "" : "s"} across{" "}
                {grouped.length} categor{grouped.length === 1 ? "y" : "ies"}
              </p>
              <div className="space-y-8">
                {grouped.map((g) => (
                  <section key={g.type}>
                    <h2 className="font-serif text-lg font-semibold mb-3 flex items-baseline gap-2">
                      <span>{TYPE_LABEL_PLURAL[g.type]}</span>
                      <span className="font-mono text-[10px] uppercase tracking-wider text-[var(--color-text-subtle)] tabular-nums">
                        {g.hits.length}
                      </span>
                    </h2>
                    <ul className="space-y-3">
                      {g.hits.map((h) => (
                        <ResultRow key={h.id} hit={h} />
                      ))}
                    </ul>
                  </section>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function ResultRow({ hit }: { hit: SearchHit }) {
  const snippet = snippetFor(hit, 180);
  const isExternal = hit.url?.startsWith("http");
  return (
    <li className="border border-[var(--color-border)] rounded-md p-4 bg-[var(--color-surface)] hover:border-[var(--color-border-strong)] hover:bg-[var(--color-surface-warm)] transition-colors">
      <div className="flex items-baseline gap-3 mb-1 flex-wrap">
        <TypePill type={hit.type} />
        <a
          href={hit.url}
          target={isExternal ? "_blank" : undefined}
          rel={isExternal ? "noopener noreferrer" : undefined}
          className="font-medium text-[var(--color-text)] hover:text-[var(--color-accent)] no-underline hover:no-underline"
        >
          {hit.title}
          {isExternal && (
            <span
              aria-hidden="true"
              className="ml-1 text-[10px] text-[var(--color-text-subtle)]"
            >
              ↗
            </span>
          )}
        </a>
      </div>
      {snippet && (
        <p className="text-sm text-[var(--color-text-muted)] leading-relaxed mt-1">
          {snippet}
        </p>
      )}
      <MetaLine hit={hit} />
    </li>
  );
}

function MetaLine({ hit }: { hit: SearchHit }) {
  const m = (hit.meta ?? {}) as Record<string, unknown>;
  const bits: string[] = [];
  if (hit.type === "grant") {
    if (m.funder) bits.push(`Funder: ${m.funder}`);
    if (m.recipient) bits.push(`→ ${m.recipient}`);
    if (m.amount_label) bits.push(String(m.amount_label));
    if (m.date) bits.push(String(m.date));
  } else if (hit.type === "funder") {
    if (m.region) bits.push(String(m.region));
    if (m.type) bits.push(String(m.type));
  } else if (hit.type === "project") {
    if (m.focus) bits.push(String(m.focus));
    if (m.maturity) bits.push(String(m.maturity));
  } else if (hit.type === "reading") {
    if (m.source) bits.push(String(m.source));
    if (m.year) bits.push(String(m.year));
    if (m.type) bits.push(String(m.type));
  } else if (hit.type === "news") {
    if (m.item_count) bits.push(`${m.item_count} items`);
  }
  if (hit.layers.length > 0) {
    bits.push(hit.layers.slice(0, 3).join(" · "));
  }
  if (bits.length === 0) return null;
  return (
    <p className="font-mono text-[10px] uppercase tracking-wider text-[var(--color-text-subtle)] mt-2">
      {bits.join("  ·  ")}
    </p>
  );
}

function TypePill({ type }: { type: SearchType }) {
  return (
    <span className="font-mono text-[10px] uppercase tracking-wider px-2 py-0.5 border border-[var(--color-border)] rounded text-[var(--color-text-muted)] bg-[var(--color-surface)] whitespace-nowrap">
      {TYPE_LABEL[type]}
    </span>
  );
}

function EmptyState() {
  const examples = [
    { q: "MoE", note: "glossary, projects" },
    { q: "vLLM", note: "project + grants + news" },
    { q: "OpenSats", note: "funder + grants" },
    { q: "sovereignty", note: "layer + funders + readings" },
    { q: "RISC-V", note: "silicon + readings" },
    { q: "MCP", note: "protocol + glossary" },
  ];
  return (
    <div className="text-sm text-[var(--color-text-muted)]">
      <p className="mb-3">Type a term to begin. A few starters:</p>
      <ul className="space-y-1.5">
        {examples.map((e) => (
          <li key={e.q} className="font-mono text-xs">
            <a
              href={`/search?q=${encodeURIComponent(e.q)}`}
              className="text-[var(--color-accent)] no-underline hover:underline"
            >
              {e.q}
            </a>
            <span className="ml-2 text-[var(--color-text-subtle)] normal-case">
              — {e.note}
            </span>
          </li>
        ))}
      </ul>
      <p className="mt-6 text-xs text-[var(--color-text-subtle)]">
        Tip: press <kbd className="font-mono px-1.5 py-0.5 border border-[var(--color-border)] rounded text-[var(--color-text-muted)]">/</kbd> from anywhere on this page to refocus the search box, or <kbd className="font-mono px-1.5 py-0.5 border border-[var(--color-border)] rounded text-[var(--color-text-muted)]">⌘K</kbd> from any page to open the quick-search popover.
      </p>
    </div>
  );
}
