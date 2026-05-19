/**
 * POST /api/account/delete
 *
 * Deletes the authenticated user's auth.users row via the Supabase
 * admin API (service role). The profiles, module_progress,
 * synthesize_notes, why_open_notes, and chat_turns rows all cascade
 * via ON DELETE CASCADE on auth.users(id).
 *
 * The form posts a `confirm` field that must equal the user's email;
 * a missing or mismatched value renders a 400 and the user can try
 * again. This is the gentle confirmation step; the audit log on the
 * Supabase side captures the deletion separately.
 */
export const prerender = false;

import type { APIRoute } from "astro";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "../../../lib/course/supabase";

export const POST: APIRoute = async ({ request, locals, redirect }) => {
  const { user, supabase } = locals;
  if (!user || !supabase) {
    return new Response("Unauthorized", { status: 401 });
  }

  const form = await request.formData();
  const confirm = String(form.get("confirm") ?? "").trim().toLowerCase();
  if (!confirm || confirm !== (user.email ?? "").toLowerCase()) {
    return new Response(
      "Confirmation email did not match. Go back and try again.",
      { status: 400 },
    );
  }

  const serviceKey = import.meta.env.SUPABASE_SERVICE_ROLE_KEY;
  const url = import.meta.env.PUBLIC_SUPABASE_URL;
  if (!serviceKey || !url) {
    return new Response(
      "Server is not configured for self-service account deletion. Email austin.f.krauss@gmail.com to delete your account.",
      { status: 500 },
    );
  }

  const admin = createClient<Database>(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { error } = await admin.auth.admin.deleteUser(user.id);
  if (error) {
    return new Response(`Deletion failed: ${error.message}`, { status: 500 });
  }

  await supabase.auth.signOut();
  return redirect("/learn");
};
