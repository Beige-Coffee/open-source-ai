#!/usr/bin/env node
/**
 * Layer 2 + 3: per-claim entailment verifier (in-session mode).
 *
 * No API key. This script does NOT call an LLM. It loads ledger rows
 * and their snapshot text, prints the verifier prompt for the in-
 * session Claude agent to process, then writes verdicts back.
 *
 * Subcommands:
 *
 *   pending [--status X] [--limit N]
 *     List rows needing verification. JSON to stdout. Default status
 *     filter is `needs_verification`.
 *
 *   show <row-id>
 *     Print the verifier prompt for one row (claim + lane + snapshot
 *     text inlined). Agent reads, judges, writes back.
 *
 *   batch [--status X] [--limit N]
 *     Print prompts for N rows as a single stream.
 *
 *   update <row-id> --verdict X [--evidence "..."] [--notes "..."]
 *     Write a verdict back to the row. Sets lastVerified to today.
 *
 *   summarize
 *     Print a count-by-verdict tally of the ledger.
 *
 * Cross-model discipline: the prompt printed here is the same shape
 * regardless of who runs it. When an agent in this session does the
 * judging, evidence_span discipline still applies (no supported
 * verdict without a verbatim quote from the snapshot). For escalated
 * rows that need a different model family to break self-preference
 * bias, route the row through a separate Gemini / GPT session and
 * write back via this same `update` command.
 */
import { readFileSync, writeFileSync, existsSync, openSync, closeSync, unlinkSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "../..");
const LEDGER_PATH = resolve(ROOT, "audit/CLAIMS_LEDGER.md");
const STORE = resolve(ROOT, "sources");
const LOCK_PATH = resolve(ROOT, "audit/.ledger-update.lock");

// Synchronous file lock around ledger updates. Multiple agents running
// `update` in parallel would otherwise race: each does read-modify-
// write on the same markdown file, and the agent that reads first
// loses its update when a later agent's write overwrites it. The lock
// serializes the critical section while letting agents' reasoning run
// in parallel.
function syncSleep(ms) {
  const view = new Int32Array(new SharedArrayBuffer(4));
  Atomics.wait(view, 0, 0, ms);
}
function withLedgerLock(fn, timeoutMs = 60000) {
  const start = Date.now();
  let fd;
  while (true) {
    try {
      fd = openSync(LOCK_PATH, "wx");
      break;
    } catch (e) {
      if (e.code !== "EEXIST") throw e;
      if (Date.now() - start > timeoutMs) {
        throw new Error(`ledger lock timeout after ${timeoutMs}ms; stale lock at ${LOCK_PATH}?`);
      }
      syncSleep(50 + Math.floor(Math.random() * 100));
    }
  }
  try {
    return fn();
  } finally {
    try { closeSync(fd); } catch {}
    try { unlinkSync(LOCK_PATH); } catch {}
  }
}

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
  const rows = [];
  // The ledger has grown over time and now contains mid-file section
  // markers ("## --- Parallel verification pass... ---") between row
  // blocks. Skip non-pipe lines instead of breaking so every row gets
  // parsed regardless of what's interleaved.
  for (let i = headerLine + 2; i < lines.length; i++) {
    const line = lines[i];
    if (!line.startsWith("|")) continue;
    const cells = line.split("|").slice(1, -1).map((c) => c.trim());
    if (cells.length < 10) continue;
    const [id, surface, location, claim, lane, type, citedSources, verdict, lastVerified, notes] = cells;
    rows.push({
      lineIndex: i,
      raw: line,
      id, surface, location, claim, lane, type, citedSources, verdict, lastVerified, notes,
    });
  }
  return { lines, headerLine, rows };
}
function writeLedgerWithUpdates(state, updates) {
  const out = [...state.lines];
  for (const u of updates) {
    out[u.lineIndex] = `| ${u.id} | ${u.surface} | ${u.location} | ${u.claim} | ${u.lane} | ${u.type} | ${u.citedSources} | ${u.verdict} | ${u.lastVerified} | ${u.notes} |`;
  }
  writeFileSync(LEDGER_PATH, out.join("\n"));
}

