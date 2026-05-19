/**
 * Personal Notes PDF document, rendered server-side via @react-pdf/renderer.
 *
 * Called from /api/notes/pdf to produce the downloadable PDF.
 * Styles intentionally minimal: monochrome, serif headings, mono labels,
 * mirrors the site's visual posture.
 */
import { Document, Page, Text, View, StyleSheet, Font } from "@react-pdf/renderer";
import type { PersonalNotesDoc } from "./notes";

const styles = StyleSheet.create({
  page: {
    padding: 56,
    fontFamily: "Helvetica",
    fontSize: 11,
    lineHeight: 1.55,
    color: "#18181b",
  },
  title: {
    fontFamily: "Times-Roman",
    fontSize: 26,
    marginBottom: 6,
  },
  byline: {
    fontSize: 10,
    color: "#737373",
    marginBottom: 18,
  },
  intro: {
    fontSize: 11,
    color: "#404040",
    marginBottom: 24,
  },
  divider: {
    borderBottomWidth: 1,
    borderBottomColor: "#e5e5e5",
    marginVertical: 16,
  },
  moduleHeader: {
    fontFamily: "Times-Roman",
    fontSize: 17,
    marginBottom: 10,
    marginTop: 6,
  },
  moduleNumber: {
    fontSize: 10,
    color: "#737373",
    marginRight: 6,
  },
  subhead: {
    fontFamily: "Helvetica-Bold",
    fontSize: 9,
    color: "#737373",
    textTransform: "uppercase",
    letterSpacing: 1,
    marginBottom: 6,
    marginTop: 8,
  },
  body: {
    fontSize: 11,
    color: "#18181b",
    marginBottom: 10,
  },
});

export function PersonalNotesPdf({ doc }: { doc: PersonalNotesDoc }) {
  const completed = doc.completed_at
    ? new Date(doc.completed_at).toISOString().slice(0, 10)
    : "in progress";
  return (
    <Document
      title="My Open-Source AI Stack Notes"
      author={doc.display_name}
      creator="open-source-ai.tech/learn"
    >
      <Page size="LETTER" style={styles.page}>
        <Text style={styles.title}>My Open-Source AI Stack Notes</Text>
        <Text style={styles.byline}>
          {doc.display_name} · {completed}
        </Text>
        <Text style={styles.intro}>
          This is my own summary of the open-source AI stack, written as
          I worked through the course at open-source-ai.tech/learn.
        </Text>
        <View style={styles.divider} />

        {doc.slices.map((slice) => (
          <View
            key={slice.module.slug}
            wrap={false}
            style={{ marginBottom: 16 }}
          >
            <Text style={styles.moduleHeader}>
              <Text style={styles.moduleNumber}>
                {String(slice.module.order).padStart(2, "0")}
              </Text>
              {slice.module.title}
            </Text>
            {slice.synthesize ? (
              <View>
                <Text style={styles.subhead}>My summary</Text>
                <Text style={styles.body}>{slice.synthesize.trim()}</Text>
              </View>
            ) : null}
            {slice.why_open ? (
              <View>
                <Text style={styles.subhead}>
                  Why open source matters here
                </Text>
                <Text style={styles.body}>{slice.why_open.trim()}</Text>
              </View>
            ) : null}
            <View style={styles.divider} />
          </View>
        ))}
      </Page>
    </Document>
  );
}
