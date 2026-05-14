"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
} from "react";
import { useSettings, useThreads } from "../lib/chat/store";
import { makeClient } from "../lib/chat/anthropic";
import { TOOLS, ToolBudget, executeTool } from "../lib/chat/tools";
import { pickPrompt, buildContextBlock } from "../lib/chat/prompts";
import { streamText, describeError } from "../lib/chat/stream";
import { chunkText, citationHref, citationLabel } from "../lib/chat/citations";
import type { ChatMessage, Mode, PageContext, ToolEventLog } from "../lib/chat/types";

// ----------------------------------------------------------------------
// Page context derivation from window.location
// ----------------------------------------------------------------------

function derivePageContext(): PageContext {
  if (typeof window === "undefined") {
    return { pathname: "/" };
  }
  const pathname = window.location.pathname;
  const m = (re: RegExp) => pathname.match(re);
  let entity: PageContext["entity"];
  let r;
  if ((r = m(/^\/stack\/([^/]+)\/?$/))) {
    entity = { kind: "layer", slug: r[1] };
  } else if ((r = m(/^\/grants\/funder\/([^/]+)\/?$/))) {
    entity = { kind: "funder", slug: r[1] };
  } else if ((r = m(/^\/news\/([^/]+)\/?$/))) {
    entity = { kind: "news", date: r[1] };
  } else if ((r = m(/^\/learn\/([^/]+)\/?$/))) {
    entity = { kind: "layer", slug: r[1] };
  }
  return { pathname, entity };
}

function defaultModeFor(ctx: PageContext): Mode {
  // Socratic on /learn; Answer everywhere else.
  if (ctx.pathname.startsWith("/learn")) {
    return "socratic";
  }
  return "answer";
}

function threadKeyFor(ctx: PageContext): string {
  if (ctx.entity) {
    return `${ctx.entity.kind}:${"slug" in ctx.entity ? ctx.entity.slug : ctx.entity.date}`;
  }
  return `path:${ctx.pathname}`;
}

// ----------------------------------------------------------------------
// Inline rendering with citation pills
// ----------------------------------------------------------------------

function RenderedMessage({ text }: { text: string }) {
  const chunks = chunkText(text);
  return (
    <div className="text-sm leading-relaxed whitespace-pre-wrap break-words text-[var(--color-text)]">
      {chunks.map((c, i) => {
        if (c.kind === "text") return <span key={i}>{c.text}</span>;
        const href = citationHref(c.citation);
        return (
          <a
            key={i}
            href={href}
            className="inline-block align-baseline mx-0.5 px-1.5 py-0.5 rounded text-[10px] font-mono uppercase tracking-wider border border-[var(--color-accent)] text-[var(--color-accent)] bg-[var(--color-accent-soft)] no-underline hover:bg-white"
            title={`${c.citation.kind}: ${c.citation.ref}`}
          >
            {c.citation.kind}: {citationLabel(c.citation)}
          </a>
        );
      })}
    </div>
  );
}

// ----------------------------------------------------------------------
// Tool trace (collapsed by default; click to expand and see what ran)
// ----------------------------------------------------------------------

function ToolTrace({ events }: { events: ToolEventLog[] }) {
  if (!events || events.length === 0) return null;
  return (
    <details className="mt-2 text-xs">
      <summary className="cursor-pointer font-mono text-[10px] uppercase tracking-wider text-[var(--color-text-subtle)]">
        {events.length} tool {events.length === 1 ? "call" : "calls"}
      </summary>
      <ul className="mt-1 space-y-1 pl-3">
        {events.map((e) => (
          <li key={e.id} className="font-mono text-[10px] text-[var(--color-text-muted)]">
            <span className={e.done ? "text-[var(--color-status-fresh)]" : "text-[var(--color-text-subtle)]"}>
              {e.done ? "✓" : "…"}
            </span>{" "}
            {e.name}({Object.keys(e.input).join(", ")}){" "}
            {e.cached ? <span className="text-[var(--color-text-subtle)]">cached</span> : null}
          </li>
        ))}
      </ul>
    </details>
  );
}

