/**
 * Main-content extraction. Trafilatura is the Python state-of-the-art
 * (Mozilla Readability is JS but heavy on the DOM). For this project
 * we want a zero-Python pure-JS implementation that gets close
 * enough; the goal is "stable text across navbar/footer churn for
 * hash-diff purposes," not perfect article isolation.
 *
 * Strategy:
 *   1. Strip script, style, nav, header, footer, aside elements.
 *   2. Strip iframe, svg, form, button.
 *   3. Decode HTML entities.
 *   4. Collapse whitespace; trim per line; collapse multi-blank-line.
 *   5. Truncate at 32KB to keep snapshots and verifier inputs bounded.
 *
 * If this proves insufficient (lots of false-positive hash drift due
 * to dynamic content), we can swap in a Python trafilatura sidecar
 * later. The verifier interface is the same.
 */

const STRIP_TAGS = [
  "script",
  "style",
  "nav",
  "header",
  "footer",
  "aside",
  "iframe",
  "svg",
  "form",
  "button",
  "noscript",
];

const ENTITY_MAP = {
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&apos;": "'",
  "&#39;": "'",
  "&#x27;": "'",
  "&nbsp;": " ",
  "&mdash;": ",",
  "&ndash;": "-",
  "&hellip;": "...",
  "&rsquo;": "'",
  "&lsquo;": "'",
  "&rdquo;": '"',
  "&ldquo;": '"',
  "&copy;": "(c)",
  "&trade;": "(tm)",
  "&reg;": "(r)",
};

const MAX_TEXT_BYTES = 32 * 1024;

function decodeEntities(text) {
  let out = text;
  for (const [ent, ch] of Object.entries(ENTITY_MAP)) {
    out = out.split(ent).join(ch);
  }
  // Numeric entities &#NNN; / &#xHH;
  out = out.replace(/&#(\d+);/g, (_, n) =>
    String.fromCharCode(parseInt(n, 10)),
  );
  out = out.replace(/&#x([0-9a-fA-F]+);/g, (_, n) =>
    String.fromCharCode(parseInt(n, 16)),
  );
  return out;
}

function stripTag(html, tag) {
  // Greedy strip including nested. Naive but tolerant of self-closing
  // and missing close tags.
  const open = new RegExp(`<${tag}\\b[^>]*?/>`, "gi");
  const block = new RegExp(`<${tag}\\b[^>]*?>[\\s\\S]*?</${tag}>`, "gi");
  return html.replace(block, " ").replace(open, " ");
}

export function extractMainContent(html, _finalUrl = null) {
  if (!html || typeof html !== "string") return "";
  let s = html;

  // Strip noise elements first.
  for (const t of STRIP_TAGS) {
    s = stripTag(s, t);
  }

  // Strip HTML comments.
  s = s.replace(/<!--[\s\S]*?-->/g, " ");

  // Convert <br>, <p>, </p>, <li>, </li>, </h[1-6]>, </div> to newlines
  // so paragraph structure survives.
  s = s.replace(/<br\s*\/?>/gi, "\n");
  s = s.replace(/<\/p>/gi, "\n\n");
  s = s.replace(/<\/li>/gi, "\n");
  s = s.replace(/<\/h[1-6]>/gi, "\n\n");
  s = s.replace(/<\/div>/gi, "\n");
  s = s.replace(/<\/section>/gi, "\n\n");
  s = s.replace(/<\/article>/gi, "\n\n");

  // Strip all remaining tags.
  s = s.replace(/<[^>]+>/g, " ");

  // Decode entities.
  s = decodeEntities(s);

  // Normalize whitespace.
  s = s
    .split("\n")
    .map((line) => line.replace(/[ \t]+/g, " ").trim())
    .filter((line, i, arr) => {
      // Collapse 3+ blank lines to one.
      if (line === "" && i > 0 && arr[i - 1] === "") return false;
      return true;
    })
    .join("\n")
    .trim();

  // Bound size.
  if (Buffer.byteLength(s, "utf8") > MAX_TEXT_BYTES) {
    // Truncate by chars then trim to a word boundary.
    let cut = s.slice(0, MAX_TEXT_BYTES);
    const lastSpace = cut.lastIndexOf(" ");
    if (lastSpace > MAX_TEXT_BYTES - 200) cut = cut.slice(0, lastSpace);
    s = cut + "\n...[truncated]";
  }

  return s;
}
