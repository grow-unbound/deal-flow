-- Register reco pg_cron jobs.
-- The original migrations included cron.schedule() calls that silently failed
-- at migration time (permission context). This migration re-registers all 4 jobs
-- idempotently using DO blocks to guard against duplicates.

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'reco-popularity-daily') THEN
    PERFORM cron.unschedule('reco-popularity-daily');
  END IF;
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'reco-assoc-weekly') THEN
    PERFORM cron.unschedule('reco-assoc-weekly');
  END IF;
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'reco-buyer-weekly') THEN
    PERFORM cron.unschedule('reco-buyer-weekly');
  END IF;
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'reco-category-weekly') THEN
    PERFORM cron.unschedule('reco-category-weekly');
  END IF;
END $$;

SELECT cron.schedule('reco-popularity-daily',  '0 3 * * *',  'SELECT app.reco_run_all_popularity()');
SELECT cron.schedule('reco-assoc-weekly',      '0 2 * * 0',  'SELECT app.reco_run_all_associations()');
SELECT cron.schedule('reco-buyer-weekly',      '0 3 * * 1',  'SELECT app.reco_run_all_buyer_profiles()');
SELECT cron.schedule('reco-category-weekly',   '0 1 * * 0',  'SELECT app.reco_refresh_category_intelligence()');
