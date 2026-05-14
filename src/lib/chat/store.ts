import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type { Provider } from "./anthropic";
import { DEFAULT_MODELS } from "./anthropic";
import type { ChatMessage, Mode } from "./types";

interface SettingsState {
  provider: Provider;
  modelByProvider: Record<Provider, string>;
  anthropicKey: string;
  openrouterKey: string;
  enterToSend: boolean;
  setProvider: (p: Provider) => void;
  setModel: (p: Provider, m: string) => void;
  setAnthropicKey: (k: string) => void;
  setOpenrouterKey: (k: string) => void;
  setEnterToSend: (v: boolean) => void;
  activeKey: () => string;
  activeModel: () => string;
  hasKey: () => boolean;
}

export const useSettings = create<SettingsState>()(
  persist(
    (set, get) => ({
      provider: "anthropic",
      modelByProvider: { ...DEFAULT_MODELS },
      anthropicKey: "",
      openrouterKey: "",
      enterToSend: true,
      setProvider: (p) => set({ provider: p }),
      setModel: (p, m) =>
        set((s) => ({
          modelByProvider: { ...s.modelByProvider, [p]: m },
        })),
      setAnthropicKey: (k) => set({ anthropicKey: k }),
      setOpenrouterKey: (k) => set({ openrouterKey: k }),
      setEnterToSend: (v) => set({ enterToSend: v }),
      activeKey: () => {
        const s = get();
        return s.provider === "anthropic" ? s.anthropicKey : s.openrouterKey;
      },
      activeModel: () => {
        const s = get();
        return s.modelByProvider[s.provider];
      },
      hasKey: () => Boolean(get().activeKey()),
    }),
    {
      name: "oss-ai-chat-settings-v1",
      storage: createJSONStorage(() => localStorage),
    },
  ),
);

interface Thread {
  messages: ChatMessage[];
  isStreaming: boolean;
}

interface ThreadsState {
  threads: Record<string, Thread>;
  preferredMode: Mode | null; // null = use page-context default
  setPreferredMode: (m: Mode | null) => void;
  getThread: (key: string) => Thread;
  append: (key: string, msg: ChatMessage) => void;
  setLastContent: (key: string, content: string) => void;
  patchLast: (key: string, patch: Partial<ChatMessage>) => void;
  setStreaming: (key: string, v: boolean) => void;
  reset: (key: string) => void;
}

export const useThreads = create<ThreadsState>()(
  persist(
    (set, get) => ({
      threads: {},
      preferredMode: null,
      setPreferredMode: (m) => set({ preferredMode: m }),
      getThread: (key) => {
        const t = get().threads[key];
        return t ?? { messages: [], isStreaming: false };
      },
      append: (key, msg) =>
        set((s) => {
          const cur = s.threads[key] ?? { messages: [], isStreaming: false };
          return {
            threads: {
              ...s.threads,
              [key]: { ...cur, messages: [...cur.messages, msg] },
            },
          };
        }),
      setLastContent: (key, content) =>
        set((s) => {
          const cur = s.threads[key];
          if (!cur || cur.messages.length === 0) return s;
          const last = cur.messages[cur.messages.length - 1];
          const updated = { ...last, content };
          return {
            threads: {
              ...s.threads,
              [key]: {
                ...cur,
                messages: [...cur.messages.slice(0, -1), updated],
              },
            },
          };
        }),
      patchLast: (key, patch) =>
        set((s) => {
          const cur = s.threads[key];
          if (!cur || cur.messages.length === 0) return s;
          const last = cur.messages[cur.messages.length - 1];
          const updated = { ...last, ...patch };
          return {
            threads: {
              ...s.threads,
              [key]: {
                ...cur,
                messages: [...cur.messages.slice(0, -1), updated],
              },
            },
          };
        }),
      setStreaming: (key, v) =>
        set((s) => {
          const cur = s.threads[key] ?? { messages: [], isStreaming: false };
          return {
            threads: {
              ...s.threads,
              [key]: { ...cur, isStreaming: v },
            },
          };
        }),
      reset: (key) =>
        set((s) => ({
          threads: { ...s.threads, [key]: { messages: [], isStreaming: false } },
        })),
    }),
    {
      name: "oss-ai-chat-threads-v1",
      storage: createJSONStorage(() => localStorage),
    },
  ),
);
