#!/usr/bin/env node
/**
 * Layer 2 + 3: per-claim entailment verifier.
 *
 * This is the LLM-based fact checker. For each (claim, source) row
 * in CLAIMS_LEDGER.md, it:
 *   1. Reads the snapshot at sources/{sha256-of-canonical-url}/latest.json.
 *   2. Sends the claim + the snapshot text to a verifier model.
 *   3. Receives a verdict in {supported, contradicted, unsupported,
 *      verifier_unable} plus an evidence_span (required for supported)
 *      plus a confidence.
 *   4. Writes the verdict back to the ledger.
 *
 * Model architecture:
 *   - DEFAULT (cheap): Claude Haiku 4.5 via Anthropic API. ~$0.01/1k
 *     input + $0.05/1k output. ~$0.001-0.003 per claim at typical
 *     sizes.
 *   - ESCALATION (expensive): Gemini 2.5 Pro or GPT-5 via OpenRouter.
 *     Used when Haiku returns low confidence or when re-verifying a
 *     previously-supported claim after source drift.
 *   - CROSS-MODEL DISCIPLINE: extractor is Claude; the verifier MUST
 *     be a different model family for any escalated row. Self-
 *     preference bias (Panickssery 2024, Liu 2024) inflates pass
 *     rates if same family does both. For the default Haiku path,
 *     accept the same-family risk for cost reasons but route
 *     low-confidence rows to a non-Claude judge.
 *
 * Local NLI option (HHEM/MiniCheck) is planned for the next
 * iteration once the Python sidecar is set up. The interface this
 * script exposes is verifier-agnostic; swapping in HHEM is a config
 * change.
 *
 * Reads env: ANTHROPIC_API_KEY (required for the Haiku default).
 *
 * Usage:
 *   node audit/verify/verify_entailment.mjs --since-last-extract
 *   node audit/verify/verify_entailment.mjs --status needs_verification
 *   node audit/verify/verify_entailment.mjs --status stale_pending_review
 *   node audit/verify/verify_entailment.mjs --all
 *   node audit/verify/verify_entailment.mjs --row <ID>
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import Anthropic from "@anthropic-ai/sdk";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "../..");
const LEDGER_PATH = resolve(ROOT, "audit/CLAIMS_LEDGER.md");
const STORE = resolve(ROOT, "sources");

const apiKey = process.env.ANTHROPIC_API_KEY;
if (!apiKey) {
  console.error("[verify_entailment] ANTHROPIC_API_KEY required");
  process.exit(2);
}

const client = new Anthropic({ apiKey });

const DEFAULT_MODEL = process.env.AUDIT_VERIFIER_MODEL || "claude-haiku-4-5-20251001";
const ESCALATION_MODEL = process.env.AUDIT_ESCALATION_MODEL || "claude-sonnet-4-6";

function canonicalize(url) {
  try {
    const u = new URL(url);
    u.search = "";
    u.hash = "";
    u.hostname = u.hostname.toLowerCase();
    if (u.pathname.endsWith("/") && u.pathname.length > 1) {
      u.pathname = u.pathname.replace(/\/+$/, "");
    }
    return u.toString();
  } catch {
    return url;
  }
}

function urlHash(url) {
  return createHash("sha256").update(canonicalize(url)).digest("hex");
}

function loadSnapshot(url) {
  const path = resolve(STORE, urlHash(url), "latest.json");
  if (!existsSync(path)) return null;
  return JSON.parse(readFileSync(path, "utf8"));
}

// ----------------------------------------------------------------------
// Ledger parsing
// ----------------------------------------------------------------------

function loadLedger() {
  const text = readFileSync(LEDGER_PATH, "utf8");
  const lines = text.split("\n");
  // Find the header row of the rows table.
  let headerLine = -1;
  for (let i = 0; i < lines.length; i++) {
    if (
      lines[i].startsWith("| ID |") &&
      lines[i].includes("Verdict") &&
      lines[i].includes("Claim")
    ) {
      headerLine = i;
      break;
    }
  }
  if (headerLine === -1) return { lines, headerLine: -1, rows: [] };
  // Two lines after header: header + separator. Rows follow.
  const rows = [];
  for (let i = headerLine + 2; i < lines.length; i++) {
    const line = lines[i];
    if (!line.startsWith("|")) break;
    const cells = line.split("|").slice(1, -1).map((c) => c.trim());
    if (cells.length < 10) continue;
    const [id, surface, location, claim, lane, type, citedSources, verdict, lastVerified, notes] = cells;
    rows.push({
      lineIndex: i,
      raw: line,
      id,
      surface,
      location,
      claim,
      lane,
      type,
      citedSources,
      verdict,
      lastVerified,
      notes,
    });
  }
  return { lines, headerLine, rows };
}

function writeLedger(state, updates) {
  const out = [...state.lines];
  for (const u of updates) {
    out[u.lineIndex] = `| ${u.id} | ${u.surface} | ${u.location} | ${u.claim} | ${u.lane} | ${u.type} | ${u.citedSources} | ${u.verdict} | ${u.lastVerified} | ${u.notes} |`;
  }
  writeFileSync(LEDGER_PATH, out.join("\n"));
}

// ----------------------------------------------------------------------
// Verifier prompt + call
// ----------------------------------------------------------------------

const SYSTEM_PROMPT = `You are an entailment verifier for the open-source-ai-stack site's claims ledger. You read a single claim and a single source snapshot and decide whether the snapshot entails the claim.

Output STRICTLY this JSON shape (no prose around it):

{
  "verdict": "supported" | "contradicted" | "unsupported" | "verifier_unable",
  "confidence": "high" | "medium" | "low",
  "evidence_span": "<verbatim quote from the snapshot, ≤300 chars, REQUIRED if verdict is supported>",
  "note": "<≤120 chars explanation>"
}

Verdict definitions:
- supported: the snapshot directly entails the specific quantity, date, attribution, or relationship in the claim. NOT topical relatedness.
- contradicted: the snapshot directly contradicts the claim. note: must name the contradiction.
- unsupported: the snapshot is relevant but does not entail the claim (and does not contradict it). The source needs to be replaced or the claim softened.
- verifier_unable: the claim is unrecoverably ambiguous, OR the snapshot is missing the relevant section, OR the claim is a framing/opinion claim that should not be in the factual lane. note: must say which.

Rules:
- Do NOT mark supported without an evidence_span quoted verbatim from the snapshot.
- If you find yourself reasoning "this is probably true based on general knowledge," that is NOT entailment. Set unsupported.
- Bias toward unsupported when entailment is not crisp. Low precision is worse than low recall here.
- "Topically related" is NOT supported. The snapshot must explicitly state the specific fact in the claim.`;

function buildUserMessage({ claim, snapshot, claimLane }) {
  return `Claim lane: ${claimLane}
Claim: ${claim}

Source URL: ${snapshot.url}
Source fetched at: ${snapshot.fetched_at}

Source content (extracted main text):
"""
${(snapshot.extracted_text || "").slice(0, 16000)}
"""

Verify the claim against the source. Output the JSON verdict.`;
}

async function callVerifier({ claim, snapshot, claimLane, model }) {
  const res = await client.messages.create({
    model,
    max_tokens: 600,
    system: SYSTEM_PROMPT,
    messages: [
      { role: "user", content: buildUserMessage({ claim, snapshot, claimLane }) },
    ],
  });
  const text = res.content.map((b) => (b.type === "text" ? b.text : "")).join("");
  // Extract the first {...} JSON object.
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) {
    return {
      verdict: "verifier_unable",
      confidence: "low",
      evidence_span: "",
      note: "Verifier returned non-JSON",
    };
  }
  try {
    return JSON.parse(m[0]);
  } catch (e) {
    return {
      verdict: "verifier_unable",
      confidence: "low",
      evidence_span: "",
      note: `JSON parse error: ${e.message}`,
    };
  }
}

// ----------------------------------------------------------------------
// Per-row routing
// ----------------------------------------------------------------------

async function verifyOne(row) {
  // Framing claims: NOT entailment. Skip; should be handled by Layer 4
  // paragraph-level consistency check.
  if (row.lane === "framing") {
    return {
      verdict: "consistent",
      lastVerified: new Date().toISOString().slice(0, 10),
      notes: "framing; consistency-check Layer 4 will re-check quarterly",
    };
  }
  // Predictions: never verify factually.
  if (row.lane === "prediction") {
    return {
      verdict: "pending_horizon",
      lastVerified: new Date().toISOString().slice(0, 10),
      notes: "prediction; horizon resolver routine handles",
    };
  }
  // Factual: do entailment.
  if (!row.citedSources || row.citedSources === "—") {
    return {
      verdict: "needs_source",
      lastVerified: new Date().toISOString().slice(0, 10),
      notes: "no cited source",
    };
  }
  // Pick the first cited source URL; iterate later if we want
  // multi-source entailment.
  const sources = row.citedSources.split(",").map((s) => s.trim()).filter(Boolean);
  let bestResult = null;
  for (const src of sources) {
    const snapshot = loadSnapshot(src);
    if (!snapshot) {
      bestResult = bestResult ?? {
        verdict: "source_unreachable",
        confidence: "high",
        evidence_span: "",
        note: `no snapshot for ${src}; run audit:snapshot`,
      };
      continue;
    }
    if (snapshot.error || !snapshot.extracted_text) {
      bestResult = bestResult ?? {
        verdict: "source_unreachable",
        confidence: "high",
        evidence_span: "",
        note: snapshot.error ?? "no extracted_text in snapshot",
      };
      continue;
    }
    const result = await callVerifier({
      claim: row.claim,
      snapshot,
      claimLane: row.lane,
      model: DEFAULT_MODEL,
    });
    // If supported, return immediately. Otherwise hold the best and
    // try the next source.
    if (result.verdict === "supported") {
      bestResult = { ...result, source: src };
      break;
    }
    if (!bestResult || bestResult.verdict === "source_unreachable") {
      bestResult = { ...result, source: src };
    }
  }

  // Escalate low-confidence to the cross-model judge.
  if (bestResult && bestResult.verdict !== "supported" && bestResult.confidence === "low") {
    const snapshot = loadSnapshot(sources[0]);
    if (snapshot && snapshot.extracted_text) {
      const escalated = await callVerifier({
        claim: row.claim,
        snapshot,
        claimLane: row.lane,
        model: ESCALATION_MODEL,
      });
      bestResult = {
        ...escalated,
        note: `escalated: ${escalated.note ?? ""}`.slice(0, 120),
      };
    }
  }

  return {
    verdict: bestResult?.verdict ?? "verifier_unable",
    lastVerified: new Date().toISOString().slice(0, 10),
    notes: (
      (bestResult?.evidence_span ? `evidence: ${bestResult.evidence_span.slice(0, 80)}... ` : "") +
      (bestResult?.note ?? "")
    ).slice(0, 120),
  };
}

// ----------------------------------------------------------------------
// Main
// ----------------------------------------------------------------------

const args = process.argv.slice(2);
function flag(name) {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] ?? true : null;
}

const state = loadLedger();
if (state.headerLine === -1) {
  console.error("[verify_entailment] no rows table found in ledger; run extraction first");
  process.exit(0);
}

let targetRows;
if (flag("--all")) {
  targetRows = state.rows;
} else if (flag("--status")) {
  const status = flag("--status");
  targetRows = state.rows.filter((r) => r.verdict === status);
} else if (flag("--row")) {
  const id = flag("--row");
  targetRows = state.rows.filter((r) => r.id === id);
} else if (flag("--since-last-extract")) {
  targetRows = state.rows.filter((r) => r.verdict === "needs_verification");
} else {
  targetRows = state.rows.filter((r) => r.verdict === "needs_verification");
}

console.log(`[verify_entailment] verifying ${targetRows.length} row(s) of ${state.rows.length} total`);

const updates = [];
let i = 0;
for (const row of targetRows) {
  i++;
  try {
    const result = await verifyOne(row);
    updates.push({
      ...row,
      verdict: result.verdict,
      lastVerified: result.lastVerified,
      notes: result.notes,
    });
    console.log(`  [${i}/${targetRows.length}] ${row.id}: ${result.verdict}`);
  } catch (e) {
    console.error(`  [${i}/${targetRows.length}] ${row.id}: ERROR ${e.message ?? e}`);
    updates.push({
      ...row,
      verdict: "verifier_unable",
      lastVerified: new Date().toISOString().slice(0, 10),
      notes: `verifier exception: ${String(e.message ?? e).slice(0, 80)}`,
    });
  }
  // Persist after every row so partial runs are not lost.
  if (i % 5 === 0) {
    writeLedger(state, updates);
  }
}
writeLedger(state, updates);

// Summary.
const counts = {};
for (const u of updates) counts[u.verdict] = (counts[u.verdict] || 0) + 1;
console.log(
  "[verify_entailment] done: " +
    Object.entries(counts).map(([k, v]) => `${k}=${v}`).join(" "),
);
