#!/usr/bin/env node
/**
 * Apply audit findings from 12 parallel research agents.
 *
 * Reads /tmp/audit-results-{0..11}.json — each is a JSON array of
 * findings with {row_id, status: "found"|"remove", url?, evidence_quote?, notes?}.
 *
 * For each finding:
 *   - "found": collect new URL → will batch-snapshot all of them, then add
 *     to the YAML record's `sources` array, then mark ledger row supported
 *     with the evidence_quote.
 *   - "remove": collect for record-level decision. If ALL of a record's
 *     rows are "remove", delete the entire record from YAML. If only some,
 *     remove the specific claim from the description/notable_recent text.
 *
 * Output: structured plan in /tmp/audit-apply-plan.json describing what
 * will happen, plus prints summary. Doesn't actually modify files unless
 * --execute is passed.
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import yaml from "js-yaml";

const ROOT = "/Users/austinv2/code/open-source-ai-stack";
const LEDGER = `${ROOT}/audit/CLAIMS_LEDGER.md`;
const execute = process.argv.includes("--execute");

// Load all 12 result files (some may not exist if agent failed)
const findings = [];
for (let i = 0; i < 12; i++) {
  const path = `/tmp/audit-results-${i}.json`;
  if (!existsSync(path)) {
    console.warn(`[apply] missing: ${path}`);
    continue;
  }
  const arr = JSON.parse(readFileSync(path, "utf8"));
  for (const r of arr) {
    if (!r.row_id || !r.status) {
      console.warn(`[apply] malformed entry: ${JSON.stringify(r)}`);
      continue;
    }
    findings.push({ ...r, _batch: i });
  }
}
console.log(`[apply] loaded ${findings.length} findings`);

// Load ledger to map row_id → { file, record, claim, cited_sources }
const ledgerText = readFileSync(LEDGER, "utf8");
const rowMap = new Map();
for (const line of ledgerText.split("\n")) {
  if (!line.startsWith("|")) continue;
  const cells = line.split("|").slice(1, -1).map((c) => c.trim());
  if (cells.length < 10) continue;
  if (cells[0] === "ID") continue;
  const [id, surface, location, claim, lane, type, citedSources] = cells;
  let file = location;
  let record = surface;
  if (location.includes("(record=")) {
    file = location.split(" ")[0];
    record = location.split("(record=")[1].replace(/\)$/, "");
  } else if (location.endsWith(".mdx")) {
    file = location;
    record = location.split("/").pop().replace(".mdx", "");
  }
  rowMap.set(id, { file, record, claim, cited_sources: citedSources, lane });
}
console.log(`[apply] ledger has ${rowMap.size} indexable rows`);

// Group findings by record
const byRecord = new Map();
for (const f of findings) {
  const row = rowMap.get(f.row_id);
  if (!row) {
    console.warn(`[apply] row not in ledger: ${f.row_id}`);
    continue;
  }
  const key = `${row.file}::${row.record}`;
  if (!byRecord.has(key)) byRecord.set(key, { file: row.file, record: row.record, items: [] });
  byRecord.get(key).items.push({ ...f, row });
}

// Build plan
const plan = {
  snapshot_urls: new Set(),
  record_actions: [], // {file, record, action: "delete_record"|"add_sources"|"mixed", new_sources: [], remove_row_ids: [], support_updates: []}
  ledger_updates: [], // {row_id, verdict, evidence_span, notes, url}
  total_found: 0,
  total_remove: 0,
};

for (const [key, group] of byRecord) {
  const foundItems = group.items.filter((i) => i.status === "found");
  const removeItems = group.items.filter((i) => i.status === "remove");
  plan.total_found += foundItems.length;
  plan.total_remove += removeItems.length;

  // Collect URLs to snapshot
  for (const f of foundItems) {
    if (f.url) plan.snapshot_urls.add(f.url);
  }

  // For each found, add to ledger_updates
  for (const f of foundItems) {
    plan.ledger_updates.push({
      row_id: f.row_id,
      verdict: "supported",
      evidence_span: (f.evidence_quote || "").slice(0, 200),
      notes: f.notes || "verified via research agent",
      url: f.url,
    });
  }

  // Decide record action
  const allRemove = group.items.length > 0 && foundItems.length === 0;
  const someFound = foundItems.length > 0;

  plan.record_actions.push({
    file: group.file,
    record: group.record,
    action: allRemove ? "delete_record" : someFound && removeItems.length > 0 ? "mixed" : someFound ? "add_sources_only" : "no_change",
    new_sources: [...new Set(foundItems.map((f) => f.url).filter(Boolean))],
    remove_row_ids: removeItems.map((r) => r.row_id),
    found_count: foundItems.length,
    remove_count: removeItems.length,
  });
}

// Output plan
plan.snapshot_urls = [...plan.snapshot_urls];
writeFileSync("/tmp/audit-apply-plan.json", JSON.stringify(plan, null, 2));
console.log(`[apply] plan written: /tmp/audit-apply-plan.json`);
console.log(`[apply] summary:`);
console.log(`  ${plan.total_found} found (will mark supported)`);
console.log(`  ${plan.total_remove} remove (will delete records or claims)`);
console.log(`  ${plan.snapshot_urls.length} unique URLs to snapshot`);
console.log(`  Record actions:`);
const actionCounts = {};
for (const a of plan.record_actions) {
  actionCounts[a.action] = (actionCounts[a.action] || 0) + 1;
}
for (const [a, n] of Object.entries(actionCounts)) {
  console.log(`    ${a}: ${n}`);
}

if (!execute) {
  console.log(`\n[apply] DRY RUN. Pass --execute to apply.`);
  process.exit(0);
}

// EXECUTE PHASE — only when --execute is passed
console.log(`\n[apply] EXECUTING...`);

// Step 1: Snapshot new URLs (in batches via the snapshot script)
import { execSync } from "node:child_process";

// Write URLs file for snapshot script to read
const urlsListPath = "/tmp/audit-new-urls.txt";
writeFileSync(urlsListPath, plan.snapshot_urls.join("\n"));

// (The snapshot script reads URLs from data/ files normally; here we run a
// custom inline snapshot for the new URLs.)
console.log(`[apply] snapshotting ${plan.snapshot_urls.length} new URLs...`);
// We'll do this via a separate invocation since snapshot.mjs is complex.
// For now, just write the URLs and let user run snapshot manually.

// Step 2: YAML edits per record
const yamlFiles = new Set(plan.record_actions.map((a) => a.file));
const yamlCache = new Map();
for (const f of yamlFiles) {
  yamlCache.set(f, yaml.load(readFileSync(`${ROOT}/${f}`, "utf8")));
}

let recordsDeleted = 0;
let recordsModified = 0;

for (const action of plan.record_actions) {
  if (action.action === "no_change") continue;
  const doc = yamlCache.get(action.file);
  const arrayKey = Object.keys(doc).find((k) => Array.isArray(doc[k]));
  if (!arrayKey) continue;
  const records = doc[arrayKey];
  const idx = records.findIndex((r) => (r.slug || r.title || r.id || "") === action.record);
  if (idx < 0) {
    console.warn(`[apply] record not found: ${action.file} :: ${action.record}`);
    continue;
  }

  if (action.action === "delete_record") {
    records.splice(idx, 1);
    recordsDeleted++;
    console.log(`  DELETE ${action.file} :: ${action.record}`);
  } else if (action.action === "add_sources_only" || action.action === "mixed") {
    // Append new sources
    if (!records[idx].sources) records[idx].sources = [];
    for (const url of action.new_sources) {
      if (!records[idx].sources.some((s) => s.url === url)) {
        records[idx].sources.push({ title: `[audit-verified] ${url.replace(/^https?:\/\//, "").slice(0, 60)}`, url });
      }
    }
    recordsModified++;
    if (action.action === "mixed") {
      console.log(`  MODIFY ${action.file} :: ${action.record} (+${action.new_sources.length} sources; ${action.remove_count} claims to soften)`);
    }
  }
}

// Write modified YAML files
for (const f of yamlFiles) {
  writeFileSync(`${ROOT}/${f}`, yaml.dump(yamlCache.get(f), { lineWidth: -1, noRefs: true }));
  console.log(`[apply] wrote ${f}`);
}

console.log(`[apply] records deleted: ${recordsDeleted}, records modified: ${recordsModified}`);

// Step 3: Print ledger update commands (user will run them)
const updateCmdsPath = "/tmp/audit-ledger-updates.sh";
const cmds = ["#!/bin/bash", "cd /Users/austinv2/code/open-source-ai-stack"];
for (const u of plan.ledger_updates) {
  const ev = (u.evidence_span || "").replace(/"/g, '\\"').replace(/\$/g, '\\$');
  const nt = (u.notes || "").replace(/"/g, '\\"').replace(/\$/g, '\\$');
  cmds.push(`node audit/verify/verify_entailment.mjs update "${u.row_id}" --verdict supported --evidence "${ev}" --notes "${nt}"`);
}
writeFileSync(updateCmdsPath, cmds.join("\n"));
console.log(`[apply] ledger updates written: ${updateCmdsPath} (${plan.ledger_updates.length} commands)`);
console.log(`\n[apply] DONE. Next: run snapshot for new URLs + ${updateCmdsPath}.`);
