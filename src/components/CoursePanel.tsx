"use client";

/**
 * CoursePanel: the course-mode chat panel that renders on /learn/<module>
 * pages. Fixed-sidebar layout (right ~40% of the page); always visible
 * while the learner is in the module.
 *
 * Phase-aware: in Probe/Compare/Why-Open phases the panel is a chat
 * (input + streamed agent output); in Synthesize the panel is a
 * text editor where the learner writes their summary in their own words.
 *
 * Persists chat turns to Supabase chat_turns table when the user is
 * logged in; falls back to React state only for anonymous users
 * (their work survives navigation within the tab but is lost on
 * tab close unless they sign up to stash via localStorage). The
 * signup-restore flow lives in src/pages/learn/signup.astro.
 *
 * Reuses the existing chat infrastructure for BYOK key + provider
 * abstraction + tools + streaming:
 *   - useSettings  (BYOK key from /settings)
 *   - makeClient   (Anthropic SDK client)
 *   - TOOLS        (existing 13 tools: find_*, read_*, today_news, search)
 *   - executeTool  (browser-side tool execution)
 *   - streamText   (Anthropic streaming + tool loop)
 */
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { useSettings } from "../lib/chat/store";
import { makeClient } from "../lib/chat/anthropic";
import { TOOLS, ToolBudget, executeTool } from "../lib/chat/tools";
import { streamText, describeError } from "../lib/chat/stream";
import { browserSupabase } from "../lib/course/supabase";
import { buildSystemPrompt } from "../lib/course/prompts";
import { encryptForStorage, readEncOrPlain } from "../lib/course/encrypted-io";
import type { EncBlobJson } from "../lib/course/supabase";
import {
  readAnonChat,
  readAnonModule,
  readAnonPassChoice,
  writeAnonChat,
  writeAnonSynth,
  writeAnonWhyOpen,
} from "../lib/course/anonStorage";
import {
  MODULE_BY_SLUG,
  nextPhase,
  phaseLabel,
  type ModulePhase,
  type ProgressPhase,
} from "../lib/course/modules";
import type { PriorWriting } from "../lib/course/prompts";

const PHASE_COMPLETE_TOKENS: Record<ModulePhase, string> = {
  read: "<READ_COMPLETE/>",
  probe: "<PROBE_COMPLETE/>",
  compare: "<COMPARE_COMPLETE/>",
  why_open: "<WHY_OPEN_COMPLETE/>",
  synthesize: "<SYNTHESIZE_COMPLETE/>",
};

interface ChatTurn {
  role: "user" | "assistant";
  content: string;
  turn_index: number;
}

interface Props {
  moduleSlug: string;
  initialPhase: ProgressPhase;
  userId: string | null;
  passChoice: "fast" | "deep";
  priorWritings?: PriorWriting[];
}

