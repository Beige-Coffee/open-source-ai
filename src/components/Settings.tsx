"use client";

import { useEffect, useState } from "react";
import { useSettings } from "../lib/chat/store";
import {
  ANTHROPIC_MODELS,
  OPENROUTER_MODEL_DETAILS,
  DEFAULT_MODELS,
  estimateCostPerTurn,
  type ModelDetails,
} from "../lib/chat/anthropic";

function CapabilityBar({
  label,
  score,
}: {
  label: string;
  score: number;
}) {
  return (
    <span className="inline-flex items-center gap-1 font-mono text-[10px] uppercase tracking-wider text-[var(--color-text-subtle)]">
      <span>{label}</span>
      <span className="text-[var(--color-text)]">
        {Array.from({ length: 5 }).map((_, i) => (
          <span key={i}>{i < score ? "●" : "○"}</span>
        ))}
      </span>
    </span>
  );
}

function ModelCard({
  model,
  selected,
  onSelect,
}: {
  model: ModelDetails;
  selected: boolean;
  onSelect: () => void;
}) {
  const costPerTurn = estimateCostPerTurn(model);
  const badge = model.recommendedFor;

  return (
    <label
      className={`block cursor-pointer border rounded-md p-4 transition-colors ${
        selected
          ? "border-[var(--color-text)] bg-[var(--color-surface-warm)]"
          : "border-[var(--color-border)] hover:border-[var(--color-border-strong)] bg-[var(--color-surface)]"
      }`}
    >
      <input
        type="radio"
        name="model"
        value={model.id}
        checked={selected}
        onChange={onSelect}
        className="sr-only"
      />
      <div className="flex items-start justify-between gap-3 mb-2 flex-wrap">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-medium text-[var(--color-text)]">
              {model.name}
            </span>
            {selected && (
              <span className="font-mono text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-[var(--color-text)] text-white">
                Active
              </span>
            )}
            {!selected && badge && (
              <span className="font-mono text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded border border-[var(--color-border-strong)] text-[var(--color-text-muted)]">
                {badge}
              </span>
            )}
          </div>
          <p className="text-xs text-[var(--color-text-subtle)] font-mono mt-0.5">
            {model.vendor}
          </p>
        </div>
        <div className="text-right">
          <p className="font-mono text-sm text-[var(--color-text)]">
            ${costPerTurn.toFixed(3)}
            <span className="text-[var(--color-text-subtle)]">/turn</span>
          </p>
          <p className="font-mono text-[10px] text-[var(--color-text-subtle)]">
            {model.contextLabel} &middot; {model.speedLabel}
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mb-2">
        <span className="font-mono text-[10px] text-[var(--color-text-subtle)]">
          ${model.inputPerM} in &middot; ${model.outputPerM} out /M
        </span>
        <CapabilityBar label="Tools" score={model.capabilities.tools} />
        <CapabilityBar label="Reason" score={model.capabilities.reasoning} />
        <CapabilityBar label="Instruct" score={model.capabilities.instruct} />
      </div>

      <p className="text-sm text-[var(--color-text-muted)] leading-snug">
        {model.description}
      </p>
    </label>
  );
}

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

  // Safety: if a previously-saved model is no longer in the available
  // list (e.g. we removed Llama 3.3 70B in the 2026-05-14 refresh),
  // fall back to the provider's default.
  useEffect(() => {
    if (!mounted) return;
    const list =
      provider === "anthropic" ? ANTHROPIC_MODELS : OPENROUTER_MODEL_DETAILS;
    const current = modelByProvider[provider];
    if (!list.some((m: { id: string }) => m.id === current)) {
      setModel(provider, DEFAULT_MODELS[provider]);
    }
  }, [mounted, provider, modelByProvider, setModel]);

  if (!mounted) {
    return (
      <p className="text-sm text-[var(--color-text-subtle)]">
        Loading settings...
      </p>
    );
  }

  const currentModel = modelByProvider[provider] ?? DEFAULT_MODELS[provider];

  return (
    <div className="space-y-10">
      <section>
        <h2 className="font-sans text-xl font-semibold mb-2">Provider</h2>
        <p className="text-sm text-[var(--color-text-muted)] mb-3">
          Pure BYOK. Your key never leaves your browser. There is no shared
          key on this site.
        </p>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setProvider("anthropic")}
            className={`px-3 py-1.5 rounded-md border text-sm ${
              provider === "anthropic"
                ? "border-[var(--color-text)] bg-[var(--color-text)] text-white"
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
                ? "border-[var(--color-text)] bg-[var(--color-text)] text-white"
                : "border-[var(--color-border)] text-[var(--color-text-muted)] hover:border-[var(--color-border-strong)]"
            }`}
          >
            OpenRouter
          </button>
        </div>
        <p className="text-xs text-[var(--color-text-subtle)] mt-3 max-w-prose">
          Anthropic direct gives you the 3 Claude models. OpenRouter
          gives you those plus Gemini, GPT-5, and Qwen3 (open weights),
          and bills you per request through one account.
        </p>
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
              className="w-full px-3 py-2 rounded-md border border-[var(--color-border)] font-mono text-sm bg-[var(--color-surface)] focus:outline-none focus:border-[var(--color-text)]"
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
              . A few dollars of credit lasts a long time on this site.
            </p>
            <input
              type="password"
              value={openrouterKey}
              onChange={(e) => setOpenrouterKey(e.target.value)}
              placeholder="sk-or-..."
              className="w-full px-3 py-2 rounded-md border border-[var(--color-border)] font-mono text-sm bg-[var(--color-surface)] focus:outline-none focus:border-[var(--color-text)]"
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
        {provider === "anthropic" ? (
          <>
            <p className="text-sm text-[var(--color-text-muted)] mb-3 max-w-prose">
              Three native Claude models. The list is intentionally
              short; for richer comparison cards (price, context,
              capability scoring) use OpenRouter.
            </p>
            <ul className="space-y-2">
              {ANTHROPIC_MODELS.map((m) => (
                <li key={m.id}>
                  <label
                    className={`flex items-start gap-3 p-3 rounded-md border cursor-pointer ${
                      currentModel === m.id
                        ? "border-[var(--color-text)] bg-[var(--color-surface-warm)]"
                        : "border-[var(--color-border)] hover:border-[var(--color-border-strong)]"
                    }`}
                  >
                    <input
                      type="radio"
                      name="model"
                      value={m.id}
                      checked={currentModel === m.id}
                      onChange={() => setModel(provider, m.id)}
                      className="mt-1 accent-[var(--color-text)]"
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
          </>
        ) : (
          <>
            <p className="text-sm text-[var(--color-text-muted)] mb-3 max-w-prose">
              Six models curated for this site&apos;s task profile:
              tool-calling, multi-step reasoning, and the strict
              citation-format discipline the chat agent uses. Pricing
              and context windows verified against openrouter.ai
              {" "}2026-05-14. Capability scores (Tools / Reason /
              Instruct) are this site&apos;s editorial judgment for
              this specific task, not general capability ratings.
            </p>
            <p className="text-xs text-[var(--color-text-subtle)] mb-4 max-w-prose">
              Cost-per-turn estimate assumes 8K input + 1.5K output
              tokens, which is typical at this site with the agent&apos;s
              tool-result inflation.
            </p>
            <ul className="space-y-3">
              {OPENROUTER_MODEL_DETAILS.map((m) => (
                <li key={m.id}>
                  <ModelCard
                    model={m}
                    selected={currentModel === m.id}
                    onSelect={() => setModel(provider, m.id)}
                  />
                </li>
              ))}
            </ul>
          </>
        )}
      </section>

      <section>
        <h2 className="font-sans text-xl font-semibold mb-2">Behavior</h2>
        <label className="flex items-center gap-2 cursor-pointer text-sm text-[var(--color-text-muted)]">
          <input
            type="checkbox"
            checked={enterToSend}
            onChange={(e) => setEnterToSend(e.target.checked)}
            className="accent-[var(--color-text)]"
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
