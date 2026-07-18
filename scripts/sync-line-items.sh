#!/usr/bin/env bash
set -euo pipefail

# Usage: ./scripts/sync-line-items.sh <since YYYY-MM-DD> <until YYYY-MM-DD> [batch_size]
# Example, one month at a time: ./scripts/sync-line-items.sh 2026-06-01 2026-06-30

# --- fill these in once ---
SUPABASE_URL="https://hcpzbnmumbykdqveyjhr.supabase.co"
TENANT_INTEGRATION_ID="825813c3-ed5f-44f2-8278-0f9fde5a660e"
# INTEGRATIONS_DISPATCH_SECRET must be set in your shell env
# ----------------------

if [ $# -lt 2 ]; then
  echo "Usage: $0 <since YYYY-MM-DD> <until YYYY-MM-DD> [batch_size]" >&2
  exit 1
fi
if [ -z "${INTEGRATIONS_DISPATCH_SECRET:-}" ]; then
  echo "INTEGRATIONS_DISPATCH_SECRET is not set — export it first." >&2
  exit 1
fi

SINCE="$1"
UNTIL="$2"
BATCH_SIZE="${3:-50}"
SLEEP_BETWEEN=2   # seconds between page calls — a safety margin on top of the
                   # function's own internal Zoho pacing (10 concurrent, 6s
                   # between internal batches); not the primary rate-limit guard

job_id=""
page=1

while :; do
  body=$(jq -n \
    --arg tid "$TENANT_INTEGRATION_ID" \
    --arg since "$SINCE" \
    --arg until "$UNTIL" \
    --argjson batch "$BATCH_SIZE" \
    --argjson page "$page" \
    --arg job "$job_id" \
    '{tenant_integration_id:$tid, since:$since, until:$until, batch_size:$batch, page_from:$page}
     + (if $job != "" then {job_id:$job} else {} end)')

  resp=$(curl -sS -X POST "$SUPABASE_URL/functions/v1/sync-transaction-line-items" \
    -H "Content-Type: application/json" \
    -H "x-integrations-dispatch-secret: $INTEGRATIONS_DISPATCH_SECRET" \
    -d "$body")

  echo "$resp" | jq .

  ok=$(echo "$resp" | jq -r '.ok')
  cancelled=$(echo "$resp" | jq -r '.cancelled // false')
  if [ "$ok" != "true" ] || [ "$cancelled" = "true" ]; then
    echo "stopped: ok=$ok cancelled=$cancelled" >&2
    exit 1
  fi

  job_id=$(echo "$resp" | jq -r '.job_id')
  has_more=$(echo "$resp" | jq -r '.has_more')

  if [ "$has_more" != "true" ]; then
    echo "done — job $job_id, records_synced=$(echo "$resp" | jq -r '.records_synced')"
    break
  fi

  page=$(echo "$resp" | jq -r '.next_cursor.page')
  sleep "$SLEEP_BETWEEN"
done