export default function CoursePanel({
  moduleSlug,
  initialPhase,
  userId,
  passChoice,
  priorWritings,
}: Props): JSX.Element {
  const courseModule = MODULE_BY_SLUG[moduleSlug];
  const settings = useSettings();
  const hasKey = settings.hasKey();
  const supabase = useMemo(() => browserSupabase(), []);

  const [phase, setPhase] = useState<ProgressPhase>(initialPhase);
  const [effectivePass, setEffectivePass] = useState<"fast" | "deep">(passChoice);
  const [turns, setTurns] = useState<ChatTurn[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [streamingText, setStreamingText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [phaseCompleteSeen, setPhaseCompleteSeen] = useState(false);
  const [synthBody, setSynthBody] = useState("");
  const [whyOpenSaved, setWhyOpenSaved] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  // Reset state when phase changes or module changes.
  useEffect(() => {
    setTurns([]);
    setInput("");
    setStreamingText("");
    setError(null);
    setPhaseCompleteSeen(false);
    setWhyOpenSaved(false);
  }, [moduleSlug, phase]);

  // For anonymous users, hydrate pass_choice from localStorage on mount
  // so the depth picker on /learn/start carries through. The server-
  // provided prop is the truth for logged-in users; anonymous keeps it
  // client-side only.
  useEffect(() => {
    if (userId) return;
    const stored = readAnonPassChoice();
    if (stored && stored !== effectivePass) setEffectivePass(stored);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  // Load prior chat turns. For logged-in users, query chat_turns from
  // Supabase. For anonymous users, hydrate from localStorage so writings
  // survive intra-tab navigation. Marks phaseCompleteSeen if the most
  // recent assistant turn already contains the completion token.
  useEffect(() => {
    if (phase === "read" || phase === "complete") return;
    let cancelled = false;
    (async () => {
      let loaded: ChatTurn[] = [];
      if (userId && supabase) {
        const { data } = await supabase
          .from("chat_turns")
          .select("role, content, content_enc, turn_index")
          .eq("user_id", userId)
          .eq("module_slug", moduleSlug)
          .eq("phase", phase)
          .order("turn_index", { ascending: true });
        const rows = (data ?? []).filter(
          (t) => t.role === "user" || t.role === "assistant",
        );
        try {
          loaded = await Promise.all(
            rows.map(async (t) => ({
              role: t.role as "user" | "assistant",
              content: await readEncOrPlain(t.content_enc as EncBlobJson | null, t.content),
              turn_index: t.turn_index,
            })),
          );
        } catch (err) {
          // Locked or wrong key. Surface a clear error to the user
          // rather than silently rendering empty turns.
          if (!cancelled) {
            setError(
              "Your encrypted course data is locked. Log out and back in to unlock.",
            );
          }
          return;
        }
      } else {
        loaded = readAnonChat(moduleSlug, phase as ModulePhase);
      }
      if (cancelled) return;
      setTurns(loaded);
      const lastAssistant = [...loaded].reverse().find((t) => t.role === "assistant");
      if (lastAssistant && lastAssistant.content.includes(PHASE_COMPLETE_TOKENS[phase as ModulePhase])) {
        setPhaseCompleteSeen(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [userId, supabase, moduleSlug, phase]);

  // Load synthesize body. Logged-in -> Supabase (decrypting body_enc);
  // anonymous -> localStorage.
  useEffect(() => {
    if (phase !== "synthesize") return;
    if (userId && supabase) {
      (async () => {
        const { data } = await supabase
          .from("synthesize_notes")
          .select("body, body_enc")
          .eq("user_id", userId)
          .eq("module_slug", moduleSlug)
          .maybeSingle();
        if (!data) return;
        try {
          const text = await readEncOrPlain(data.body_enc as EncBlobJson | null, data.body);
          if (text) setSynthBody(text);
        } catch {
          setError("Your encrypted summary is locked. Log out and back in to unlock.");
        }
      })();
    } else {
      const anon = readAnonModule(moduleSlug);
      if (anon.synth) setSynthBody(anon.synth);
    }
  }, [phase, userId, supabase, moduleSlug]);

  // Auto-scroll to bottom on new messages or stream tokens.
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [turns, streamingText]);

  // Persist a single turn. Logged-in -> Supabase chat_turns. Anonymous
  // -> localStorage via the anonStorage helpers, so writings survive
  // intra-tab navigation. The signup flow at /learn/signup.astro
  // promotes anon entries to Supabase under the new account.
  const recordTurn = useCallback(
    async (role: "user" | "assistant", content: string) => {
      const newTurn: ChatTurn = {
        role,
        content,
        turn_index: turns.length,
      };
      const nextTurns = [...turns, newTurn];
      setTurns(nextTurns);
      if (phase === "read" || phase === "complete") return;
      if (userId && supabase) {
        try {
          const content_enc = await encryptForStorage(content);
          await supabase.from("chat_turns").insert({
            user_id: userId,
            module_slug: moduleSlug,
            phase,
            role,
            content_enc,
            turn_index: newTurn.turn_index,
          });
        } catch (err) {
          setError(
            "Could not save this turn: your encryption key is locked. Log out and back in.",
          );
        }
      } else if (!userId) {
        writeAnonChat(moduleSlug, phase as ModulePhase, nextTurns);
      }
    },
    [turns, userId, supabase, moduleSlug, phase],
  );

  // Send a user message, stream the agent's response.
  const send = useCallback(
    async (text: string) => {
      if (!hasKey || streaming) return;
      setError(null);
      await recordTurn("user", text);
      setInput("");
      setStreaming(true);
      setStreamingText("");
      abortRef.current = new AbortController();

      const client = makeClient({
        provider: settings.provider,
        apiKey: settings.activeKey(),
      });
      const system = buildSystemPrompt(phase as ModulePhase, {
        module: courseModule,
        passChoice: effectivePass,
        priorWritings,
      });
      const budget = new ToolBudget();
      const allMessages = [
        ...turns.map((t) => ({ role: t.role, content: t.content })),
        { role: "user" as const, content: text },
      ];

      let accumulated = "";
      // Watchdog: if nothing arrives (no deltas, no tool activity) for
      // STALL_MS, abort the stream and surface an error. Reset on each
      // delta so a slow-but-progressing stream isn't cut off.
      const STALL_MS = 45_000;
      let stallTimer: number | null = null;
      const armStallTimer = () => {
        if (stallTimer !== null) window.clearTimeout(stallTimer);
        stallTimer = window.setTimeout(() => {
          abortRef.current?.abort();
        }, STALL_MS);
      };
      armStallTimer();

      try {
        await streamText({
          client,
          model: settings.activeModel(),
          system,
          messages: allMessages,
          tools: TOOLS,
          executeTool: (call) => executeTool(call, budget),
          onDelta: (delta) => {
            accumulated += delta;
            setStreamingText(accumulated);
            armStallTimer();
          },
          signal: abortRef.current.signal,
        });
        if (accumulated.trim().length === 0) {
          // The stream finished but produced no text. Surface that
          // explicitly rather than silently appending an empty turn.
          setError(
            "The agent returned an empty response. Check your API key on /settings, or try again.",
          );
        } else {
          await recordTurn("assistant", accumulated);
          if (
            phase !== "read" &&
            phase !== "complete" &&
            accumulated.includes(PHASE_COMPLETE_TOKENS[phase as ModulePhase])
          ) {
            setPhaseCompleteSeen(true);
          }
        }
      } catch (e) {
        const aborted =
          (e as { name?: string })?.name === "AbortError" ||
          abortRef.current?.signal.aborted;
        if (aborted && accumulated.trim().length === 0) {
          setError(
            "Stopped — the agent took too long to respond. Check your API key on /settings, or try again.",
          );
        } else if (aborted) {
          // Partial response then stopped; save what we have rather
          // than discarding it.
          await recordTurn("assistant", accumulated);
        } else {
          setError(describeError(e));
        }
      } finally {
        if (stallTimer !== null) window.clearTimeout(stallTimer);
        setStreaming(false);
        setStreamingText("");
        abortRef.current = null;
      }
    },
    [
      hasKey,
      streaming,
      recordTurn,
      settings,
      phase,
      courseModule,
      effectivePass,
      priorWritings,
      turns,
    ],
  );

  // Auto-start the agent on Probe / Compare / Why-Open phases (no prior turns).
  // The agent's opening question is the first message.
  useEffect(() => {
    if (
      (phase === "probe" || phase === "compare" || phase === "why_open") &&
      turns.length === 0 &&
      hasKey &&
      !streaming
    ) {
      send("Begin.");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, turns.length, hasKey]);

  // Phase advance: clear local state, write progress to Supabase, set new phase.
  const advance = useCallback(async () => {
    if (phase === "read" || phase === "complete") return;
    const next = nextPhase(phase as ModulePhase);
    if (userId && supabase) {
      await supabase.from("module_progress").upsert({
        user_id: userId,
        module_slug: moduleSlug,
        phase: next,
        phase_started_at: new Date().toISOString(),
      });
    }
    setPhase(next);
  }, [phase, userId, supabase, moduleSlug]);

  // Save synthesize body. Logged-in -> Supabase synthesize_notes encrypted
  // into body_enc; anonymous -> localStorage.
  const saveSynth = useCallback(
    async (body: string) => {
      if (userId && supabase) {
        try {
          const body_enc = await encryptForStorage(body);
          await supabase.from("synthesize_notes").upsert({
            user_id: userId,
            module_slug: moduleSlug,
            body_enc,
          });
        } catch {
          setError("Could not save your summary: encryption key is locked.");
        }
      } else if (!userId) {
        writeAnonSynth(moduleSlug, body);
      }
    },
    [userId, supabase, moduleSlug],
  );

  // Save the last substantive user turn from the Why-Open phase.
  // Logged-in -> direct upsert to why_open_notes with body_enc (encryption
  // happens client-side so the server never sees plaintext).
  // Anonymous -> localStorage; signup will promote it later.
  const saveWhyOpen = useCallback(async () => {
    if (phase !== "why_open") return;
    const lastUser = [...turns].reverse().find((t) => t.role === "user");
    const body = lastUser?.content?.trim() ?? "";
    if (body.length < 20) {
      setError("Your last answer is too short to save. Write more, then try again.");
      return;
    }
    if (userId && supabase) {
      try {
        const body_enc = await encryptForStorage(body);
        const { error: e } = await supabase.from("why_open_notes").upsert({
          user_id: userId,
          module_slug: moduleSlug,
          body_enc,
        });
        if (e) {
          setError(`Save failed: ${e.message}`);
          return;
        }
      } catch (err) {
        setError(`Save failed: ${err instanceof Error ? err.message : String(err)}`);
        return;
      }
    } else if (!userId) {
      writeAnonWhyOpen(moduleSlug, body);
    }
    setWhyOpenSaved(true);
  }, [phase, userId, supabase, turns, moduleSlug]);

  // ---- Render ----

  if (!hasKey) {
    return (
      <div class="p-4 text-sm text-[var(--color-text-muted)]">
        <p class="mb-3">
          The course agent needs your API key to drive the dialogue.
        </p>
        <p class="mb-4">
          Open <a href="/settings" class="text-[var(--color-text)] underline">Settings</a> and paste an Anthropic or OpenRouter key. It stays in your browser; the server never sees it.
        </p>
        <a
          href="/settings"
          class="inline-block px-3 py-1.5 text-xs rounded border border-[var(--color-border-strong)] bg-[var(--color-surface)] hover:bg-[var(--color-surface-warm)] no-underline text-[var(--color-text)]"
        >
          Open Settings →
        </a>
      </div>
    );
  }

  function PhaseHeader() {
    return (
      <div class="px-4 py-2 border-b border-[var(--color-border)] flex items-baseline justify-between">
        <span class="font-mono text-xs uppercase tracking-wider text-[var(--color-text-subtle)]">
          Course agent
        </span>
        <span class="font-mono text-[10px] text-[var(--color-text-subtle)]">
          {phaseLabel(phase)}
        </span>
      </div>
    );
  }

  if (phase === "read") {
    return (
      <>
        <PhaseHeader />
        <div class="p-4 text-sm text-[var(--color-text-muted)] leading-relaxed">
          <p>
            Reading phase. The agent waits until you advance to Probe;
            then the dialogue begins.
          </p>
        </div>
      </>
    );
  }

  if (phase === "complete") {
    return (
      <>
        <PhaseHeader />
        <div class="p-4 text-sm text-[var(--color-text-muted)] leading-relaxed">
          <p>
            You've completed this module. Use the navigation below the
            content to move to the next module, or revisit a phase by
            clicking the ribbon above.
          </p>
        </div>
      </>
    );
  }

  if (phase === "synthesize") {
    return (
      <>
        <PhaseHeader />
        <div class="flex-1 flex flex-col p-4 gap-3">
          <p class="text-xs text-[var(--color-text-subtle)] leading-relaxed">
            Write your own summary of this layer in your own words.
            One paragraph for fast pass; several paragraphs for deep
            pass. Save as you go.
          </p>
          <textarea
            value={synthBody}
            onInput={(e) => setSynthBody((e.target as HTMLTextAreaElement).value)}
            onBlur={() => saveSynth(synthBody)}
            placeholder="My summary of this layer..."
            class="flex-1 min-h-[200px] p-3 border border-[var(--color-border-strong)] rounded-md bg-[var(--color-surface)] text-sm leading-relaxed resize-none"
          />
          <div class="flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={() => saveSynth(synthBody)}
              class="text-xs px-3 py-1.5 rounded-md text-[var(--color-text-muted)] hover:text-[var(--color-text)] border border-[var(--color-border)]"
            >
              Save
            </button>
            <button
              type="button"
              onClick={async () => {
                await saveSynth(synthBody);
                await advance();
              }}
              disabled={synthBody.trim().length < 50}
              class="text-xs px-3 py-1.5 rounded-md bg-[var(--color-accent-strong)] text-white disabled:bg-[var(--color-border)] disabled:text-[var(--color-text-subtle)] cursor-pointer"
            >
              Done · complete module
            </button>
          </div>
        </div>
      </>
    );
  }

  // Probe / Compare / Why-Open: chat UI.
  return (
    <>
      <PhaseHeader />
      <div ref={scrollRef} class="flex-1 overflow-y-auto p-3 space-y-3 text-sm">
        {turns.map((t, i) => (
          <div
            key={i}
            class={
              t.role === "user"
                ? "ml-6 p-3 rounded-md bg-[var(--color-surface-warm)] border border-[var(--color-border)]"
                : "mr-6 p-3 rounded-md bg-[var(--color-surface)] border border-[var(--color-border)]"
            }
          >
            <div class="font-mono text-[10px] uppercase tracking-wider text-[var(--color-text-subtle)] mb-1">
              {t.role}
            </div>
            <div class="prose prose-sm max-w-none text-[var(--color-text)] leading-relaxed whitespace-pre-wrap break-words">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                {t.content.replace(PHASE_COMPLETE_TOKENS[phase as ModulePhase] ?? "", "")}
              </ReactMarkdown>
            </div>
          </div>
        ))}
        {streaming && streamingText && (
          <div class="mr-6 p-3 rounded-md bg-[var(--color-surface)] border border-[var(--color-border)]">
            <div class="font-mono text-[10px] uppercase tracking-wider text-[var(--color-text-subtle)] mb-1">
              assistant
            </div>
            <div class="prose prose-sm max-w-none text-[var(--color-text)] leading-relaxed whitespace-pre-wrap break-words">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                {streamingText.replace(PHASE_COMPLETE_TOKENS[phase as ModulePhase] ?? "", "")}
              </ReactMarkdown>
            </div>
          </div>
        )}
        {streaming && !streamingText && (
          <div class="flex items-center justify-between gap-2">
            <p class="text-xs text-[var(--color-text-subtle)] italic">
              Thinking...
            </p>
            <button
              type="button"
              onClick={() => abortRef.current?.abort()}
              class="text-xs px-2 py-1 rounded-md border border-[var(--color-border)] text-[var(--color-text-muted)] hover:text-[var(--color-text)] hover:border-[var(--color-border-strong)] cursor-pointer"
            >
              Stop
            </button>
          </div>
        )}
        {error && (
          <p class="text-xs text-red-700 bg-red-50 border border-red-200 px-3 py-2 rounded">
            {error}
          </p>
        )}
      </div>
      <form
        onSubmit={(e: FormEvent) => {
          e.preventDefault();
          if (!input.trim()) return;
          send(input.trim());
        }}
        class="p-3 border-t border-[var(--color-border)] flex gap-2"
      >
        <input
          type="text"
          value={input}
          onInput={(e) => setInput((e.target as HTMLInputElement).value)}
          disabled={streaming}
          placeholder={
            streaming
              ? "Agent is responding..."
              : "Your answer..."
          }
          class="flex-1 px-3 py-1.5 border border-[var(--color-border-strong)] rounded-md bg-[var(--color-surface)] text-sm disabled:bg-[var(--color-surface-warm)]"
        />
        <button
          type="submit"
          disabled={streaming || !input.trim()}
          class="px-3 py-1.5 rounded-md bg-[var(--color-accent-strong)] text-white text-sm disabled:bg-[var(--color-border)] disabled:text-[var(--color-text-subtle)] cursor-pointer"
        >
          Send
        </button>
      </form>
      {phaseCompleteSeen && (
        <div class="px-3 py-2 border-t border-[var(--color-border)] bg-[var(--color-surface-warm)] flex items-center justify-between gap-2 flex-wrap">
          <span class="text-xs text-[var(--color-text-muted)]">
            {phase === "why_open" && !whyOpenSaved
              ? "Save your answer to your Personal Notes before continuing."
              : "The agent says this phase is done."}
          </span>
          <div class="flex gap-2">
            {phase === "why_open" && !whyOpenSaved && (
              <button
                type="button"
                onClick={saveWhyOpen}
                class="text-xs px-3 py-1.5 rounded-md border border-[var(--color-border-strong)] bg-[var(--color-surface)] hover:bg-[var(--color-surface-warm)] cursor-pointer"
              >
                Save my answer for my Personal Notes
              </button>
            )}
            {phase === "why_open" && whyOpenSaved && (
              <span class="text-xs text-[var(--color-text-muted)] italic px-2 py-1">
                Saved.
              </span>
            )}
            <button
              type="button"
              onClick={advance}
              class="text-xs px-3 py-1.5 rounded-md bg-[var(--color-accent-strong)] text-white cursor-pointer"
            >
              Continue to {phaseLabel(nextPhase(phase as ModulePhase))} →
            </button>
          </div>
        </div>
      )}
    </>
  );
}
