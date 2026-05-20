"use client";

import {
  Fragment,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { useSettings, useThreads, type Thread } from "../lib/chat/store";
import { makeClient } from "../lib/chat/anthropic";
import { TOOLS, ToolBudget, executeTool } from "../lib/chat/tools";
import { ANSWER_SYSTEM_PROMPT, buildContextBlock } from "../lib/chat/prompts";
import { streamText, describeError } from "../lib/chat/stream";
import {
  chunkText,
  citationHref,
  citationLabel,
  type ParsedCitation,
} from "../lib/chat/citations";
import { suggestionsForContext, GENERIC_SUGGESTIONS } from "../lib/chat/suggestions";
import type { ChatMessage, PageContext, ToolEventLog } from "../lib/chat/types";

// ----------------------------------------------------------------------
// Page context derivation (still useful: agent system prompt sees the
// current page so it can ground "this layer" / "this funder" questions).
// ----------------------------------------------------------------------

function derivePageContext(): PageContext {
  if (typeof window === "undefined") return { pathname: "/" };
  const pathname = window.location.pathname;
  const m = (re: RegExp) => pathname.match(re);
  let entity: PageContext["entity"];
  let r;
  if ((r = m(/^\/stack\/([^/]+)\/?$/))) {
    entity = { kind: "layer", slug: r[1] };
  } else if ((r = m(/^\/grants\/funder\/([^/]+)\/?$/))) {
    entity = { kind: "funder", slug: r[1] };
  } else if ((r = m(/^\/projects\/([^/]+)\/?$/))) {
    entity = { kind: "project", slug: r[1] };
  } else if ((r = m(/^\/glossary\/([^/]+)\/?$/))) {
    entity = { kind: "glossary", slug: r[1] };
  } else if ((r = m(/^\/news\/([^/]+)\/?$/))) {
    entity = { kind: "news", date: r[1] };
  } else if ((r = m(/^\/models\/([^/]+)\/?$/)) && r[1] !== "compare") {
    entity = { kind: "model", slug: r[1] };
  }
  return { pathname, entity };
}

// ----------------------------------------------------------------------
// Citation pill + markdown-aware message renderer
// ----------------------------------------------------------------------

function CitationPill({ citation }: { citation: ParsedCitation }) {
  const href = citationHref(citation);
  return (
    <a
      href={href}
      className="inline-block align-baseline mx-0.5 px-1.5 py-0.5 rounded text-[10px] font-mono uppercase tracking-wider border border-[var(--color-accent)] text-[var(--color-accent)] bg-[var(--color-accent-soft)] no-underline hover:bg-white"
      title={`${citation.kind}: ${citation.ref}`}
    >
      {citation.kind}: {citationLabel(citation)}
    </a>
  );
}

function withCitations(s: string): ReactNode {
  const chunks = chunkText(s);
  if (chunks.length === 1 && chunks[0].kind === "text") return s;
  return (
    <>
      {chunks.map((c, i) =>
        c.kind === "text" ? (
          <Fragment key={i}>{c.text}</Fragment>
        ) : (
          <CitationPill key={i} citation={c.citation} />
        ),
      )}
    </>
  );
}

function injectCitations(children: ReactNode): ReactNode {
  if (children == null) return children;
  if (typeof children === "string") return withCitations(children);
  if (Array.isArray(children)) {
    return children.map((child, i) =>
      typeof child === "string" ? (
        <Fragment key={i}>{withCitations(child)}</Fragment>
      ) : (
        <Fragment key={i}>{child}</Fragment>
      ),
    );
  }
  return children;
}

function RenderedMessage({ text }: { text: string }) {
  return (
    <div className="text-sm leading-relaxed break-words text-[var(--color-text)] chat-md">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          p: ({ children }) => <p>{injectCitations(children)}</p>,
          li: ({ children }) => <li>{injectCitations(children)}</li>,
          strong: ({ children }) => <strong>{injectCitations(children)}</strong>,
          em: ({ children }) => <em>{injectCitations(children)}</em>,
          a: ({ href, children }) => (
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="underline text-[var(--color-text)] hover:text-[var(--color-accent-strong)]"
            >
              {children}
            </a>
          ),
          code: ({ children }) => (
            <code className="font-mono text-[0.85em] bg-[var(--color-surface-warm)] px-1 py-0.5 rounded">
              {children}
            </code>
          ),
          h1: ({ children }) => <h3 className="font-serif text-base mt-3 mb-1">{injectCitations(children)}</h3>,
          h2: ({ children }) => <h3 className="font-serif text-base mt-3 mb-1">{injectCitations(children)}</h3>,
          h3: ({ children }) => <h3 className="font-serif text-base mt-3 mb-1">{injectCitations(children)}</h3>,
          h4: ({ children }) => <h4 className="font-serif text-sm mt-2 mb-1">{injectCitations(children)}</h4>,
        }}
      >
        {text}
      </ReactMarkdown>
    </div>
  );
}

