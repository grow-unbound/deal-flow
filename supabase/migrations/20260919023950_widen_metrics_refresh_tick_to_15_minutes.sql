-- Pace metrics-v2-refresh-tick from every 30s to every 15 minutes.
--
-- Incident 2026-09-17..19 (yukti-prod): the 30s tick could not finish inside its
-- ~14s wall budget once the instance was contended (claim step alone took 11-23s,
-- commercial-domain ticks aborted 584-810x/day vs ~100-150x/day before). Aborted ticks
-- roll back their own claim, so every 30s tick re-burned a full statement timeout on the
-- same batch without draining it. A slower cadence stops the retry storm; the queue is
-- still drained, just in larger, less frequent passes.
--
-- Looks the job up by name (job ids differ between projects) and no-ops when pg_cron or
-- the job is absent (fresh local db).
DO $$
DECLARE
  v_jobid bigint;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_extension WHERE extname = 'pg_cron') THEN
    RETURN;
  END IF;

  SELECT jobid INTO v_jobid FROM cron.job WHERE jobname = 'metrics-v2-refresh-tick';
  IF v_jobid IS NOT NULL THEN
    PERFORM cron.alter_job(job_id := v_jobid, schedule := '*/15 * * * *');
  END IF;
END
$$;