// ----------------------------------------------------------------------
// Prompt rendering
// ----------------------------------------------------------------------

const SYSTEM_PROMPT = `You are an entailment verifier for the open-source-ai-stack site's claims ledger. You read a single claim and a single source snapshot and decide whether the snapshot entails the claim.

Output STRICTLY this JSON shape (no prose around it):

{
  "verdict": "supported" | "contradicted" | "unsupported" | "verifier_unable",
  "confidence": "high" | "medium" | "low",
  "evidence_span": "<verbatim quote from the snapshot, <=300 chars, REQUIRED if verdict is supported>",
  "note": "<=120 chars explanation>"
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

function renderPrompt(row, snapshot, src) {
  return `=== VERIFIER SYSTEM PROMPT ===

${SYSTEM_PROMPT}

=== ROW ===

Row ID: ${row.id}
Surface: ${row.surface}
Location: ${row.location}
Claim lane: ${row.lane}
Claim type: ${row.type}
Claim: ${row.claim}

Source URL: ${snapshot.url}
Source fetched at: ${snapshot.fetched_at}

Source content (extracted main text):
"""
${(snapshot.extracted_text || "").slice(0, 96000)}
"""

=== TASK ===

Verify the claim against the source above. Output the JSON verdict.

After judging, persist with:
  node audit/verify/verify_entailment.mjs update ${row.id} --verdict <V> --evidence "<span>" --notes "<note>"
`;
}

function autoVerdict(row) {
  // Lanes that don't need entailment.
  if (row.lane === "framing") {
    return {
      verdict: "consistent",
      notes: "framing; consistency-check Layer 4 will re-check quarterly",
    };
  }
  if (row.lane === "prediction") {
    return {
      verdict: "pending_horizon",
      notes: "prediction; horizon resolver routine handles",
    };
  }
  if (!row.citedSources || row.citedSources === "—") {
    return { verdict: "needs_source", notes: "no cited source" };
  }
  return null;
}

// ----------------------------------------------------------------------
// Subcommands
// ----------------------------------------------------------------------

function cmdPending(args) {
  const statusIdx = args.indexOf("--status");
  const status = statusIdx >= 0 ? args[statusIdx + 1] : "needs_verification";
  const limitIdx = args.indexOf("--limit");
  const limit = limitIdx >= 0 ? Number(args[limitIdx + 1]) : Infinity;
  const { rows } = loadLedger();
  const target = rows.filter((r) => r.verdict === status).slice(0, limit);
  const out = target.map((r) => ({
    id: r.id,
    lane: r.lane,
    type: r.type,
    claim: r.claim.slice(0, 80),
    source_count: r.citedSources ? r.citedSources.split(",").length : 0,
  }));
  console.log(JSON.stringify({ status, count: target.length, total: rows.length, rows: out }, null, 2));
}

function emitForRow(row) {
  // Auto-decide for framing/prediction/no-source rows.
  const auto = autoVerdict(row);
  if (auto) {
    console.log(`=== ROW ${row.id} (auto-verdict: ${auto.verdict}) ===\n`);
    console.log(`Persist with:`);
    console.log(`  node audit/verify/verify_entailment.mjs update ${row.id} --verdict ${auto.verdict} --notes "${auto.notes}"`);
    console.log(`\n=== END ROW ===\n`);
    return true;
  }
  // Factual: load the first snapshot we have.
  const sources = row.citedSources.split(",").map((s) => s.trim()).filter(Boolean);
  for (const src of sources) {
    const snapshot = loadSnapshot(src);
    if (!snapshot) continue;
    if (snapshot.error || !snapshot.extracted_text) continue;
    console.log(renderPrompt(row, snapshot, src));
    console.log("\n=== END ROW ===\n");
    return true;
  }
  // No usable snapshot.
  console.log(`=== ROW ${row.id} (source_unreachable) ===\n`);
  console.log(`No snapshot found for any of: ${sources.join(", ")}`);
  console.log(`Run: npm run audit:snapshot   then retry.`);
  console.log(`Or mark: node audit/verify/verify_entailment.mjs update ${row.id} --verdict source_unreachable --notes "no snapshot"`);
  console.log(`\n=== END ROW ===\n`);
  return false;
}

function getId(args) {
  // Accept --id <id> form (so callers whose harness treats dotted
  // positional args as file paths can still pass row IDs) or
  // positional <id>.
  const idx = args.indexOf("--id");
  if (idx >= 0 && args[idx + 1]) return args[idx + 1];
  return args.find((a) => !a.startsWith("--"));
}

function cmdShow(args) {
  const id = getId(args);
  if (!id) {
    console.error("usage: verify_entailment.mjs show <row-id>  (or --id <row-id>)");
    process.exit(1);
  }
  const { rows } = loadLedger();
  const row = rows.find((r) => r.id === id);
  if (!row) {
    console.error(`[verify] row not found: ${id}`);
    process.exit(1);
  }
  emitForRow(row);
}

function cmdBatch(args) {
  const statusIdx = args.indexOf("--status");
  const status = statusIdx >= 0 ? args[statusIdx + 1] : "needs_verification";
  const limitIdx = args.indexOf("--limit");
  const limit = limitIdx >= 0 ? Number(args[limitIdx + 1]) : 10;
  const { rows } = loadLedger();
  const target = rows.filter((r) => r.verdict === status).slice(0, limit);
  if (target.length === 0) {
    console.log(`# No rows in status=${status}.`);
    return;
  }
  for (const row of target) emitForRow(row);
  console.error(`[verify] emitted ${target.length} row prompt(s)`);
}

