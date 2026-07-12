-- Push missing rebuild_metrics_for_tenant_range to remote DB.
-- Phase7 migration did not apply this function; same root cause as run_metrics_analysis_for_tenant.

DROP FUNCTION IF EXISTS app.rebuild_metrics_for_tenant_range(uuid, date, date, boolean, boolean);

CREATE OR REPLACE FUNCTION app.rebuild_metrics_for_tenant_range(
  p_tenant_id uuid,
  p_start_day date,
  p_end_day date,
  p_include_snapshots boolean DEFAULT true,
  p_include_kpis boolean DEFAULT true
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO pg_catalog, app
SET statement_timeout TO '0'
AS $$
DECLARE
  v_days_from_start integer;
  v_day date;
  v_location record;
  v_warehouse record;
  v_brand record;
  v_category record;
  v_product record;
BEGIN
  PERFORM app._metrics_assert_valid_range(p_start_day, p_end_day);

  IF COALESCE(p_include_kpis, true) THEN
    v_days_from_start := GREATEST(((now() AT TIME ZONE 'Asia/Kolkata')::date - p_start_day), 0);

    PERFORM app.rebuild_buyer_app_activity_for_tenant(
      p_tenant_id,
      GREATEST(v_days_from_start, 365)
    );

    DELETE FROM app.kpi_brand_daily
    WHERE tenant_id = p_tenant_id
      AND day BETWEEN p_start_day AND p_end_day;

    DELETE FROM app.kpi_buyer_app_daily
    WHERE tenant_id = p_tenant_id
      AND snapshot_date BETWEEN p_start_day AND p_end_day;

    DELETE FROM app.kpi_buyers_daily
    WHERE tenant_id = p_tenant_id
      AND day BETWEEN p_start_day AND p_end_day;

    DELETE FROM app.kpi_category_daily
    WHERE tenant_id = p_tenant_id
      AND day BETWEEN p_start_day AND p_end_day;

    DELETE FROM app.kpi_estimates_daily
    WHERE tenant_id = p_tenant_id
      AND day BETWEEN p_start_day AND p_end_day;

    DELETE FROM app.kpi_invoices_daily
    WHERE tenant_id = p_tenant_id
      AND day BETWEEN p_start_day AND p_end_day;

    DELETE FROM app.kpi_location_daily
    WHERE tenant_id = p_tenant_id
      AND day BETWEEN p_start_day AND p_end_day;

    DELETE FROM app.kpi_orders_daily
    WHERE tenant_id = p_tenant_id
      AND day BETWEEN p_start_day AND p_end_day;

    DELETE FROM app.kpi_product_daily
    WHERE tenant_id = p_tenant_id
      AND day BETWEEN p_start_day AND p_end_day;

    DELETE FROM app.kpi_tenant_daily
    WHERE tenant_id = p_tenant_id
      AND day BETWEEN p_start_day AND p_end_day;

    DELETE FROM app.kpi_warehouse_daily
    WHERE tenant_id = p_tenant_id
      AND day BETWEEN p_start_day AND p_end_day;

    FOR v_day IN
      SELECT generate_series(p_start_day, p_end_day, interval '1 day')::date
    LOOP
      PERFORM app.refresh_kpi_tenant_daily(p_tenant_id, v_day);
      PERFORM app.refresh_kpi_estimates_daily(p_tenant_id, v_day);
      PERFORM app.refresh_kpi_orders_daily(p_tenant_id, v_day);
      PERFORM app.refresh_kpi_invoices_daily(p_tenant_id, v_day);
      PERFORM app.refresh_kpi_buyers_daily(p_tenant_id, v_day);
      PERFORM app.refresh_buyer_app_daily(p_tenant_id, v_day);

      FOR v_brand IN
        SELECT tb.id
        FROM app.tenant_brands tb
        WHERE tb.tenant_id = p_tenant_id
          AND tb.deleted_at IS NULL
      LOOP
        PERFORM app.refresh_kpi_brand_daily(p_tenant_id, v_brand.id, v_day);
      END LOOP;

      FOR v_category IN
        SELECT DISTINCT tp.tenant_category_id AS id
        FROM app.tenant_products tp
        WHERE tp.tenant_id = p_tenant_id
          AND tp.deleted_at IS NULL
          AND tp.tenant_category_id IS NOT NULL
      LOOP
        PERFORM app.refresh_kpi_category_daily(p_tenant_id, v_category.id, v_day);
      END LOOP;

      FOR v_product IN
        SELECT tp.id
        FROM app.tenant_products tp
        WHERE tp.tenant_id = p_tenant_id
          AND tp.deleted_at IS NULL
      LOOP
        PERFORM app.refresh_kpi_product_daily(p_tenant_id, v_product.id, v_day);
      END LOOP;

      FOR v_location IN
        SELECT l.id
        FROM app.locations l
        WHERE l.tenant_id = p_tenant_id
          AND l.deleted_at IS NULL
      LOOP
        PERFORM app.refresh_kpi_location_daily(p_tenant_id, v_location.id, v_day);
      END LOOP;

      FOR v_warehouse IN
        SELECT w.id
        FROM app.warehouses w
        WHERE w.tenant_id = p_tenant_id
          AND w.deleted_at IS NULL
      LOOP
        PERFORM app.refresh_kpi_warehouse_daily(p_tenant_id, v_warehouse.id, v_day);
      END LOOP;
    END LOOP;
  END IF;

  IF COALESCE(p_include_snapshots, true) THEN
    PERFORM app.refresh_estimates_snapshot(p_tenant_id);
    PERFORM app.refresh_invoices_snapshot(p_tenant_id);
    PERFORM app.refresh_orders_snapshot(p_tenant_id);
    PERFORM app.refresh_buyers_snapshot(p_tenant_id);
    PERFORM app.refresh_products_snapshot(p_tenant_id);
    PERFORM app.refresh_categories_snapshot(p_tenant_id);
    PERFORM app.refresh_brands_snapshot(p_tenant_id);
    PERFORM app.refresh_buyer_current_snapshot(p_tenant_id);
    PERFORM app.refresh_buyer_app_snapshot(p_tenant_id);

    FOR v_location IN
      SELECT l.id
      FROM app.locations l
      WHERE l.tenant_id = p_tenant_id
        AND l.deleted_at IS NULL
    LOOP
      PERFORM app.refresh_locations_snapshot(v_location.id);
    END LOOP;

    FOR v_warehouse IN
      SELECT w.id
      FROM app.warehouses w
      WHERE w.tenant_id = p_tenant_id
        AND w.deleted_at IS NULL
    LOOP
      PERFORM app.refresh_warehouses_snapshot(v_warehouse.id);
    END LOOP;
  END IF;

  RETURN jsonb_build_object(
    'tenant_id', p_tenant_id,
    'start_day', p_start_day,
    'end_day', p_end_day,
    'include_snapshots', COALESCE(p_include_snapshots, true),
    'include_kpis', COALESCE(p_include_kpis, true),
    'rebuilt_at', now(),
    'analysis', app._run_metrics_analysis_for_tenant_range(p_tenant_id, p_start_day, p_end_day)
  );
END;
$$;

COMMENT ON FUNCTION app.rebuild_metrics_for_tenant_range(uuid, date, date, boolean, boolean)
  IS 'Operator repair entrypoint for rebuilding tenant metric aggregates over an explicit IST date range.';

REVOKE ALL ON FUNCTION app.rebuild_metrics_for_tenant_range(uuid, date, date, boolean, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.rebuild_metrics_for_tenant_range(uuid, date, date, boolean, boolean) TO service_role;
