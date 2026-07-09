-- Metrics Aggregation Phase 1 completion — buyer home aggregate slice
-- Adds a buyer-scoped current snapshot plus a buyer-home summary read model
-- so buyer financial cards stop scanning raw invoices/orders in the route.

-- Defensive helper bootstrap:
-- this migration uses app.metric_day_ist(...) in the buyer-home read model
-- and dispatch functions. Re-declare it here so the migration remains
-- replayable even if an earlier tranche was skipped or the helper drifted.
CREATE OR REPLACE FUNCTION app.metric_day_ist(
  p_explicit_date date,
  p_created_at timestamptz
)
RETURNS date
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT COALESCE(
    p_explicit_date,
    (p_created_at AT TIME ZONE 'Asia/Kolkata')::date
  );
$$;

CREATE TABLE IF NOT EXISTS app.buyer_current_snapshot (
  tenant_id              uuid NOT NULL REFERENCES app.tenants(id) ON DELETE CASCADE,
  buyer_id               uuid NOT NULL REFERENCES app.buyers(id) ON DELETE CASCADE,
  credit_limit           numeric NOT NULL DEFAULT 0,
  outstanding_dues       numeric NOT NULL DEFAULT 0,
  credit_used            numeric NOT NULL DEFAULT 0,
  available_credit       numeric NOT NULL DEFAULT 0,
  open_invoice_count     bigint NOT NULL DEFAULT 0,
  earliest_due_date      timestamptz,
  overdue_invoice_count  bigint NOT NULL DEFAULT 0,
  overdue_amount         numeric NOT NULL DEFAULT 0,
  open_orders_count      bigint NOT NULL DEFAULT 0,
  refreshed_at           timestamptz NOT NULL DEFAULT now(),
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, buyer_id)
);

CREATE INDEX IF NOT EXISTS idx_buyer_current_snapshot_buyer
  ON app.buyer_current_snapshot (buyer_id);

CREATE INDEX IF NOT EXISTS idx_buyer_current_snapshot_refreshed_at
  ON app.buyer_current_snapshot (tenant_id, refreshed_at DESC);

ALTER TABLE app.buyer_current_snapshot ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "tenant members can read buyer_current_snapshot" ON app.buyer_current_snapshot;
CREATE POLICY "tenant members can read buyer_current_snapshot"
  ON app.buyer_current_snapshot FOR SELECT
  USING (
    app.jwt_tenant_id() = tenant_id
    AND (app.jwt_buyer_id() IS NULL OR app.jwt_buyer_id() = buyer_id)
  );

