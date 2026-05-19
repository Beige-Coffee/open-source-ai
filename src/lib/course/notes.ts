/**
 * Helpers for assembling the user's Personal Notes from Supabase.
 *
 * Pulls `synthesize_notes` + `why_open_notes` for a given user, joins
 * each row to its module (so we can render the module title, type,
 * and order), and returns a structured form usable by:
 *   - /learn/profile/notes.astro (HTML render)
 *   - /api/notes/markdown.ts (Markdown export)
 *   - /api/notes/pdf.ts (react-pdf export)
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { MODULES, MODULE_BY_SLUG, type CourseModule } from "./modules";
import { readEncOrPlain } from "./encrypted-io";
import { displayIdentity } from "./identity";
import type { Database, EncBlobJson } from "./supabase";

export interface ModuleNoteSlice {
  module: CourseModule;
  synthesize?: string;
  why_open?: string;
}

/**
 * Raw form with ciphertext envelopes attached. Server loaders return this
 * shape; the client decrypts via decryptPersonalNotes before render.
 */
export interface PersonalNotesCipherDoc {
  display_name: string;
  email: string;
  completed_at: string | null;
  cipherSlices: Array<{
    module: CourseModule;
    synthesize: { body: string | null; body_enc: EncBlobJson | null } | null;
    why_open: { body: string | null; body_enc: EncBlobJson | null } | null;
  }>;
}

export interface PersonalNotesDoc {
  display_name: string;
  email: string;
  completed_at: string | null;
  slices: ModuleNoteSlice[];
}

/**
 * Load all notes as a CIPHERTEXT document. The server can assemble the
 * structural metadata (display name, which modules have entries, in
 * what order) without ever seeing plaintext. Decryption is client-side.
 */
export async function loadPersonalNotesCipher(
  supabase: SupabaseClient<Database>,
  userId: string,
  email: string,
): Promise<PersonalNotesCipherDoc> {
  const [{ data: profile }, { data: syntheses }, { data: whyOpens }] = await Promise.all([
    supabase
      .from("profiles")
      .select("display_name, completed_at")
      .eq("user_id", userId)
      .maybeSingle(),
    supabase
      .from("synthesize_notes")
      .select("module_slug, body, body_enc")
      .eq("user_id", userId),
    supabase
      .from("why_open_notes")
      .select("module_slug, body, body_enc")
      .eq("user_id", userId),
  ]);

  const synthBySlug = new Map(
    (syntheses ?? []).map((r) => [r.module_slug, r] as const),
  );
  const whyOpenBySlug = new Map(
    (whyOpens ?? []).map((r) => [r.module_slug, r] as const),
  );

  const cipherSlices = MODULES.filter(
    (m) => synthBySlug.has(m.slug) || whyOpenBySlug.has(m.slug),
  ).map((m) => {
    const s = synthBySlug.get(m.slug);
    const w = whyOpenBySlug.get(m.slug);
    return {
      module: m,
      synthesize: s ? { body: s.body, body_enc: s.body_enc } : null,
      why_open: w ? { body: w.body, body_enc: w.body_enc } : null,
    };
  });

  return {
    display_name: profile?.display_name ?? displayIdentity(email),
    email,
    completed_at: profile?.completed_at ?? null,
    cipherSlices,
  };
}

/**
 * Client-side: decrypt every body_enc blob and return a plaintext
 * PersonalNotesDoc. Throws if the session is locked.
 */
export async function decryptPersonalNotes(
  doc: PersonalNotesCipherDoc,
): Promise<PersonalNotesDoc> {
  const slices: ModuleNoteSlice[] = await Promise.all(
    doc.cipherSlices.map(async (cs) => ({
      module: cs.module,
      synthesize: cs.synthesize
        ? (await readEncOrPlain(cs.synthesize.body_enc, cs.synthesize.body)) || undefined
        : undefined,
      why_open: cs.why_open
        ? (await readEncOrPlain(cs.why_open.body_enc, cs.why_open.body)) || undefined
        : undefined,
    })),
  );
  return {
    display_name: doc.display_name,
    email: doc.email,
    completed_at: doc.completed_at,
    slices,
  };
}

/**
 * Render the personal notes as Markdown. Used by the /api/notes/markdown
 * download endpoint and (optionally) by the HTML view as fallback copy.
 */
export function notesToMarkdown(doc: PersonalNotesDoc): string {
  const lines: string[] = [];
  lines.push(`# My Open-Source AI Stack Notes`);
  lines.push("");
  const completed = doc.completed_at
    ? new Date(doc.completed_at).toISOString().slice(0, 10)
    : "in progress";
  lines.push(`*${doc.display_name} · ${completed}*`);
  lines.push("");
  lines.push(
    "This is my own summary of the open-source AI stack, written as I worked through the course at open-source-ai.tech/learn.",
  );
  lines.push("");
  lines.push("---");
  lines.push("");
  for (const slice of doc.slices) {
    lines.push(
      `## Layer ${slice.module.order}: ${slice.module.title}`,
    );
    lines.push("");
    if (slice.synthesize) {
      lines.push("### My summary");
      lines.push("");
      lines.push(slice.synthesize.trim());
      lines.push("");
    }
    if (slice.why_open) {
      lines.push("### Why open source matters here");
      lines.push("");
      lines.push(slice.why_open.trim());
      lines.push("");
    }
    lines.push("---");
    lines.push("");
  }
  return lines.join("\n");
}