function flag(args, name) {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : null;
}

function cmdUpdate(args) {
  const id = getId(args);
  const verdict = flag(args, "--verdict");
  const evidence = flag(args, "--evidence") || "";
  const notes = flag(args, "--notes") || "";
  if (!id || !verdict) {
    console.error('usage: verify_entailment.mjs update <row-id> --verdict X [--evidence "..."] [--notes "..."]  (row-id may also be passed as --id <row-id>)');
    process.exit(1);
  }
  const allowed = new Set([
    "supported", "contradicted", "unsupported", "consistent",
    "pending_horizon", "source_unreachable", "verifier_unable",
    "stale_pending_review", "needs_human", "needs_verification",
    "needs_source",
  ]);
  if (!allowed.has(verdict)) {
    console.error(`[verify] unknown verdict: ${verdict}`);
    process.exit(1);
  }
  withLedgerLock(() => {
    const state = loadLedger();
    const row = state.rows.find((r) => r.id === id);
    if (!row) {
      console.error(`[verify] row not found: ${id}`);
      process.exit(1);
    }
    const today = new Date().toISOString().slice(0, 10);
    const combined = (
      (evidence ? `evidence: ${esc(evidence).slice(0, 80)}... ` : "") +
      esc(notes)
    ).slice(0, 200);
    writeLedgerWithUpdates(state, [{
      ...row,
      verdict,
      lastVerified: today,
      notes: combined,
    }]);
    console.log(`[verify] ${id}: ${verdict}`);
  });
}

function esc(s) {
  return String(s ?? "").replace(/\|/g, "/").replace(/\n/g, " ").trim();
}

// Defer remaining needs_verification rows to the scheduled routine.
// Marks rows with a verdict that distinguishes "we couldn't get to it
// in the bootstrap" from "we tried and the verifier couldn't decide."
function cmdDeferRemaining(args) {
  const noteIdx = args.indexOf("--note");
  const note = noteIdx >= 0 ? args[noteIdx + 1] : "deferred to scheduled audit-layer2 routine";
  const state = loadLedger();
  const today = new Date().toISOString().slice(0, 10);
  const updates = [];
  for (const row of state.rows) {
    if (row.verdict !== "needs_verification") continue;
    updates.push({
      ...row,
      verdict: "stale_pending_review",
      lastVerified: today,
      notes: note,
    });
  }
  writeLedgerWithUpdates(state, updates);
  console.log(`[defer] marked ${updates.length} row(s) as stale_pending_review`);
}

