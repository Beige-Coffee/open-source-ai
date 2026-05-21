#!/usr/bin/env node
// Batch entailment verifier for AA chunk 2.
// For each row id:
//   1. Run `audit:verify:show` and capture the snapshot.
//   2. Parse claim line.
//   3. Locate the matching value in the snapshot.
//   4. Decide verdict (supported / contradicted / verifier_unable).
//   5. Run `audit:verify:update` with the verdict.
//
// Adapted from run-aa-chunk-3.mjs. Chunk-2 is bench/cost/speed rows
// with AA snapshots, no lineage rows.

import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';

const CHUNK_PATH = '/tmp/aa-verify-chunk-2.txt';
const REPORT_PATH = '/tmp/aa-verify-chunk-2-report.md';
const LOG_PATH = '/tmp/aa-verify-chunk-2-log.txt';
const REPO = '/Users/austinv2/code/open-source-ai-stack';

const ids = readFileSync(CHUNK_PATH, 'utf8')
  .split('\n')
  .map(s => s.trim())
  .filter(Boolean);

function runShow(id) {
  return execFileSync(
    'npm',
    ['run', '--silent', 'audit:verify:show', '--', '--id', id],
    { encoding: 'utf8', cwd: REPO, maxBuffer: 8 * 1024 * 1024 }
  );
}

function runUpdate(id, verdict, evidence, notes) {
  const args = [
    'run', '--silent', 'audit:verify:update', '--',
    '--id', id,
    '--verdict', verdict,
  ];
  if (evidence) args.push('--evidence', evidence);
  if (notes) args.push('--notes', notes);
  return execFileSync('npm', args, {
    encoding: 'utf8', cwd: REPO, maxBuffer: 8 * 1024 * 1024,
  });
}

