-- =============================================================================
-- ONE-TIME STORAGE CLEANUP
-- Safe for both prod (hcpzbnmumbykdqveyjhr) and dev (euhzgherjvjopjrpoqjr).
-- Does NOT touch orders / invoices / estimates / buyers (real business data).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. cron.job_run_details
--    Prod: 62 MB  (4,149 job-13 failure rows, each ~8 KB of SQL text)
--    Dev:  117 MB (11,931 rows from 15-second cadence over 3 days)
-- -----------------------------------------------------------------------------
DELETE FROM cron.job_run_details;

-- -----------------------------------------------------------------------------
-- 2. app.metrics_dirty_work
--    Delete completed rows (never purged after acknowledge).
--    Delete pending rows: on dev these are 49,477 seeded artefacts; on prod
--    only 31 rows that the daily reconciliation will re-enqueue tonight.
-- -----------------------------------------------------------------------------
DELETE FROM app.metrics_dirty_work WHERE state = 'completed';
DELETE FROM app.metrics_dirty_work WHERE state = 'pending';

-- -----------------------------------------------------------------------------
-- 3. Unblock prod job 13 (metrics worker) — infinite failure loop fix
--    Root cause: _metrics_refresh_location_scopes uses
--      ON CONFLICT (tenant_id, location_id, day) WHERE deleted_at IS NULL
--    but metrics_location_daily also has UNIQUE (tenant_id, external_ref)
--    (not partial). Soft-deleted rows are outside the partial index so ON
--    CONFLICT never fires and the external_ref constraint throws instead.
--    Hard-deleting soft-deleted rows unblocks the next worker tick.
--    NOTE: the underlying function bug still needs a code-level fix — see
--    _metrics_refresh_location_scopes, change ON CONFLICT target to also
--    handle (tenant_id, external_ref) or purge soft-deletes before insert.
-- -----------------------------------------------------------------------------
DELETE FROM app.metrics_location_daily WHERE deleted_at IS NOT NULL;

-- -----------------------------------------------------------------------------
-- 4. net._http_response — pg_net accumulates HTTP call logs; never auto-expired.
--    All 5,338 prod rows are from the Jul 13 initial Zoho sync; stale.
-- -----------------------------------------------------------------------------
DELETE FROM net._http_response;

-- -----------------------------------------------------------------------------
-- 5. supabase_functions.hooks — processed edge-function invocation records.
--    Only present on prod; guard against dev where the relation may not exist.
-- -----------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'supabase_functions' AND table_name = 'hooks'
  ) THEN
    DELETE FROM supabase_functions.hooks
    WHERE created_at < now() - interval '7 days';
  END IF;
END;
$$;

-- =============================================================================
-- DEV-ONLY: truncate seeded test-data tables (~280 MB on dev).
-- Run these manually on the dev DB after applying this migration:
--
--   TRUNCATE app.invoice_items, app.estimate_items, app.order_items CASCADE;
--   TRUNCATE app.invoices, app.estimates, app.orders CASCADE;
--   TRUNCATE app.buyers_snapshot CASCADE;
--   VACUUM ANALYZE app.invoices, app.estimates, app.orders,
--                  app.order_items, app.estimate_items, app.invoice_items,
--                  app.buyers_snapshot;
-- =============================================================================
