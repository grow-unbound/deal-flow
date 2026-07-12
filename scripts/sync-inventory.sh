#!/usr/bin/env bash
set -euo pipefail

# Usage: ./scripts/sync-inventory.sh [per_page]
# Runs a full inventory sync (all products, no date filter) page by page.
# Defaults to per_page=20 — each page is ~60s at worst-case Zoho latency.
# INTEGRATIONS_DISPATCH_SECRET must be set in your shell env.

# --- fill these in once ---
SUPABASE_URL="https://ytlusgmlqxuosifeapkz.supabase.co"
TENANT_INTEGRATION_ID="cf3fb1c0-509a-482f-9f2f-8e622e87de1b"
# -------------------------

if [ -z "${INTEGRATIONS_DISPATCH_SECRET:-}" ]; then
  echo "INTEGRATIONS_DISPATCH_SECRET is not set — export it first." >&2
  exit 1
fi

PER_PAGE="${1:-20}"
SLEEP_BETWEEN=5   # seconds between pages — on top of the function's own
                   # internal Zoho pacing; gives the rate-limit window room
                   # to recover between pages

page=1
total_persisted=0
page_count=0

echo "Starting inventory sync — per_page=$PER_PAGE"

while :; do
  body=$(jq -n \
    --arg tid "$TENANT_INTEGRATION_ID" \
    --argjson per_page "$PER_PAGE" \
    --argjson page "$page" \
    '{tenant_integration_id:$tid, per_page:$per_page, page_from:$page}')

  resp=$(curl -sS -X POST "$SUPABASE_URL/functions/v1/sync-inventory" \
    -H "Content-Type: application/json" \
    -H "x-integrations-dispatch-secret: $INTEGRATIONS_DISPATCH_SECRET" \
    -d "$body")

  echo "$resp" | jq .

  ok=$(echo "$resp" | jq -r '.ok')
  if [ "$ok" != "true" ]; then
    echo "stopped: ok=$ok" >&2
    exit 1
  fi

  records=$(echo "$resp" | jq -r '.records_synced // 0')
  total_persisted=$((total_persisted + records))
  page_count=$((page_count + 1))
  has_more=$(echo "$resp" | jq -r '.has_more')

  echo "page=$page records_synced=$records running_total=$total_persisted has_more=$has_more"

  if [ "$has_more" != "true" ]; then
    echo "done — $page_count pages, $total_persisted rows persisted"
    break
  fi

  page=$(echo "$resp" | jq -r '.next_cursor.page')
  sleep "$SLEEP_BETWEEN"
done
