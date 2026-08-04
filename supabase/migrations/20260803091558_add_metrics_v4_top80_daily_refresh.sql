-- Daily batch compute for the 3 top-80%-of-revenue concentration cards
-- (Customers/quarter, Brands/month, Locations/month), set-based across every
-- tenant in one query each (PARTITION BY tenant_id), writing into
-- app.metrics_tenant_top80_cache. app._metrics_v4_refresh_landing_kpis reads
-- from that cache instead of recomputing these window-function rankings live
-- on every 15s tick (see the domain-scoping migration for the read side).
--
-- LEFT JOIN app.tenants ensures every active tenant gets a fresh row (reset
-- to 0) even when it has no qualifying period-summary rows this period, so a
-- tenant that drops out of a top-80% set doesn't keep showing a stale
-- nonzero count from a prior day.
CREATE OR REPLACE FUNCTION app.metrics_v4_refresh_top80_daily(p_as_of timestamptz DEFAULT clock_timestamp())
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, app, pg_temp
AS $$
DECLARE
  v_now timestamptz := COALESCE(p_as_of, clock_timestamp());
  v_month record;
  v_quarter record;
  v_rows integer := 0;
  v_count integer;
BEGIN
  SELECT * INTO v_month FROM app.metrics_v4_period_bounds('this_month', v_now);
  SELECT * INTO v_quarter FROM app.metrics_v4_period_bounds('this_quarter', v_now);

  INSERT INTO app.metrics_tenant_top80_cache (
    tenant_id, entity_kind, grain, period_start, top80_count, computed_at, created_at, updated_at
  )
  SELECT t.id, 'customers', 'quarter', v_quarter.period_start, COALESCE(r.cnt, 0), v_now, v_now, v_now
  FROM app.tenants t
  LEFT JOIN (
    WITH ranked AS (
      SELECT tenant_id,
        SUM(invoice_value) OVER (PARTITION BY tenant_id ORDER BY invoice_value DESC) AS running,
        SUM(invoice_value) OVER (PARTITION BY tenant_id) AS total
      FROM app.metrics_buyer_period_summary
      WHERE grain = 'quarter' AND period_start = v_quarter.period_start AND deleted_at IS NULL AND invoice_value > 0
    )
    SELECT tenant_id, COUNT(*)::bigint AS cnt FROM ranked WHERE total > 0 AND running <= total * 0.8 GROUP BY tenant_id
  ) r ON r.tenant_id = t.id
  WHERE t.deleted_at IS NULL
  ON CONFLICT (tenant_id, entity_kind, grain, period_start) DO UPDATE SET
    top80_count = EXCLUDED.top80_count, computed_at = EXCLUDED.computed_at, updated_at = EXCLUDED.updated_at;
  GET DIAGNOSTICS v_count = ROW_COUNT; v_rows := v_rows + v_count;

  INSERT INTO app.metrics_tenant_top80_cache (
    tenant_id, entity_kind, grain, period_start, top80_count, computed_at, created_at, updated_at
  )
  SELECT t.id, 'brands', 'month', v_month.period_start, COALESCE(r.cnt, 0), v_now, v_now, v_now
  FROM app.tenants t
  LEFT JOIN (
    WITH ranked AS (
      SELECT tenant_id,
        SUM(invoice_value) OVER (PARTITION BY tenant_id ORDER BY invoice_value DESC) AS running,
        SUM(invoice_value) OVER (PARTITION BY tenant_id) AS total
      FROM app.metrics_brand_period_summary
      WHERE grain = 'month' AND period_start = v_month.period_start AND deleted_at IS NULL AND invoice_value > 0
    )
    SELECT tenant_id, COUNT(*)::bigint AS cnt FROM ranked WHERE total > 0 AND running <= total * 0.8 GROUP BY tenant_id
  ) r ON r.tenant_id = t.id
  WHERE t.deleted_at IS NULL
  ON CONFLICT (tenant_id, entity_kind, grain, period_start) DO UPDATE SET
    top80_count = EXCLUDED.top80_count, computed_at = EXCLUDED.computed_at, updated_at = EXCLUDED.updated_at;
  GET DIAGNOSTICS v_count = ROW_COUNT; v_rows := v_rows + v_count;

  INSERT INTO app.metrics_tenant_top80_cache (
    tenant_id, entity_kind, grain, period_start, top80_count, computed_at, created_at, updated_at
  )
  SELECT t.id, 'locations', 'month', v_month.period_start, COALESCE(r.cnt, 0), v_now, v_now, v_now
  FROM app.tenants t
  LEFT JOIN (
    WITH ranked AS (
      SELECT tenant_id,
        SUM(invoice_value) OVER (PARTITION BY tenant_id ORDER BY invoice_value DESC) AS running,
        SUM(invoice_value) OVER (PARTITION BY tenant_id) AS total
      FROM app.metrics_location_period_summary
      WHERE grain = 'month' AND period_start = v_month.period_start AND deleted_at IS NULL AND invoice_value > 0
    )
    SELECT tenant_id, COUNT(*)::bigint AS cnt FROM ranked WHERE total > 0 AND running <= total * 0.8 GROUP BY tenant_id
  ) r ON r.tenant_id = t.id
  WHERE t.deleted_at IS NULL
  ON CONFLICT (tenant_id, entity_kind, grain, period_start) DO UPDATE SET
    top80_count = EXCLUDED.top80_count, computed_at = EXCLUDED.computed_at, updated_at = EXCLUDED.updated_at;
  GET DIAGNOSTICS v_count = ROW_COUNT; v_rows := v_rows + v_count;

  RETURN v_rows;
END;
$$;

ALTER FUNCTION app.metrics_v4_refresh_top80_daily(timestamptz) OWNER TO postgres;
REVOKE ALL ON FUNCTION app.metrics_v4_refresh_top80_daily(timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.metrics_v4_refresh_top80_daily(timestamptz) TO service_role;

CREATE OR REPLACE FUNCTION app.ensure_metrics_v4_top80_daily_cron_scheduled() RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app
AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_extension WHERE extname = 'pg_cron') THEN
    RETURN;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'metrics-v4-top80-daily') THEN
    -- Same 01:00 UTC slot as the existing v2 daily reconciliation sweep --
    -- this is a pure read+cache-write (no dirty-marking), so running
    -- alongside it is harmless.
    PERFORM cron.schedule(
      'metrics-v4-top80-daily',
      '0 1 * * *',
      'SELECT app.metrics_v4_refresh_top80_daily()'
    );
  END IF;
END;
$$;

ALTER FUNCTION app.ensure_metrics_v4_top80_daily_cron_scheduled() OWNER TO postgres;
REVOKE ALL ON FUNCTION app.ensure_metrics_v4_top80_daily_cron_scheduled() FROM PUBLIC;

SELECT app.ensure_metrics_v4_top80_daily_cron_scheduled();
