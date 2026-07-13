-- cron.job_run_details is an operational log table (one row per cron
-- invocation), not customer data — unlike whatsapp_send_queue/whatsapp_-
-- messages (audit/credit-management records that must never be purged), it's
-- safe and necessary to prune. No purge job existed for it anywhere, and even
-- with cron jobs now scoped to job lifetime (see the coordinator/reaper
-- lifecycle migration) rather than running forever, it still accumulates one
-- row per trigger/tick/daily run indefinitely.
CREATE OR REPLACE FUNCTION app.purge_cron_job_run_details()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'cron'
AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_extension WHERE extname = 'pg_cron') THEN
    RETURN;
  END IF;

  DELETE FROM cron.job_run_details
  WHERE end_time < now() - interval '7 days';
END;
$$;

REVOKE ALL ON FUNCTION app.purge_cron_job_run_details() FROM PUBLIC;
GRANT ALL ON FUNCTION app.purge_cron_job_run_details() TO service_role;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_catalog.pg_extension WHERE extname = 'pg_cron') THEN
    IF NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'cron-job-run-details-purge') THEN
      -- 20:00 UTC = 01:30 IST — after reco-popularity-daily (01:00 IST), 30min gap.
      PERFORM cron.schedule('cron-job-run-details-purge', '0 20 * * *', 'SELECT app.purge_cron_job_run_details()');
    END IF;
  END IF;
END;
$$;
