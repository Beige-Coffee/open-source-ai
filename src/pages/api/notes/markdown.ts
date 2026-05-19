/**
 * GET /api/notes/markdown
 *
 * Renders the logged-in user's Personal Notes as a Markdown document
 * and returns it as a downloadable `.md` file.
 */
export const prerender = false;

import type { APIRoute } from "astro";
import { loadPersonalNotes, notesToMarkdown } from "../../../lib/course/notes";

export const GET: APIRoute = async ({ locals }) => {
  const { user, supabase } = locals;
  if (!user || !supabase) {
    return new Response("Unauthorized", { status: 401 });
  }
  const doc = await loadPersonalNotes(supabase, user.id, user.email ?? "");
  const md = notesToMarkdown(doc);
  const filename = `open-source-ai-stack-notes-${doc.display_name
    .toLowerCase()
    .replace(/\s+/g, "-")}.md`;
  return new Response(md, {
    status: 200,
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
};
