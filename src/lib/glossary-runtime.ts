/**
 * Glossary runtime: progressive-enhances <G> components on the page.
 *
 * Responsibilities:
 * 1. When a popover card opens, position it next to its trigger via
 *    Floating UI (flip + shift + offset).
 * 2. Hover-to-peek on the trigger: opens the popover after a short
 *    delay, closes it (with grace period) when both trigger and card
 *    are vacated.
 * 3. "Chat about this" button in the card dispatches the chat-trigger
 *    custom event so ChatBubble opens with a pre-filled prompt.
 *
 * Native Popover API handles: click-to-open, click-outside-to-close,
 * Escape-to-close, focus-trap semantics. We layer hover-peek and
 * positioning on top.
 */
import { computePosition, flip, shift, offset, autoUpdate } from "@floating-ui/dom";

type CleanupFn = () => void;
const cleanupMap = new WeakMap<HTMLElement, CleanupFn>();

const HOVER_OPEN_DELAY = 120;
const HOVER_CLOSE_DELAY = 160;

function positionCard(trigger: HTMLElement, card: HTMLElement): CleanupFn {
  // The card is `position: fixed` (and in the top layer once
  // showPopover() runs), so Floating UI must use the matching `fixed`
  // strategy. The default `absolute` strategy returns document-relative
  // coords, which land scrollY below the trigger when applied to a
  // fixed-positioned element.
  const update = () => {
    computePosition(trigger, card, {
      strategy: "fixed",
      placement: "bottom-start",
      middleware: [offset(6), flip({ padding: 12 }), shift({ padding: 12 })],
    }).then(({ x, y }) => {
      card.style.left = `${x}px`;
      card.style.top = `${y}px`;
    });
  };
  update();
  return autoUpdate(trigger, card, update, { animationFrame: false });
}

function wireTrigger(trigger: HTMLButtonElement): void {
  const cardId = trigger.getAttribute("popovertarget");
  if (!cardId) return;
  const card = document.getElementById(cardId) as HTMLElement | null;
  if (!card) return;

  let openDelay: number | null = null;
  let closeDelay: number | null = null;

  const open = () => {
    if (typeof (card as unknown as { showPopover?: () => void }).showPopover !== "function") return;
    try {
      (card as unknown as { showPopover: () => void }).showPopover();
    } catch {
      // Already open; ignore.
    }
  };
  const close = () => {
    try {
      (card as unknown as { hidePopover: () => void }).hidePopover();
    } catch {
      // Already closed; ignore.
    }
  };

  const cancelOpen = () => {
    if (openDelay !== null) {
      window.clearTimeout(openDelay);
      openDelay = null;
    }
  };
  const cancelClose = () => {
    if (closeDelay !== null) {
      window.clearTimeout(closeDelay);
      closeDelay = null;
    }
  };

  trigger.addEventListener("mouseenter", () => {
    cancelClose();
    cancelOpen();
    openDelay = window.setTimeout(open, HOVER_OPEN_DELAY);
  });
  trigger.addEventListener("mouseleave", () => {
    cancelOpen();
    closeDelay = window.setTimeout(close, HOVER_CLOSE_DELAY);
  });
  card.addEventListener("mouseenter", () => {
    cancelClose();
  });
  card.addEventListener("mouseleave", () => {
    closeDelay = window.setTimeout(close, HOVER_CLOSE_DELAY);
  });

  // Reposition every time the card transitions into the open state.
  // The native ToggleEvent fires on popover state change.
  card.addEventListener("toggle", (event) => {
    const e = event as ToggleEvent;
    const existing = cleanupMap.get(card);
    if (existing) {
      existing();
      cleanupMap.delete(card);
    }
    if (e.newState === "open") {
      cleanupMap.set(card, positionCard(trigger, card));
    }
  });

  // Chat-trigger wiring inside the card. The button dispatches the
  // chat-trigger event so the ChatBubble picks it up and opens with
  // a pre-filled prompt.
  const chatBtn = card.querySelector<HTMLButtonElement>(".g-card-chat");
  if (chatBtn) {
    chatBtn.addEventListener("click", () => {
      const term = chatBtn.getAttribute("data-g-term") ?? "this term";
      const slug = chatBtn.getAttribute("data-g-slug") ?? "";
      close();
      window.dispatchEvent(
        new CustomEvent("chat-trigger", {
          detail: {
            prompt:
              `Explain "${term}" for someone exploring the open-source AI stack. ` +
              `Call read_glossary("${slug}") first to ground the answer in the wiki entry, ` +
              `then add nuance the entry doesn't cover.`,
          },
        }),
      );
    });
  }
}

function init(): void {
  const triggers = document.querySelectorAll<HTMLButtonElement>(".g-trigger");
  triggers.forEach((t) => {
    if ((t as HTMLButtonElement & { __gWired?: boolean }).__gWired) return;
    (t as HTMLButtonElement & { __gWired?: boolean }).__gWired = true;
    wireTrigger(t);
  });
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}

// Re-run on view transitions (Astro's persisted state across navigations).
document.addEventListener("astro:page-load", init);
