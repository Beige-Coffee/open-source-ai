/**
 * GET /api/notes/pdf
 *
 * Renders the logged-in user's Personal Notes as a PDF via
 * @react-pdf/renderer and returns it as a downloadable file.
 */
export const prerender = false;

import type { APIRoute } from "astro";
import React from "react";
import { renderToBuffer } from "@react-pdf/renderer";
import { loadPersonalNotes } from "../../../lib/course/notes";
import { PersonalNotesPdf } from "../../../lib/course/pdf";

export const GET: APIRoute = async ({ locals }) => {
  const { user, supabase } = locals;
  if (!user || !supabase) {
    return new Response("Unauthorized", { status: 401 });
  }
  const doc = await loadPersonalNotes(supabase, user.id, user.email ?? "");
  const buffer = await renderToBuffer(
    React.createElement(PersonalNotesPdf, { doc }),
  );
  const filename = `open-source-ai-stack-notes-${doc.display_name
    .toLowerCase()
    .replace(/\s+/g, "-")}.pdf`;
  return new Response(new Uint8Array(buffer), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
};
