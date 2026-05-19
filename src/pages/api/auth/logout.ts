/**
 * POST /api/auth/logout
 *
 * Signs the user out of Supabase and redirects to the /learn landing.
 * Called from the Log Out button in /learn/index.astro and elsewhere.
 */
export const prerender = false;

import type { APIRoute } from "astro";

export const POST: APIRoute = async ({ locals, redirect }) => {
  await locals.supabase.auth.signOut();
  return redirect("/learn");
};