function extractClaim(showOutput) {
  const m = showOutput.match(/^Claim:\s*(.+)$/m);
  return m ? m[1].trim() : null;
}
function extractSnapshot(showOutput) {
  const m = showOutput.match(/Source content[^"]*?"""\s*([\s\S]*?)"""/);
  return m ? m[1] : '';
}
function extractSourceUrlInRow(showOutput) {
  const m = showOutput.match(/^Source URL:\s*(\S+)/m);
  return m ? m[1] : null;
}
function extractSnapshotSourceUrl(snapshot) {
  const m = snapshot.match(/^Source:\s*(\S+)/m);
  return m ? m[1] : null;
}

function rowKind(id) {
  if (id.includes('.bench.')) return 'bench';
  if (id.includes('.cost.input')) return 'cost-input';
  if (id.includes('.cost.output')) return 'cost-output';
  if (id.includes('.speed.output_tps')) return 'speed-output';
  if (id.includes('.speed.ttft')) return 'speed-ttft';
  if (id.includes('.lineage.')) return 'lineage';
  return null;
}
function benchName(id) {
  const parts = id.split('.bench.');
  return parts[1] || null;
}

function parseClaimedValue(kind, claim, bench) {
  switch (kind) {
    case 'bench': {
      const re = new RegExp(`scored\\s+([\\d.]+)\\s+on\\s+${bench}`);
      const m = claim.match(re);
      return m ? m[1] : null;
    }
    case 'cost-input': {
      const m = claim.match(/input\s+price[^$]*\$([\d.]+)\s*per\s*million\s*tokens/i)
        || claim.match(/input\s*(?:cost|price)?\s*[:=]?\s*\$([\d.]+)\s*per\s*(?:million|1M)/i)
        || claim.match(/\$([\d.]+)\s*per\s*(?:million|1M)\s*tokens?\s*\(input\)/i);
      return m ? m[1] : null;
    }
    case 'cost-output': {
      const m = claim.match(/output\s+price[^$]*\$([\d.]+)\s*per\s*million\s*tokens/i)
        || claim.match(/output\s*(?:cost|price)?\s*[:=]?\s*\$([\d.]+)\s*per\s*(?:million|1M)/i)
        || claim.match(/\$([\d.]+)\s*per\s*(?:million|1M)\s*tokens?\s*\(output\)/i);
      return m ? m[1] : null;
    }
    case 'speed-output': {
      const m = claim.match(/output\s+throughput[^0-9]*([\d.]+)\s*tokens?\s*\/\s*sec/i)
        || claim.match(/output\s+throughput[^0-9]*([\d.]+)\s*tps/i)
        || claim.match(/([\d.]+)\s*(?:tokens?\/s(?:ec)?|tps)/i);
      return m ? m[1] : null;
    }
    case 'speed-ttft': {
      const m = claim.match(/time[- ]to[- ]first[- ]token[^0-9]*([\d.]+)\s*ms/i)
        || claim.match(/TTFT[^0-9]*([\d.]+)\s*ms/i)
        || claim.match(/([\d.]+)\s*ms/i);
      return m ? m[1] : null;
    }
  }
  return null;
}

function snapshotValueLine(kind, snapshot, bench) {
  const lines = snapshot.split('\n');
  switch (kind) {
    case 'bench': {
      const prefix = `${bench}:`;
      const line = lines.find(l => l.trim().startsWith(prefix));
      if (!line) return null;
      const m = line.match(new RegExp(`^${bench}:\\s*([\\d.]+)\\s*\\(AA evaluation\\)`));
      return m ? { value: m[1], line: line.trim() } : { value: null, line: line.trim() };
    }
    case 'cost-input': {
      const line = lines.find(l => /^Input cost:/.test(l.trim()));
      if (!line) return null;
      const m = line.match(/Input cost:\s*\$([\d.]+)\s*per\s*1M\s*tokens/);
      return m ? { value: m[1], line: line.trim() } : { value: null, line: line.trim() };
    }
    case 'cost-output': {
      const line = lines.find(l => /^Output cost:/.test(l.trim()));
      if (!line) return null;
      const m = line.match(/Output cost:\s*\$([\d.]+)\s*per\s*1M\s*tokens/);
      return m ? { value: m[1], line: line.trim() } : { value: null, line: line.trim() };
    }
    case 'speed-output': {
      const line = lines.find(l => /^Output speed:/.test(l.trim()));
      if (!line) return null;
      const m = line.match(/Output speed:\s*([\d.]+)\s*tokens\/sec\s*\(median\)/);
      return m ? { value: m[1], line: line.trim() } : { value: null, line: line.trim() };
    }
    case 'speed-ttft': {
      const line = lines.find(l => /^TTFT median:/.test(l.trim()));
      if (!line) return null;
      const m = line.match(/TTFT median:\s*([\d.]+)\s*ms/);
      return m ? { value: m[1], line: line.trim() } : { value: null, line: line.trim() };
    }
  }
  return null;
}

const results = [];

let processed = 0;
for (const id of ids) {
  processed += 1;
  let result;
  try {
    const show = runShow(id);
    const claim = extractClaim(show) || '';
    const snapshot = extractSnapshot(show);
    const rowSourceUrl = extractSourceUrlInRow(show);
    const snapSourceUrl = extractSnapshotSourceUrl(snapshot);
    const kind = rowKind(id);

    if (kind === 'lineage') {
      result = {
        id,
        verdict: 'verifier_unable',
        evidence: '',
        notes: 'lineage removal-justification meta-claim; source is non-AA launch post',
      };
    } else if (!kind) {
      result = { id, verdict: 'verifier_unable', evidence: '', notes: 'unknown row kind' };
    } else if (!snapshot) {
      result = { id, verdict: 'verifier_unable', evidence: '', notes: 'no snapshot content' };
    } else if (snapSourceUrl && rowSourceUrl && snapSourceUrl !== rowSourceUrl) {
      result = { id, verdict: 'verifier_unable', evidence: '', notes: `source url mismatch row=${rowSourceUrl} snap=${snapSourceUrl}` };
    } else {
      const bench = kind === 'bench' ? benchName(id) : null;
      const claimed = parseClaimedValue(kind, claim, bench);
      const snap = snapshotValueLine(kind, snapshot, bench);

      if (!snap || !snap.line) {
        result = { id, verdict: 'verifier_unable', evidence: '', notes: 'snapshot missing field' };
      } else if (!snap.value) {
        result = { id, verdict: 'verifier_unable', evidence: '', notes: `cannot parse snapshot line: ${snap.line}` };
      } else if (claimed == null) {
        result = {
          id,
          verdict: 'verifier_unable',
          evidence: '',
          notes: `cannot parse claim value from: ${claim.slice(0, 90)}`,
        };
      } else {
        const a = Number(claimed);
        const b = Number(snap.value);
        const same = Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) < 1e-9;
        if (same) {
          result = {
            id,
            verdict: 'supported',
            evidence: snap.line,
            notes: 'AA snapshot value matches claim verbatim',
          };
        } else {
          result = {
            id,
            verdict: 'contradicted',
            evidence: snap.line,
            notes: `claim=${claimed} snapshot=${snap.value}`,
          };
        }
      }
    }
  } catch (err) {
    result = { id, verdict: 'verifier_unable', evidence: '', notes: `show failed: ${String(err.message).slice(0,100)}` };
  }

  try {
    runUpdate(result.id, result.verdict, result.evidence, result.notes);
  } catch (err) {
    result.updateError = String(err.message).slice(0, 200);
  }

  results.push(result);
  if (processed % 10 === 0) {
    process.stdout.write(`[runner] processed ${processed}/${ids.length}\n`);
  }
}

const counts = results.reduce((acc, r) => {
  const v = r.updateError ? 'update_error' : r.verdict;
  acc[v] = (acc[v] || 0) + 1;
  return acc;
}, {});

const lines = [];
lines.push(`# AA verify chunk 2 report`);
lines.push('');
lines.push(`Total processed: ${results.length}`);
for (const [verdict, count] of Object.entries(counts).sort()) {
  lines.push(`- ${verdict}: ${count}`);
}
lines.push('');
lines.push('## Non-supported rows');
lines.push('');
for (const r of results) {
  if (r.verdict !== 'supported' || r.updateError) {
    lines.push(`- \`${r.id}\` -> **${r.updateError ? 'update_error' : r.verdict}** -- ${r.notes || ''}${r.updateError ? ' :: ' + r.updateError : ''}`);
  }
}

writeFileSync(REPORT_PATH, lines.join('\n') + '\n');
writeFileSync(LOG_PATH, JSON.stringify(results, null, 2) + '\n');

process.stdout.write(`Done. Wrote ${REPORT_PATH} and ${LOG_PATH}\n`);
for (const [k, v] of Object.entries(counts)) {
  process.stdout.write(`  ${k}: ${v}\n`);
}
