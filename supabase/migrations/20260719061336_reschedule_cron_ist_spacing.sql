-- Reschedule all nightly cron jobs with 30-45 min IST spacing.
--
-- Zoho rate limits reset at midnight IST; sync moved to 00:30 IST to avoid
-- hammering the API at reset time. All downstream jobs cascaded to prevent
-- overlaps. All times are IST (UTC+5:30).
--
-- Final schedule:
--   00:30 IST  (19:00 UTC)          zoho-daily-incremental
--   01:00 IST  (19:30 UTC)          buyer-metric-snapshot-freshness
--   01:45 IST  (20:15 UTC)          reco-popularity-daily
--   02:15 IST  (20:45 UTC) Sun      reco-buyer-weekly
--   02:45 IST  (21:15 UTC) 1st/15th reco-assoc-category-fortnightly
--   03:15 IST  (21:45 UTC)          storage-maintenance-evening
--   06:30 IST  (01:00 UTC)          metrics-v2-daily-reconciliation  (unchanged)
--   13:30 IST  (08:00 UTC)          storage-maintenance-morning       (unchanged)
--   every 15s                       metrics-v2-refresh-tick           (unchanged)
--   every hour                      sync-cron-idle-sweep              (unchanged)

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_extension WHERE extname = 'pg_cron') THEN
    RETURN;
  END IF;

  -- Unschedule by name (idempotent — no-op if not found)
  PERFORM cron.unschedule(jobname)
  FROM cron.job
  WHERE jobname IN (
    'zoho-daily-incremental',
    'buyer-metric-snapshot-freshness',
    'reco-popularity-daily',
    'reco-buyer-weekly',
    'reco-assoc-category-fortnightly',
    'storage-maintenance-evening'
  );

  PERFORM cron.schedule('zoho-daily-incremental',           '0 19 * * *',     'SELECT app.run_zoho_orchestrator_cron()');
  PERFORM cron.schedule('buyer-metric-snapshot-freshness',  '30 19 * * *',    'SELECT app.refresh_all_buyer_metric_snapshots()');
  PERFORM cron.schedule('reco-popularity-daily',            '15 20 * * *',    'SELECT app.reco_run_all_popularity()');
  PERFORM cron.schedule('reco-buyer-weekly',                '45 20 * * 0',    'SELECT app.reco_run_all_buyer_profiles()');
  PERFORM cron.schedule('reco-assoc-category-fortnightly',  '15 21 1,15 * *', 'SELECT app.reco_refresh_category_intelligence()');
  PERFORM cron.schedule('storage-maintenance-evening',      '45 21 * * *',    'SELECT app.run_storage_maintenance()');
END;
$$;
