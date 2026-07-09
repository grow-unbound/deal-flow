-- Phase 6 buyer-home completion on top of prod_bootstrap.sql.
-- Reuse the existing buyer-home aggregate contract, correct status-helper drift,
-- keep buyer YTD facts safe from generic retention pruning, and bootstrap the
-- buyer metric freshness cron job on databases that only applied the baseline.

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
        WHERE app.invoice_status_has_receivable(i.status, i.outstanding_balance)
      ), 0) AS outstanding_dues,
      COUNT(*) FILTER (
        WHERE app.invoice_status_has_receivable(i.status, i.outstanding_balance)
      )::bigint AS open_invoice_count,
      MIN(i.due_date) FILTER (
        WHERE app.invoice_status_has_receivable(i.status, i.outstanding_balance)
          AND i.due_date IS NOT NULL
      ) AS earliest_due_date,
      COUNT(*) FILTER (
        WHERE app.invoice_is_overdue(i.status, i.due_date, i.outstanding_balance)
      )::bigint AS overdue_invoice_count,
      COALESCE(SUM(i.outstanding_balance) FILTER (
        WHERE app.invoice_is_overdue(i.status, i.due_date, i.outstanding_balance)
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
        WHERE app.order_status_is_open(o.status)
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

CREATE OR REPLACE FUNCTION app.prune_kpi_daily_old_rows(p_retention_days integer DEFAULT 90)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app
AS $$
DECLARE
  v_today_ist date := (now() AT TIME ZONE 'Asia/Kolkata')::date;
  v_default_cutoff date := v_today_ist - COALESCE(p_retention_days, 90);
  v_buyer_cutoff date := LEAST(
    v_today_ist - COALESCE(p_retention_days, 90),
    date_trunc('year', v_today_ist::timestamp)::date
  );
BEGIN
  DELETE FROM app.kpi_tenant_daily     WHERE day           < v_default_cutoff;
  DELETE FROM app.kpi_product_daily    WHERE day           < v_default_cutoff;
  DELETE FROM app.kpi_category_daily   WHERE day           < v_default_cutoff;
  DELETE FROM app.kpi_location_daily   WHERE day           < v_default_cutoff;
  DELETE FROM app.kpi_warehouse_daily  WHERE day           < v_default_cutoff;
  DELETE FROM app.kpi_brand_daily      WHERE day           < v_default_cutoff;
  DELETE FROM app.kpi_buyers_daily     WHERE day           < v_buyer_cutoff;
  DELETE FROM app.kpi_estimates_daily  WHERE day           < v_default_cutoff;
  DELETE FROM app.kpi_orders_daily     WHERE day           < v_default_cutoff;
  DELETE FROM app.kpi_invoices_daily   WHERE day           < v_default_cutoff;
  DELETE FROM app.kpi_buyer_app_daily  WHERE snapshot_date < v_default_cutoff;
END;
$$;

CREATE OR REPLACE FUNCTION app.post_sync_rebuild(p_tenant_id uuid, p_days integer DEFAULT 2)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app
AS $$
DECLARE
  loc RECORD;
  wh RECORD;
  buyer_rebuild_days integer := GREATEST(
    COALESCE(p_days, 2),
    EXTRACT(DOY FROM (now() AT TIME ZONE 'Asia/Kolkata'))::int
  );
BEGIN
  PERFORM app.refresh_estimates_snapshot(p_tenant_id);
  PERFORM app.refresh_invoices_snapshot(p_tenant_id);
  PERFORM app.refresh_orders_snapshot(p_tenant_id);
  PERFORM app.refresh_buyers_snapshot(p_tenant_id);
  PERFORM app.refresh_products_snapshot(p_tenant_id);
  PERFORM app.refresh_categories_snapshot(p_tenant_id);
  PERFORM app.refresh_brands_snapshot(p_tenant_id);
  PERFORM app.refresh_buyer_current_snapshot(p_tenant_id);
  PERFORM app.rebuild_buyer_app_activity_for_tenant(p_tenant_id, GREATEST(COALESCE(p_days, 2), 365));
  PERFORM app.refresh_buyer_app_snapshot(p_tenant_id);

  FOR loc IN
    SELECT id
    FROM app.locations
    WHERE tenant_id = p_tenant_id
      AND deleted_at IS NULL
  LOOP
    PERFORM app.refresh_locations_snapshot(loc.id);
  END LOOP;

  FOR wh IN
    SELECT id
    FROM app.warehouses
    WHERE tenant_id = p_tenant_id
      AND deleted_at IS NULL
  LOOP
    PERFORM app.refresh_warehouses_snapshot(wh.id);
  END LOOP;

  PERFORM app.rebuild_kpi_tenant_daily_for_tenant(p_tenant_id, COALESCE(p_days, 2));
  PERFORM app.rebuild_kpi_estimates_daily_for_tenant(p_tenant_id, COALESCE(p_days, 2));
  PERFORM app.rebuild_kpi_orders_daily_for_tenant(p_tenant_id, COALESCE(p_days, 2));
  PERFORM app.rebuild_kpi_invoices_daily_for_tenant(p_tenant_id, COALESCE(p_days, 2));
  PERFORM app.rebuild_kpi_buyers_daily_for_tenant(p_tenant_id, buyer_rebuild_days);
  PERFORM app.rebuild_kpi_brand_daily_for_tenant(p_tenant_id, COALESCE(p_days, 2));
  PERFORM app.rebuild_kpi_category_daily_for_tenant(p_tenant_id, COALESCE(p_days, 2));
  PERFORM app.rebuild_kpi_product_daily_for_tenant(p_tenant_id, COALESCE(p_days, 2));
  PERFORM app.rebuild_kpi_location_daily_for_tenant(p_tenant_id, COALESCE(p_days, 2));
  PERFORM app.rebuild_kpi_warehouse_daily_for_tenant(p_tenant_id, COALESCE(p_days, 2));
  PERFORM app.rebuild_buyer_app_daily_for_tenant(p_tenant_id, COALESCE(p_days, 2));
END;
$$;

DO $$
BEGIN
  -- The bootstrap baseline keeps an orphaned customers_snapshot trigger helper
  -- body that calls refresh_customers_snapshot(uuid), even though that refresh
  -- function is no longer part of the active buyer aggregate contract. Only
  -- clean it up when the refresh function is absent, so any unexpected legacy
  -- environment that still owns that compatibility path is left alone.
  IF to_regprocedure('app.refresh_customers_snapshot(uuid)') IS NULL THEN
    EXECUTE 'DROP TRIGGER IF EXISTS trg_buyers_refresh_snapshot ON app.buyers';
    EXECUTE 'DROP FUNCTION IF EXISTS app.trg_refresh_customers_snapshot()';
  END IF;
END;
$$;

SELECT app.ensure_buyer_metric_snapshot_cron_scheduled();