CREATE OR REPLACE FUNCTION app.refresh_buyer_current_snapshot(p_tenant_id uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = app
AS $$
  INSERT INTO app.buyer_current_snapshot (
    tenant_id,
    buyer_id,
    credit_limit,
    outstanding_dues,
    credit_used,
    available_credit,
    open_invoice_count,
    earliest_due_date,
    overdue_invoice_count,
    overdue_amount,
    open_orders_count,
    refreshed_at,
    updated_at
  )
  WITH invoice_rollup AS (
    SELECT
      i.buyer_id,
      COALESCE(SUM(i.outstanding_balance) FILTER (
        WHERE COALESCE(i.outstanding_balance, 0) > 0
          AND i.status IN ('sent', 'overdue', 'unpaid', 'viewed', 'partially_paid')
      ), 0) AS outstanding_dues,
      COUNT(*) FILTER (
        WHERE COALESCE(i.outstanding_balance, 0) > 0
          AND i.status IN ('sent', 'overdue', 'unpaid', 'viewed', 'partially_paid')
      )::bigint AS open_invoice_count,
      MIN(i.due_date) FILTER (
        WHERE COALESCE(i.outstanding_balance, 0) > 0
          AND i.status IN ('sent', 'overdue', 'unpaid', 'viewed', 'partially_paid')
          AND i.due_date IS NOT NULL
      ) AS earliest_due_date,
      COUNT(*) FILTER (
        WHERE COALESCE(i.outstanding_balance, 0) > 0
          AND i.status IN ('sent', 'overdue', 'unpaid', 'viewed', 'partially_paid')
          AND i.due_date IS NOT NULL
          AND (i.due_date AT TIME ZONE 'Asia/Kolkata')::date < (now() AT TIME ZONE 'Asia/Kolkata')::date
      )::bigint AS overdue_invoice_count,
      COALESCE(SUM(i.outstanding_balance) FILTER (
        WHERE COALESCE(i.outstanding_balance, 0) > 0
          AND i.status IN ('sent', 'overdue', 'unpaid', 'viewed', 'partially_paid')
          AND i.due_date IS NOT NULL
          AND (i.due_date AT TIME ZONE 'Asia/Kolkata')::date < (now() AT TIME ZONE 'Asia/Kolkata')::date
      ), 0) AS overdue_amount
    FROM app.invoices i
    WHERE i.tenant_id = p_tenant_id
      AND i.deleted_at IS NULL
    GROUP BY i.buyer_id
  ),
  order_rollup AS (
    SELECT
      o.buyer_id,
      COUNT(*) FILTER (
        WHERE o.status IN (
          'draft',
          'open',
          'received',
          'confirmed',
          'partially_dispatched',
          'dispatched',
          'partially_invoiced',
          'overdue'
        )
      )::bigint AS open_orders_count
    FROM app.orders o
    WHERE o.tenant_id = p_tenant_id
      AND o.deleted_at IS NULL
    GROUP BY o.buyer_id
  )
  SELECT
    b.tenant_id,
    b.id,
    COALESCE(b.credit_limit, 0) AS credit_limit,
    COALESCE(ir.outstanding_dues, 0) AS outstanding_dues,
    COALESCE(ir.outstanding_dues, 0) AS credit_used,
    GREATEST(COALESCE(b.credit_limit, 0) - COALESCE(ir.outstanding_dues, 0), 0) AS available_credit,
    COALESCE(ir.open_invoice_count, 0) AS open_invoice_count,
    ir.earliest_due_date,
    COALESCE(ir.overdue_invoice_count, 0) AS overdue_invoice_count,
    COALESCE(ir.overdue_amount, 0) AS overdue_amount,
    COALESCE(orx.open_orders_count, 0) AS open_orders_count,
    now(),
    now()
  FROM app.buyers b
  LEFT JOIN invoice_rollup ir
    ON ir.buyer_id = b.id
  LEFT JOIN order_rollup orx
    ON orx.buyer_id = b.id
  WHERE b.tenant_id = p_tenant_id
    AND b.deleted_at IS NULL
  ON CONFLICT (tenant_id, buyer_id) DO UPDATE SET
    credit_limit = EXCLUDED.credit_limit,
    outstanding_dues = EXCLUDED.outstanding_dues,
    credit_used = EXCLUDED.credit_used,
    available_credit = EXCLUDED.available_credit,
    open_invoice_count = EXCLUDED.open_invoice_count,
    earliest_due_date = EXCLUDED.earliest_due_date,
    overdue_invoice_count = EXCLUDED.overdue_invoice_count,
    overdue_amount = EXCLUDED.overdue_amount,
    open_orders_count = EXCLUDED.open_orders_count,
    refreshed_at = EXCLUDED.refreshed_at,
    updated_at = EXCLUDED.updated_at;

  DELETE FROM app.buyer_current_snapshot snapshot
  WHERE snapshot.tenant_id = p_tenant_id
    AND NOT EXISTS (
      SELECT 1
      FROM app.buyers b
      WHERE b.tenant_id = p_tenant_id
        AND b.id = snapshot.buyer_id
        AND b.deleted_at IS NULL
    );
$$;

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
      LEAST(
        prev_month_start_ist + (current_day_of_month - 1),
        prev_month_end_ist
      ) AS prev_window_end_ist
    FROM bounds
  ),
  invoice_rollup AS (
    SELECT
      COALESCE(SUM(i.total_amount) FILTER (
        WHERE app.metric_day_ist((i.invoice_date AT TIME ZONE 'Asia/Kolkata')::date, i.created_at) BETWEEN pb.month_start_ist AND pb.today_ist
          AND i.status IN ('sent', 'overdue', 'unpaid', 'viewed', 'partially_paid', 'paid')
      ), 0) AS gmv_mtd,
      COUNT(*) FILTER (
        WHERE app.metric_day_ist((i.invoice_date AT TIME ZONE 'Asia/Kolkata')::date, i.created_at) BETWEEN pb.year_start_ist AND pb.today_ist
          AND i.status NOT IN ('void', 'cancelled', 'archived', 'rejected')
      )::bigint AS invoice_count_ytd,
      COALESCE(SUM(i.total_amount) FILTER (
        WHERE app.metric_day_ist((i.invoice_date AT TIME ZONE 'Asia/Kolkata')::date, i.created_at) BETWEEN pb.prev_month_start_ist AND pb.prev_window_end_ist
          AND i.status IN ('sent', 'overdue', 'unpaid', 'viewed', 'partially_paid', 'paid')
      ), 0) AS gmv_prev_window
    FROM period_bounds pb
    LEFT JOIN app.invoices i
      ON i.tenant_id = p_tenant_id
     AND i.buyer_id = p_buyer_id
     AND i.deleted_at IS NULL
  )
  SELECT
    ir.gmv_mtd,
    ir.invoice_count_ytd,
    CASE
      WHEN ir.gmv_prev_window > 0
        THEN ROUND(((ir.gmv_mtd - ir.gmv_prev_window) / ir.gmv_prev_window) * 100)::integer
      WHEN ir.gmv_mtd > 0
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
  CROSS JOIN invoice_rollup ir
  LEFT JOIN app.buyer_current_snapshot snapshot
    ON snapshot.tenant_id = p_tenant_id
   AND snapshot.buyer_id = p_buyer_id;
