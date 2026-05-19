/**
 * Supabase client factories for the course at /learn.
 *
 * Two clients: server (used in .astro frontmatter + API routes) and
 * browser (used in React islands). Both read PUBLIC env vars; the
 * service-role key is never exposed to the browser and only used in
 * dedicated admin contexts (none in this codebase yet).
 *
 * Env vars (set in .env and in Vercel project settings):
 *   PUBLIC_SUPABASE_URL          // e.g. https://xxxx.supabase.co
 *   PUBLIC_SUPABASE_ANON_KEY     // anon public key (safe in browser)
 *
 * The anon key has Row-Level-Security applied via the policies in
 * supabase/migrations/. Each user can only read/write their own rows.
 */
import { createServerClient, createBrowserClient, type CookieOptions } from "@supabase/ssr";
import type { AstroCookies } from "astro";

/** Database type stubs. Generated types live in src/lib/course/database.types.ts. */
export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: {
          user_id: string;
          display_name: string | null;
          pass_choice: "fast" | "deep" | null;
          created_at: string;
          completed_at: string | null;
        };
        Insert: {
          user_id: string;
          display_name?: string | null;
          pass_choice?: "fast" | "deep" | null;
        };
        Update: Partial<{
          display_name: string | null;
          pass_choice: "fast" | "deep" | null;
          completed_at: string | null;
        }>;
      };
      module_progress: {
        Row: {
          user_id: string;
          module_slug: string;
          phase: "read" | "probe" | "compare" | "why_open" | "synthesize" | "complete";
          phase_started_at: string;
          phase_completed_at: string | null;
          jumped: boolean;
        };
        Insert: {
          user_id: string;
          module_slug: string;
          phase: "read" | "probe" | "compare" | "why_open" | "synthesize" | "complete";
          phase_started_at?: string;
          phase_completed_at?: string | null;
          jumped?: boolean;
        };
        Update: Partial<{
          phase: "read" | "probe" | "compare" | "why_open" | "synthesize" | "complete";
          phase_completed_at: string | null;
          jumped: boolean;
        }>;
      };
      synthesize_notes: {
        Row: {
          user_id: string;
          module_slug: string;
          body: string;
          updated_at: string;
        };
        Insert: {
          user_id: string;
          module_slug: string;
          body: string;
        };
        Update: Partial<{ body: string }>;
      };
      why_open_notes: {
        Row: {
          user_id: string;
          module_slug: string;
          body: string;
          updated_at: string;
        };
        Insert: {
          user_id: string;
          module_slug: string;
          body: string;
        };
        Update: Partial<{ body: string }>;
      };
      chat_turns: {
        Row: {
          id: string;
          user_id: string;
          module_slug: string;
          phase: "probe" | "compare" | "why_open" | "synthesize";
          role: "user" | "assistant" | "tool";
          content: string;
          turn_index: number;
          created_at: string;
        };
        Insert: {
          user_id: string;
          module_slug: string;
          phase: "probe" | "compare" | "why_open" | "synthesize";
          role: "user" | "assistant" | "tool";
          content: string;
          turn_index: number;
        };
        Update: never;
      };
    };
  };
};

const SUPABASE_URL = import.meta.env.PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.PUBLIC_SUPABASE_ANON_KEY;

/**
 * Returns true if both Supabase env vars are present. Routes branch
 * on this to surface a "course is being set up" notice instead of
 * erroring when the project hasn't been wired yet.
 */
export function isSupabaseConfigured(): boolean {
  return Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);
}

/**
 * Server client for Astro server-rendered routes (`.astro`
 * frontmatter, API routes). Reads + writes the auth session cookie
 * via Astro's cookies API so RLS gets the right `auth.uid()`.
 *
 * Returns null when env vars are not configured. Callers must handle
 * the null case (typically: degrade to anonymous, surface a
 * configuration notice).
 */
export function serverSupabase(cookies: AstroCookies) {
  if (!isSupabaseConfigured()) return null;
  return createServerClient<Database>(SUPABASE_URL!, SUPABASE_ANON_KEY!, {
    cookies: {
      get(name: string) {
        return cookies.get(name)?.value;
      },
      set(name: string, value: string, options: CookieOptions) {
        cookies.set(name, value, options as never);
      },
      remove(name: string, options: CookieOptions) {
        cookies.delete(name, options as never);
      },
    },
  });
}

/**
 * Browser client for React islands. Reads the session cookie via
 * document.cookie. Returns null when env vars are not configured.
 */
export function browserSupabase() {
  if (!isSupabaseConfigured()) return null;
  return createBrowserClient<Database>(SUPABASE_URL!, SUPABASE_ANON_KEY!);
}

export { SUPABASE_URL, SUPABASE_ANON_KEY };
