/**
 * POST /api/auth/signup
 *
 * Body: { email: string, password: string }
 *
 * Creates a Supabase auth user via the admin API. This exists so the
 * username-signup flow on /learn/signup can accept synthesized
 * non-deliverable addresses like `<slug>@oas.local` that Supabase's
 * public signUp validator rejects as "invalid email." The admin path
 * skips that validator, since email_confirm=true short-circuits the
 * confirmation send entirely.
 *
 * Real-email signups should NOT go through this endpoint; they use
 * the public auth.signUp path so password-reset stays available.
 *
 * Response: { ok: true } on success; the client then calls
 * supabase.auth.signInWithPassword to establish a session and runs
 * initKeys to set up E2EE keys.
 */
export const prerender = false;

import type { APIRoute } from "astro";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "../../../lib/course/supabase";

export const POST: APIRoute = async ({ request }) => {
  const payload = (await request.json().catch(() => null)) as
    | { email?: unknown; password?: unknown }
    | null;
  const email = typeof payload?.email === "string" ? payload.email.trim() : "";
  const password = typeof payload?.password === "string" ? payload.password : "";

  if (!email || !email.includes("@")) {
    return new Response("Bad email", { status: 400 });
  }
  if (!password || password.length < 8) {
    return new Response("Password must be at least 8 characters", { status: 400 });
  }

  const serviceKey = import.meta.env.SUPABASE_SERVICE_ROLE_KEY;
  const url = import.meta.env.PUBLIC_SUPABASE_URL;
  if (!serviceKey || !url) {
    return new Response("Server not configured for signup", { status: 500 });
  }

  const admin = createClient<Database>(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (error) {
    // Pass the Supabase error through; it covers "User already registered",
    // "Password should be ..." policies, and rate limits with usable copy.
    return new Response(error.message, { status: 400 });
  }

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
};
