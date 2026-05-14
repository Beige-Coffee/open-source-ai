/**
 * Parse the inline citation tags the agent emits and chunk text for
 * rendering. Per CLAUDE.md, the agent must use these markers verbatim:
 *
 *   (Layer: silicon)
 *   (Funder: hrf)
 *   (Grant: Maple AI)
 *   (Project: vllm)
 *   (Reading: Building Effective Agents)
 *   (News: 2026-05-13)
 */

export type CitationKind =
  | "layer"
  | "funder"
  | "grant"
  | "project"
  | "reading"
  | "news";

export interface ParsedCitation {
  start: number;
  end: number;
  kind: CitationKind;
  ref: string; // slug or title
  raw: string;
}

const PATTERN =
  /\((Layer|Funder|Grant|Project|Reading|News):\s*([^)]+)\)/g;

export function parseCitations(text: string): ParsedCitation[] {
  const hits: ParsedCitation[] = [];
  const re = new RegExp(PATTERN.source, PATTERN.flags);
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const kind = m[1].toLowerCase() as CitationKind;
    const ref = m[2].trim();
    if (!ref) continue;
    hits.push({
      start: m.index,
      end: m.index + m[0].length,
      kind,
      ref,
      raw: m[0],
    });
  }
  return hits;
}

export type Chunk =
  | { kind: "text"; text: string }
  | { kind: "citation"; citation: ParsedCitation };

export function chunkText(text: string): Chunk[] {
  const cites = parseCitations(text);
  if (!cites.length) return [{ kind: "text", text }];
  const out: Chunk[] = [];
  let cursor = 0;
  for (const c of cites) {
    if (c.start > cursor) {
      out.push({ kind: "text", text: text.slice(cursor, c.start) });
    }
    out.push({ kind: "citation", citation: c });
    cursor = c.end;
  }
  if (cursor < text.length) {
    out.push({ kind: "text", text: text.slice(cursor) });
  }
  return out;
}

/**
 * Build the destination href for a citation. For most kinds we route
 * to the local detail page. For grants and readings we don't have
 * per-entry pages, so the agent should ground in the funder page or
 * the layer page; pill display uses the raw text.
 */
export function citationHref(c: ParsedCitation): string {
  switch (c.kind) {
    case "layer":
      return `/stack/${c.ref}`;
    case "funder":
      return `/grants/funder/${c.ref}`;
    case "news":
      return `/news/${c.ref}`;
    case "grant":
      // No per-grant page; deep-link the grants section.
      return `/grants#grants-browser`;
    case "project":
      // No per-project page; deep-link the layer page.
      return `/stack`;
    case "reading":
      // No per-reading page; deep-link the learn hub.
      return `/learn`;
  }
}

export function citationLabel(c: ParsedCitation): string {
  return c.ref;
}
