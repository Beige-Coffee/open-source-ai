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
  Fragment,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  chunkText,
  citationHref,
  citationLabel,
  type ParsedCitation,
} from "../lib/chat/citations";
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

/** Turn a tool call into a short verb-led status line, like
 *  "Reading the silicon overview" or "Searching for: RISC-V".
 *  Falls back to the tool name when we don't have a friendlier
 *  phrasing. */
function humanizeTool(name: string, input: Record<string, unknown>): string {
  const arg = (k: string) =>
    typeof input?.[k] === "string" ? (input[k] as string) : "";
  switch (name) {
    case "read_layer":
      return `Reading the ${arg("slug") || "layer"} overview`;
    case "read_funder":
      return `Reading funder ${arg("slug")}`;
    case "read_grant":
      return `Reading grant "${arg("title")}"`;
    case "read_project":
      return `Reading project ${arg("slug")}`;
    case "read_prediction":
      return `Reading predictions for ${arg("layer")}`;
    case "read_glossary":
      return `Reading glossary entry ${arg("slug")}`;
    case "find_grants":
      return "Searching grants";
    case "find_funders":
      return "Searching funders";
    case "find_projects":
      return "Searching projects";
    case "find_readings":
      return "Searching readings";
    case "find_glossary":
      return "Searching glossary";
    case "today_news":
      return "Reading today's news";
    case "search":
      return `Searching the wiki for "${arg("query")}"`;
    default:
      return `Using ${name}`;
  }
}

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
  probePrimer?: string[];
}

