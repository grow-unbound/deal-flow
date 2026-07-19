-- =============================================================================
-- REGULAR STORAGE MAINTENANCE
-- Replaces / adds purge functions and cron schedules for both prod and dev.
-- After this migration the DB is self-cleaning within defined retention windows.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Replace purge_cron_job_run_details — shrink retention from 7 days → 2 days
--
--    Why: job 13 (metrics worker) runs every 15 s and stores the full ~3 KB
--    command text on every run. At 5,760 runs/day × 3 KB = 17 MB/day.
--    7-day window = up to 120 MB just from this one job. 2 days = 34 MB max.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.purge_cron_job_run_details()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'cron'
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_extension WHERE extname = 'pg_cron'
  ) THEN
    RETURN;
  END IF;

  DELETE FROM cron.job_run_details
  WHERE end_time < now() - interval '2 days';

  -- Free pages immediately so storage meter drops without waiting for autovacuum.
  -- VACUUM cannot run inside a transaction, so we use a DO block via dblink-free
  -- approach: just let autovacuum handle it (it will within minutes after a large
  -- delete). If you want instant reclaim, run manually:
  --   VACUUM ANALYZE cron.job_run_details;
END;
$$;

-- -----------------------------------------------------------------------------
-- 2. NEW: purge_metrics_dirty_work
--    Completed rows have zero value after acknowledge — delete after 1 hour.
--    Failed rows that have exhausted retries — delete after 3 days.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.purge_metrics_dirty_work()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'app', 'pg_catalog'
AS $$
BEGIN
  -- completed rows: keep for 1 hour in case of debugging, then gone
  DELETE FROM app.metrics_dirty_work
  WHERE state = 'completed'
    AND completed_at < now() - interval '1 hour';

  -- failed rows that are permanently stuck (attempts > 5 and stale)
  DELETE FROM app.metrics_dirty_work
  WHERE state = 'failed'
    AND attempts >= 5
    AND next_attempt_at < now() - interval '3 days';
END;
$$;

-- -----------------------------------------------------------------------------
-- 3. NEW: purge_integration_webhook_events
--    Webhook events are reference logs — keep 30 days, then drop.
--    Prod: ~600 events/day × 30 days = 18,000 rows steady-state (~15 MB).
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.purge_integration_webhook_events()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'app', 'pg_catalog'
AS $$
BEGIN
  DELETE FROM app.integration_webhook_events
  WHERE created_at < now() - interval '30 days';
END;
$$;

-- -----------------------------------------------------------------------------
-- 4. NEW: purge_net_http_response
--    pg_net accumulates HTTP response logs indefinitely. Keep 7 days.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.purge_net_http_response()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'net', 'pg_catalog'
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_extension WHERE extname = 'pg_net'
  ) THEN
    RETURN;
  END IF;

  DELETE FROM net._http_response
  WHERE created < now() - interval '7 days';
END;
$$;

-- -----------------------------------------------------------------------------
-- 5. NEW: purge_supabase_hooks
--    supabase_functions.hooks rows accumulate; keep 7 days.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.purge_supabase_hooks()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'supabase_functions', 'pg_catalog'
AS $$
BEGIN
  DELETE FROM supabase_functions.hooks
  WHERE created_at < now() - interval '7 days';
END;
$$;

-- -----------------------------------------------------------------------------
-- 6. Master purge coordinator — single entry point called by cron.
--    Runs all purge functions in one scheduled job.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.run_storage_maintenance()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'app', 'pg_catalog'
AS $$
BEGIN
  PERFORM app.purge_cron_job_run_details();
  PERFORM app.purge_metrics_dirty_work();
  PERFORM app.purge_integration_webhook_events();
  PERFORM app.purge_net_http_response();
  PERFORM app.purge_supabase_hooks();
END;
$$;

-- -----------------------------------------------------------------------------
-- 7. Schedule: replace the existing purge job (jobid=9) with the master fn,
--    and add a second run at 08:00 UTC so we get two purges per day.
--
--    Existing job 9: "0 20 * * *" → SELECT app.purge_cron_job_run_details()
--    We update it to call the master coordinator instead.
-- -----------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_catalog.pg_extension WHERE extname = 'pg_cron') THEN

    -- Replace job 9 with the master maintenance call
    PERFORM cron.unschedule(9);
    PERFORM cron.schedule(
      'storage-maintenance-evening',
      '0 20 * * *',
      'SELECT app.run_storage_maintenance()'
    );

    -- Add a morning run so cron.job_run_details doesn't balloon between 20:00 runs.
    -- Job 13/14 generates ~80 MB of logs per day — two purges keeps it under ~40 MB.
    PERFORM cron.schedule(
      'storage-maintenance-morning',
      '0 8 * * *',
      'SELECT app.run_storage_maintenance()'
    );

  END IF;
END;
$$;

-- -----------------------------------------------------------------------------
-- Retention summary after this migration:
--   cron.job_run_details          2 days   (was 7)   ~34 MB max
--   app.metrics_dirty_work        1 hr after complete, 3 days after perm-fail
--   app.integration_webhook_events 30 days             ~15 MB steady-state
--   net._http_response            7 days
--   supabase_functions.hooks      7 days
-- -----------------------------------------------------------------------------
