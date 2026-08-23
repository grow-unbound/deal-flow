-- Problem 3d: reconciliation self-heal sweep. The dead-letter requeue (20260823032311)
-- only recovers rows that are already in app.membership_dirty_work and got stuck.
-- Neither that nor the sync on-write refresh can catch a case where NOTHING ever
-- marked an entity dirty in the first place -- e.g. a bulk UPDATE app.buyers that
-- bypasses the per-row trigger, a migration touching app.orders/app.invoices
-- directly, or any other write path that isn't one of the known trigger sources.
--
-- This sweep re-derives membership from scratch for every automatic cohort/campaign/
-- price_list, independent of the dirty-work queue -- the true backstop for "consistency
-- and completeness against raw data". Cheap post-20260823032310 (each refresh_*_by_id
-- call is now one sub-second set-based statement), so a full per-tenant sweep is
-- inexpensive even run daily across every automatic entity.
--
-- Mirrors app.metrics_v2_run_daily_reconciliation_sweep's off-peak daily cron
-- convention (20260717094820_metrics_v2_daily_reconciliation.sql), offset by 30
-- minutes so the two sweeps don't contend.

CREATE OR REPLACE FUNCTION app.membership_run_daily_reconciliation_sweep()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'app', 'public'
AS $function$
DECLARE
  v_entity record;
BEGIN
  FOR v_entity IN
    SELECT id, 'cohort'::text AS entity_type FROM app.cohorts
    WHERE membership_mode = 'automatic' AND deleted_at IS NULL
    UNION ALL
    SELECT id, 'price_list'::text FROM app.price_lists
    WHERE membership_mode = 'automatic' AND deleted_at IS NULL
    UNION ALL
    SELECT id, 'campaign_buyers'::text FROM app.campaigns
    WHERE buyer_target_mode = 'automatic' AND deleted_at IS NULL
    UNION ALL
    SELECT id, 'campaign_products'::text FROM app.campaigns
    WHERE product_membership_mode = 'automatic' AND deleted_at IS NULL
  LOOP
    BEGIN
      IF v_entity.entity_type = 'cohort' THEN
        PERFORM app.refresh_cohort_by_id(v_entity.id);
      ELSIF v_entity.entity_type = 'price_list' THEN
        PERFORM app.refresh_price_list_by_id(v_entity.id);
      ELSIF v_entity.entity_type = 'campaign_buyers' THEN
        PERFORM app.refresh_campaign_buyers_by_id(v_entity.id);
      ELSIF v_entity.entity_type = 'campaign_products' THEN
        PERFORM app.refresh_campaign_products_by_id(v_entity.id);
      END IF;
    EXCEPTION WHEN OTHERS THEN
      -- One entity's failure (e.g. a transient lock) must not abort the sweep for
      -- every other tenant's entities.
      CONTINUE;
    END;
  END LOOP;
END;
$function$;

ALTER FUNCTION app.membership_run_daily_reconciliation_sweep() OWNER TO postgres;
REVOKE EXECUTE ON FUNCTION app.membership_run_daily_reconciliation_sweep() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION app.membership_run_daily_reconciliation_sweep() TO service_role;

CREATE OR REPLACE FUNCTION app.ensure_membership_daily_reconciliation_cron_scheduled()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'app'
AS $function$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_extension WHERE extname = 'pg_cron') THEN
    RETURN;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'membership-daily-reconciliation') THEN
    -- 01:30 UTC = 07:00 IST -- off-peak, offset from metrics-v2-daily-reconciliation's
    -- 01:00 UTC slot so the two sweeps don't contend for the same window.
    PERFORM cron.schedule(
      'membership-daily-reconciliation',
      '30 1 * * *',
      $cron$SELECT app.membership_run_daily_reconciliation_sweep();$cron$
    );
  END IF;
END;
$function$;

ALTER FUNCTION app.ensure_membership_daily_reconciliation_cron_scheduled() OWNER TO postgres;
REVOKE EXECUTE ON FUNCTION app.ensure_membership_daily_reconciliation_cron_scheduled() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION app.ensure_membership_daily_reconciliation_cron_scheduled() TO service_role;

SELECT app.ensure_membership_daily_reconciliation_cron_scheduled();
