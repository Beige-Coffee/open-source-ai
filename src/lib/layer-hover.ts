/**
 * Layer-hover popover runtime.
 *
 * Replaces native title="" tooltips on layer-name elements with a
 * styled card that matches the site visual language. One shared
 * card element lives in BaseLayout; this runtime moves it around
 * via Floating UI, populating its body from /data/layers.json.
 *
 * Triggers anywhere in the DOM:
 *
 *   <a data-layer-hover="silicon" href="/stack/silicon">Silicon</a>
 *
 * The hover pattern mirrors src/lib/glossary-runtime.ts: short open
 * delay, longer close delay, card stays open while the cursor is on
 * it. The card itself does not interrupt navigation — the trigger
 * remains a normal link.
 */
import { computePosition, flip, shift, offset, autoUpdate } from "@floating-ui/dom";

interface LayerSummary {
  slug: string;
  title: string;
  short_description: string;
  order: number;
  lock_in_vector?: string;
  sovereignty_relevance?: number;
  related_layers?: string[];
  type?: "core" | "meta";
}

interface LayersFile {
  core: LayerSummary[];
  meta: LayerSummary[];
}

const HOVER_OPEN_DELAY = 140;
const HOVER_CLOSE_DELAY = 180;

let layerMap: Map<string, LayerSummary> | null = null;
let loadPromise: Promise<Map<string, LayerSummary>> | null = null;

function loadLayers(): Promise<Map<string, LayerSummary>> {
  if (layerMap) return Promise.resolve(layerMap);
  if (loadPromise) return loadPromise;
  loadPromise = (async () => {
    const res = await fetch("/data/layers.json", { cache: "force-cache" });
    if (!res.ok) throw new Error(`layers.json: ${res.status}`);
    const file = (await res.json()) as LayersFile;
    const m = new Map<string, LayerSummary>();
    for (const l of file.core ?? []) m.set(l.slug, { ...l, type: "core" });
    for (const l of file.meta ?? []) m.set(l.slug, { ...l, type: "meta" });
    layerMap = m;
    return m;
  })();
  return loadPromise;
}

function ensureCard(): HTMLElement {
  let card = document.getElementById("layer-hover-card");
  if (card) return card;
  card = document.createElement("div");
  card.id = "layer-hover-card";
  card.className = "layer-hover-card";
  card.setAttribute("role", "dialog");
  card.setAttribute("aria-hidden", "true");
  card.style.display = "none";
  document.body.appendChild(card);
  return card;
}

function renderCard(card: HTMLElement, layer: LayerSummary): void {
  const tier = layer.type === "meta" ? "Meta-layer" : "Core stack";
  const orderStr = String(layer.order).padStart(2, "0");
  const relatedHtml =
    layer.related_layers && layer.related_layers.length > 0
      ? `<div class="layer-hover-row"><span class="layer-hover-key">Related</span><span class="layer-hover-val">${layer.related_layers.map((s) => `<a href="/stack/${s}">${s}</a>`).join(" · ")}</span></div>`
      : "";
  const sovHtml =
    typeof layer.sovereignty_relevance === "number"
      ? `<div class="layer-hover-row"><span class="layer-hover-key">Sovereignty</span><span class="layer-hover-val">${layer.sovereignty_relevance} / 5</span></div>`
      : "";
  const lockHtml = layer.lock_in_vector
    ? `<div class="layer-hover-row"><span class="layer-hover-key">Lock-in</span><span class="layer-hover-val">${layer.lock_in_vector}</span></div>`
    : "";
  card.innerHTML = `
    <div class="layer-hover-head">
      <span class="layer-hover-tier">${orderStr} · ${tier}</span>
      <a class="layer-hover-title" href="/stack/${layer.slug}">${layer.title}</a>
    </div>
    <p class="layer-hover-desc">${layer.short_description ?? ""}</p>
    ${sovHtml}${lockHtml}${relatedHtml}
    <div class="layer-hover-foot">
      <a class="layer-hover-link" href="/stack/${layer.slug}">Open layer →</a>
    </div>
  `;
}