// ----------------------------------------------------------------------
// Main component
// ----------------------------------------------------------------------

const SUGGESTIONS_BY_MODE: Record<Mode, string[]> = {
  answer: [
    "Which funders cross over from Bitcoin OSS to AI?",
    "Show me grants under $100K at the identity-trust layer",
    "What's vLLM and why does it matter for local AI?",
    "Recent news at the runtime layer?",
  ],
  socratic: [
    "Help me understand why memory bandwidth is the local-AI constraint",
    "Walk me through what OSAID v2.0 is fighting about",
    "Why do closed agents defeat open weights?",
    "What's the load-bearing claim for sovereign training?",
  ],
};

export default function ChatBubble() {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [pageCtx, setPageCtx] = useState<PageContext>({ pathname: "/" });
  const [width, setWidth] = useState(420);
  const [resizing, setResizing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [input, setInput] = useState("");

  const provider = useSettings((s) => s.provider);
  const hasKey = useSettings((s) => s.hasKey);
  const activeKey = useSettings((s) => s.activeKey);
  const activeModel = useSettings((s) => s.activeModel);
  const enterToSend = useSettings((s) => s.enterToSend);

  const preferredMode = useThreads((s) => s.preferredMode);
  const setPreferredMode = useThreads((s) => s.setPreferredMode);
  const append = useThreads((s) => s.append);
  const setLastContent = useThreads((s) => s.setLastContent);
  const patchLast = useThreads((s) => s.patchLast);
  const setStreaming = useThreads((s) => s.setStreaming);
  const reset = useThreads((s) => s.reset);
  const threadsAll = useThreads((s) => s.threads);

  // Hydration: mount + read URL.
  useEffect(() => {
    setMounted(true);
    setPageCtx(derivePageContext());
    const onPop = () => setPageCtx(derivePageContext());
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  // Persist + restore width.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const saved = Number(localStorage.getItem("oss-ai-chat-width"));
    if (Number.isFinite(saved) && saved >= 320) {
      setWidth(Math.min(saved, Math.min(720, window.innerWidth - 80)));
    }
  }, []);
  useEffect(() => {
    if (typeof window === "undefined") return;
    localStorage.setItem("oss-ai-chat-width", String(width));
  }, [width]);

  // Resize handlers.
  const onResizeMove = (e: MouseEvent) => {
    if (!resizing) return;
    const max = Math.min(720, window.innerWidth - 80);
    setWidth(Math.max(320, Math.min(max, window.innerWidth - e.clientX)));
  };
  const onResizeUp = () => setResizing(false);
  useEffect(() => {
    if (!resizing) return;
    window.addEventListener("mousemove", onResizeMove);
    window.addEventListener("mouseup", onResizeUp);
    return () => {
      window.removeEventListener("mousemove", onResizeMove);
      window.removeEventListener("mouseup", onResizeUp);
    };
  }, [resizing]);

  const ctxKey = useMemo(() => threadKeyFor(pageCtx), [pageCtx]);
  const thread = threadsAll[ctxKey] ?? { messages: [], isStreaming: false };
  const mode: Mode = preferredMode ?? defaultModeFor(pageCtx);

  const scrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [thread.messages.length, open, thread.isStreaming]);

  async function send(promptText: string) {
    setError(null);
    if (!promptText.trim()) return;
    if (!hasKey()) {
      setError("No API key set. Open Settings to add one.");
      return;
    }
    const key = activeKey();
    const userMsg: ChatMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content: promptText,
      createdAt: Date.now(),
    };
    append(ctxKey, userMsg);
    const assistantMsg: ChatMessage = {
      id: crypto.randomUUID(),
      role: "assistant",
      content: "",
      toolEvents: [],
      createdAt: Date.now(),
    };
    append(ctxKey, assistantMsg);
    setStreaming(ctxKey, true);

    const budget = new ToolBudget();
    const toolEvents: ToolEventLog[] = [];

    try {
      const client = makeClient(provider, key);
      const system =
        pickPrompt(mode) + "\n\n" + buildContextBlock(pageCtx);
      // Build history payload from current thread (post-append).
      const allMsgs = [...(useThreads.getState().threads[ctxKey]?.messages ?? [])];
      // Drop the trailing empty assistant placeholder for the API call.
      const apiMessages = allMsgs
        .filter((m) => !(m.role === "assistant" && m.content === ""))
        .map((m) => ({ role: m.role, content: m.content }));

      let buf = "";
      await streamText({
        client,
        model: activeModel(),
        system,
        messages: apiMessages,
        tools: TOOLS,
        executeTool: (call) => executeTool(call, budget),
        onDelta: (d) => {
          buf += d;
          setLastContent(ctxKey, buf);
        },
        onToolEvent: (ev) => {
          if (ev.kind === "start") {
            toolEvents.push({
              id: ev.id,
              name: ev.name,
              input: ev.input,
              done: false,
            });
          } else {
            const idx = toolEvents.findIndex((e) => e.id === ev.id);
            if (idx >= 0) {
              toolEvents[idx] = {
                ...toolEvents[idx],
                done: true,
                result: ev.result,
                cached: ev.cached,
              };
            }
          }
          patchLast(ctxKey, { toolEvents: [...toolEvents] });
        },
        maxTokens: 1800,
      });
    } catch (e) {
      const details = describeError(e);
      setError(
        /401|invalid|unauthor|api.key/i.test(details)
          ? `${details}. Check your API key on Settings.`
          : details,
      );
      console.error("Chat send failed:", e);
    } finally {
      setStreaming(ctxKey, false);
    }
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (thread.isStreaming) return;
    const text = input.trim();
    if (!text) return;
    setInput("");
    send(text);
  }
  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (enterToSend && e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      onSubmit(e as unknown as FormEvent);
    }
  }

  // ------------------------------------------------------------------
  // Render
  // ------------------------------------------------------------------

  if (!mounted) return null;

  // Hide on the settings page itself; redundant.
  if (pageCtx.pathname.startsWith("/settings")) return null;

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="fixed bottom-5 right-5 z-40 px-4 py-3 rounded-full bg-[var(--color-accent)] text-white shadow-lg hover:bg-[var(--color-accent-strong)] transition-colors flex items-center gap-2 text-sm font-medium"
        aria-label="Open chat"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
        </svg>
        Ask
      </button>
    );
  }

  return (
    <>
      {resizing ? (
        <div
          className="fixed inset-0 z-[60]"
          style={{ cursor: "col-resize" }}
        />
      ) : null}
      <aside
        className="fixed top-0 right-0 bottom-0 z-50 bg-[var(--color-surface)] border-l border-[var(--color-border-strong)] shadow-2xl flex flex-col"
        style={{ width: `${width}px` }}
      >
        <div
          onMouseDown={(e) => {
            e.preventDefault();
            setResizing(true);
          }}
          className="absolute left-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-[var(--color-accent-soft)]"
        />

        <header className="flex items-center justify-between px-4 py-3 border-b border-[var(--color-border)]">
          <div className="flex items-center gap-3">
            <span className="font-mono text-xs uppercase tracking-wider text-[var(--color-text-subtle)]">
              Chat
            </span>
            <div className="flex items-center gap-1 text-xs">
              <button
                type="button"
                onClick={() => setPreferredMode("answer")}
                className={`px-2 py-0.5 rounded ${mode === "answer" ? "bg-[var(--color-accent-soft)] text-[var(--color-accent)]" : "text-[var(--color-text-subtle)] hover:text-[var(--color-text)]"}`}
              >
                Answer
              </button>
              <button
                type="button"
                onClick={() => setPreferredMode("socratic")}
                className={`px-2 py-0.5 rounded ${mode === "socratic" ? "bg-[var(--color-accent-soft)] text-[var(--color-accent)]" : "text-[var(--color-text-subtle)] hover:text-[var(--color-text)]"}`}
              >
                Socratic
              </button>
              {preferredMode !== null && (
                <button
                  type="button"
                  onClick={() => setPreferredMode(null)}
                  className="ml-1 text-[10px] text-[var(--color-text-subtle)] hover:text-[var(--color-text)]"
                  title="Use the page-context default mode"
                >
                  auto
                </button>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <a
              href="/settings"
              className="text-xs text-[var(--color-text-subtle)] hover:text-[var(--color-accent)] no-underline"
              title="Open settings"
            >
              ⚙
            </a>
            <button
              type="button"
              onClick={() => reset(ctxKey)}
              className="text-xs text-[var(--color-text-subtle)] hover:text-[var(--color-accent)]"
              title="Clear thread"
              disabled={thread.isStreaming}
            >
              ✕ clear
            </button>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="text-[var(--color-text-subtle)] hover:text-[var(--color-text)] text-lg leading-none px-1"
              aria-label="Close chat"
            >
              ›
            </button>
          </div>
        </header>

        <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-3 space-y-4">
          {thread.messages.length === 0 ? (
            <div className="space-y-3">
              <p className="text-sm text-[var(--color-text-muted)]">
                {!hasKey()
                  ? "No API key yet. "
                  : `Mode: ${mode}. Page: ${pageCtx.pathname}. Try one of these or ask anything.`}
                {!hasKey() && (
                  <a href="/settings" className="text-[var(--color-accent)] hover:underline">
                    Add one on Settings
                  </a>
                )}
              </p>
              {hasKey() && (
                <ul className="space-y-1.5">
                  {SUGGESTIONS_BY_MODE[mode].map((s) => (
                    <li key={s}>
                      <button
                        type="button"
                        onClick={() => send(s)}
                        className="text-left text-sm text-[var(--color-text-muted)] hover:text-[var(--color-accent)] hover:underline w-full"
                      >
                        → {s}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ) : (
            thread.messages.map((m) => (
              <div key={m.id} className="space-y-1">
                <div className="font-mono text-[10px] uppercase tracking-wider text-[var(--color-text-subtle)]">
                  {m.role === "user" ? "You" : "Chat"}
                </div>
                {m.role === "user" ? (
                  <div className="text-sm text-[var(--color-text)] whitespace-pre-wrap break-words">
                    {m.content}
                  </div>
                ) : (
                  <>
                    <RenderedMessage text={m.content || (thread.isStreaming ? "…" : "")} />
                    {m.toolEvents && <ToolTrace events={m.toolEvents} />}
                  </>
                )}
              </div>
            ))
          )}
        </div>

        {error && (
          <div className="px-4 py-2 text-xs text-red-700 bg-red-50 border-t border-red-200">
            {error}
          </div>
        )}

        <form onSubmit={onSubmit} className="border-t border-[var(--color-border)] px-3 py-3">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder={hasKey() ? "Ask about grants, layers, projects..." : "Add an API key on Settings to chat"}
            disabled={!hasKey() || thread.isStreaming}
            rows={2}
            className="w-full px-2 py-1.5 text-sm rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] resize-none focus:outline-none focus:border-[var(--color-accent)] disabled:opacity-50"
          />
          <div className="flex items-center justify-between mt-1.5">
            <span className="text-[10px] font-mono text-[var(--color-text-subtle)]">
              {enterToSend ? "Enter to send · Shift+Enter newline" : "Cmd/Ctrl+Enter to send"}
            </span>
            <button
              type="submit"
              disabled={!hasKey() || thread.isStreaming || !input.trim()}
              className="px-3 py-1 text-xs rounded-md bg-[var(--color-accent)] text-white hover:bg-[var(--color-accent-strong)] disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {thread.isStreaming ? "…" : "Send"}
            </button>
          </div>
        </form>
      </aside>
    </>
  );
}
