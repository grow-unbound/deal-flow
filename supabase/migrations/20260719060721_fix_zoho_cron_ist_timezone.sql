-- Fix: Zoho daily incremental sync never fired because of UTC/IST mismatch.
--
-- run_zoho_orchestrator_cron() only dispatches the sync when IST hour = 0
-- (midnight IST). The old schedule was 23:30 UTC = 05:00 IST, so the guard
-- was never satisfied. Correct schedule is 18:30 UTC = 00:00 IST.
--
-- Applied live on prod (hcpzbnmumbykdqveyjhr) on 2026-07-19 — this migration
-- is idempotent for prod (unschedule is a no-op if name not found) and
-- also corrects any future DB resets or dev pushes.

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_catalog.pg_extension WHERE extname = 'pg_cron') THEN
    -- Remove old job by name if it still exists (idempotent)
    PERFORM cron.unschedule('zoho-daily-incremental')
    WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'zoho-daily-incremental');

    -- Also clean up any legacy numeric job 12 if still present on a fresh DB
    PERFORM cron.unschedule(j.jobid)
    FROM cron.job j
    WHERE j.command LIKE '%run_zoho_orchestrator_cron%'
      AND j.schedule = '30 23 * * *';

    PERFORM cron.schedule(
      'zoho-daily-incremental',
      '30 18 * * *',   -- 18:30 UTC = 00:00 IST
      'SELECT app.run_zoho_orchestrator_cron()'
    );
  END IF;
END;
$$;
