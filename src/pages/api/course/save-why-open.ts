/**
 * POST /api/course/save-why-open
 *
 * Body: { module_slug: string, body: string }
 *
 * Saves (upserts) the user's Why-Open answer for a given module into
 * why_open_notes. Called from CoursePanel.tsx when the agent emits
 * <WHY_OPEN_COMPLETE/> and the learner clicks "Save my answer". The
 * stored body is the last substantive user turn from the Why-Open
 * phase; the agent's prompts.ts confirms it back to the learner before
 * we save.
 */
export const prerender = false;

import type { APIRoute } from "astro";
import { MODULE_BY_SLUG } from "../../../lib/course/modules";

export const POST: APIRoute = async ({ request, locals }) => {
  const { user, supabase } = locals;
  if (!user || !supabase) {
    return new Response("Unauthorized", { status: 401 });
  }
  const payload = await request.json().catch(() => null);
  const moduleSlug =
    typeof payload?.module_slug === "string" ? payload.module_slug : "";
  const body = typeof payload?.body === "string" ? payload.body.trim() : "";
  if (!moduleSlug || !MODULE_BY_SLUG[moduleSlug]) {
    return new Response("Bad module slug", { status: 400 });
  }
  if (body.length < 20) {
    return new Response("Body is too short", { status: 400 });
  }

  const { error } = await supabase.from("why_open_notes").upsert({
    user_id: user.id,
    module_slug: moduleSlug,
    body,
  });
  if (error) {
    return new Response(error.message, { status: 500 });
  }
  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
};
