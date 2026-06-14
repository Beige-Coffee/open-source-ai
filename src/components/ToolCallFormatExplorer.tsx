import { useState } from "react";

/**
 * Tool-Call Format Explorer. Pick a model family and see how it serializes
 * the same tool call. The point it makes tangible: there is no single wire
 * format. Each model emits only the serialization it was trained on, and
 * runtimes ship per-model parsers to read them back.
 *
 * Every format carries its own primary source (the lab's prompt-format or
 * tool-use docs). The example snippets are illustrative of the documented
 * format, not verbatim transcripts. The family -> catalog-model links are
 * family membership, not a per-checkpoint format assertion (a per-model
 * tool_call_format field is a separate, later addition).
 */

interface Family {
  id: string;
  label: string;
  vendor: string;
  markers: string;
  blurb: string;
  example: string;
  resultNote: string;
  models: { slug: string; name: string }[];
  source: { title: string; url: string };
}

const FAMILIES: Family[] = [
  {
    id: "llama",
    label: "Llama",
    vendor: "Meta",
    markers: "<|python_tag|> · ipython role · <|eom_id|>",
    blurb:
      "Custom tools are passed as JSON and the model returns a JSON object naming the function and its parameters. Built-in tools (search, code) use the <|python_tag|> marker, and a tool result is fed back under the ipython role.",
    example: '{"name": "get_weather", "parameters": {"city": "Paris"}}',
    resultNote: "Result returned with the ipython role, ended by <|eot_id|>.",
    models: [
      { slug: "llama-3-1-8b-instruct", name: "Llama 3.1 8B Instruct" },
      { slug: "llama-3-3-70b-instruct", name: "Llama 3.3 70B Instruct" },
    ],
    source: {
      title: "Llama 3.1 model card and prompt formats (Meta)",
      url: "https://www.llama.com/docs/model-cards-and-prompt-formats/llama3_1/",
    },
  },
  {
    id: "mistral",
    label: "Mistral",
    vendor: "Mistral AI",
    markers: "[AVAILABLE_TOOLS] · [TOOL_CALLS] · [TOOL_RESULTS]",
    blurb:
      "Tools are declared inside [AVAILABLE_TOOLS] control tokens. The model emits its call after a [TOOL_CALLS] token as a JSON list, and results come back wrapped in [TOOL_RESULTS].",
    example: '[TOOL_CALLS][{"name": "get_weather", "arguments": {"city": "Paris"}}]',
    resultNote: "Result returned inside [TOOL_RESULTS] ... [/TOOL_RESULTS].",
    models: [
      { slug: "mistral-large-2", name: "Mistral Large 2" },
      { slug: "mixtral-8x22b-instruct-v0-1", name: "Mixtral 8x22B Instruct" },
    ],
    source: {
      title: "Mistral function calling documentation",
      url: "https://docs.mistral.ai/capabilities/function_calling/",
    },
  },
  {
    id: "hermes",
    label: "Hermes / Qwen",
    vendor: "NousResearch, adopted by Qwen",
    markers: "<tool_call> ... </tool_call>",
    blurb:
      "The call is wrapped in <tool_call> tags containing a JSON object with the function name and arguments. This template, from NousResearch's Hermes line, was adopted as a default by Qwen and by several runtimes' tool-call parsers.",
    example: '<tool_call>\n{"name": "get_weather", "arguments": {"city": "Paris"}}\n</tool_call>',
    resultNote: "Result returned wrapped in <tool_response> tags.",
    models: [
      { slug: "qwen2-5-72b-instruct", name: "Qwen2.5 72B Instruct" },
      { slug: "qwen3-32b-instruct", name: "Qwen3 32B" },
    ],
    source: {
      title: "NousResearch Hermes 2 Pro (tool-call format)",
      url: "https://huggingface.co/NousResearch/Hermes-2-Pro-Mistral-7B",
    },
  },
  {
    id: "command-r",
    label: "Command R",
    vendor: "Cohere",
    markers: "JSON action list · directly_answer",
    blurb:
      "The model emits a JSON list of actions, each naming a tool and its parameters. A built-in directly_answer tool is the signal for replying without calling anything, so 'answer now' is itself a structured choice.",
    example: '[\n  {"tool_name": "get_weather", "parameters": {"city": "Paris"}}\n]',
    resultNote: "Results are appended as documents the model grounds its reply on.",
    models: [
      { slug: "command-r-plus", name: "Command R+" },
      { slug: "command-a", name: "Command A" },
    ],
    source: {
      title: "Cohere tool use documentation",
      url: "https://docs.cohere.com/docs/tool-use",
    },
  },
];

export default function ToolCallFormatExplorer() {
  const [active, setActive] = useState(FAMILIES[0].id);
  const f = FAMILIES.find((x) => x.id === active)!;

  return (
    <div className="border border-[var(--color-border)] rounded-lg bg-[var(--color-surface)] overflow-hidden">
      <div className="flex flex-wrap gap-1 p-2 border-b border-[var(--color-border)] bg-[var(--color-surface-warm)]">
        {FAMILIES.map((x) => (
          <button
            key={x.id}
            onClick={() => setActive(x.id)}
            className={`font-mono text-xs px-3 py-1.5 rounded cursor-pointer ${
              x.id === active
                ? "bg-[var(--color-surface)] border border-[var(--color-border-strong)] text-[var(--color-text)]"
                : "border border-transparent text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
            }`}
          >
            {x.label}
          </button>
        ))}
      </div>

      <div className="p-4">
        <div className="flex items-baseline justify-between gap-3 mb-1">
          <h3 className="text-sm font-medium text-[var(--color-text)]">{f.label} tool-call format</h3>
          <span className="font-mono text-[10px] text-[var(--color-text-subtle)]">{f.vendor}</span>
        </div>
        <p className="font-mono text-[10px] text-[var(--color-text-subtle)] mb-3">{f.markers}</p>
        <p className="text-sm text-[var(--color-text-muted)] leading-relaxed mb-3">{f.blurb}</p>

        <div className="mb-1 font-mono text-[10px] uppercase tracking-wider text-[var(--color-text-subtle)]">
          The same call, "get the weather in Paris"
        </div>
        <pre className="bg-[var(--color-surface-warm)] border border-[var(--color-border)] rounded p-3 overflow-x-auto font-mono text-xs text-[var(--color-text)] whitespace-pre">{f.example}</pre>
        <p className="font-mono text-[10px] text-[var(--color-text-subtle)] mt-1.5">{f.resultNote}</p>

        <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-1">
          <span className="font-mono text-[10px] uppercase tracking-wider text-[var(--color-text-subtle)]">Models in this family</span>
          {f.models.map((m) => (
            <a
              key={m.slug}
              href={`/models/${m.slug}`}
              className="font-mono text-[10px] px-1.5 py-0.5 rounded border border-[var(--color-border)] bg-[var(--color-surface-warm)] text-[var(--color-text-muted)] no-underline hover:border-[var(--color-text)] hover:text-[var(--color-text)]"
            >
              {m.name}
            </a>
          ))}
        </div>

        <p className="font-mono text-[10px] text-[var(--color-text-subtle)] mt-3">
          Source:{" "}
          <a href={f.source.url} target="_blank" rel="noopener" className="underline hover:text-[var(--color-text)]">
            {f.source.title} ↗
          </a>
        </p>
      </div>
    </div>
  );
}
