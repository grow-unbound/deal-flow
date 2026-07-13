-- Register reco pg_cron jobs, and define the per-tenant runner functions
-- they call.
--
-- Each reco_run_all_* / reco_refresh_category_intelligence loops every
-- active tenant; each iteration is wrapped so a single tenant's failure is
-- logged and skipped, not fatal to the whole batch (a bad/oversized tenant
-- shouldn't abort every other tenant's run or hold locks on
-- invoice_items/orders joins for longer than necessary).
--
-- Cadence differentiated by how fast each recommendation type actually
-- drifts at this app's scale (small catalogs, B2B reorder patterns don't
-- shift day to day):
--   - popularity:        daily  — cheap ranking recompute, drives buyer-app
--                         relevance directly, worth staying fresh.
--   - buyer profiles:    weekly — cheap post-rewrite (set-based, see
--                         20260712072700), B2B taste doesn't shift weekly.
--   - associations +
--     category profiles: fortnightly, merged into ONE per-tenant loop
--                         (was two separate tenant-loop passes on
--                         consecutive cron slots) — co-purchase patterns
--                         move slowly with a 500-product catalog.
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
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'reco-assoc-category-fortnightly') THEN
    PERFORM cron.unschedule('reco-assoc-category-fortnightly');
  END IF;
END $$;

CREATE OR REPLACE FUNCTION app.reco_refresh_category_intelligence()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE t RECORD;
BEGIN
  FOR t IN SELECT id FROM app.tenants WHERE status = 'active' LOOP
    BEGIN
      PERFORM app.reco_compute_category_profiles(t.id);
      PERFORM app.reco_compute_category_associations(t.id, 90);
      PERFORM app.reco_compute_associations(t.id, 90);
      PERFORM app.reco_suggest_bundles(t.id);
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'reco_refresh_category_intelligence failed for tenant %: %', t.id, SQLERRM;
    END;
  END LOOP;
END;
$$;

ALTER FUNCTION app.reco_refresh_category_intelligence() OWNER TO postgres;

-- Kept standalone (product-level associations only) so it's still callable
-- directly for a targeted repair, even though the fortnightly cron now goes
-- through reco_refresh_category_intelligence instead.
CREATE OR REPLACE FUNCTION app.reco_run_all_associations()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE t RECORD;
BEGIN
  FOR t IN SELECT id FROM app.tenants WHERE status = 'active' LOOP
    BEGIN
      PERFORM app.reco_compute_associations(t.id, 90);
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'reco_run_all_associations failed for tenant %: %', t.id, SQLERRM;
    END;
  END LOOP;
END;
$$;

ALTER FUNCTION app.reco_run_all_associations() OWNER TO postgres;

CREATE OR REPLACE FUNCTION app.reco_run_all_buyer_profiles()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE t RECORD;
BEGIN
  FOR t IN SELECT id FROM app.tenants WHERE status = 'active' LOOP
    BEGIN
      PERFORM app.reco_refresh_buyer_profiles(t.id);
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'reco_run_all_buyer_profiles failed for tenant %: %', t.id, SQLERRM;
    END;
  END LOOP;
END;
$$;

ALTER FUNCTION app.reco_run_all_buyer_profiles() OWNER TO postgres;

CREATE OR REPLACE FUNCTION app.reco_run_all_popularity()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE t RECORD;
BEGIN
  FOR t IN SELECT id FROM app.tenants WHERE status = 'active' LOOP
    BEGIN
      PERFORM app.reco_compute_popularity(t.id);
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'reco_run_all_popularity failed for tenant %: %', t.id, SQLERRM;
    END;
  END LOOP;
END;
$$;

ALTER FUNCTION app.reco_run_all_popularity() OWNER TO postgres;

-- All times anchored to midnight-IST hours, 30min apart, chained after the
-- daily sync/snapshot slots (00:00 zoho-sync-daily, 00:30 buyer-metric-
-- snapshot-freshness — see bootstrap.sql). pg_cron evaluates schedules in
-- UTC, and IST is UTC+5:30, so every "midnight IST hour" (00:00-04:59 IST)
-- falls on the PREVIOUS UTC calendar date/weekday — day-of-week and
-- day-of-month fields below are adjusted accordingly, not just the time.
--
-- reco-popularity-daily: 01:00 IST -> 19:30 UTC (same UTC date, no shift needed).
SELECT cron.schedule('reco-popularity-daily',           '30 19 * * *',  'SELECT app.reco_run_all_popularity()');
-- reco-buyer-weekly: target "Monday 02:00 IST" = Sunday 20:30 UTC — day-of-week
-- must be 0 (Sunday), not 1 (Monday), or this silently fires a day early.
SELECT cron.schedule('reco-buyer-weekly',                '30 20 * * 0',  'SELECT app.reco_run_all_buyer_profiles()');
-- reco-assoc-category-fortnightly: target "1st & 15th, 02:30 IST" = 21:00 UTC
-- the PRIOR day. Day 0 isn't a valid cron field (and "last day of prior
-- month" isn't expressible without 'L' support, which pg_cron's parser
-- doesn't have) — so day-of-month stays 1,15 in UTC, which lands on IST
-- calendar days 2nd & 16th at 02:30 IST. Fortnightly cadence is what
-- matters here, not the exact calendar day, so this is the correct
-- resolution rather than a bug.
SELECT cron.schedule('reco-assoc-category-fortnightly',  '0 21 1,15 * *', 'SELECT app.reco_refresh_category_intelligence()');
