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
import type { Database } from "./supabase";

export interface ModuleNoteSlice {
  module: CourseModule;
  synthesize?: string;
  why_open?: string;
}

export interface PersonalNotesDoc {
  display_name: string;
  email: string;
  completed_at: string | null;
  slices: ModuleNoteSlice[]; // ordered by module.order
}

/**
 * Load all notes for the given user, ordered by module order. Returns
 * a `slices` array with one entry per module the user has written
 * anything in (empty modules are filtered out).
 */
export async function loadPersonalNotes(
  supabase: SupabaseClient<Database>,
  userId: string,
  email: string,
): Promise<PersonalNotesDoc> {
  const [{ data: profile }, { data: syntheses }, { data: whyOpens }] = await Promise.all([
    supabase
      .from("profiles")
      .select("display_name, completed_at")
      .eq("user_id", userId)
      .maybeSingle(),
    supabase
      .from("synthesize_notes")
      .select("module_slug, body")
      .eq("user_id", userId),
    supabase
      .from("why_open_notes")
      .select("module_slug, body")
      .eq("user_id", userId),
  ]);

  const synthBySlug = new Map<string, string>(
    (syntheses ?? []).map((r) => [r.module_slug, r.body]),
  );
  const whyOpenBySlug = new Map<string, string>(
    (whyOpens ?? []).map((r) => [r.module_slug, r.body]),
  );

  const slices: ModuleNoteSlice[] = MODULES.filter((m) => {
    return synthBySlug.has(m.slug) || whyOpenBySlug.has(m.slug);
  }).map((m) => ({
    module: m,
    synthesize: synthBySlug.get(m.slug),
    why_open: whyOpenBySlug.get(m.slug),
  }));

  return {
    display_name: profile?.display_name ?? email.split("@")[0],
    email,
    completed_at: profile?.completed_at ?? null,
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
