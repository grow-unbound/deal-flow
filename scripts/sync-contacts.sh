#!/usr/bin/env bash
set -euo pipefail

# Trigger sync-customers one contact at a time (or in paginated batches for
# --since mode) based on local buyer criteria and/or a Zoho last-modified date.
#
# Usage:
#   ./scripts/sync-contacts.sh [--since YYYY-MM-DD] [--buyer-app-enabled] [--gstin] [--incremental] [--batch-size N]
#
# Filter flags (at least one required; multiple flags are OR-combined in DB query):
#   --since YYYY-MM-DD      Paginated bulk-sync of contacts modified since this
#                           date (server-side Zoho last_modified_time filter).
#   --buyer-app-enabled     Sync only buyers with is_buyer_app_enabled = true.
#   --gstin                 Sync only buyers with gstin IS NOT NULL.
#
# Step-2 flag (incremental mode only — NOT for initial full loads):
#   --incremental           After the list-sync pass, also fetch full contact
#                           details via /contacts/{id} for each updated buyer.
#                           Calls sync-customers with contact_id param.
#                           Skip this flag during initial / historical loads.
#
# Examples:
#   # Daily incremental — modified yesterday + full detail fetch:
#   ./scripts/sync-contacts.sh --since 2026-07-19 --incremental
#
#   # Backfill buyer-app-enabled contacts, no per-ID detail fetch:
#   ./scripts/sync-contacts.sh --buyer-app-enabled
#
#   # Backfill contacts with GSTIN, no per-ID detail fetch:
#   ./scripts/sync-contacts.sh --gstin
#
#   # Full OR criteria — buyer-app OR gstin:
#   ./scripts/sync-contacts.sh --buyer-app-enabled --gstin
#
#   # Daily incremental with all three criteria (OR):
#   ./scripts/sync-contacts.sh --since 2026-07-19 --buyer-app-enabled --gstin --incremental

# ── Config (edit once) ────────────────────────────────────────────────────────
SUPABASE_URL="https://hcpzbnmumbykdqveyjhr.supabase.co"
TENANT_INTEGRATION_ID="825813c3-ed5f-44f2-8278-0f9fde5a660e"
# Required env vars:
#   INTEGRATIONS_DISPATCH_SECRET — shared secret for the edge function
#   SUPABASE_SERVICE_KEY         — service-role key for direct DB queries
# ─────────────────────────────────────────────────────────────────────────────

SINCE=""
BUYER_APP_ENABLED=false
GSTIN_FILTER=false
INCREMENTAL=false
BATCH_SIZE=100
SLEEP_BETWEEN=2   # seconds between paginated calls (since-mode only)

# ── Arg parsing ───────────────────────────────────────────────────────────────
while [[ $# -gt 0 ]]; do
  case "$1" in
    --since)
      SINCE="$2"; shift 2 ;;
    --buyer-app-enabled)
      BUYER_APP_ENABLED=true; shift ;;
    --gstin)
      GSTIN_FILTER=true; shift ;;
      --incremental)
      INCREMENTAL=true; shift ;;
    --batch-size)
      BATCH_SIZE="$2"; shift 2 ;;
    *)
      echo "Unknown flag: $1" >&2
      echo "Usage: $0 [--since YYYY-MM-DD] [--buyer-app-enabled] [--gstin] [--incremental] [--batch-size N]" >&2
      exit 1 ;;
  esac
done

if [ -z "$SINCE" ] && [ "$BUYER_APP_ENABLED" = false ] && [ "$GSTIN_FILTER" = false ]; then
  echo "Error: at least one filter required (--since, --buyer-app-enabled, --gstin)." >&2
  exit 1
fi

if [ -z "${INTEGRATIONS_DISPATCH_SECRET:-}" ]; then
  echo "INTEGRATIONS_DISPATCH_SECRET is not set — export it first." >&2
  exit 1
fi

if [ "$BUYER_APP_ENABLED" = true ] || [ "$GSTIN_FILTER" = true ] || [ "$INCREMENTAL" = true ]; then
  if [ -z "${SUPABASE_SERVICE_KEY:-}" ]; then
    echo "SUPABASE_SERVICE_KEY is not set — export it first (needed for DB queries)." >&2
    exit 1
  fi
fi

