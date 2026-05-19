import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { DEFAULT_MODEL } from "./anthropic";
import type { ChatMessage, Mode } from "./types";

// ---------------------------------------------------------------------------
// Settings (BYOK key, model preference). OpenRouter-only: the previous
// Anthropic-direct path was retired; OpenRouter exposes Claude, GPT,
// Gemini, and the open-weights tier under one key, which keeps the
// /settings UX to one panel.
// ---------------------------------------------------------------------------

interface SettingsState {
  apiKey: string;
  model: string;
  enterToSend: boolean;
  setApiKey: (k: string) => void;
  setModel: (m: string) => void;
  setEnterToSend: (v: boolean) => void;
  hasKey: () => boolean;
}

export const useSettings = create<SettingsState>()(
  persist(
    (set, get) => ({
      apiKey: "",
      model: DEFAULT_MODEL,
      enterToSend: true,
      setApiKey: (k) => set({ apiKey: k }),
      setModel: (m) => set({ model: m }),
      setEnterToSend: (v) => set({ enterToSend: v }),
      hasKey: () => Boolean(get().apiKey),
    }),
    {
      // v2 because the shape changed and we don't carry the old provider
      // toggle / Anthropic key forward. Existing users re-paste their
      // OpenRouter key once after deploy; their threads stay intact
      // (those live in a separate persist namespace).
      name: "oss-ai-chat-settings-v2",
      storage: createJSONStorage(() => localStorage),
    },
  ),
);

// ---------------------------------------------------------------------------
// Threads: user-managed, ChatGPT-style. Each thread has an id, an
// auto-generated-from-first-message-but-editable title, and the message
// log. The active thread persists across navigation.
// ---------------------------------------------------------------------------

export interface Thread {
  id: string;
  title: string;
  messages: ChatMessage[];
  isStreaming: boolean;
  createdAt: number;
  updatedAt: number;
}

interface ThreadsState {
  threads: Thread[];
  activeThreadId: string | null;
  preferredMode: Mode | null;
  open: boolean;
  showThreadList: boolean;

  setPreferredMode: (m: Mode | null) => void;
  setOpen: (v: boolean) => void;
  setShowThreadList: (v: boolean) => void;

  createThread: (title?: string) => string;
  setActiveThread: (id: string) => void;
  renameThread: (id: string, title: string) => void;
  deleteThread: (id: string) => void;
  clearActive: () => void;

  getActiveThread: () => Thread | null;
  append: (id: string, msg: ChatMessage) => void;
  setLastContent: (id: string, content: string) => void;
  patchLast: (id: string, patch: Partial<ChatMessage>) => void;
  setStreaming: (id: string, v: boolean) => void;
}

function uid(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `t-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function touch<T extends Thread>(t: T): T {
  return { ...t, updatedAt: Date.now() };
}

export const useThreads = create<ThreadsState>()(
  persist(
    (set, get) => ({
      threads: [],
      activeThreadId: null,
      preferredMode: null,
      open: false,
      showThreadList: false,

      setPreferredMode: (m) => set({ preferredMode: m }),
      setOpen: (v) => set({ open: v }),
      setShowThreadList: (v) => set({ showThreadList: v }),

      createThread: (title) => {
        const id = uid();
        const now = Date.now();
        const thread: Thread = {
          id,
          title: title ?? "New chat",
          messages: [],
          isStreaming: false,
          createdAt: now,
          updatedAt: now,
        };
        set((s) => ({
          threads: [thread, ...s.threads],
          activeThreadId: id,
        }));
        return id;
      },

      setActiveThread: (id) => set({ activeThreadId: id }),

      renameThread: (id, title) =>
        set((s) => ({
          threads: s.threads.map((t) =>
            t.id === id ? touch({ ...t, title: title || "Untitled" }) : t,
          ),
        })),

      deleteThread: (id) =>
        set((s) => {
          const remaining = s.threads.filter((t) => t.id !== id);
          const wasActive = s.activeThreadId === id;
          return {
            threads: remaining,
            activeThreadId: wasActive ? (remaining[0]?.id ?? null) : s.activeThreadId,
          };
        }),

      clearActive: () =>
        set((s) => {
          const id = s.activeThreadId;
          if (!id) return s;
          return {
            threads: s.threads.map((t) =>
              t.id === id ? touch({ ...t, messages: [], isStreaming: false }) : t,
            ),
          };
        }),

      getActiveThread: () => {
        const s = get();
        if (!s.activeThreadId) return null;
        return s.threads.find((t) => t.id === s.activeThreadId) ?? null;
      },

      append: (id, msg) =>
        set((s) => ({
          threads: s.threads.map((t) =>
            t.id === id ? touch({ ...t, messages: [...t.messages, msg] }) : t,
          ),
        })),

      setLastContent: (id, content) =>
        set((s) => ({
          threads: s.threads.map((t) => {
            if (t.id !== id || t.messages.length === 0) return t;
            const last = t.messages[t.messages.length - 1];
            return touch({
              ...t,
              messages: [...t.messages.slice(0, -1), { ...last, content }],
            });
          }),
        })),

      patchLast: (id, patch) =>
        set((s) => ({
          threads: s.threads.map((t) => {
            if (t.id !== id || t.messages.length === 0) return t;
            const last = t.messages[t.messages.length - 1];
            return touch({
              ...t,
              messages: [...t.messages.slice(0, -1), { ...last, ...patch }],
            });
          }),
        })),

      setStreaming: (id, v) =>
        set((s) => ({
          threads: s.threads.map((t) =>
            t.id === id ? { ...t, isStreaming: v } : t,
          ),
        })),
    }),
    {
      name: "oss-ai-chat-threads-v2",
      storage: createJSONStorage(() => localStorage),
      // Don't persist isStreaming flags across reload (would lock the
      // UI if a stream was mid-flight when the tab closed).
      partialize: (state) => ({
        ...state,
        threads: state.threads.map((t) => ({ ...t, isStreaming: false })),
      }),
    },
  ),
);