// Bulk auto-verdict pass: handles rows that don't require any LLM
// judgment (framing, prediction, no-source, no-snapshot). These all
// have deterministic verdicts under the audit rules.
function cmdAutoVerdict() {
  const state = loadLedger();
  const today = new Date().toISOString().slice(0, 10);
  const updates = [];
  const counts = { consistent: 0, pending_horizon: 0, needs_source: 0, source_unreachable: 0, skipped: 0 };
  for (const row of state.rows) {
    if (row.verdict !== "needs_verification") continue;
    let verdict = null;
    let notes = "";
    if (row.lane === "framing") {
      verdict = "consistent";
      notes = "framing; consistency-check Layer 4 will re-check quarterly";
    } else if (row.lane === "prediction") {
      verdict = "pending_horizon";
      notes = "prediction; horizon resolver routine handles";
    } else if (!row.citedSources || row.citedSources === "" || row.citedSources === "—") {
      verdict = "needs_source";
      notes = "no cited source on row; cannot verify";
    } else {
      // Factual with cited sources. Check if at least one snapshot exists.
      const sources = row.citedSources.split(",").map((s) => s.trim()).filter(Boolean);
      let hasSnapshot = false;
      for (const src of sources) {
        const snap = loadSnapshot(src);
        if (snap && snap.extracted_text) {
          hasSnapshot = true;
          break;
        }
      }
      if (!hasSnapshot) {
        verdict = "source_unreachable";
        notes = "no snapshot available for any cited source";
      }
    }
    if (verdict) {
      updates.push({ ...row, verdict, lastVerified: today, notes });
      counts[verdict] = (counts[verdict] ?? 0) + 1;
    } else {
      counts.skipped++;
    }
  }
  writeLedgerWithUpdates(state, updates);
  console.log(`[auto-verdict] processed ${updates.length} row(s):`);
  for (const [k, v] of Object.entries(counts)) {
    if (v > 0) console.log(`  ${k.padEnd(22)} ${v}`);
  }
}

function cmdSummarize() {
  const { rows } = loadLedger();
  const counts = {};
  for (const r of rows) counts[r.verdict] = (counts[r.verdict] || 0) + 1;
  const total = rows.length;
  console.log(`[verify] ledger total: ${total} rows`);
  for (const [k, v] of Object.entries(counts).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${k.padEnd(22)} ${String(v).padStart(5)}  (${((100 * v) / total).toFixed(1)}%)`);
  }
}

// ----------------------------------------------------------------------
// Main
// ----------------------------------------------------------------------

const [sub, ...rest] = process.argv.slice(2);
switch (sub) {
  case "pending": cmdPending(rest); break;
  case "show": cmdShow(rest); break;
  case "batch": cmdBatch(rest); break;
  case "update": cmdUpdate(rest); break;
  case "summarize": case "summary": cmdSummarize(); break;
  case "auto-verdict": cmdAutoVerdict(); break;
  case "defer-remaining": cmdDeferRemaining(rest); break;
  default:
    console.error(`Usage: verify_entailment.mjs <subcommand>

Subcommands:
  pending [--status X] [--limit N]    list rows needing verification
  show <row-id>                       print verifier prompt for one row
  batch [--status X] [--limit N]      print prompts for N rows
  update <row-id> --verdict X [--evidence "..."] [--notes "..."]
                                       write verdict back, set lastVerified=today
  summarize                            count rows by verdict

This script does NOT call any LLM. The agent reads the printed prompt,
judges in-session, then persists via 'update'.`);
    process.exit(sub ? 1 : 0);
}
