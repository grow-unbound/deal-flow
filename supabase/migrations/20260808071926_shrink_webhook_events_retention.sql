-- =============================================================================
-- Shrink integration_webhook_events retention: 30 days → 7 days
--
-- The 30-day retention set in 20260719052150_regular_storage_maintenance.sql
-- assumed ~15 MB steady-state, but actual rows carry full raw_payload +
-- normalized_payload + request_headers JSONB (~8 KB/row avg, not lean). At
-- 30-day retention this table alone reaches ~110-130 MB steady-state — 25%+
-- of a 500 MB project. 7-day retention keeps recent-replay/debug value while
-- cutting steady-state roughly 4x (~25-30 MB).
-- =============================================================================

CREATE OR REPLACE FUNCTION app.purge_integration_webhook_events()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'app', 'pg_catalog'
AS $$
BEGIN
  DELETE FROM app.integration_webhook_events
  WHERE created_at < now() - interval '7 days';
END;
$$;

-- Apply the new 7-day window immediately rather than waiting for the next
-- scheduled cron run (job runs at 08:00 and 21:45 UTC).
SELECT app.purge_integration_webhook_events();
