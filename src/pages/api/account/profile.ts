/**
 * POST /api/account/profile
 *
 * Updates display_name and/or pass_choice on the authenticated user's
 * profiles row. Used by the form on /learn/profile.
 *
 * pass_choice is one of "fast" | "deep". display_name is free text;
 * a blank submission clears it (handle_new_user defaulted it to the
 * email local-part at signup so the column is rarely truly empty).
 */
export const prerender = false;

import type { APIRoute } from "astro";

export const POST: APIRoute = async ({ request, locals, redirect }) => {
  const { user, supabase } = locals;
  if (!user || !supabase) {
    return new Response("Unauthorized", { status: 401 });
  }

  const form = await request.formData();
  const displayNameRaw = form.get("display_name");
  const passChoiceRaw = form.get("pass_choice");

  const update: { display_name?: string | null; pass_choice?: "fast" | "deep" } = {};
  if (typeof displayNameRaw === "string") {
    const trimmed = displayNameRaw.trim();
    update.display_name = trimmed.length > 0 ? trimmed : null;
  }
  if (passChoiceRaw === "fast" || passChoiceRaw === "deep") {
    update.pass_choice = passChoiceRaw;
  }

  if (Object.keys(update).length > 0) {
    await supabase
      .from("profiles")
      .upsert({ user_id: user.id, ...update });
  }

  return redirect("/learn/profile");
};
