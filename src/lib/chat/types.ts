/**
 * Shared types for the in-site chat agent.
 */

export type Mode = "answer" | "socratic";

export interface PageContext {
  pathname: string;
  // Specific entity if the page is about one. Set by the chat bubble
  // based on URL pattern matching.
  entity?:
    | { kind: "layer"; slug: string }
    | { kind: "funder"; slug: string }
    | { kind: "news"; date: string };
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
