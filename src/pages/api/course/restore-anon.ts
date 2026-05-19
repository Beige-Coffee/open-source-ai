/**
 * POST /api/course/restore-anon
 *
 * Body: AnonState JSON from localStorage (see anonStorage.ts).
 *
 * Promotes anonymous course writings (chat turns, synthesize bodies,
 * why-open bodies) into Supabase under the authenticated user's row.
 * Called once by the client immediately after a successful signup,
 * via the /learn?restore=anon entry point.
 *
 * Idempotent on synthesize_notes and why_open_notes (upserts). For
 * chat_turns, only inserts rows that don't already exist for the
 * (user, module, phase, turn_index) tuple, to keep retries safe.
 */
export const prerender = false;

import type { APIRoute } from "astro";
import { MODULE_BY_SLUG, type ModulePhase } from "../../../lib/course/modules";

interface ChatTurn {
  role: "user" | "assistant";
  content: string;
  turn_index: number;
}

interface AnonModuleEntry {
  chat?: Partial<Record<ModulePhase, ChatTurn[]>>;
  synth?: string;
  why_open_saved?: string;
}

interface AnonState {
  version: string;
  modules: Record<string, AnonModuleEntry>;
}

export const POST: APIRoute = async ({ request, locals }) => {
  const { user, supabase } = locals;
  if (!user || !supabase) {
    return new Response("Unauthorized", { status: 401 });
  }
  const payload = (await request.json().catch(() => null)) as AnonState | null;
  if (!payload || !payload.modules) {
    return new Response("Bad payload", { status: 400 });
  }

  let synthCount = 0;
  let whyOpenCount = 0;
  let chatCount = 0;

  for (const [moduleSlug, entry] of Object.entries(payload.modules)) {
    if (!MODULE_BY_SLUG[moduleSlug]) continue;

    if (typeof entry.synth === "string" && entry.synth.trim().length > 0) {
      const { error } = await supabase.from("synthesize_notes").upsert({
        user_id: user.id,
        module_slug: moduleSlug,
        body: entry.synth.trim(),
      });
      if (!error) synthCount += 1;
    }

    if (typeof entry.why_open_saved === "string" && entry.why_open_saved.trim().length > 0) {
      const { error } = await supabase.from("why_open_notes").upsert({
        user_id: user.id,
        module_slug: moduleSlug,
        body: entry.why_open_saved.trim(),
      });
      if (!error) whyOpenCount += 1;
    }

    for (const [phase, turns] of Object.entries(entry.chat ?? {})) {
      if (!Array.isArray(turns)) continue;
      for (const t of turns) {
        if (!t || (t.role !== "user" && t.role !== "assistant")) continue;
        const { error } = await supabase.from("chat_turns").insert({
          user_id: user.id,
          module_slug: moduleSlug,
          phase: phase as ModulePhase,
          role: t.role,
          content: t.content,
          turn_index: t.turn_index ?? 0,
        });
        if (!error) chatCount += 1;
      }
    }
  }

  return new Response(
    JSON.stringify({ ok: true, synthCount, whyOpenCount, chatCount }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
};
