"use client";

/**
 * Personal Notes view + downloads, all client-side so decryption can
 * happen against the in-memory DK. The server passes a CipherDoc into
 * the island via props; we decrypt it on mount, render the readable
 * form, and wire the Markdown / PDF download buttons.
 */

import { useEffect, useMemo, useState } from "react";
import {
  decryptPersonalNotes,
  notesToMarkdown,
  type PersonalNotesCipherDoc,
  type PersonalNotesDoc,
} from "../lib/course/notes";

interface Props {
  cipherDoc: PersonalNotesCipherDoc;
}

function safeFilename(name: string): string {
  return name.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9._-]/g, "");
}

function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export default function PersonalNotesView({ cipherDoc }: Props): JSX.Element {
  const [doc, setDoc] = useState<PersonalNotesDoc | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pdfBusy, setPdfBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const plain = await decryptPersonalNotes(cipherDoc);
        if (!cancelled) setDoc(plain);
      } catch (e) {
        if (!cancelled) {
          setError(
            e instanceof Error && e.message.startsWith("E2EE_LOCKED")
              ? "Your notes are encrypted and your session is locked. Log out and back in to unlock."
              : `Could not decrypt notes: ${e instanceof Error ? e.message : String(e)}`,
          );
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [cipherDoc]);

  const completedDate = useMemo(() => {
    return cipherDoc.completed_at
      ? new Date(cipherDoc.completed_at).toISOString().slice(0, 10)
      : null;
  }, [cipherDoc.completed_at]);

  async function onDownloadMarkdown() {
    if (!doc) return;
    const md = notesToMarkdown(doc);
    const blob = new Blob([md], { type: "text/markdown;charset=utf-8" });
    triggerDownload(blob, `open-source-ai-stack-notes-${safeFilename(doc.display_name)}.md`);
  }

  async function onDownloadPdf() {
    if (!doc || pdfBusy) return;
    setPdfBusy(true);
    try {
      // Lazy-load @react-pdf/renderer + the PDF component on click; the
      // module is ~1MB and most users will never download the PDF.
      const [{ pdf }, { PersonalNotesPdf }] = await Promise.all([
        import("@react-pdf/renderer"),
        import("../lib/course/pdf"),
      ]);
      const blob = await pdf(<PersonalNotesPdf doc={doc} />).toBlob();
      triggerDownload(blob, `open-source-ai-stack-notes-${safeFilename(doc.display_name)}.pdf`);
    } catch (err) {
      setError(`Could not generate PDF: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setPdfBusy(false);
    }
  }

  if (error) {
    return (
      <p className="text-sm text-red-700 border border-red-200 bg-red-50 px-3 py-2 rounded">
        {error}
      </p>
    );
  }

  if (!doc) {
    return (
      <p className="text-sm text-[var(--color-text-muted)] italic">
        Decrypting your notes...
      </p>
    );
  }

  return (
    <>
      <p className="text-sm text-[var(--color-text-muted)] mb-2">
        {doc.display_name}
        {completedDate ? ` · completed ${completedDate}` : " · in progress"}
      </p>
      <p className="text-base text-[var(--color-text-muted)] max-w-prose leading-relaxed mb-6">
        This is your own summary of the open-source AI stack, written as
        you worked through the course. It accumulates as you complete
        each module's Synthesize and Why-Open phases.
      </p>

      <div className="flex flex-wrap gap-2 mb-10">
        <button
          type="button"
          onClick={onDownloadMarkdown}
          className="text-sm px-3 py-1.5 rounded-md border border-[var(--color-border-strong)] bg-[var(--color-surface)] hover:bg-[var(--color-surface-warm)] text-[var(--color-text)] cursor-pointer"
        >
          Download Markdown
        </button>
        <button
          type="button"
          onClick={onDownloadPdf}
          disabled={pdfBusy}
          className="text-sm px-3 py-1.5 rounded-md border border-[var(--color-border-strong)] bg-[var(--color-surface)] hover:bg-[var(--color-surface-warm)] text-[var(--color-text)] cursor-pointer disabled:opacity-60"
        >
          {pdfBusy ? "Generating PDF..." : "Download PDF"}
        </button>
        <a
          href="/learn/profile"
          className="text-sm px-3 py-1.5 rounded-md text-[var(--color-text-muted)] hover:text-[var(--color-text)] no-underline self-center"
        >
          Back to profile
        </a>
      </div>

      {doc.slices.length === 0 ? (
        <p className="text-sm text-[var(--color-text-muted)] italic">
          You haven't written any notes yet. Complete the Synthesize or
          Why-Open phase of any module and your writing will appear here.
        </p>
      ) : (
        <div className="space-y-10">
          {doc.slices.map((slice) => (
            <section
              key={slice.module.slug}
              className="border-t border-[var(--color-border)] pt-6"
            >
              <h2 className="font-serif text-2xl text-[var(--color-text)] mb-4">
                <span className="font-mono text-sm text-[var(--color-text-subtle)] mr-2">
                  {String(slice.module.order).padStart(2, "0")}
                </span>
                {slice.module.title}
              </h2>
              {slice.synthesize && (
                <>
                  <h3 className="font-mono text-xs uppercase tracking-wider text-[var(--color-text-subtle)] mb-2">
                    My summary
                  </h3>
                  <div className="prose prose-base max-w-none text-[var(--color-text)] leading-relaxed mb-6 whitespace-pre-wrap">
                    {slice.synthesize}
                  </div>
                </>
              )}
              {slice.why_open && (
                <>
                  <h3 className="font-mono text-xs uppercase tracking-wider text-[var(--color-text-subtle)] mb-2">
                    Why open source matters here
                  </h3>
                  <div className="prose prose-base max-w-none text-[var(--color-text)] leading-relaxed whitespace-pre-wrap">
                    {slice.why_open}
                  </div>
                </>
              )}
            </section>
          ))}
        </div>
      )}
    </>
  );
}