// ----------------------------------------------------------------------
// Tool trace (collapsed)
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
// Constants
// ----------------------------------------------------------------------

function autoTitleFrom(prompt: string): string {
  // Shorten to a reasonable title; cut at sentence end or 60 chars.
  const cleaned = prompt.replace(/\s+/g, " ").trim();
  if (cleaned.length <= 60) return cleaned;
  const sentenceEnd = cleaned.slice(0, 60).lastIndexOf(". ");
  if (sentenceEnd > 20) return cleaned.slice(0, sentenceEnd);
  const wordBoundary = cleaned.slice(0, 60).lastIndexOf(" ");
  return cleaned.slice(0, wordBoundary > 20 ? wordBoundary : 60) + "…";
}

function relativeTime(ts: number): string {
  const diff = Date.now() - ts;
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}d ago`;
  return new Date(ts).toLocaleDateString();
}

// ----------------------------------------------------------------------
// Main component
// ----------------------------------------------------------------------

export default function ChatBubble() {
  const [mounted, setMounted] = useState(false);
  const [pageCtx, setPageCtx] = useState<PageContext>({ pathname: "/" });
  const [width, setWidth] = useState(480);
  const [resizing, setResizing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [renamingId, setRenamingId] = useState<string | null>(null);

  const apiKey = useSettings((s) => s.apiKey);
  const model = useSettings((s) => s.model);
  const enterToSend = useSettings((s) => s.enterToSend);
  const hasKey = apiKey.length > 0;

  const threads = useThreads((s) => s.threads);
  const activeThreadId = useThreads((s) => s.activeThreadId);
  const open = useThreads((s) => s.open);
  const showThreadList = useThreads((s) => s.showThreadList);
  const setOpen = useThreads((s) => s.setOpen);
  const setShowThreadList = useThreads((s) => s.setShowThreadList);
  const createThread = useThreads((s) => s.createThread);
  const setActiveThread = useThreads((s) => s.setActiveThread);
  const renameThread = useThreads((s) => s.renameThread);
  const deleteThread = useThreads((s) => s.deleteThread);
  const clearActive = useThreads((s) => s.clearActive);
  const append = useThreads((s) => s.append);
  const setLastContent = useThreads((s) => s.setLastContent);
  const patchLast = useThreads((s) => s.patchLast);
  const setStreaming = useThreads((s) => s.setStreaming);

  const activeThread: Thread | null = useMemo(
    () => threads.find((t) => t.id === activeThreadId) ?? null,
    [threads, activeThreadId],
  );

  // Page-context-aware starter prompts. Resolved async because the
  // suggestion templates look up the entity's display name from
  // /data/*.json. Initial GENERIC_SUGGESTIONS render synchronously
  // so the empty state never shows a blank list.
  const [suggestions, setSuggestions] = useState<string[]>(GENERIC_SUGGESTIONS);
  useEffect(() => {
    let cancelled = false;
    suggestionsForContext(pageCtx).then((next) => {
      if (!cancelled) setSuggestions(next);
    });
    return () => {
      cancelled = true;
    };
  }, [pageCtx.pathname, pageCtx.entity?.kind, (pageCtx.entity as { slug?: string })?.slug]);

  // ------------------------------------------------------------------
  // Mount + page-context tracking
  // ------------------------------------------------------------------

  useEffect(() => {
    setMounted(true);
    setPageCtx(derivePageContext());
    document.getElementById("chat-panel-placeholder")?.remove();
    const onPop = () => setPageCtx(derivePageContext());
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  // ------------------------------------------------------------------
  // Push-content layout: when chat is open on wide viewports, set
  // body[data-chat-open] so CSS in global.css can reserve right margin.
  // Below the breakpoint (CSS-handled), the chat overlays instead.
  // ------------------------------------------------------------------

  useEffect(() => {
    if (typeof document === "undefined") return;
    if (open) {
      document.body.dataset.chatOpen = "true";
      document.body.style.setProperty("--chat-width", `${width}px`);
    } else {
      delete document.body.dataset.chatOpen;
      document.body.style.removeProperty("--chat-width");
    }
    return () => {
      delete document.body.dataset.chatOpen;
      document.body.style.removeProperty("--chat-width");
    };
  }, [open, width]);

  // ------------------------------------------------------------------
  // Chat-trigger handler: open chat, ensure there's an active thread,
  // send the prompt. Persists across navigation thanks to zustand.
  // ------------------------------------------------------------------

  const sendRef = useRef<((prompt: string) => void) | null>(null);
  useEffect(() => {
    function handler(e: Event) {
      const detail = (e as CustomEvent<{ prompt?: string }>).detail;
      if (!detail || !detail.prompt) return;
      setOpen(true);
      setTimeout(() => {
        if (sendRef.current) sendRef.current(detail.prompt!);
      }, 50);
    }
    window.addEventListener("chat-trigger", handler);
    return () => window.removeEventListener("chat-trigger", handler);
  }, [setOpen]);

  // ------------------------------------------------------------------
  // Persist + restore width
  // ------------------------------------------------------------------

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

  // Resize handlers
  const onResizeMove = (e: MouseEvent) => {
    if (!resizing) return;
    const max = Math.min(800, window.innerWidth - 80);
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resizing]);

  // ------------------------------------------------------------------
  // Auto-scroll on new message
  // ------------------------------------------------------------------

  const scrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [activeThread?.messages.length, open, activeThread?.isStreaming]);

  // ------------------------------------------------------------------
  // Send: route the prompt into the active thread (creates one if none)
  // ------------------------------------------------------------------

  async function send(promptText: string) {
    setError(null);
    if (!promptText.trim()) return;
    if (!hasKey) {
      setOpen(true);
      setError("No API key set. Open Settings to add one.");
      return;
    }
    // Ensure we have an active thread.
    let threadId = activeThreadId;
    if (!threadId) {
      threadId = createThread(autoTitleFrom(promptText));
    } else {
      // Auto-title an existing "New chat" on first user message.
      const t = useThreads.getState().threads.find((x) => x.id === threadId);
      if (t && t.title === "New chat" && t.messages.length === 0) {
        renameThread(threadId, autoTitleFrom(promptText));
      }
    }
    const t = useThreads.getState().threads.find((x) => x.id === threadId);
    if (t?.isStreaming) return;

    const key = apiKey;
    const userMsg: ChatMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content: promptText,
      createdAt: Date.now(),
    };
    append(threadId, userMsg);
    const assistantMsg: ChatMessage = {
      id: crypto.randomUUID(),
      role: "assistant",
      content: "",
      toolEvents: [],
      createdAt: Date.now(),
    };
    append(threadId, assistantMsg);
    setStreaming(threadId, true);

    const budget = new ToolBudget();
    const toolEvents: ToolEventLog[] = [];

    try {
      const client = makeClient(key);
      const system = ANSWER_SYSTEM_PROMPT + "\n\n" + buildContextBlock(pageCtx);
      const allMsgs = [
        ...(useThreads.getState().threads.find((x) => x.id === threadId)?.messages ?? []),
      ];
      const apiMessages = allMsgs
        .filter((m) => !(m.role === "assistant" && m.content === ""))
        .map((m) => ({ role: m.role, content: m.content }));

      let buf = "";
      await streamText({
        client,
        model,
        system,
        messages: apiMessages,
        tools: TOOLS,
        executeTool: (call) => executeTool(call, budget),
        onDelta: (d) => {
          buf += d;
          setLastContent(threadId!, buf);
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
          patchLast(threadId!, { toolEvents: [...toolEvents] });
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
      setStreaming(threadId, false);
    }
  }

  sendRef.current = send;

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (activeThread?.isStreaming) return;
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

  const messages = activeThread?.messages ?? [];
  const streaming = activeThread?.isStreaming ?? false;

  return (
    <>
      {resizing ? (
        <div className="fixed inset-0 z-[60]" style={{ cursor: "col-resize" }} />
      ) : null}
      <aside
        className="chat-panel fixed top-0 right-0 bottom-0 z-50 bg-[var(--color-surface)] border-l border-[var(--color-border-strong)] flex flex-col"
        style={{ width: `${width}px` }}
      >
        {/* Resize handle on the left edge */}
        <div
          onMouseDown={(e) => {
            e.preventDefault();
            setResizing(true);
          }}
          className="absolute left-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-[var(--color-accent-soft)]"
          aria-hidden="true"
        />

        {/* Header */}
        <header className="flex items-center justify-between gap-2 px-3 py-2.5 border-b border-[var(--color-border)]">
          <div className="flex items-center gap-2 min-w-0 flex-1">
            <button
              type="button"
              onClick={() => setShowThreadList(!showThreadList)}
              className="p-1.5 rounded hover:bg-[var(--color-surface-warm)] text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
              aria-label={showThreadList ? "Hide thread list" : "Show thread list"}
              title={showThreadList ? "Hide threads" : "Show threads"}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="3" y1="6" x2="21" y2="6"/>
                <line x1="3" y1="12" x2="21" y2="12"/>
                <line x1="3" y1="18" x2="21" y2="18"/>
              </svg>
            </button>
            <span className="font-serif text-sm text-[var(--color-text)] truncate flex-1 min-w-0" title={activeThread?.title ?? "Chat"}>
              {activeThread?.title ?? "Chat"}
            </span>
            <button
              type="button"
              onClick={() => {
                const id = createThread();
                setActiveThread(id);
              }}
              className="p-1.5 rounded hover:bg-[var(--color-surface-warm)] text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
              aria-label="New chat"
              title="New chat"
              disabled={streaming}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="12" y1="5" x2="12" y2="19"/>
                <line x1="5" y1="12" x2="19" y2="12"/>
              </svg>
            </button>
          </div>
          <div className="flex items-center gap-1">
            <a
              href="/settings"
              className="p-1.5 rounded text-[var(--color-text-subtle)] hover:text-[var(--color-accent)] hover:bg-[var(--color-surface-warm)] no-underline"
              title="Settings (API key, model)"
              aria-label="Open settings"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="3"/>
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/>
              </svg>
            </a>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="p-1.5 rounded text-[var(--color-text-subtle)] hover:text-[var(--color-text)] hover:bg-[var(--color-surface-warm)]"
              title="Close chat"
              aria-label="Close chat"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18"/>
                <line x1="6" y1="6" x2="18" y2="18"/>
              </svg>
            </button>
          </div>
        </header>

        {/* Thread-action row (kept for the per-thread Clear button). */}
        {activeThread && messages.length > 0 && (
          <div className="flex items-center justify-end px-3 py-1.5 border-b border-[var(--color-border)] bg-[var(--color-surface-warm)]">
            <button
              type="button"
              onClick={() => {
                if (confirm("Clear all messages in this thread?")) clearActive();
              }}
              className="text-[10px] font-mono uppercase tracking-wider text-[var(--color-text-subtle)] hover:text-[var(--color-text)]"
              title="Clear messages in this thread"
              disabled={streaming}
            >
              Clear
            </button>
          </div>
        )}

        <div className="flex-1 flex min-h-0">
          {/* Thread sidebar (left, collapsible) */}
          {showThreadList && (
            <nav
              className="w-44 border-r border-[var(--color-border)] bg-[var(--color-bg)] overflow-y-auto"
              aria-label="Chat threads"
            >
              <ul className="py-1">
                {threads.length === 0 && (
                  <li className="px-3 py-2 text-xs text-[var(--color-text-subtle)] italic">
                    No threads yet
                  </li>
                )}
                {threads.map((t) => (
                  <li key={t.id} className="group relative">
                    {renamingId === t.id ? (
                      <input
                        type="text"
                        defaultValue={t.title}
                        autoFocus
                        onBlur={(e) => {
                          renameThread(t.id, e.target.value);
                          setRenamingId(null);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            renameThread(t.id, e.currentTarget.value);
                            setRenamingId(null);
                          } else if (e.key === "Escape") {
                            setRenamingId(null);
                          }
                        }}
                        className="block w-full px-3 py-1.5 text-xs bg-[var(--color-surface)] border border-[var(--color-border-strong)] focus:outline-none"
                      />
                    ) : (
                      <button
                        type="button"
                        onClick={() => setActiveThread(t.id)}
                        onDoubleClick={() => setRenamingId(t.id)}
                        className={`block w-full text-left px-3 py-1.5 text-xs ${
                          t.id === activeThreadId
                            ? "bg-[var(--color-surface)] text-[var(--color-text)] font-medium"
                            : "text-[var(--color-text-muted)] hover:bg-[var(--color-surface-warm)]"
                        }`}
                        title={`${t.title} (double-click to rename)`}
                      >
                        <div className="truncate">{t.title}</div>
                        <div className="text-[10px] font-mono text-[var(--color-text-subtle)] mt-0.5">
                          {relativeTime(t.updatedAt)} · {t.messages.length} msg
                        </div>
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        if (confirm(`Delete thread "${t.title}"?`)) {
                          deleteThread(t.id);
                        }
                      }}
                      className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 p-1 text-[var(--color-text-subtle)] hover:text-[var(--color-text)]"
                      title="Delete thread"
                      aria-label="Delete thread"
                    >
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <line x1="18" y1="6" x2="6" y2="18"/>
                        <line x1="6" y1="6" x2="18" y2="18"/>
                      </svg>
                    </button>
                  </li>
                ))}
              </ul>
            </nav>
          )}

          {/* Main message column */}
          <div className="flex-1 flex flex-col min-w-0">
            <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-3 space-y-4">
              {messages.length === 0 ? (
                <div className="space-y-3">
                  {!hasKey ? (
                    <p className="text-sm text-[var(--color-text-muted)]">
                      No API key yet.{" "}
                      <a href="/settings" className="text-[var(--color-accent)] hover:underline">
                        Add one on Settings
                      </a>
                      .
                    </p>
                  ) : (
                    <ul className="space-y-1.5">
                      {suggestions.map((s) => (
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
                messages.map((m) => (
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
                        <RenderedMessage text={m.content || (streaming ? "…" : "")} />
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
                placeholder={hasKey ? "Ask about grants, layers, projects..." : "Add an API key on Settings to chat"}
                disabled={!hasKey || streaming}
                rows={2}
                className="w-full px-2 py-1.5 text-sm rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] resize-none focus:outline-none focus:border-[var(--color-accent)] disabled:opacity-50"
              />
              <div className="flex items-center justify-between mt-1.5">
                <span className="text-[10px] font-mono text-[var(--color-text-subtle)]">
                  {enterToSend ? "Enter to send · Shift+Enter newline" : "Cmd/Ctrl+Enter to send"}
                </span>
                <button
                  type="submit"
                  disabled={!hasKey || streaming || !input.trim()}
                  className="px-3 py-1 text-xs rounded-md bg-[var(--color-accent)] text-white hover:bg-[var(--color-accent-strong)] disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {streaming ? "…" : "Send"}
                </button>
              </div>
            </form>
          </div>
        </div>
      </aside>
    </>
  );
}