export default function CoursePanel({
  moduleSlug,
  initialPhase,
  userId,
  passChoice,
  priorWritings,
  probePrimer,
}: Props): JSX.Element {
  const courseModule = MODULE_BY_SLUG[moduleSlug];
  // Subscribe to the specific fields we read so the panel re-renders the
  // moment the API key gets pasted on /settings (zustand persist syncs
  // store instances across tabs). Reading via the whole-store hook plus
  // a method call captures a snapshot at render time and misses updates.
  const apiKey = useSettings((s) => s.apiKey);
  const model = useSettings((s) => s.model);
  const hasKey = apiKey.length > 0;
  const supabase = useMemo(() => browserSupabase(), []);

  const [phase, setPhase] = useState<ProgressPhase>(initialPhase);
  const [effectivePass, setEffectivePass] = useState<"fast" | "deep">(passChoice);
  const [turns, setTurns] = useState<ChatTurn[]>([]);
  // Live tool trace for the currently-streaming assistant turn. Each
  // entry is one tool call. `done` flips true on the matching end event.
  // Cleared at the start of each new send().
  const [toolTrace, setToolTrace] = useState<
    Array<{ id: string; name: string; input: Record<string, unknown>; done: boolean }>
  >([]);
  // Tracks whether the load-prior-turns effect has settled for the
  // current (moduleSlug, phase). Without this, the auto-start effect
  // could fire send("Begin.") in parallel with the load query, and a
  // late-arriving setTurns(loaded) would overwrite the user turn that
  // send() just appended. See the comment on the load effect.
  const [phaseLoaded, setPhaseLoaded] = useState(false);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [streamingText, setStreamingText] = useState("");
  const [toolStatus, setToolStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [phaseCompleteSeen, setPhaseCompleteSeen] = useState(false);
  const [synthBody, setSynthBody] = useState("");
  const [whyOpenSaved, setWhyOpenSaved] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  // Auto-grow the textarea: reset height to auto so the next
  // measurement is from content alone, then set to scrollHeight.
  // CSS caps the visible height at 180px; beyond that it scrolls.
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(180, el.scrollHeight)}px`;
  }, [input]);

  // Reset state when phase changes or module changes. phaseLoaded
  // flips back to false so the auto-start effect waits for the next
  // load cycle to settle before firing send("Begin.").
  useEffect(() => {
    setTurns([]);
    setPhaseLoaded(false);
    setInput("");
    setStreamingText("");
    setToolStatus(null);
    setToolTrace([]);
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

  // Load prior chat turns for the current (moduleSlug, phase). This is
  // the ONLY effect that calls setTurns with a DB / localStorage
  // snapshot; subsequent setTurns calls only come from recordTurn,
  // which appends. Sets phaseLoaded=true at the very end so the
  // auto-start effect can fire afterwards, never in parallel.
  useEffect(() => {
    if (phase === "read" || phase === "complete") {
      setPhaseLoaded(true);
      return;
    }
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
          if (!cancelled) {
            setError(
              "Your encrypted course data is locked. Log out and back in to unlock.",
            );
            setPhaseLoaded(true);
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
      setPhaseLoaded(true);
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
  //
  // The setTurns call uses the functional updater form so two
  // recordTurn calls in a single send() sequence (the user turn and
  // the assistant turn) both see the latest state. Closing over
  // `turns` from React's render lexically (the previous shape of
  // this callback) caused the second call to start from the same
  // pre-send turns array as the first, so the assistant turn would
  // overwrite the user turn that was just appended.
  const recordTurn = useCallback(
    async (role: "user" | "assistant", content: string) => {
      let nextTurns: ChatTurn[] = [];
      let turn_index = 0;
      setTurns((prev) => {
        turn_index = prev.length;
        const newTurn: ChatTurn = { role, content, turn_index };
        nextTurns = [...prev, newTurn];
        return nextTurns;
      });
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
            turn_index,
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
    [userId, supabase, moduleSlug, phase],
  );

  // Send a user message, stream the agent's response.
  const send = useCallback(
    async (text: string) => {
      if (!hasKey || streaming) return;
      setError(null);
      // Clear the input synchronously, before recordTurn yields on
      // its supabase encrypt + insert. setTurns inside recordTurn
      // runs synchronously too, so React batches both updates into a
      // single render: the textarea empties at the exact moment the
      // message appears in the transcript above. Without this, the
      // textarea visibly carried the just-sent text for the 1-2 sec
      // it took the persistence round-trip to finish.
      setInput("");
      setStreaming(true);
      setToolTrace([]);
      await recordTurn("user", text);
      setStreamingText("");
      abortRef.current = new AbortController();

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
        // Build the client inside the try block so a missing key (or any
        // other init error) is surfaced via setError rather than leaving
        // streaming=true forever.
        const client = makeClient(apiKey);
        const system = buildSystemPrompt(phase as ModulePhase, {
          module: courseModule,
          passChoice: effectivePass,
          priorWritings,
          probePrimer,
        });
        const budget = new ToolBudget();
        const allMessages = [
          ...turns.map((t) => ({ role: t.role, content: t.content })),
          { role: "user" as const, content: text },
        ];
        await streamText({
          client,
          model,
          system,
          messages: allMessages,
          tools: TOOLS,
          executeTool: (call) => executeTool(call, budget),
          onDelta: (delta) => {
            accumulated += delta;
            setStreamingText(accumulated);
            // Don't clear toolStatus on text delta any more; tool may
            // still be in flight and we want the user to see it. The
            // status clears on the matching tool "done" event below.
            armStallTimer();
          },
          onToolEvent: (event) => {
            // Surface tool activity so the user sees the agent making
            // progress (reading the layer, searching grants, etc.)
            // instead of a silent spinner. Each event resets the stall
            // watchdog because tool calls are real progress.
            armStallTimer();
            const label = humanizeTool(event.name, event.input);
            if (event.kind === "start") {
              setToolStatus(label);
              setToolTrace((prev) => [
                ...prev,
                {
                  id: event.id,
                  name: event.name,
                  input: event.input,
                  done: false,
                },
              ]);
            } else if (event.kind === "done") {
              // Clear the live status if this was the most recent
              // start; mark the matching trace entry as done.
              setToolStatus((current) => (current === label ? null : current));
              setToolTrace((prev) =>
                prev.map((t) =>
                  t.id === event.id ? { ...t, done: true } : t,
                ),
              );
            }
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
        setToolStatus(null);
        abortRef.current = null;
      }
    },
    [
      hasKey,
      streaming,
      recordTurn,
      apiKey,
      model,
      phase,
      probePrimer,
      courseModule,
      effectivePass,
      priorWritings,
      turns,
    ],
  );

  // Auto-start the agent on Probe / Compare / Why-Open phases when no
  // prior turns exist. Gated on phaseLoaded so the load effect always
  // settles before we fire send("Begin.") — otherwise a late-arriving
  // setTurns(loaded) from the load effect would overwrite the user
  // turn that recordTurn appended, making the learner's first message
  // (and sometimes the agent's first reply) appear briefly then vanish.
  useEffect(() => {
    if (
      phaseLoaded &&
      (phase === "probe" || phase === "compare" || phase === "why_open") &&
      turns.length === 0 &&
      hasKey &&
      !streaming
    ) {
      send("Begin.");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, phaseLoaded, turns.length, hasKey]);

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
          Open <a href="/settings" class="text-[var(--color-text)] underline">Settings</a> and paste an OpenRouter key. It stays in your browser; the server never sees it.
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
  //
  // Visible message list: filter out the auto-start "Begin." user
  // turn, which is an internal kickoff prompt rather than something
  // the learner typed. Keeps the transcript clean and matches the
  // modern frontier-chat convention of not showing system priming.
  const visibleTurns = turns.filter(
    (t, i) =>
      !(
        i === 0 &&
        t.role === "user" &&
        t.content.trim().toLowerCase() === "begin."
      ),
  );

  const stripToken = (s: string) =>
    s.replace(PHASE_COMPLETE_TOKENS[phase as ModulePhase] ?? "", "");

  return (
    <>
      <PhaseHeader />
      <div ref={scrollRef} class="course-chat-scroll flex-1 overflow-y-auto px-4 py-5">
        <div class="space-y-5">
          {visibleTurns.map((t, i) => (
            <ChatMessage key={i} role={t.role} content={stripToken(t.content)} />
          ))}
          {streaming && (
            <>
              {/* Live trace: every tool call the agent has made on
                  this turn, with an inline status row for the one in
                  flight. The trace persists below the streaming text
                  so the learner can see what was researched. */}
              {toolTrace.length > 0 && (
                <ToolTrace trace={toolTrace} live={toolStatus} />
              )}
              {streamingText ? (
                <ChatMessage
                  role="assistant"
                  content={stripToken(streamingText)}
                  streaming
                />
              ) : (
                <div class="flex items-center gap-3 text-xs text-[var(--color-text-subtle)]">
                  <span class="course-typing" aria-hidden="true">
                    <span /><span /><span />
                  </span>
                  <span>{toolStatus ?? "Thinking"}</span>
                  <button
                    type="button"
                    onClick={() => abortRef.current?.abort()}
                    class="ml-auto font-mono text-[10px] uppercase tracking-wider px-2 py-0.5 rounded border border-[var(--color-border)] text-[var(--color-text-muted)] hover:text-[var(--color-text)] hover:border-[var(--color-border-strong)] cursor-pointer"
                  >
                    Stop
                  </button>
                </div>
              )}
            </>
          )}
          {error && (
            <p class="text-xs text-red-700 bg-red-50 border border-red-200 px-3 py-2 rounded">
              {error}
            </p>
          )}
        </div>
      </div>
      <form
        onSubmit={(e: FormEvent) => {
          e.preventDefault();
          if (!input.trim() || streaming) return;
          send(input.trim());
        }}
        class="px-4 pt-3 pb-4 border-t border-[var(--color-border)]"
      >
        <div class="relative flex items-end gap-2 border border-[var(--color-border-strong)] rounded-2xl bg-[var(--color-surface)] focus-within:border-[var(--color-text-muted)] transition-colors">
          <textarea
            ref={textareaRef}
            value={input}
            onInput={(e) => setInput((e.target as HTMLTextAreaElement).value)}
            onKeyDown={(e) => {
              // Enter sends; Shift+Enter (or Cmd+Enter) inserts a newline.
              if (e.key === "Enter" && !e.shiftKey && !e.metaKey && !e.ctrlKey) {
                e.preventDefault();
                if (input.trim() && !streaming) send(input.trim());
              }
            }}
            disabled={streaming}
            placeholder={streaming ? "Agent is responding…" : "Your answer…"}
            rows={1}
            class="course-input flex-1 resize-none bg-transparent px-4 py-2.5 text-sm leading-snug placeholder:text-[var(--color-text-subtle)] focus:outline-none disabled:opacity-60"
            style={{ maxHeight: "180px" }}
          />
          <button
            type="submit"
            disabled={streaming || !input.trim()}
            aria-label="Send"
            class="self-end m-1.5 w-8 h-8 flex items-center justify-center rounded-full bg-[var(--color-text)] text-[var(--color-surface)] disabled:bg-[var(--color-border)] disabled:text-[var(--color-text-subtle)] cursor-pointer hover:opacity-90 disabled:cursor-not-allowed"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <path d="M12 19V5" />
              <path d="M5 12l7-7 7 7" />
            </svg>
          </button>
        </div>
        <p class="mt-2 text-[10px] font-mono text-[var(--color-text-subtle)] flex items-center gap-2">
          <kbd class="px-1 border border-[var(--color-border)] rounded">↵</kbd> send
          <span class="opacity-50">·</span>
          <kbd class="px-1 border border-[var(--color-border)] rounded">⇧↵</kbd> newline
        </p>
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

/**
 * Single chat message. Frontier-chat visual language: assistant
 * messages render full-width with no chrome (just prose); user
 * messages render as a soft right-aligned bubble. No role labels,
 * no borders, no boxes around the assistant — the typographic
 * difference and alignment carry the role distinction.
 *
 * Assistant messages run through CitationProse, which parses the
 * agent's (Project: slug) / (Layer: slug) / (Glossary: slug) etc.
 * markers and renders them as clickable pills inline with the prose.
 */
function ChatMessage({
  role,
  content,
  streaming = false,
}: {
  role: "user" | "assistant";
  content: string;
  streaming?: boolean;
}) {
  if (role === "user") {
    return (
      <div class="flex justify-end">
        <div class="max-w-[85%] px-3.5 py-2 rounded-2xl rounded-br-md bg-[var(--color-surface-warm)] text-[var(--color-text)] text-sm leading-snug whitespace-pre-wrap break-words">
          {content}
        </div>
      </div>
    );
  }
  return (
    <div class="text-[var(--color-text)]">
      <div class="course-msg-assistant text-sm leading-relaxed">
        <CitationProse text={content} />
        {streaming && (
          <span
            aria-hidden="true"
            class="inline-block w-1.5 h-3.5 -mb-0.5 ml-0.5 bg-[var(--color-text)] align-baseline course-caret"
          />
        )}
      </div>
    </div>
  );
}

/**
 * Renders markdown prose AND inline citation pills. The agent emits
 * markers like `(Project: vllm)` in the prose; chunkText splits them
 * out and we render each as a small clickable pill that points to
 * the local entry's page.
 */
function CitationProse({ text }: { text: string }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        p: ({ children }) => <p>{injectCitations(children)}</p>,
        li: ({ children }) => <li>{injectCitations(children)}</li>,
        strong: ({ children }) => <strong>{injectCitations(children)}</strong>,
        em: ({ children }) => <em>{injectCitations(children)}</em>,
        h1: ({ children }) => <h3>{injectCitations(children)}</h3>,
        h2: ({ children }) => <h3>{injectCitations(children)}</h3>,
        h3: ({ children }) => <h3>{injectCitations(children)}</h3>,
        h4: ({ children }) => <h4>{injectCitations(children)}</h4>,
      }}
    >
      {text}
    </ReactMarkdown>
  );
}

function CitationPill({ citation }: { citation: ParsedCitation }) {
  const href = citationHref(citation);
  return (
    <a
      href={href}
      class="inline-block align-baseline mx-0.5 px-1.5 py-0.5 rounded text-[10px] font-mono uppercase tracking-wider border border-[var(--color-accent)] text-[var(--color-accent)] bg-[var(--color-accent-soft)] no-underline hover:bg-white"
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

/**
 * Inline tool-call trace for the in-flight assistant turn. Each row
 * is one tool call (read_layer, find_grants, search, etc.) with a
 * humanized label and a status indicator (… while in flight, ✓ when
 * done). The current in-flight call animates a small pulse so it
 * reads as "live work" rather than a static log line.
 */
function ToolTrace({
  trace,
  live,
}: {
  trace: Array<{ id: string; name: string; input: Record<string, unknown>; done: boolean }>;
  live: string | null;
}) {
  return (
    <div class="border-l-2 border-[var(--color-border-strong)] pl-3 py-1 space-y-1">
      {trace.map((t) => {
        const label = humanizeTool(t.name, t.input);
        const isLive = !t.done && live === label;
        return (
          <div
            key={t.id}
            class={`flex items-center gap-2 text-xs ${
              t.done
                ? "text-[var(--color-text-muted)]"
                : "text-[var(--color-text)]"
            }`}
          >
            <span
              class={`font-mono text-[10px] w-3 inline-flex justify-center ${
                t.done
                  ? "text-[var(--color-status-fresh)]"
                  : "text-[var(--color-text-subtle)]"
              }`}
              aria-hidden="true"
            >
              {t.done ? "✓" : isLive ? <span class="course-tool-pulse">●</span> : "…"}
            </span>
            <span>{label}</span>
          </div>
        );
      })}
    </div>
  );
}