$$;

CREATE OR REPLACE FUNCTION app.dispatch_from_buyers()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = app AS $$
DECLARE
  v_tenant uuid;
BEGIN
  v_tenant := COALESCE(NEW.tenant_id, OLD.tenant_id);
  IF v_tenant IS NULL THEN RETURN NULL; END IF;
  IF app.sync_trigger_bypass_active() THEN RETURN NULL; END IF;

  PERFORM app.refresh_customers_snapshot(v_tenant);
  PERFORM app.refresh_buyer_app_snapshot(v_tenant);
  PERFORM app.refresh_buyer_current_snapshot(v_tenant);

  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION app.dispatch_from_orders()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = app AS $$
DECLARE
  v_tenant uuid;
  v_bypass boolean;
  v_location uuid;
  v_day    date;
  v_placed_day date;
  v_is_app boolean;
BEGIN
  v_tenant := COALESCE(NEW.tenant_id, OLD.tenant_id);
  IF v_tenant IS NULL THEN RETURN NULL; END IF;

  v_bypass := app.sync_trigger_bypass_active();
  v_location := COALESCE(NEW.location_id, OLD.location_id);
  v_day := app.metric_day_ist(
    COALESCE(NEW.order_date, OLD.order_date),
    COALESCE(NEW.created_at, OLD.created_at)
  );
  v_placed_day := (COALESCE(NEW.placed_at, OLD.placed_at) AT TIME ZONE 'Asia/Kolkata')::date;
  v_is_app := COALESCE(NEW.is_buyer_app_order, OLD.is_buyer_app_order, false);

  IF NOT v_bypass THEN
    PERFORM app.refresh_orders_snapshot(v_tenant);
    IF v_day IS NOT NULL THEN
      PERFORM app.refresh_kpi_orders_daily(v_tenant, v_day);
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
    PERFORM app.refresh_buyer_current_snapshot(v_tenant);
  END IF;

  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION app.dispatch_from_invoices()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = app AS $$
DECLARE
  v_tenant uuid;
  v_location uuid;
  v_day    date;
BEGIN
  IF app.sync_trigger_bypass_active() THEN RETURN NULL; END IF;

  v_tenant := COALESCE(NEW.tenant_id, OLD.tenant_id);
  v_location := COALESCE(NEW.location_id, OLD.location_id);
  IF v_tenant IS NULL THEN RETURN NULL; END IF;

  v_day := app.metric_day_ist(
    COALESCE(NEW.invoice_date, OLD.invoice_date)::date,
    COALESCE(NEW.created_at, OLD.created_at)
  );

  PERFORM app.refresh_invoices_snapshot(v_tenant);

  IF v_location IS NOT NULL THEN
    PERFORM app.refresh_locations_snapshot(v_location);
  END IF;

  IF v_day IS NOT NULL THEN
    PERFORM app.refresh_kpi_invoices_daily(v_tenant, v_day);
    PERFORM app.refresh_buyer_app_daily(v_tenant, v_day);
  END IF;
  PERFORM app.refresh_buyer_app_snapshot(v_tenant);
  PERFORM app.refresh_buyer_current_snapshot(v_tenant);

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
  PERFORM app.refresh_customers_snapshot(p_tenant_id);
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
  PERFORM app.rebuild_kpi_brand_daily_for_tenant(p_tenant_id, p_days);
  PERFORM app.rebuild_kpi_category_daily_for_tenant(p_tenant_id, p_days);
  PERFORM app.rebuild_kpi_product_daily_for_tenant(p_tenant_id, p_days);
  PERFORM app.rebuild_kpi_location_daily_for_tenant(p_tenant_id, p_days);
  PERFORM app.rebuild_kpi_warehouse_daily_for_tenant(p_tenant_id, p_days);
  PERFORM app.rebuild_buyer_app_daily_for_tenant(p_tenant_id, p_days);
END;
$$;

SELECT app.refresh_buyer_current_snapshot(id)
FROM app.tenants
WHERE deleted_at IS NULL;
