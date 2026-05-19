/**
 * Astro middleware: loads the Supabase session for every request and
 * attaches it to `Astro.locals`. Server-rendered routes (especially
 * `/learn/*`) read `Astro.locals.user` to know whether the request
 * is authenticated.
 *
 * Static (prerendered) routes don't go through this middleware at
 * request time; they're built once and served as HTML. Only routes
 * with `export const prerender = false` (or all routes when running
 * `astro dev`) hit this path in production.
 */
import { defineMiddleware } from "astro:middleware";
import { serverSupabase } from "./lib/course/supabase";

export const onRequest = defineMiddleware(async (context, next) => {
  // Server-side Supabase client. Returns null if env vars are not
  // configured (local dev before Supabase is wired). Routes degrade
  // to anonymous in that case rather than failing the build.
  const supabase = serverSupabase(context.cookies);
  context.locals.supabase = supabase;

  if (supabase) {
    try {
      const { data } = await supabase.auth.getUser();
      context.locals.user = data.user ?? null;
    } catch {
      context.locals.user = null;
    }
  } else {
    context.locals.user = null;
  }

  return next();
});
