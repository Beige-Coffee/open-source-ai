/**
 * POST /api/course/start?next=<path>
 *
 * Records the learner's depth choice (fast or deep) and redirects to
 * <next>. For logged-in users we upsert profiles.pass_choice. For
 * anonymous users the choice is set in localStorage via a sentinel
 * on the redirect; the chosen value is appended to the URL as a
 * query string the destination's client script can pick up.
 *
 * Default `next` is /learn/infrastructure (module 01).
 */
export const prerender = false;

import type { APIRoute } from "astro";

const DEFAULT_NEXT = "/learn/infrastructure";

export const POST: APIRoute = async ({ request, locals, redirect, url }) => {
  const form = await request.formData();
  const choice = form.get("pass_choice");
  const next = url.searchParams.get("next") || DEFAULT_NEXT;
  const safeChoice: "fast" | "deep" = choice === "deep" ? "deep" : "fast";

  if (!next.startsWith("/")) {
    return new Response("Bad next param", { status: 400 });
  }

  const { user, supabase } = locals;
  if (user && supabase) {
    await supabase
      .from("profiles")
      .upsert({ user_id: user.id, pass_choice: safeChoice });
    return redirect(next);
  }

  // Anonymous: pass the choice through the URL so the destination's
  // client-side script can store it in localStorage. The redirect is
  // followed before any DOM script runs, so we cannot setItem here.
  const sep = next.includes("?") ? "&" : "?";
  return redirect(`${next}${sep}set_pass=${safeChoice}`);
};
