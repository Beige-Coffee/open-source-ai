/**
 * Site-wide popover runtime. Any element on any page with a
 * `data-popover="..."` attribute shows a styled hint on hover. The
 * popover element itself lives in BaseLayout (#site-popover); the CSS
 * is in src/styles/global.css.
 *
 * Replaces native `title` tooltips so hints match the site palette
 * (mono font, soft border, no OS-yellow) and there is no question-
 * mark "help" cursor.
 *
 * Uses event delegation on document so it works for dynamically
 * inserted elements (e.g. SVG dots, table rows from filter changes)
 * without needing per-element wiring.
 */

let panel: HTMLDivElement | null = null;
let hideTimer: number | null = null;

function ensurePanel(): HTMLDivElement | null {
  if (panel) return panel;
  const el = document.getElementById("site-popover") as HTMLDivElement | null;
  if (!el) return null;
  panel = el;
  return panel;
}

function position(el: Element): void {
  const p = ensurePanel();
  if (!p) return;
  const rect = (el as HTMLElement).getBoundingClientRect();
  // Reset to measure natural width.
  p.style.left = "0px";
  p.style.top = "0px";
  p.style.maxWidth = "320px";
  const pRect = p.getBoundingClientRect();
  // Try to place below the trigger, centered. If it would clip the
  // viewport right edge, shift left.
  let left = rect.left + rect.width / 2 - pRect.width / 2;
  let top = rect.bottom + 8;
  const margin = 8;
  if (left < margin) left = margin;
  if (left + pRect.width > window.innerWidth - margin) {
    left = window.innerWidth - margin - pRect.width;
  }
  // If below would clip the bottom edge, flip above.
  if (top + pRect.height > window.innerHeight - margin) {
    top = rect.top - pRect.height - 8;
  }
  p.style.left = `${left}px`;
  p.style.top = `${top}px`;
}

function show(el: Element): void {
  const p = ensurePanel();
  if (!p) return;
  const html = (el as HTMLElement).getAttribute("data-popover-html");
  const text = (el as HTMLElement).getAttribute("data-popover");
  if (!html && !text) return;
  if (hideTimer !== null) {
    window.clearTimeout(hideTimer);
    hideTimer = null;
  }
  // data-popover-html lets the popover carry inline links + emphasis.
  // The HTML is server-authored (in the .astro template) so trust is
  // bounded; we don't sanitize. data-popover is treated as plain
  // text and is the safer default when in doubt.
  if (html) {
    p.innerHTML = html;
    p.style.pointerEvents = "auto";
  } else {
    p.textContent = text!;
    p.style.pointerEvents = "none";
  }
  position(el);
  p.classList.add("visible");
  p.setAttribute("aria-hidden", "false");
}

function hide(): void {
  const p = ensurePanel();
  if (!p) return;
  // Brief delay so a quick mouse-jiggle doesn't flicker the popover
  // off-screen.
  if (hideTimer !== null) window.clearTimeout(hideTimer);
  hideTimer = window.setTimeout(() => {
    p.classList.remove("visible");
    p.setAttribute("aria-hidden", "true");
    hideTimer = null;
  }, 80);
}

function isTrigger(target: EventTarget | null): Element | null {
  if (!(target instanceof Element)) return null;
  return target.closest("[data-popover], [data-popover-html]");
}

document.addEventListener("mouseover", (e) => {
  const trigger = isTrigger(e.target);
  if (trigger) show(trigger);
  // If the cursor moves into the popover itself (to click a link),
  // cancel any pending hide.
  if (e.target instanceof Element && e.target.closest("#site-popover")) {
    if (hideTimer !== null) {
      window.clearTimeout(hideTimer);
      hideTimer = null;
    }
  }
});
document.addEventListener("mouseout", (e) => {
  const trigger = isTrigger(e.target);
  const popoverEl = document.getElementById("site-popover");
  if (trigger) {
    const related = e.relatedTarget instanceof Element
      ? (e.relatedTarget.closest("[data-popover], [data-popover-html]") ?? e.relatedTarget.closest("#site-popover"))
      : null;
    if (related !== trigger && !(related && related.id === "site-popover")) hide();
  }
  // Leaving the popover panel itself (and not back to the trigger).
  if (e.target instanceof Element && e.target.closest("#site-popover")) {
    const related = e.relatedTarget instanceof Element
      ? (e.relatedTarget.closest("[data-popover], [data-popover-html]") ?? e.relatedTarget.closest("#site-popover"))
      : null;
    if (!related) hide();
  }
});
document.addEventListener("focusin", (e) => {
  const trigger = isTrigger(e.target);
  if (trigger) show(trigger);
});
document.addEventListener("focusout", (e) => {
  const trigger = isTrigger(e.target);
  if (trigger) hide();
});
window.addEventListener("scroll", () => {
  if (panel?.classList.contains("visible")) hide();
}, { passive: true });

export {};
