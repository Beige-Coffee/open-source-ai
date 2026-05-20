/**
 * Shared types for the in-site chat agent.
 */

/**
 * Legacy mode union, kept for back-compat with persisted store state
 * and for the course agent (which still uses Socratic-style prompts
 * via src/lib/course/prompts.ts). The floating ChatBubble no longer
 * exposes a mode toggle; it always operates in "answer" mode.
 */
export type Mode = "answer" | "socratic";

export interface PageContext {
  pathname: string;
  // Specific entity if the page is about one. Set by the chat bubble
  // based on URL pattern matching. Suggestions templates branch on
  // entity.kind; the agent's system-prompt context block also reads
  // it so it knows what "this layer" / "this project" refers to.
  entity?:
    | { kind: "layer"; slug: string }
    | { kind: "funder"; slug: string }
    | { kind: "project"; slug: string }
    | { kind: "glossary"; slug: string }
    | { kind: "news"; date: string }
    | { kind: "model"; slug: string };
}

export interface ToolEventLog {
  id: string;
  name: string;
  input: Record<string, unknown>;
  done: boolean;
  result?: unknown;
  cached?: boolean;
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  // Stored as plain text for user messages; for assistant messages
  // this is the rendered text after streaming. The Anthropic-format
  // content blocks (used during tool loops) are not persisted.
  content: string;
  toolEvents?: ToolEventLog[];
  createdAt: number;
}
