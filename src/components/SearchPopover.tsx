/**
 * Global Cmd+K (Ctrl+K) search popover.
 *
 * Mounted once in BaseLayout. Listens for ⌘K / Ctrl+K, slash key from
 * non-input context, and a `search-open` custom event (used by the
 * nav search button). Renders as a modal overlay with the same
 * MiniSearch engine the /search page uses.
 *
 * Keyboard model:
 *   ⌘K / Ctrl+K  open / close
 *   /            open (when not typing in another field)
 *   Esc          close
 *   ↑ / ↓        move selection
 *   Enter        go to selected hit
 *   ⌘Enter       "see all results" (jumps to /search?q=)
 */
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ensureIndex,
  searchAll,
  groupByType,
  snippetFor,
  TYPE_LABEL,
  TYPE_LABEL_PLURAL,
  type SearchHit,
  type SearchType,
} from "../lib/search";

const PER_TYPE_LIMIT = 4;
const TOTAL_LIMIT = 25;

export default function SearchPopover() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [activeIdx, setActiveIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Toggle open via ⌘K / Ctrl+K, "/" from non-input context, or the
  // `search-open` event the nav button dispatches.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const meta = e.metaKey || e.ctrlKey;
      if (meta && (e.key === "k" || e.key === "K")) {
        e.preventDefault();
        setOpen((v) => !v);
        return;
      }
      if (e.key === "Escape") {
        setOpen(false);
        return;
      }
      if (e.key === "/" && !open) {
        const t = e.target as HTMLElement | null;
        if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
        e.preventDefault();
        setOpen(true);
      }
    };
    const onOpen = () => setOpen(true);
    window.addEventListener("keydown", onKey);
    window.addEventListener("search-open", onOpen as EventListener);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("search-open", onOpen as EventListener);
    };
  }, [open]);

  // Focus the input and warm the index when the popover opens.
  useEffect(() => {
    if (!open) return;
    ensureIndex();
    const t = setTimeout(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    }, 0);
    return () => clearTimeout(t);
  }, [open]);

  // Lock body scroll while open.
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  // Run search on query change (debounced).
  useEffect(() => {
    if (!query.trim()) {
      setHits([]);
      setActiveIdx(0);
      return;
    }
    const t = setTimeout(async () => {
      const r = await searchAll(query, { limit: 80 });
      // Cap per-type before flattening so the popover shows breadth.
      const buckets = new Map<SearchType, SearchHit[]>();
      for (const h of r) {
        const arr = buckets.get(h.type) ?? [];
        if (arr.length < PER_TYPE_LIMIT) arr.push(h);
        buckets.set(h.type, arr);
      }
      const capped = [...buckets.values()].flat().slice(0, TOTAL_LIMIT);
      setHits(capped);
      setActiveIdx(0);
    }, 60);
    return () => clearTimeout(t);
  }, [query]);

  // Flat ranked list for keyboard nav (mirrors render order: grouped
  // by type, ranked within each group).
  const flat = useMemo(() => {
    const grouped = groupByType(hits);
    const out: SearchHit[] = [];
    for (const g of grouped) for (const h of g.hits) out.push(h);
    return out;
  }, [hits]);

  // Arrow keys + Enter when the input has focus.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setActiveIdx((i) => Math.min(flat.length - 1, i + 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setActiveIdx((i) => Math.max(0, i - 1));
      } else if (e.key === "Enter") {
        e.preventDefault();
        if (e.metaKey || e.ctrlKey) {
          window.location.href = `/search?q=${encodeURIComponent(query)}`;
          return;
        }
        const hit = flat[activeIdx];
        if (hit) go(hit);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, flat, activeIdx, query]);

  // Keep the active row in view as the user arrows down.
  useEffect(() => {
    if (!listRef.current) return;
    const el = listRef.current.querySelector(
      `[data-row-idx="${activeIdx}"]`,
    ) as HTMLElement | null;
    el?.scrollIntoView({ block: "nearest" });
  }, [activeIdx]);

  function go(hit: SearchHit) {
    setOpen(false);
    if (hit.url?.startsWith("http")) {
      window.open(hit.url, "_blank", "noopener");
    } else {
      window.location.href = hit.url;
    }
  }

  if (!open) return null;

  const grouped = groupByType(hits);
  let runningIdx = -1;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-start justify-center pt-16 sm:pt-24 px-4"
      role="dialog"
      aria-modal="true"
      aria-label="Site search"
      onClick={(e) => {
        if (e.target === e.currentTarget) setOpen(false);
      }}
    >
      <div
        className="absolute inset-0 bg-black/30 backdrop-blur-sm"
        aria-hidden="true"
        onClick={() => setOpen(false)}
      />
      <div className="relative w-full max-w-xl bg-[var(--color-surface)] border border-[var(--color-border-strong)] rounded-lg shadow-2xl overflow-hidden">
        <div className="flex items-center gap-2 px-4 py-3 border-b border-[var(--color-border)]">
          <svg
            aria-hidden="true"
            className="w-4 h-4 text-[var(--color-text-subtle)] shrink-0"
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
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search layers, glossary, projects, grants…"
            aria-label="Search the site"
            className="flex-1 bg-transparent text-sm text-[var(--color-text)] placeholder:text-[var(--color-text-subtle)] focus:outline-none"
          />
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label="Close search"
            className="font-mono text-[10px] uppercase tracking-wider px-2 py-1 border border-[var(--color-border)] rounded text-[var(--color-text-subtle)] hover:text-[var(--color-text)] hover:border-[var(--color-text-muted)] cursor-pointer"
          >
            Esc
          </button>
        </div>

        <div
          ref={listRef}
          className="max-h-[60vh] overflow-y-auto"
        >
          {!query.trim() ? (
            <div className="px-4 py-6 text-sm text-[var(--color-text-muted)]">
              <p className="mb-3">Start typing to search across the site.</p>
              <p className="font-mono text-[10px] uppercase tracking-wider text-[var(--color-text-subtle)]">
                <kbd className="px-1.5 py-0.5 border border-[var(--color-border)] rounded mr-1">↑</kbd>
                <kbd className="px-1.5 py-0.5 border border-[var(--color-border)] rounded mr-1">↓</kbd>
                navigate
                <kbd className="ml-3 px-1.5 py-0.5 border border-[var(--color-border)] rounded mr-1">↵</kbd>
                go
                <kbd className="ml-3 px-1.5 py-0.5 border border-[var(--color-border)] rounded mr-1">esc</kbd>
                close
              </p>
            </div>
          ) : flat.length === 0 ? (
            <div className="px-4 py-6 text-sm text-[var(--color-text-subtle)]">
              No results for <strong className="text-[var(--color-text)]">{query}</strong>.
            </div>
          ) : (
            <>
              {grouped.map((g) => (
                <div key={g.type} className="border-b border-[var(--color-border)] last:border-b-0">
                  <div className="px-4 pt-3 pb-1 font-mono text-[10px] uppercase tracking-wider text-[var(--color-text-subtle)]">
                    {TYPE_LABEL_PLURAL[g.type]}
                  </div>
                  <ul>
                    {g.hits.map((h) => {
                      runningIdx++;
                      const isActive = runningIdx === activeIdx;
                      return (
                        <li key={h.id} data-row-idx={runningIdx}>
                          <button
                            type="button"
                            onMouseEnter={() => setActiveIdx(runningIdx)}
                            onClick={() => go(h)}
                            className={`w-full text-left px-4 py-2 cursor-pointer flex items-baseline gap-3 transition-colors ${
                              isActive
                                ? "bg-[var(--color-accent-soft)]"
                                : "hover:bg-[var(--color-surface-warm)]"
                            }`}
                          >
                            <span className="font-mono text-[10px] uppercase tracking-wider text-[var(--color-text-subtle)] w-20 shrink-0">
                              {TYPE_LABEL[h.type]}
                            </span>
                            <span className="flex-1 min-w-0">
                              <span className="block text-sm text-[var(--color-text)] font-medium truncate">
                                {h.title}
                              </span>
                              <span className="block text-xs text-[var(--color-text-muted)] truncate">
                                {snippetFor(h, 100)}
                              </span>
                            </span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ))}
            </>
          )}
        </div>

        <div className="px-4 py-2 border-t border-[var(--color-border)] flex items-center justify-between text-[10px] font-mono text-[var(--color-text-subtle)]">
          <span>
            {query.trim() && flat.length > 0 ? (
              <a
                href={`/search?q=${encodeURIComponent(query)}`}
                className="text-[var(--color-accent)] no-underline hover:underline"
              >
                See all results for "{query}" →
              </a>
            ) : (
              <span>
                <kbd className="px-1.5 py-0.5 border border-[var(--color-border)] rounded">⌘K</kbd>{" "}
                opens this anywhere
              </span>
            )}
          </span>
          <span className="hidden sm:inline">
            <kbd className="px-1.5 py-0.5 border border-[var(--color-border)] rounded">⌘↵</kbd>{" "}
            full search
          </span>
        </div>
      </div>
    </div>
  );
}
