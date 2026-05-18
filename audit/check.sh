#!/usr/bin/env bash
#
# Layer 0 + 1 mechanical audit. Runs on every commit (prebuild) and
# on demand via `npm run audit:layer1`.
#
# Skips Layer 1 link-liveness check by default (network calls are
# too slow per-commit). To include it, set INCLUDE_LINKS=1 or use
# the weekly scheduled routine.
#
# Exits non-zero if any verifier fails.

set -e

cd "$(dirname "$0")/.."

echo "[audit] Layer 0: JSON Schema validation"
node audit/verify/verify_schemas.mjs

echo "[audit] Layer 1: cross-reference resolution"
node audit/verify/verify_cross_refs.mjs

echo "[audit] Layer 1: citation discipline (existing linter)"
node scripts/lint-citations.mjs

if [[ "${INCLUDE_LINKS:-}" == "1" ]]; then
  echo "[audit] Layer 1: link liveness"
  node audit/verify/verify_links.mjs
else
  echo "[audit] Layer 1: link liveness (skipped; set INCLUDE_LINKS=1)"
fi

echo "[audit] all layers clean"
