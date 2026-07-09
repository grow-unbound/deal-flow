-- Metrics Aggregation Phase 2
-- Tranche 1: retire customers_snapshot ownership in favor of buyers_snapshot
-- Tranche 2: move buyer-home period cards onto buyer daily facts and restore
--            buyer_current_snapshot refresh ownership
-- Tranche 3: harden canonical document-date writes and backfill order_date
-- Tranche 4: add scheduled freshness for time-only overdue and dormancy drift

ALTER TABLE app.orders
  ADD COLUMN IF NOT EXISTS order_date date;

UPDATE app.orders
SET order_date = COALESCE(
  order_date,
  (placed_at AT TIME ZONE 'Asia/Kolkata')::date,
  (created_at AT TIME ZONE 'Asia/Kolkata')::date
)
WHERE order_date IS NULL;

ALTER TABLE app.orders
  ALTER COLUMN order_date SET DEFAULT ((now() AT TIME ZONE 'Asia/Kolkata')::date);

ALTER TABLE app.orders
  ALTER COLUMN order_date SET NOT NULL;

CREATE OR REPLACE FUNCTION app.get_buyer_home_summary(
  p_tenant_id uuid,
  p_buyer_id uuid,
  p_as_of timestamptz DEFAULT now()
)
RETURNS TABLE (
  gmv_mtd numeric,
  invoice_count_ytd bigint,
  trend_vs_last_month_pct integer,
  outstanding_dues numeric,
  open_invoice_count bigint,
  earliest_due_date timestamptz,
  days_until_earliest_due integer,
  credit_limit numeric,
  available_credit numeric,
  credit_used numeric,
  open_orders_count bigint,
  refreshed_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = app
AS $$
  WITH bounds AS (
    SELECT
      (p_as_of AT TIME ZONE 'Asia/Kolkata')::date AS today_ist,
      date_trunc('month', p_as_of AT TIME ZONE 'Asia/Kolkata')::date AS month_start_ist,
      make_date(
        EXTRACT(YEAR FROM (p_as_of AT TIME ZONE 'Asia/Kolkata'))::int,
        1,
        1
      ) AS year_start_ist,
      (date_trunc('month', p_as_of AT TIME ZONE 'Asia/Kolkata') - interval '1 month')::date AS prev_month_start_ist,
      (date_trunc('month', p_as_of AT TIME ZONE 'Asia/Kolkata')::date - 1) AS prev_month_end_ist,
      EXTRACT(DAY FROM (p_as_of AT TIME ZONE 'Asia/Kolkata'))::int AS current_day_of_month
  ),
  period_bounds AS (
    SELECT
      today_ist,
      month_start_ist,
      year_start_ist,
      prev_month_start_ist,
      LEAST(prev_month_start_ist + (current_day_of_month - 1), prev_month_end_ist) AS prev_window_end_ist
    FROM bounds
  ),
  buyer_period_rollup AS (
    SELECT
      COALESCE(SUM(k.invoices_gmv) FILTER (
        WHERE k.day BETWEEN pb.month_start_ist AND pb.today_ist
      ), 0) AS gmv_mtd,
      COALESCE(SUM(k.invoices_count) FILTER (
        WHERE k.day BETWEEN pb.year_start_ist AND pb.today_ist
      ), 0)::bigint AS invoice_count_ytd,
      COALESCE(SUM(k.invoices_gmv) FILTER (
        WHERE k.day BETWEEN pb.prev_month_start_ist AND pb.prev_window_end_ist
      ), 0) AS gmv_prev_window
    FROM period_bounds pb
    LEFT JOIN app.kpi_buyers_daily k
      ON k.tenant_id = p_tenant_id
     AND k.buyer_id = p_buyer_id
     AND k.scope = 'tenant'
  )
  SELECT
    rollup.gmv_mtd,
    rollup.invoice_count_ytd,
    CASE
      WHEN rollup.gmv_prev_window > 0
        THEN ROUND(((rollup.gmv_mtd - rollup.gmv_prev_window) / rollup.gmv_prev_window) * 100)::integer
      WHEN rollup.gmv_mtd > 0
        THEN 100
      ELSE 0
    END AS trend_vs_last_month_pct,
    COALESCE(snapshot.outstanding_dues, 0) AS outstanding_dues,
    COALESCE(snapshot.open_invoice_count, 0) AS open_invoice_count,
    snapshot.earliest_due_date,
    CASE
      WHEN snapshot.earliest_due_date IS NULL THEN NULL
      ELSE ((snapshot.earliest_due_date AT TIME ZONE 'Asia/Kolkata')::date - pb.today_ist)::integer
    END AS days_until_earliest_due,
    COALESCE(snapshot.credit_limit, 0) AS credit_limit,
    COALESCE(snapshot.available_credit, 0) AS available_credit,
    COALESCE(snapshot.credit_used, 0) AS credit_used,
    COALESCE(snapshot.open_orders_count, 0) AS open_orders_count,
    snapshot.refreshed_at
  FROM period_bounds pb
  CROSS JOIN buyer_period_rollup rollup
  LEFT JOIN app.buyer_current_snapshot snapshot
    ON snapshot.tenant_id = p_tenant_id
   AND snapshot.buyer_id = p_buyer_id;
$$;

CREATE OR REPLACE FUNCTION app.confirm_order(p_order_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, app
AS $$
DECLARE
  v_order app.orders%ROWTYPE;
  v_short_lines jsonb := '[]'::jsonb;
  v_line record;
  v_on_hand integer;
  v_order_date date;
BEGIN
  SELECT *
  INTO STRICT v_order
  FROM app.orders o
  WHERE o.id = p_order_id
    AND o.deleted_at IS NULL;

  IF v_order.tenant_id <> app.jwt_tenant_id() THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  IF NOT app.is_seller() THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  v_order_date := COALESCE(
    v_order.order_date,
    (v_order.placed_at AT TIME ZONE 'Asia/Kolkata')::date,
    (now() AT TIME ZONE 'Asia/Kolkata')::date
  );

  FOR v_line IN
    SELECT oi.id, oi.tenant_product_id, oi.qty
    FROM app.order_items oi
    WHERE oi.order_id = p_order_id
  LOOP
    SELECT COALESCE(SUM(ti.qty_available), 0)::integer
    INTO v_on_hand
    FROM app.tenant_inventory ti
    WHERE ti.tenant_product_id = v_line.tenant_product_id;

    UPDATE app.order_items
    SET
      on_hand_at_confirm = v_on_hand,
      updated_at = now(),
      updated_by = auth.uid()
    WHERE id = v_line.id;

    IF v_line.qty > v_on_hand THEN
      v_short_lines := v_short_lines || jsonb_build_object(
        'line_id', v_line.id,
        'tenant_product_id', v_line.tenant_product_id,
        'qty', v_line.qty,
        'on_hand', v_on_hand,
        'shortfall', GREATEST(v_line.qty - v_on_hand, 0)
      );
    END IF;
  END LOOP;

  UPDATE app.orders
  SET
    status = 'received',
    order_date = v_order_date,
    placed_at = COALESCE(
      placed_at,
      make_timestamptz(
        EXTRACT(YEAR FROM v_order_date)::int,
        EXTRACT(MONTH FROM v_order_date)::int,
        EXTRACT(DAY FROM v_order_date)::int,
        12, 0, 0,
        'Asia/Kolkata'
      )
    ),
    updated_at = now(),
    updated_by = auth.uid()
  WHERE id = p_order_id;

  INSERT INTO app.audit_log (
    tenant_id,
    actor_user_id,
    entity_type,
    entity_id,
    action,
    diff,
    ts
  )
  VALUES (
    v_order.tenant_id,
    auth.uid(),
    'order',
    p_order_id,
    'status_change',
    jsonb_build_object(
      'to', 'received',
      'has_backorder', COALESCE(jsonb_array_length(v_short_lines), 0) > 0
    ),
    now()
  );

  RETURN jsonb_build_object(
    'ok', true,
    'order_id', p_order_id,
    'short_lines', v_short_lines
  );
END;
$$;

CREATE OR REPLACE FUNCTION app.estimate_convert_to_order(
  p_tenant_id uuid,
  p_estimate_id uuid,
  p_actor_user_id uuid,
  p_line_ids uuid[] DEFAULT NULL,
  p_expected_delivery date DEFAULT NULL,
  p_order_number_override text DEFAULT NULL,
  p_qty_overrides jsonb DEFAULT '{}'::jsonb,
  p_order_date date DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, app
AS $$
DECLARE
  v_result jsonb;
  v_order_id uuid;
  v_effective_order_date date := COALESCE(p_order_date, (now() AT TIME ZONE 'Asia/Kolkata')::date);
BEGIN
  v_result := app.estimate_convert_to_order(
    p_tenant_id,
    p_estimate_id,
    p_actor_user_id,
    p_line_ids,
    p_expected_delivery,
    p_order_number_override,
    p_qty_overrides
  );

  v_order_id := NULLIF(v_result ->> 'order_id', '')::uuid;

  IF v_order_id IS NOT NULL THEN
    UPDATE app.orders
    SET
      order_date = v_effective_order_date,
      placed_at = COALESCE(
        placed_at,
        make_timestamptz(
          EXTRACT(YEAR FROM v_effective_order_date)::int,
          EXTRACT(MONTH FROM v_effective_order_date)::int,
          EXTRACT(DAY FROM v_effective_order_date)::int,
          12, 0, 0,
          'Asia/Kolkata'
        )
      ),
      updated_at = now(),
      updated_by = p_actor_user_id
    WHERE id = v_order_id
      AND tenant_id = p_tenant_id;
  END IF;

  RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION app.dispatch_from_buyers()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app
AS $$
DECLARE
  v_tenant uuid;
BEGIN
  v_tenant := COALESCE(NEW.tenant_id, OLD.tenant_id);
  IF v_tenant IS NULL THEN RETURN NULL; END IF;
  IF app.sync_trigger_bypass_active() THEN RETURN NULL; END IF;

  PERFORM app.refresh_buyers_snapshot(v_tenant);
  PERFORM app.refresh_buyer_app_snapshot(v_tenant);
  PERFORM app.refresh_buyer_current_snapshot(v_tenant);

  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION app.dispatch_from_estimates()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app
AS $$
DECLARE
  v_tenant uuid;
  v_bypass boolean;
  v_day date;
  v_is_app boolean;
BEGIN
  v_tenant := COALESCE(NEW.tenant_id, OLD.tenant_id);
  IF v_tenant IS NULL THEN RETURN NULL; END IF;

  v_bypass := app.sync_trigger_bypass_active();
  v_day := app.metric_day_ist(COALESCE(NEW.estimate_date, OLD.estimate_date), COALESCE(NEW.created_at, OLD.created_at));
  v_is_app := COALESCE(NEW.is_buyer_app_estimate, OLD.is_buyer_app_estimate, false);

  IF NOT v_bypass THEN
    PERFORM app.refresh_estimates_snapshot(v_tenant);
    PERFORM app.refresh_buyers_snapshot(v_tenant);
    IF v_day IS NOT NULL THEN
      PERFORM app.refresh_kpi_estimates_daily(v_tenant, v_day);
      PERFORM app.refresh_kpi_buyers_daily(v_tenant, v_day);
    END IF;
    IF v_is_app AND v_day IS NOT NULL THEN
      PERFORM app.refresh_buyer_app_daily(v_tenant, v_day);
    END IF;
    PERFORM app.refresh_buyer_app_snapshot(v_tenant);
  END IF;

  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION app.dispatch_from_orders()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app
AS $$
DECLARE
  v_tenant uuid;
  v_bypass boolean;
  v_location uuid;
  v_day date;
  v_placed_day date;
  v_is_app boolean;
BEGIN
  v_tenant := COALESCE(NEW.tenant_id, OLD.tenant_id);
  IF v_tenant IS NULL THEN RETURN NULL; END IF;

  v_bypass := app.sync_trigger_bypass_active();
  v_location := COALESCE(NEW.location_id, OLD.location_id);
  v_day := app.metric_day_ist(COALESCE(NEW.order_date, OLD.order_date), COALESCE(NEW.created_at, OLD.created_at));
  v_placed_day := (COALESCE(NEW.placed_at, OLD.placed_at) AT TIME ZONE 'Asia/Kolkata')::date;
  v_is_app := COALESCE(NEW.is_buyer_app_order, OLD.is_buyer_app_order, false);

  IF NOT v_bypass THEN
    PERFORM app.refresh_orders_snapshot(v_tenant);
    PERFORM app.refresh_buyers_snapshot(v_tenant);
    PERFORM app.refresh_buyer_current_snapshot(v_tenant);
    IF v_day IS NOT NULL THEN
      PERFORM app.refresh_kpi_orders_daily(v_tenant, v_day);
      PERFORM app.refresh_kpi_buyers_daily(v_tenant, v_day);
    END IF;
    IF v_placed_day IS NOT NULL THEN
      PERFORM app.refresh_kpi_tenant_daily(v_tenant, v_placed_day);
      IF v_location IS NOT NULL THEN
        PERFORM app.refresh_kpi_location_daily(v_tenant, v_location, v_placed_day);
      END IF;
    END IF;
    IF v_is_app AND v_day IS NOT NULL THEN
      PERFORM app.refresh_buyer_app_daily(v_tenant, v_day);
    END IF;
    PERFORM app.refresh_buyer_app_snapshot(v_tenant);
  END IF;

  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION app.dispatch_from_invoices()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app
AS $$
DECLARE
  v_tenant uuid;
  v_location uuid;
  v_day date;
BEGIN
  IF app.sync_trigger_bypass_active() THEN RETURN NULL; END IF;

  v_tenant := COALESCE(NEW.tenant_id, OLD.tenant_id);
  IF v_tenant IS NULL THEN RETURN NULL; END IF;

  v_location := COALESCE(NEW.location_id, OLD.location_id);
  v_day := app.metric_day_ist((COALESCE(NEW.invoice_date, OLD.invoice_date) AT TIME ZONE 'Asia/Kolkata')::date, COALESCE(NEW.created_at, OLD.created_at));

  PERFORM app.refresh_invoices_snapshot(v_tenant);
  PERFORM app.refresh_buyers_snapshot(v_tenant);
  PERFORM app.refresh_buyer_current_snapshot(v_tenant);

  IF v_location IS NOT NULL THEN
    PERFORM app.refresh_locations_snapshot(v_location);
  END IF;

  IF v_day IS NOT NULL THEN
    PERFORM app.refresh_kpi_invoices_daily(v_tenant, v_day);
    PERFORM app.refresh_kpi_buyers_daily(v_tenant, v_day);
    PERFORM app.refresh_buyer_app_daily(v_tenant, v_day);
  END IF;
  PERFORM app.refresh_buyer_app_snapshot(v_tenant);

  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION app.post_sync_rebuild(p_tenant_id uuid, p_days int DEFAULT 2)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app
AS $$
DECLARE
  loc RECORD;
  wh RECORD;
BEGIN
  PERFORM app.refresh_estimates_snapshot(p_tenant_id);
  PERFORM app.refresh_invoices_snapshot(p_tenant_id);
  PERFORM app.refresh_orders_snapshot(p_tenant_id);
  PERFORM app.refresh_buyers_snapshot(p_tenant_id);
  PERFORM app.refresh_products_snapshot(p_tenant_id);
  PERFORM app.refresh_categories_snapshot(p_tenant_id);
  PERFORM app.refresh_brands_snapshot(p_tenant_id);
  PERFORM app.refresh_buyer_app_snapshot(p_tenant_id);
  PERFORM app.refresh_buyer_current_snapshot(p_tenant_id);

  FOR loc IN
    SELECT id FROM app.locations
    WHERE tenant_id = p_tenant_id
      AND deleted_at IS NULL
  LOOP
    PERFORM app.refresh_locations_snapshot(loc.id);
  END LOOP;

  FOR wh IN
    SELECT id FROM app.warehouses
    WHERE tenant_id = p_tenant_id
      AND deleted_at IS NULL
  LOOP
    PERFORM app.refresh_warehouses_snapshot(wh.id);
  END LOOP;

  PERFORM app.rebuild_kpi_tenant_daily_for_tenant(p_tenant_id, p_days);
  PERFORM app.rebuild_kpi_estimates_daily_for_tenant(p_tenant_id, p_days);
  PERFORM app.rebuild_kpi_orders_daily_for_tenant(p_tenant_id, p_days);
  PERFORM app.rebuild_kpi_invoices_daily_for_tenant(p_tenant_id, p_days);
  PERFORM app.rebuild_kpi_buyers_daily_for_tenant(p_tenant_id, p_days);
  PERFORM app.rebuild_kpi_brand_daily_for_tenant(p_tenant_id, p_days);
  PERFORM app.rebuild_kpi_category_daily_for_tenant(p_tenant_id, p_days);
  PERFORM app.rebuild_kpi_product_daily_for_tenant(p_tenant_id, p_days);
  PERFORM app.rebuild_kpi_location_daily_for_tenant(p_tenant_id, p_days);
  PERFORM app.rebuild_kpi_warehouse_daily_for_tenant(p_tenant_id, p_days);
  PERFORM app.rebuild_buyer_app_daily_for_tenant(p_tenant_id, p_days);
END;
$$;

CREATE OR REPLACE FUNCTION app.refresh_all_buyer_metric_snapshots()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app
AS $$
DECLARE
  tenant_row RECORD;
BEGIN
  FOR tenant_row IN
    SELECT id
    FROM app.tenants
    WHERE deleted_at IS NULL
  LOOP
    PERFORM app.refresh_buyers_snapshot(tenant_row.id);
    PERFORM app.refresh_buyer_current_snapshot(tenant_row.id);
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION app.ensure_buyer_metric_snapshot_cron_scheduled()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app
AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_extension WHERE extname = 'pg_cron') THEN
    RETURN;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'buyer-metric-snapshot-freshness') THEN
    PERFORM cron.schedule(
      'buyer-metric-snapshot-freshness',
      '40 18 * * *',
      'SELECT app.refresh_all_buyer_metric_snapshots()'
    );
  END IF;
END;
$$;

DO $$
DECLARE
  tenant_row RECORD;
BEGIN
  FOR tenant_row IN
    SELECT id
    FROM app.tenants
    WHERE deleted_at IS NULL
  LOOP
    PERFORM app.refresh_buyers_snapshot(tenant_row.id);
    PERFORM app.refresh_buyer_current_snapshot(tenant_row.id);
    PERFORM app.refresh_estimates_snapshot(tenant_row.id);
    PERFORM app.refresh_invoices_snapshot(tenant_row.id);
    PERFORM app.refresh_orders_snapshot(tenant_row.id);
    PERFORM app.rebuild_kpi_buyers_daily_for_tenant(tenant_row.id, 3650);
  END LOOP;
END;
$$;

SELECT app.refresh_buyer_current_snapshot(id)
FROM app.tenants
WHERE deleted_at IS NULL;

SELECT app.ensure_buyer_metric_snapshot_cron_scheduled();

GRANT EXECUTE ON FUNCTION app.confirm_order(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION app.estimate_convert_to_order(uuid, uuid, uuid, uuid[], date, text, jsonb, date) TO authenticated, service_role;

DROP FUNCTION IF EXISTS app.refresh_customers_snapshot(uuid);
DROP TABLE IF EXISTS app.customers_snapshot;
