/**
 * User identity helpers.
 *
 * Username-only signups synthesize an `@oas.local` email so Supabase
 * Auth has something to key on. That synthesized address must NEVER
 * surface in UI — to the user, their identity is the username they
 * picked. `displayIdentity` strips the synthesized suffix; real emails
 * pass through unchanged.
 */

const SYNTHESIZED_SUFFIX = "@oas.local";

export function isSynthesizedUsername(email: string | null | undefined): boolean {
  return (email ?? "").toLowerCase().endsWith(SYNTHESIZED_SUFFIX);
}

export function displayIdentity(email: string | null | undefined): string {
  const e = email ?? "";
  if (isSynthesizedUsername(e)) return e.slice(0, -SYNTHESIZED_SUFFIX.length);
  return e;
}
