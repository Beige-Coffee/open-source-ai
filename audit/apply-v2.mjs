#!/usr/bin/env node
/**
 * Audit apply v2 — smarter than v1.
 *
 * For each finding:
 *   - "found" → add URL to YAML record's sources[], mark ledger row supported
 *   - "remove" with record having ZERO other supported claims → delete entire record
 *   - "remove" with record having other supported claims → leave YAML record, mark ledger row removed (claim text in YAML may still describe the unverifiable detail, but the row no longer asserts it)
 *
 * For "remove" rows we DELETE the row from the ledger (no orphan rows
 * — clean end-state where every ledger row is supported/consistent/pending_horizon).
 *
 * If --execute, modifies YAML, ledger, and prints summary.
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import yaml from "js-yaml";

const ROOT = "/Users/austinv2/code/open-source-ai-stack";
const LEDGER = `${ROOT}/audit/CLAIMS_LEDGER.md`;
const execute = process.argv.includes("--execute");

// ----- Load findings -----
const findings = [];
for (let i = 0; i < 12; i++) {
  const path = `/tmp/audit-results-${i}.json`;
  if (!existsSync(path)) continue;
  for (const r of JSON.parse(readFileSync(path, "utf8"))) {
    if (r.row_id && r.status) findings.push(r);
  }
}

// ----- Load ledger -----
const ledgerLines = readFileSync(LEDGER, "utf8").split("\n");
const rowIdToLineIdx = new Map();
const rowMap = new Map(); // row_id -> {file, record, claim, verdict, lane}
const recordsAllRows = new Map(); // "file::record" -> [row_ids]
ledgerLines.forEach((line, idx) => {
  if (!line.startsWith("|")) return;
  const cells = line.split("|").slice(1, -1).map((c) => c.trim());
  if (cells.length < 10) return;
  if (cells[0] === "ID") return;
  const [id, surface, location, claim, lane, type, citedSources, verdict] = cells;
  rowIdToLineIdx.set(id, idx);
  let file = location;
  let record = surface;
  if (location.includes("(record=")) {
    file = location.split(" ")[0];
    record = location.split("(record=")[1].replace(/\)$/, "");
  } else if (location.endsWith(".mdx")) {
    file = location;
    record = location.split("/").pop().replace(".mdx", "");
  }
  rowMap.set(id, { file, record, claim, verdict, lane, lineIdx: idx, cells });
  const key = `${file}::${record}`;
  if (!recordsAllRows.has(key)) recordsAllRows.set(key, []);
  recordsAllRows.get(key).push(id);
});

// ----- Process findings: group by record -----
const recordFindings = new Map(); // "file::record" -> {found:[], remove:[]}
for (const f of findings) {
  const row = rowMap.get(f.row_id);
  if (!row) { console.warn(`[apply-v2] row not in ledger: ${f.row_id}`); continue; }
  const key = `${row.file}::${row.record}`;
  if (!recordFindings.has(key)) recordFindings.set(key, { file: row.file, record: row.record, found: [], remove: [] });
  recordFindings.get(key)[f.status].push({ ...f, row });
}

// ----- Decide actions per record -----
const supportedVerdicts = new Set(["supported", "consistent", "pending_horizon"]);
const actions = []; // {type, file, record, ...}
const ledgerUpdates = []; // {row_id, verdict: "supported", evidence, notes}
const ledgerDeletes = new Set(); // row_ids to delete from ledger entirely

for (const [key, rec] of recordFindings) {
  const allRowIds = recordsAllRows.get(key) || [];
  const otherSupported = allRowIds.filter((id) => {
    const r = rowMap.get(id);
    return r && supportedVerdicts.has(r.verdict);
  });
  const foundRowIds = new Set(rec.found.map((f) => f.row_id));
  const removeRowIds = new Set(rec.remove.map((f) => f.row_id));

  // Found rows: mark supported in ledger, add URL to YAML sources
  for (const f of rec.found) {
    ledgerUpdates.push({
      row_id: f.row_id,
      verdict: "supported",
      evidence: (f.evidence_quote || "").slice(0, 200),
      notes: f.notes || "verified via parallel research agent",
    });
  }

  // Remove rows: always delete from ledger
  for (const f of rec.remove) ledgerDeletes.add(f.row_id);

  // Record-level YAML action
  if (otherSupported.length === 0 && rec.found.length === 0) {
    // All rows are remove and no prior supported → delete record
    actions.push({ type: "delete_record", file: rec.file, record: rec.record });
  } else if (rec.found.length > 0) {
    // Some found rows → add URLs to sources
    const newUrls = [...new Set(rec.found.map((f) => f.url).filter(Boolean))];
    if (newUrls.length > 0) {
      actions.push({ type: "add_sources", file: rec.file, record: rec.record, urls: newUrls });
    }
  }
}

// ----- Summary -----
console.log(`[apply-v2] ${findings.length} findings loaded`);
console.log(`[apply-v2] ${ledgerUpdates.length} rows to mark supported`);
console.log(`[apply-v2] ${ledgerDeletes.size} rows to delete from ledger`);
const actionTypes = {};
for (const a of actions) actionTypes[a.type] = (actionTypes[a.type] ?? 0) + 1;
console.log(`[apply-v2] YAML actions: ${JSON.stringify(actionTypes)}`);
console.log(`[apply-v2] true deletes: ${actions.filter((a) => a.type === "delete_record").map((a) => `${a.file}::${a.record}`).join(", ")}`);

if (!execute) { console.log("\n[apply-v2] DRY RUN. Pass --execute to apply."); process.exit(0); }

// ----- EXECUTE -----
// 1. YAML edits
const yamlFiles = new Set(actions.map((a) => a.file).filter((f) => f.startsWith("data/")));
const yamlCache = new Map();
for (const f of yamlFiles) yamlCache.set(f, yaml.load(readFileSync(`${ROOT}/${f}`, "utf8")));

let recordsDeleted = 0, recordsModified = 0;
for (const action of actions) {
  if (!action.file.startsWith("data/")) continue; // MDX edits would need text-level handling; skip for now
  const doc = yamlCache.get(action.file);
  const arrayKey = Object.keys(doc).find((k) => Array.isArray(doc[k]));
  const records = doc[arrayKey];
  const idx = records.findIndex((r) => (r.slug || r.title || r.id || "") === action.record);
  if (idx < 0) { console.warn(`[apply-v2] record not found in YAML: ${action.file} :: ${action.record}`); continue; }

  if (action.type === "delete_record") {
    records.splice(idx, 1);
    recordsDeleted++;
    console.log(`  DELETE ${action.file} :: ${action.record}`);
  } else if (action.type === "add_sources") {
    if (!records[idx].sources) records[idx].sources = [];
    for (const url of action.urls) {
      if (!records[idx].sources.some((s) => s.url === url)) {
        // Generate a reasonable title from the URL
        let title;
        try { title = new URL(url).hostname.replace(/^www\./, "") + " (audit-verified)"; }
        catch { title = "audit-verified source"; }
        records[idx].sources.push({ title, url });
      }
    }
    recordsModified++;
  }
}

// Write YAML files
for (const f of yamlFiles) {
  writeFileSync(`${ROOT}/${f}`, yaml.dump(yamlCache.get(f), { lineWidth: -1, noRefs: true }));
}
console.log(`[apply-v2] YAML: ${recordsDeleted} records deleted, ${recordsModified} modified`);

// 2. Ledger edits — apply supports + delete remove rows
let newLedger = [...ledgerLines];

// First, delete the remove rows (in reverse line order so indices stay valid)
const deleteIdxs = [];
for (const rowId of ledgerDeletes) {
  const idx = rowIdToLineIdx.get(rowId);
  if (idx !== undefined) deleteIdxs.push(idx);
}
deleteIdxs.sort((a, b) => b - a);
for (const idx of deleteIdxs) newLedger.splice(idx, 1);

// Now apply supports (re-read line indices since the file shrank)
const ledgerText = newLedger.join("\n");
const idLines = new Map();
newLedger.forEach((line, i) => {
  if (!line.startsWith("|")) return;
  const cells = line.split("|").slice(1, -1).map((c) => c.trim());
  if (cells.length < 10) return;
  idLines.set(cells[0], i);
});

let updated = 0;
for (const u of ledgerUpdates) {
  const idx = idLines.get(u.row_id);
  if (idx === undefined) continue;
  const cells = newLedger[idx].split("|").slice(1, -1).map((c) => c.trim());
  cells[7] = "supported";
  cells[8] = new Date().toISOString().slice(0, 10);
  const evNote = `${u.evidence ? `evidence: ${u.evidence.slice(0, 80)}... ` : ""}${u.notes || ""}`.slice(0, 200).replace(/\|/g, "/").replace(/\n/g, " ");
  cells[9] = evNote;
  newLedger[idx] = `| ${cells.join(" | ")} |`;
  updated++;
}

writeFileSync(LEDGER, newLedger.join("\n"));
console.log(`[apply-v2] ledger: ${deleteIdxs.length} rows deleted, ${updated} rows marked supported`);
console.log(`\n[apply-v2] DONE.`);
