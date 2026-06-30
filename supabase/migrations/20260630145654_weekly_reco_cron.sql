-- Weekly recommendation computation cron.
--
-- Architectural rationale: reco models (popularity, associations, buyer profiles,
-- bundles) require a week of order-signal accumulation to produce meaningful results.
-- Running them per-sync wastes CPU and risks the 150s Edge Function timeout for large
-- tenants when multiple tenants sync in parallel (each reco RPC is a full
-- orders/order_items scan scoped by tenant_id).
--
-- Pattern mirrors wineyard-catalog's weekly reco crons (Sunday ~06:00 IST).
-- post_sync_rebuild (snapshots + KPI) still fires per-phase via the DB trigger so
-- KPI tiles stay current throughout each sync run.

CREATE OR REPLACE FUNCTION app.run_weekly_reco()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  rec record;
BEGIN
  -- Sequential per-tenant to avoid concurrent full table scans on Postgres.
  FOR rec IN
    SELECT DISTINCT ti.tenant_id
    FROM app.tenant_integrations ti
    WHERE ti.status = 'connected'
      AND ti.deleted_at IS NULL
    ORDER BY ti.tenant_id
  LOOP
    BEGIN
      PERFORM app.reco_compute_popularity(rec.tenant_id);
      PERFORM app.reco_compute_associations(rec.tenant_id);
      PERFORM app.reco_refresh_buyer_profiles(rec.tenant_id);
      PERFORM app.reco_compute_category_profiles(rec.tenant_id);
      PERFORM app.reco_compute_category_associations(rec.tenant_id);
      PERFORM app.reco_suggest_bundles(rec.tenant_id);
    EXCEPTION WHEN OTHERS THEN
      -- Skip this tenant on error; continue to the next.
      RAISE WARNING '[run_weekly_reco] tenant % failed: %', rec.tenant_id, SQLERRM;
    END;
  END LOOP;
END;
$$;

-- Sundays 00:30 UTC (06:00 IST). Off-peak, avoids Saturday night batch overlap.
SELECT cron.schedule(
  'weekly-reco-compute',
  '30 0 * * 0',
  $$SELECT app.run_weekly_reco()$$
);
