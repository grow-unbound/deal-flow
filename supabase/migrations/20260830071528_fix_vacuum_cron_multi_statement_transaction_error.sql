-- vacuum-pruned-operational-tables (added 2026-08-23) has failed every
-- run since 2026-08-28: "ERROR: VACUUM cannot run inside a transaction
-- block". Root cause: its command was 3 semicolon-joined VACUUM
-- statements in one string -- pg_cron wraps a multi-statement command in
-- an implicit transaction, and VACUUM can't run inside one. Fix: split
-- into 3 separate single-statement jobs (each stays its own top-level
-- statement, no implicit transaction wrapping).
SELECT cron.unschedule('vacuum-pruned-operational-tables');

SELECT cron.schedule('vacuum-cron-job-run-details', '50 2 * * *',
  $$VACUUM (ANALYZE) cron.job_run_details$$);
SELECT cron.schedule('vacuum-realtime-notifications', '51 2 * * *',
  $$VACUUM (ANALYZE) app.realtime_notifications$$);
SELECT cron.schedule('vacuum-integration-webhook-events', '52 2 * * *',
  $$VACUUM (ANALYZE) app.integration_webhook_events$$);