# ── Helper: query Supabase REST for buyer external_refs ───────────────────────
# Returns a newline-separated list of Zoho contact IDs (external_ref values).
query_buyer_external_refs() {
  local filter_parts=()

  # Build PostgREST OR filter for the requested criteria
  if [ "$BUYER_APP_ENABLED" = true ] && [ "$GSTIN_FILTER" = true ]; then
    # OR(is_buyer_app_enabled.eq.true,gstin.not.is.null)
    filter_parts+=("or=(is_buyer_app_enabled.eq.true,gstin.not.is.null)")
  elif [ "$BUYER_APP_ENABLED" = true ]; then
    filter_parts+=("is_buyer_app_enabled=eq.true")
  elif [ "$GSTIN_FILTER" = true ]; then
    filter_parts+=("gstin=not.is.null")
  fi

  # Also filter by since if set — contacts updated locally after that date
  if [ -n "$SINCE" ]; then
    filter_parts+=("updated_at=gte.${SINCE}")
  fi

  local query_string
  query_string=$(IFS='&'; echo "${filter_parts[*]}")

  local url="${SUPABASE_URL}/rest/v1/buyers?select=external_ref&external_ref=not.is.null&deleted_at=is.null&${query_string}"

  curl -sS "$url" \
    -H "apikey: ${SUPABASE_SERVICE_KEY}" \
    -H "Authorization: Bearer ${SUPABASE_SERVICE_KEY}" \
    -H "Accept: application/json" \
    | jq -r '.[].external_ref' \
    | grep -v '^null$' \
    | sort -u
}

# ── Helper: query buyers updated since a date (for step-2 incremental) ────────
query_updated_buyer_external_refs() {
  local since="$1"
  curl -sS "${SUPABASE_URL}/rest/v1/buyers?select=external_ref&external_ref=not.is.null&deleted_at=is.null&updated_at=gte.${since}" \
    -H "apikey: ${SUPABASE_SERVICE_KEY}" \
    -H "Authorization: Bearer ${SUPABASE_SERVICE_KEY}" \
    -H "Accept: application/json" \
    | jq -r '.[].external_ref' \
    | grep -v '^null$' \
    | sort -u
}

# ── Helper: call sync-customers for one contact by Zoho ID (step 2) ──────────
# Requires sync-customers to support contact_id param (single-contact mode:
# fetches /contacts/{contact_id} instead of the paginated /contacts list).
sync_single_contact() {
  local contact_id="$1"

  local body
  body=$(jq -n \
    --arg tid "$TENANT_INTEGRATION_ID" \
    --arg cid "$contact_id" \
    '{tenant_integration_id:$tid, contact_id:$cid}')

  local resp
  resp=$(curl -sS -X POST "${SUPABASE_URL}/functions/v1/sync-customers" \
    -H "Content-Type: application/json" \
    -H "x-integrations-dispatch-secret: ${INTEGRATIONS_DISPATCH_SECRET}" \
    -d "$body")

  echo "$resp" | jq .

  local ok
  ok=$(echo "$resp" | jq -r '.ok')
  if [ "$ok" != "true" ]; then
    echo "  [warn] sync_single_contact failed for $contact_id: $(echo "$resp" | jq -r '.error // .message // "unknown"')" >&2
    return 1
  fi
}

# ═══════════════════════════════════════════════════════════════════════════════
# STEP 1 — Sync contacts list
# ═══════════════════════════════════════════════════════════════════════════════
echo "=== Step 1: Sync contacts list ==="

