/**
 * localStorage helpers for anonymous /learn users.
 *
 * Per locked design decision #14, the entire course is readable
 * anonymously. Anonymous writings (chat turns + synthesize body) live
 * in localStorage and survive tab navigation; they are wiped on tab
 * close unless the user signs up, at which point the signup-flow
 * restore in /learn/signup.astro reads localStorage and persists the
 * stashed entries to Supabase under the new account, then clears them.
 *
 * Keys are versioned (`oas-course-v1`) so we can change the wire
 * format later without colliding with stale entries.
 */
export const STORAGE_VERSION = "v1";
export const STORAGE_KEY = `oas-course-${STORAGE_VERSION}`;

import type { ModulePhase } from "./modules";

interface ChatTurn {
  role: "user" | "assistant";
  content: string;
  turn_index: number;
}

export interface AnonModuleEntry {
  chat?: Partial<Record<ModulePhase, ChatTurn[]>>;
  synth?: string;
  why_open_saved?: string;
  /**
   * The learner's current phase for this module. Persists across
   * page reloads for anonymous users. Logged-in users use
   * module_progress server-side; the SSR loads it into
   * `currentPhase` directly.
   */
  phase?: ModulePhase;
}

export interface AnonState {
  version: typeof STORAGE_VERSION;
  modules: Record<string, AnonModuleEntry>;
  /** Picked at the depth-picker step on /learn/start. Logged-in users
   *  store this in profiles.pass_choice instead. */
  pass_choice?: "fast" | "deep";
}

function emptyState(): AnonState {
  return { version: STORAGE_VERSION, modules: {} };
}

function readState(): AnonState {
  if (typeof window === "undefined") return emptyState();
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return emptyState();
    const parsed = JSON.parse(raw) as AnonState;
    if (!parsed || parsed.version !== STORAGE_VERSION) return emptyState();
    return parsed;
  } catch {
    return emptyState();
  }
}

function writeState(state: AnonState): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Quota or disabled storage; we silently degrade since the user's
    // writings are best-effort anyway pre-signup.
  }
}

export function readAnonModule(moduleSlug: string): AnonModuleEntry {
  return readState().modules[moduleSlug] ?? {};
}

export function readAnonChat(
  moduleSlug: string,
  phase: ModulePhase,
): ChatTurn[] {
  return readAnonModule(moduleSlug).chat?.[phase] ?? [];
}

export function writeAnonChat(
  moduleSlug: string,
  phase: ModulePhase,
  turns: ChatTurn[],
): void {
  const state = readState();
  const m = state.modules[moduleSlug] ?? {};
  m.chat = m.chat ?? {};
  m.chat[phase] = turns;
  state.modules[moduleSlug] = m;
  writeState(state);
}

export function writeAnonSynth(moduleSlug: string, body: string): void {
  const state = readState();
  const m = state.modules[moduleSlug] ?? {};
  m.synth = body;
  state.modules[moduleSlug] = m;
  writeState(state);
}

export function writeAnonWhyOpen(moduleSlug: string, body: string): void {
  const state = readState();
  const m = state.modules[moduleSlug] ?? {};
  m.why_open_saved = body;
  state.modules[moduleSlug] = m;
  writeState(state);
}

export function writeAnonPhase(moduleSlug: string, phase: ModulePhase): void {
  const state = readState();
  const m = state.modules[moduleSlug] ?? {};
  m.phase = phase;
  state.modules[moduleSlug] = m;
  writeState(state);
}

export function readAnonPhase(moduleSlug: string): ModulePhase | null {
  return readState().modules[moduleSlug]?.phase ?? null;
}

export function writeAnonPassChoice(choice: "fast" | "deep"): void {
  const state = readState();
  state.pass_choice = choice;
  writeState(state);
}

export function readAnonPassChoice(): "fast" | "deep" | null {
  return readState().pass_choice ?? null;
}

export function readAllAnonState(): AnonState {
  return readState();
}

export function clearAnonState(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}
