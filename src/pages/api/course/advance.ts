/**
 * POST /api/course/advance?module=<slug>
 *
 * Read -> Probe transition. The Read phase is the only one where
 * advancement is gated by an explicit form submission from the page
 * (vs. the CoursePanel's in-island advance for the chat phases).
 * Logs an upsert into module_progress and redirects back to the
 * module page so the SSR render picks up the new phase.
 *
 * Anonymous users can still walk through the module client-side, but
 * we don't persist a row for them; the redirect just brings them back.
 */
export const prerender = false;

import type { APIRoute } from "astro";
import { MODULE_BY_SLUG } from "../../../lib/course/modules";

export const POST: APIRoute = async ({ request, locals, redirect }) => {
  const url = new URL(request.url);
  const moduleSlug = url.searchParams.get("module") ?? "";
  if (!moduleSlug || !MODULE_BY_SLUG[moduleSlug]) {
    return redirect("/learn");
  }
  const { user, supabase } = locals;
  if (user && supabase) {
    await supabase.from("module_progress").upsert({
      user_id: user.id,
      module_slug: moduleSlug,
      phase: "probe",
      phase_started_at: new Date().toISOString(),
    });
  }
  return redirect(`/learn/${moduleSlug}`);
};