type CleanupFn = () => void;
let activeCleanup: CleanupFn | null = null;
let activeTrigger: HTMLElement | null = null;
let openTimer: number | null = null;
let closeTimer: number | null = null;

function cancelOpen(): void {
  if (openTimer !== null) {
    window.clearTimeout(openTimer);
    openTimer = null;
  }
}
function cancelClose(): void {
  if (closeTimer !== null) {
    window.clearTimeout(closeTimer);
    closeTimer = null;
  }
}

function hideCard(): void {
  cancelOpen();
  cancelClose();
  const card = document.getElementById("layer-hover-card");
  if (card) {
    card.style.display = "none";
    card.setAttribute("aria-hidden", "true");
  }
  if (activeCleanup) {
    activeCleanup();
    activeCleanup = null;
  }
  activeTrigger = null;
}

async function showCard(trigger: HTMLElement, slug: string): Promise<void> {
  const map = await loadLayers();
  const layer = map.get(slug);
  if (!layer) return;
  if (activeTrigger && activeTrigger !== trigger) {
    // Cleanly tear down the previous binding before re-binding.
    if (activeCleanup) {
      activeCleanup();
      activeCleanup = null;
    }
  }
  const card = ensureCard();
  renderCard(card, layer);
  card.style.display = "block";
  card.setAttribute("aria-hidden", "false");
  activeTrigger = trigger;
  const update = () => {
    computePosition(trigger, card, {
      placement: "bottom-start",
      middleware: [offset(8), flip({ padding: 12 }), shift({ padding: 12 })],
    }).then(({ x, y }) => {
      card.style.left = `${x}px`;
      card.style.top = `${y}px`;
    });
  };
  update();
  activeCleanup = autoUpdate(trigger, card, update);
}

function wireTrigger(trigger: HTMLElement): void {
  if ((trigger as HTMLElement & { __layerHover?: boolean }).__layerHover) return;
  (trigger as HTMLElement & { __layerHover?: boolean }).__layerHover = true;

  const slug = trigger.getAttribute("data-layer-hover");
  if (!slug) return;

  // Strip the native title to suppress the OS tooltip; the styled
  // card replaces it. Keep the original on a data attribute so any
  // other code that needs the description can still find it.
  if (trigger.hasAttribute("title")) {
    const t = trigger.getAttribute("title");
    if (t) trigger.setAttribute("data-layer-hover-title", t);
    trigger.removeAttribute("title");
  }

  trigger.addEventListener("mouseenter", () => {
    cancelClose();
    cancelOpen();
    openTimer = window.setTimeout(() => showCard(trigger, slug), HOVER_OPEN_DELAY);
  });
  trigger.addEventListener("mouseleave", () => {
    cancelOpen();
    closeTimer = window.setTimeout(hideCard, HOVER_CLOSE_DELAY);
  });
  trigger.addEventListener("focus", () => {
    cancelClose();
    cancelOpen();
    showCard(trigger, slug);
  });
  trigger.addEventListener("blur", () => {
    closeTimer = window.setTimeout(hideCard, HOVER_CLOSE_DELAY);
  });
}

function wireCardHover(): void {
  const card = ensureCard();
  card.addEventListener("mouseenter", () => {
    cancelClose();
  });
  card.addEventListener("mouseleave", () => {
    closeTimer = window.setTimeout(hideCard, HOVER_CLOSE_DELAY);
  });
}

function init(): void {
  wireCardHover();
  document
    .querySelectorAll<HTMLElement>("[data-layer-hover]")
    .forEach(wireTrigger);
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}
document.addEventListener("astro:page-load", init);

// Hide on Escape — a small accessibility nicety for keyboard users.
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") hideCard();
});
