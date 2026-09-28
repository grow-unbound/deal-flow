-- SQL test: a soft-deleted entry must not block re-creating an entry with the same external_ref.
-- Migration under test: 20260928072642_fix_entries_external_ref_soft_delete_and_refresh_isolation.sql
-- Run against the DEV project only (hcpzbnmumbykdqveyjhr). Everything is rolled back: the last
-- statement raises 'entries_external_ref tests passed (N assertions)'; a failure raises 'ASSERT FAILED: <label>'.

DO $test$
DECLARE
  n int := 0;
  src app.entries%ROWTYPE;
  k text := 'test-soft-delete-' || gen_random_uuid()::text;
  live_dupe_blocked boolean := false;
BEGIN
  SELECT * INTO src FROM app.entries WHERE deleted_at IS NULL LIMIT 1;
  IF src.id IS NULL THEN RAISE EXCEPTION 'no entries fixture on dev to copy from'; END IF;

  -- first row, then soft-delete it
  INSERT INTO app.entries (tenant_id, buyer_id, location_id, entry_type, source_channel, source_entity_type, source_entity_id,
                           dedupe_key, status, priority_at, external_sync_status, metadata, external_ref, deleted_at)
  VALUES (src.tenant_id, src.buyer_id, src.location_id, src.entry_type, src.source_channel, src.source_entity_type, src.source_entity_id,
          k, 'new', now(), 'not_required', '{}', k, now());
  n := n + 1;

  -- re-creating the same external_ref while the old row is soft-deleted must succeed
  INSERT INTO app.entries (tenant_id, buyer_id, location_id, entry_type, source_channel, source_entity_type, source_entity_id,
                           dedupe_key, status, priority_at, external_sync_status, metadata, external_ref)
  VALUES (src.tenant_id, src.buyer_id, src.location_id, src.entry_type, src.source_channel, src.source_entity_type, src.source_entity_id,
          k, 'new', now(), 'not_required', '{}', k);
  n := n + 1;

  -- but two LIVE rows with the same external_ref are still rejected
  BEGIN
    INSERT INTO app.entries (tenant_id, buyer_id, location_id, entry_type, source_channel, source_entity_type, source_entity_id,
                             dedupe_key, status, priority_at, external_sync_status, metadata, external_ref)
    VALUES (src.tenant_id, src.buyer_id, src.location_id, src.entry_type, src.source_channel, src.source_entity_type, src.source_entity_id,
            k || '-b', 'new', now(), 'not_required', '{}', k);
  EXCEPTION WHEN unique_violation THEN
    live_dupe_blocked := true;
  END;
  IF NOT live_dupe_blocked THEN RAISE EXCEPTION 'ASSERT FAILED: live duplicate external_ref not rejected'; END IF;
  n := n + 1;

  RAISE EXCEPTION 'entries_external_ref tests passed (% assertions)', n;
END
$test$;