if [ -n "$SINCE" ] && [ "$BUYER_APP_ENABLED" = false ] && [ "$GSTIN_FILTER" = false ]; then
  # Pure since-mode: paginated bulk sync — no local DB query needed.
  # Zoho applies last_modified_time filter server-side. Mirrors sync-line-items.sh.
  echo "Mode: paginated bulk-sync (since=$SINCE)"

  job_id=""
  page=1
  total_synced=0

  while :; do
    body=$(jq -n \
      --arg tid "$TENANT_INTEGRATION_ID" \
      --arg since "$SINCE" \
      --argjson batch "$BATCH_SIZE" \
      --argjson page "$page" \
      --arg job "$job_id" \
      '{tenant_integration_id:$tid, since:$since, per_page:$batch, page_from:$page}
       + (if $job != "" then {job_id:$job} else {} end)')

    resp=$(curl -sS -X POST "${SUPABASE_URL}/functions/v1/sync-customers" \
      -H "Content-Type: application/json" \
      -H "x-integrations-dispatch-secret: ${INTEGRATIONS_DISPATCH_SECRET}" \
      -d "$body")

    echo "$resp" | jq .

    ok=$(echo "$resp" | jq -r '.ok')
    cancelled=$(echo "$resp" | jq -r '.cancelled // false')
    if [ "$ok" != "true" ] || [ "$cancelled" = "true" ]; then
      echo "Stopped: ok=$ok cancelled=$cancelled" >&2
      exit 1
    fi

    job_id=$(echo "$resp" | jq -r '.job_id // ""')
    records=$(echo "$resp" | jq -r '.records_synced // 0')
    total_synced=$((total_synced + records))
    has_more=$(echo "$resp" | jq -r '.has_more')

    if [ "$has_more" != "true" ]; then
      echo "Step 1 done — job=${job_id} total_synced=${total_synced}"
      break
    fi

    page=$(echo "$resp" | jq -r '.next_cursor.page')
    sleep "$SLEEP_BETWEEN"
  done

else
  # Local-filter mode: query DB for matching buyer external_refs, then sync
  # each contact individually (one after the other as specified).
  echo "Mode: local-filter (buyer_app_enabled=$BUYER_APP_ENABLED, gstin=$GSTIN_FILTER, since=${SINCE:-none})"

  echo "Querying DB for matching buyers..."
  contact_ids_file=$(mktemp)
  query_buyer_external_refs > "$contact_ids_file"

  total=$(wc -l < "$contact_ids_file" | tr -d ' ')
  echo "Found $total matching buyers."

  if [ "$total" -eq 0 ]; then
    echo "No matching buyers — nothing to sync."
  else
    idx=0
    failed=0
    while IFS= read -r contact_id; do
      idx=$((idx + 1))
      echo "[$idx/$total] Syncing contact $contact_id..."

      body=$(jq -n \
        --arg tid "$TENANT_INTEGRATION_ID" \
        --arg cid "$contact_id" \
        --arg since "$SINCE" \
        '{tenant_integration_id:$tid, contact_id:$cid}
         + (if $since != "" then {since:$since} else {} end)')

      resp=$(curl -sS -X POST "${SUPABASE_URL}/functions/v1/sync-customers" \
        -H "Content-Type: application/json" \
        -H "x-integrations-dispatch-secret: ${INTEGRATIONS_DISPATCH_SECRET}" \
        -d "$body")

      echo "$resp" | jq .

      ok=$(echo "$resp" | jq -r '.ok')
      if [ "$ok" != "true" ]; then
        echo "  [warn] failed for $contact_id" >&2
        failed=$((failed + 1))
      fi

      sleep "$SLEEP_BETWEEN"
    done < "$contact_ids_file"

    rm -f "$contact_ids_file"
    echo "Step 1 done — synced $idx contacts, $failed failed."
  fi
fi

# ═══════════════════════════════════════════════════════════════════════════════
# STEP 2 — Per-contact full-detail fetch (incremental daily sync only)
# Skip during initial full loads or historical backfills.
# Calls /contacts/{id} on Zoho for each buyer updated since the since-date,
# populating fields not returned by the list endpoint (e.g. custom fields,
# detailed address, credit terms). Requires sync-customers to support
# contact_id param (single-contact mode).
# ═══════════════════════════════════════════════════════════════════════════════
if [ "$INCREMENTAL" = true ]; then
  echo ""
  echo "=== Step 2: Per-contact full-detail fetch (incremental only) ==="

  if [ -z "$SINCE" ]; then
    echo "[warn] --incremental requires --since to scope which buyers changed. Skipping step 2." >&2
  else
    echo "Querying DB for buyers updated since $SINCE..."
    updated_ids_file=$(mktemp)
    query_updated_buyer_external_refs "$SINCE" > "$updated_ids_file"

    total_updated=$(wc -l < "$updated_ids_file" | tr -d ' ')
    echo "Found $total_updated updated buyers for detail fetch."

    if [ "$total_updated" -eq 0 ]; then
      echo "No updated buyers — step 2 skipped."
    else
      idx=0
      failed=0
      while IFS= read -r contact_id; do
        idx=$((idx + 1))
        echo "[$idx/$total_updated] Detail fetch for $contact_id..."

        if sync_single_contact "$contact_id"; then
          true
        else
          failed=$((failed + 1))
        fi

        sleep "$SLEEP_BETWEEN"
      done < "$updated_ids_file"

      rm -f "$updated_ids_file"
      echo "Step 2 done — $idx detail fetches, $failed failed."
    fi
  fi
fi

echo ""
echo "All done."
