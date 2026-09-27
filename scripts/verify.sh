#!/usr/bin/env bash
# Verify gate: tsc + vitest on the tests the code graph says are affected by the diff.
# Usage: scripts/verify.sh [BASE_REF]   (default HEAD = uncommitted work; pass the PR base to include branch commits)
set -uo pipefail
cd "$(git rev-parse --show-toplevel)"
BASE="${1:-HEAD}"

codegraph sync >/dev/null 2>&1 || echo "warn: codegraph sync failed; affected-test list may be stale"

changed=$( { git diff --name-only "$BASE"; git ls-files --others --exclude-standard; } | sort -u | grep -E '\.(ts|tsx|js|jsx|mjs)$' || true)
if [ -z "$changed" ]; then echo "verify: no TS/JS changes vs $BASE"; exit 0; fi

echo "== tsc =="; pnpm exec tsc --noEmit || { echo "verify: tsc FAILED"; exit 1; }

# changed test files run directly; graph adds tests affected by changed source
direct=$(echo "$changed" | grep -E '\.(test|spec)\.(ts|tsx)$' || true)
graph=$(echo "$changed" | codegraph affected --stdin -q -d "${VERIFY_DEPTH:-2}") || { echo "verify: codegraph affected FAILED — cannot determine affected tests (not a pass)"; exit 1; }
tests=$( { echo "$direct"; echo "$graph"; } | grep -E '\.(test|spec)\.(ts|tsx)$' | sort -u || true)
if [ -z "$tests" ]; then echo "verify: no affected tests found (say so in the PR; add coverage if logic changed)"; exit 0; fi
n=$(echo "$tests" | wc -l | tr -d ' ')
echo "== vitest ($n files) =="; echo "$tests" | xargs pnpm exec vitest run || { echo "verify: vitest FAILED"; exit 1; }
echo "verify: OK"
