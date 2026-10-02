-- F31 (specs/db-io-review-2026-09-28.md, Follow-up 2026-10-01 (2)): three nightly cron jobs
-- unconditionally loop every tenant regardless of activity, breaking the dirty-row-bounded
-- property for row-level metrics. Gate all three on a shared "tenant touched recently" signal
-- instead of looping blind. Window is 2 days (job cadence is 24h; +1 day buffer for late UTC
-- cron runs). New tenants (<7 days old) always pass so first-time population isn't skipped.
CREATE OR REPLACE FUNCTION app.tenants_with_recent_activity(p_lookback interval DEFAULT interval '2 days')
RETURNS TABLE(tenant_id uuid)
LANGUAGE sql
STABLE
SET search_path TO 'app', 'public'
AS $function$
  SELECT id FROM app.tenants WHERE deleted_at IS NULL AND created_at >= now() - interval '7 days'
  UNION
  SELECT tenant_id FROM app.integration_webhook_events WHERE received_at >= now() - p_lookback
  UNION
  SELECT tenant_id FROM app.orders WHERE updated_at >= now() - p_lookback
  UNION
  SELECT tenant_id FROM app.invoices WHERE updated_at >= now() - p_lookback
  UNION
  SELECT tenant_id FROM app.estimates WHERE updated_at >= now() - p_lookback;
$function$;

-- job 21 (membership-time-boundary-refresh, 00:05 UTC): was enqueueing every automatic
-- cohort/campaign/price_list for every tenant nightly. Scope to tenants with recent activity.
CREATE OR REPLACE FUNCTION app.membership_enqueue_time_boundary_refresh(p_reason text DEFAULT 'time_boundary'::text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'app', 'public'
AS $function$
BEGIN
  INSERT INTO app.membership_dirty_work (tenant_id, entity_type, entity_id, reason)
  SELECT tenant_id, 'cohort', id, p_reason
  FROM app.cohorts
  WHERE membership_mode = 'automatic' AND deleted_at IS NULL
    AND tenant_id IN (SELECT tenant_id FROM app.tenants_with_recent_activity())
  ON CONFLICT (tenant_id, entity_type, entity_id) WHERE state = 'pending' DO NOTHING;

  INSERT INTO app.membership_dirty_work (tenant_id, entity_type, entity_id, reason)
  SELECT tenant_id, 'campaign_buyers', id, p_reason
  FROM app.campaigns
  WHERE buyer_target_mode = 'automatic' AND deleted_at IS NULL
    AND tenant_id IN (SELECT tenant_id FROM app.tenants_with_recent_activity())
  ON CONFLICT (tenant_id, entity_type, entity_id) WHERE state = 'pending' DO NOTHING;

  INSERT INTO app.membership_dirty_work (tenant_id, entity_type, entity_id, reason)
  SELECT tenant_id, 'price_list', id, p_reason
  FROM app.price_lists
  WHERE membership_mode = 'automatic' AND deleted_at IS NULL
    AND tenant_id IN (SELECT tenant_id FROM app.tenants_with_recent_activity())
  ON CONFLICT (tenant_id, entity_type, entity_id) WHERE state = 'pending' DO NOTHING;

  INSERT INTO app.membership_dirty_work (tenant_id, entity_type, entity_id, reason)
  SELECT tenant_id, 'campaign_products', id, p_reason
  FROM app.campaigns
  WHERE product_membership_mode = 'automatic' AND deleted_at IS NULL
    AND tenant_id IN (SELECT tenant_id FROM app.tenants_with_recent_activity())
  ON CONFLICT (tenant_id, entity_type, entity_id) WHERE state = 'pending' DO NOTHING;
END;
$function$;

-- job 19 (membership-daily-reconciliation, 01:30 UTC): was the worst offender — synchronous,
-- unbudgeted, bypassed the dirty queue entirely for every entity/tenant nightly. Scope to
-- tenants with recent activity; still bypasses the queue (unchanged behavior for correctness),
-- just no longer pays the cost for tenants nothing happened to.
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
      AND tenant_id IN (SELECT tenant_id FROM app.tenants_with_recent_activity())
    UNION ALL
    SELECT id, 'price_list'::text FROM app.price_lists
    WHERE membership_mode = 'automatic' AND deleted_at IS NULL
      AND tenant_id IN (SELECT tenant_id FROM app.tenants_with_recent_activity())
    UNION ALL
    SELECT id, 'campaign_buyers'::text FROM app.campaigns
    WHERE buyer_target_mode = 'automatic' AND deleted_at IS NULL
      AND tenant_id IN (SELECT tenant_id FROM app.tenants_with_recent_activity())
    UNION ALL
    SELECT id, 'campaign_products'::text FROM app.campaigns
    WHERE product_membership_mode = 'automatic' AND deleted_at IS NULL
      AND tenant_id IN (SELECT tenant_id FROM app.tenants_with_recent_activity())
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

-- job 24 (metrics-v2-daily-reconciliation, 01:00 UTC): was marking every tenant's 4 domains
-- dirty nightly with no activity check. Scope to tenants with recent activity.
CREATE OR REPLACE FUNCTION app.metrics_v4_run_daily_reconciliation_sweep()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'app', 'pg_temp'
AS $function$
DECLARE
  v_tenant record;
BEGIN
  PERFORM app.metrics_requeue_dead_letters();
  FOR v_tenant IN SELECT tenant_id AS id FROM app.tenants_with_recent_activity() LOOP
    PERFORM app.metrics_mark_daily_reconciliation(v_tenant.id);
  END LOOP;
END;
$function$;
