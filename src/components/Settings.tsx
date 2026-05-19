"use client";

import { useEffect, useState } from "react";
import { useSettings } from "../lib/chat/store";
import {
  OPENROUTER_MODEL_DETAILS,
  DEFAULT_MODEL,
  estimateCostPerTurn,
  type ModelDetails,
} from "../lib/chat/anthropic";

function CapabilityBar({
  label,
  score,
  tooltip,
}: {
  label: string;
  score: number;
  tooltip: string;
}) {
  return (
    <span
      className="inline-flex items-center gap-1 font-mono text-[10px] uppercase tracking-wider text-[var(--color-text-subtle)] cursor-help"
      title={tooltip}
    >
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
        <CapabilityBar
          label="Tools"
          score={model.capabilities.tools}
          tooltip="Tool-calling reliability. Mapped from BFCL (function-calling correctness), TAU3-Bench (policy-adherent agentic tool use), and MCPMark. Important here because each turn calls 1-5 tools to read the wiki."
        />
        <CapabilityBar
          label="Reason"
          score={model.capabilities.reasoning}
          tooltip="Multi-hop reasoning depth. Mapped from Artificial Analysis Intelligence Index (composite of ~10 tasks) and GPQA Diamond (scientific reasoning). Important here for cross-layer synthesis questions."
        />
        <CapabilityBar
          label="Instruct"
          score={model.capabilities.instruct}
          tooltip="Adherence to instructions and output format. Mapped from IFEval and Anthropic's published track record on strict-format tasks. Important here for the strict (Layer: slug) / (Project: slug) citation markers the agent must emit."
        />
      </div>

      <p className="text-sm text-[var(--color-text-muted)] leading-snug">
        {model.description}
      </p>
    </label>
  );
}

export default function Settings() {
  const apiKey = useSettings((s) => s.apiKey);
  const model = useSettings((s) => s.model);
  const setApiKey = useSettings((s) => s.setApiKey);
  const setModel = useSettings((s) => s.setModel);
  const enterToSend = useSettings((s) => s.enterToSend);
  const setEnterToSend = useSettings((s) => s.setEnterToSend);

  // Avoid hydration mismatch: zustand persist hydrates from localStorage
  // on the client, so only render real values once mounted.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  // Safety: if a previously-saved model is no longer in the available
  // list (e.g. one was removed in a refresh), fall back to the default.
  useEffect(() => {
    if (!mounted) return;
    if (!OPENROUTER_MODEL_DETAILS.some((m) => m.id === model)) {
      setModel(DEFAULT_MODEL);
    }
  }, [mounted, model, setModel]);

  if (!mounted) {
    return (
      <p className="text-sm text-[var(--color-text-subtle)]">
        Loading settings...
      </p>
    );
  }

  return (
    <div className="space-y-10">
      <section>
        <h2 className="font-sans text-xl font-semibold mb-2">API key</h2>
        <p className="text-sm text-[var(--color-text-muted)] mb-2">
          Pure BYOK via OpenRouter. Your key never leaves this browser.
          There is no shared key on this site. Get one at{" "}
          <a
            href="https://openrouter.ai/keys"
            target="_blank"
            rel="noopener"
          >
            openrouter.ai/keys
          </a>
          . A few dollars of credit lasts a long time here.
        </p>
        <input
          type="password"
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
          placeholder="sk-or-..."
          className="w-full px-3 py-2 rounded-md border border-[var(--color-border)] font-mono text-sm bg-[var(--color-surface)] focus:outline-none focus:border-[var(--color-text)]"
          autoComplete="off"
          spellCheck={false}
        />
        <p className="text-xs text-[var(--color-text-subtle)] mt-2">
          Stored in this browser&apos;s localStorage only. Clear it from
          devtools whenever you want.
        </p>
      </section>

      <section>
        <h2 className="font-sans text-xl font-semibold mb-2">Model</h2>
        <p className="text-sm text-[var(--color-text-muted)] mb-3 max-w-prose">
          Eight models curated for this site&apos;s task profile:
          tool-calling, multi-step reasoning, and the strict
          citation-format discipline the chat agent uses. Pricing and
          context windows verified against openrouter.ai 2026-05-19.
          Capability scores (Tools / Reason / Instruct) are this
          site&apos;s editorial judgment for this specific task, not
          general capability ratings.
        </p>
        <p className="text-xs text-[var(--color-text-subtle)] mb-4 max-w-prose">
          Cost-per-turn estimate assumes 8K input + 1.5K output tokens,
          which is typical at this site with the agent&apos;s tool-result
          inflation.
        </p>
        <ul className="space-y-3">
          {OPENROUTER_MODEL_DETAILS.map((m) => (
            <li key={m.id}>
              <ModelCard
                model={m}
                selected={model === m.id}
                onSelect={() => setModel(m.id)}
              />
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
            <code>oss-ai-chat-settings-v2</code>: your model, OpenRouter
            key, and behavior preferences.
          </li>
          <li>
            <code>oss-ai-chat-threads-v2</code>: your chat history per
            page context.
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
