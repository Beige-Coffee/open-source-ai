"use client";

import { useEffect, useState } from "react";
import { useSettings } from "../lib/chat/store";
import {
  ANTHROPIC_MODELS,
  OPENROUTER_MODELS,
  DEFAULT_MODELS,
  modelsFor,
} from "../lib/chat/anthropic";

export default function Settings() {
  const provider = useSettings((s) => s.provider);
  const setProvider = useSettings((s) => s.setProvider);
  const setModel = useSettings((s) => s.setModel);
  const modelByProvider = useSettings((s) => s.modelByProvider);
  const anthropicKey = useSettings((s) => s.anthropicKey);
  const openrouterKey = useSettings((s) => s.openrouterKey);
  const setAnthropicKey = useSettings((s) => s.setAnthropicKey);
  const setOpenrouterKey = useSettings((s) => s.setOpenrouterKey);
  const enterToSend = useSettings((s) => s.enterToSend);
  const setEnterToSend = useSettings((s) => s.setEnterToSend);

  // Avoid hydration mismatch: zustand persist hydrates from localStorage
  // on the client, so only render real values once mounted.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  if (!mounted) {
    return (
      <p className="text-sm text-[var(--color-text-subtle)]">
        Loading settings...
      </p>
    );
  }

  const currentModel =
    modelByProvider[provider] ?? DEFAULT_MODELS[provider];
  const models = modelsFor(provider);

  return (
    <div className="space-y-8">
      <section>
        <h2 className="font-sans text-xl font-semibold mb-2">Provider</h2>
        <p className="text-sm text-[var(--color-text-muted)] mb-3">
          The chat is pure BYOK. Your key never leaves your browser. There
          is no shared key on this site.
        </p>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setProvider("anthropic")}
            className={`px-3 py-1.5 rounded-md border text-sm ${
              provider === "anthropic"
                ? "border-[var(--color-accent)] bg-[var(--color-accent-soft)] text-[var(--color-accent)]"
                : "border-[var(--color-border)] text-[var(--color-text-muted)] hover:border-[var(--color-border-strong)]"
            }`}
          >
            Anthropic
          </button>
          <button
            type="button"
            onClick={() => setProvider("openrouter")}
            className={`px-3 py-1.5 rounded-md border text-sm ${
              provider === "openrouter"
                ? "border-[var(--color-accent)] bg-[var(--color-accent-soft)] text-[var(--color-accent)]"
                : "border-[var(--color-border)] text-[var(--color-text-muted)] hover:border-[var(--color-border-strong)]"
            }`}
          >
            OpenRouter
          </button>
        </div>
      </section>

      <section>
        <h2 className="font-sans text-xl font-semibold mb-2">API key</h2>
        {provider === "anthropic" ? (
          <>
            <p className="text-sm text-[var(--color-text-muted)] mb-2">
              Get an Anthropic key at{" "}
              <a
                href="https://console.anthropic.com/settings/keys"
                target="_blank"
                rel="noopener"
              >
                console.anthropic.com/settings/keys
              </a>
              .
            </p>
            <input
              type="password"
              value={anthropicKey}
              onChange={(e) => setAnthropicKey(e.target.value)}
              placeholder="sk-ant-..."
              className="w-full px-3 py-2 rounded-md border border-[var(--color-border)] font-mono text-sm bg-[var(--color-surface)] focus:outline-none focus:border-[var(--color-accent)]"
              autoComplete="off"
              spellCheck={false}
            />
          </>
        ) : (
          <>
            <p className="text-sm text-[var(--color-text-muted)] mb-2">
              Get an OpenRouter key at{" "}
              <a
                href="https://openrouter.ai/keys"
                target="_blank"
                rel="noopener"
              >
                openrouter.ai/keys
              </a>
              . Add a few dollars of credit; goes a long way.
            </p>
            <input
              type="password"
              value={openrouterKey}
              onChange={(e) => setOpenrouterKey(e.target.value)}
              placeholder="sk-or-..."
              className="w-full px-3 py-2 rounded-md border border-[var(--color-border)] font-mono text-sm bg-[var(--color-surface)] focus:outline-none focus:border-[var(--color-accent)]"
              autoComplete="off"
              spellCheck={false}
            />
          </>
        )}
        <p className="text-xs text-[var(--color-text-subtle)] mt-2">
          Stored in this browser&apos;s localStorage only. Clear it from
          devtools whenever you want.
        </p>
      </section>

      <section>
        <h2 className="font-sans text-xl font-semibold mb-2">Model</h2>
        <ul className="space-y-2">
          {models.map((m) => (
            <li key={m.id}>
              <label
                className={`flex items-start gap-3 p-3 rounded-md border cursor-pointer ${
                  currentModel === m.id
                    ? "border-[var(--color-accent)] bg-[var(--color-accent-soft)]"
                    : "border-[var(--color-border)] hover:border-[var(--color-border-strong)]"
                }`}
              >
                <input
                  type="radio"
                  name="model"
                  value={m.id}
                  checked={currentModel === m.id}
                  onChange={() => setModel(provider, m.id)}
                  className="mt-1 accent-[var(--color-accent)]"
                />
                <span className="flex-1">
                  <span className="block font-medium text-sm text-[var(--color-text)]">
                    {m.label}
                  </span>
                  <span className="block text-xs text-[var(--color-text-muted)] leading-snug mt-0.5">
                    {m.description}
                  </span>
                </span>
              </label>
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h2 className="font-sans text-xl font-semibold mb-2">Behavior</h2>
        <label className="flex items-center gap-2 cursor-pointer text-sm text-[var(--color-text-muted)]">
          <input
            type="checkbox"
            checked={enterToSend}
            onChange={(e) => setEnterToSend(e.target.checked)}
            className="accent-[var(--color-accent)]"
          />
          Press Enter to send (shift+Enter for newline)
        </label>
      </section>

      <section className="border-t border-[var(--color-border)] pt-6">
        <h2 className="font-sans text-xl font-semibold mb-2">
          What this site stores
        </h2>
        <ul className="text-sm text-[var(--color-text-muted)] space-y-1 list-disc list-inside">
          <li>
            <code>oss-ai-chat-settings-v1</code>: your provider, model, key,
            and behavior preferences.
          </li>
          <li>
            <code>oss-ai-chat-threads-v1</code>: your chat history per page
            context.
          </li>
        </ul>
        <p className="text-xs text-[var(--color-text-subtle)] mt-2">
          Both live only in this browser&apos;s localStorage. Nothing is
          sent to any server on this site.
        </p>
      </section>
    </div>
  );
}
