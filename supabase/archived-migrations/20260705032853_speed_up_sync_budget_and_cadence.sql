-- Speed up sync throughput: shorter dead-time between resume attempts.
-- Companion to raising TIME_BUDGET_MS (sync-utils.ts, 100s -> 120s) and
-- removing the orchestrator's same-phase re-dispatch loop (integrations-sync
-- no longer risks a platform kill from compounding two ~100s calls past the
-- ~150s hard limit) — each cron tick now gets more real work done per call,
-- and ticking more often shrinks the average wait between resume attempts.
CREATE OR REPLACE FUNCTION app.ensure_zoho_sync_cron_scheduled()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, app
AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_extension WHERE extname = 'pg_cron') THEN
    RETURN;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'zoho-sync-orchestrator') THEN
    PERFORM cron.schedule('zoho-sync-orchestrator', '15 seconds', 'SELECT app.run_zoho_orchestrator_cron()');
  END IF;
END;
$$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_catalog.pg_extension WHERE extname = 'pg_cron')
     AND EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'zoho-sync-orchestrator') THEN
    PERFORM cron.unschedule(jobname) FROM cron.job WHERE jobname = 'zoho-sync-orchestrator';
    PERFORM cron.schedule('zoho-sync-orchestrator', '15 seconds', 'SELECT app.run_zoho_orchestrator_cron()');
  END IF;
END;
$$;
