-- Rename buyer_app_daily → kpi_buyer_app_daily for naming consistency with other
-- kpi_*_daily tables. Update all dependent objects (policy, index, functions).
--
-- Also fixes IST timezone inconsistency: kpi_location_daily and buyer_app_daily
-- used raw ::date casts which assign rows to the wrong day for orders placed
-- between 00:00–05:30 IST (= previous day UTC).
-- All kpi_*_daily functions now consistently use AT TIME ZONE 'Asia/Kolkata'.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Rename table
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE app.buyer_app_daily RENAME TO kpi_buyer_app_daily;

-- Rename the existing index for clarity.
ALTER INDEX IF EXISTS idx_buyer_app_daily_tenant_date
  RENAME TO idx_kpi_buyer_app_daily_tenant_date;

-- Update BRIN index name created in previous migration.
ALTER INDEX IF EXISTS idx_buyer_app_daily_date_brin
  RENAME TO idx_kpi_buyer_app_daily_date_brin;

-- Drop old RLS policy and recreate under new name.
DROP POLICY IF EXISTS "tenant members can read buyer_app_daily" ON app.kpi_buyer_app_daily;
CREATE POLICY "tenant members can read kpi_buyer_app_daily"
  ON app.kpi_buyer_app_daily FOR SELECT
  USING (app.jwt_tenant_id() = tenant_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Update refresh_buyer_app_daily to use new table name + IST date bucketing
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION app.refresh_buyer_app_daily(p_tenant_id uuid, p_date date)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = app AS $$
  INSERT INTO app.kpi_buyer_app_daily (
    tenant_id, snapshot_date,
    app_gmv, app_orders, active_buyers,
    app_estimates_value, app_estimates_count,
    converted_to_order_value, converted_to_order_count,
    invoiced_value, invoiced_count
  )
  SELECT
    p_tenant_id,
    p_date,
    COALESCE((SELECT SUM(total_amount) FROM app.orders
              WHERE tenant_id = p_tenant_id AND source = 'buyer_app'
                AND (placed_at AT TIME ZONE 'Asia/Kolkata')::date = p_date
                AND deleted_at IS NULL), 0),
    COALESCE((SELECT COUNT(*) FROM app.orders
              WHERE tenant_id = p_tenant_id AND source = 'buyer_app'
                AND (placed_at AT TIME ZONE 'Asia/Kolkata')::date = p_date
                AND deleted_at IS NULL), 0),
    COALESCE((SELECT COUNT(DISTINCT buyer_id) FROM app.orders
              WHERE tenant_id = p_tenant_id AND source = 'buyer_app'
                AND (placed_at AT TIME ZONE 'Asia/Kolkata')::date = p_date
                AND deleted_at IS NULL), 0),
    COALESCE((SELECT SUM(total_amount) FROM app.estimates
              WHERE tenant_id = p_tenant_id AND source = 'buyer_app'
                AND (created_at AT TIME ZONE 'Asia/Kolkata')::date = p_date
                AND deleted_at IS NULL), 0),
    COALESCE((SELECT COUNT(*) FROM app.estimates
              WHERE tenant_id = p_tenant_id AND source = 'buyer_app'
                AND (created_at AT TIME ZONE 'Asia/Kolkata')::date = p_date
                AND deleted_at IS NULL), 0),
    COALESCE((SELECT SUM(total_amount) FROM app.orders
              WHERE tenant_id = p_tenant_id AND source = 'buyer_app'
                AND (placed_at AT TIME ZONE 'Asia/Kolkata')::date = p_date
                AND status IN ('confirmed','partially_dispatched','dispatched','delivered','invoiced','partially_invoiced')
                AND deleted_at IS NULL), 0),
    COALESCE((SELECT COUNT(*) FROM app.orders
              WHERE tenant_id = p_tenant_id AND source = 'buyer_app'
                AND (placed_at AT TIME ZONE 'Asia/Kolkata')::date = p_date
                AND status IN ('confirmed','partially_dispatched','dispatched','delivered','invoiced','partially_invoiced')
                AND deleted_at IS NULL), 0),
    COALESCE((SELECT SUM(i.total_amount)
              FROM app.invoices i JOIN app.estimates e ON i.estimate_id = e.id
              WHERE i.tenant_id = p_tenant_id AND e.source = 'buyer_app'
                AND (i.invoice_date AT TIME ZONE 'Asia/Kolkata')::date = p_date
                AND i.deleted_at IS NULL), 0),
    COALESCE((SELECT COUNT(*)
              FROM app.invoices i JOIN app.estimates e ON i.estimate_id = e.id
              WHERE i.tenant_id = p_tenant_id AND e.source = 'buyer_app'
                AND (i.invoice_date AT TIME ZONE 'Asia/Kolkata')::date = p_date
                AND i.deleted_at IS NULL), 0)
  ON CONFLICT (tenant_id, snapshot_date) DO UPDATE SET
    app_gmv                  = EXCLUDED.app_gmv,
    app_orders               = EXCLUDED.app_orders,
    active_buyers            = EXCLUDED.active_buyers,
    app_estimates_value      = EXCLUDED.app_estimates_value,
    app_estimates_count      = EXCLUDED.app_estimates_count,
    converted_to_order_value = EXCLUDED.converted_to_order_value,
    converted_to_order_count = EXCLUDED.converted_to_order_count,
    invoiced_value           = EXCLUDED.invoiced_value,
    invoiced_count           = EXCLUDED.invoiced_count;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Update trigger functions that reference buyer_app_daily → kpi_buyer_app_daily
--    (table rename is transparent via the rename above, but we also update the
--    function bodies' IST date bucketing while we are here)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION app.trg_orders_refresh_buyer_app_daily()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = app AS $$
DECLARE
  target_tenant uuid;
  target_date   date;
BEGIN
  IF app.sync_trigger_bypass_active() THEN RETURN NULL; END IF;
  IF TG_OP = 'DELETE' OR NEW.source = 'buyer_app' OR OLD.source = 'buyer_app' THEN
    target_tenant := COALESCE(NEW.tenant_id, OLD.tenant_id);
    target_date   := (COALESCE(NEW.placed_at, OLD.placed_at) AT TIME ZONE 'Asia/Kolkata')::date;
    PERFORM app.refresh_buyer_app_daily(target_tenant, target_date);
  END IF;
  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION app.trg_estimates_refresh_buyer_app_daily()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = app AS $$
DECLARE
  target_tenant uuid;
  target_date   date;
BEGIN
  IF app.sync_trigger_bypass_active() THEN RETURN NULL; END IF;
  IF TG_OP = 'DELETE' OR NEW.source = 'buyer_app' OR OLD.source = 'buyer_app' THEN
    target_tenant := COALESCE(NEW.tenant_id, OLD.tenant_id);
    target_date   := (COALESCE(NEW.created_at, OLD.created_at) AT TIME ZONE 'Asia/Kolkata')::date;
    PERFORM app.refresh_buyer_app_daily(target_tenant, target_date);
  END IF;
  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION app.trg_invoices_refresh_buyer_app_daily()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = app AS $$
DECLARE
  target_tenant uuid;
  target_date   date;
BEGIN
  IF app.sync_trigger_bypass_active() THEN RETURN NULL; END IF;
  target_tenant := COALESCE(NEW.tenant_id, OLD.tenant_id);
  target_date   := (COALESCE(NEW.invoice_date, OLD.invoice_date, now()::date)
                    AT TIME ZONE 'Asia/Kolkata')::date;
  PERFORM app.refresh_buyer_app_daily(target_tenant, target_date);
  RETURN NULL;
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Update prune_kpi_daily_old_rows to reference new table name.
--    The retention migration created this function when the table was still
--    named buyer_app_daily; patch the body now that the rename has occurred.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION app.prune_kpi_daily_old_rows(p_retention_days int DEFAULT 90)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = app AS $$
  DELETE FROM app.kpi_tenant_daily    WHERE day           < CURRENT_DATE - p_retention_days;
  DELETE FROM app.kpi_product_daily   WHERE day           < CURRENT_DATE - p_retention_days;
  DELETE FROM app.kpi_category_daily  WHERE day           < CURRENT_DATE - p_retention_days;
  DELETE FROM app.kpi_location_daily  WHERE day           < CURRENT_DATE - p_retention_days;
  DELETE FROM app.kpi_brand_daily     WHERE day           < CURRENT_DATE - p_retention_days;
  DELETE FROM app.kpi_buyer_app_daily WHERE snapshot_date < CURRENT_DATE - p_retention_days;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. Fix refresh_buyer_app_snapshot to use IST for month boundaries
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION app.refresh_buyer_app_snapshot(p_tenant_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = app AS $$
DECLARE
  -- Month boundaries in IST so a purchase at 23:45 IST on the last day of the
  -- month counts in the correct calendar month.
  v_now         timestamptz := now() AT TIME ZONE 'Asia/Kolkata';
  v_month_start timestamptz := date_trunc('month', v_now) AT TIME ZONE 'Asia/Kolkata';
  v_month_end   timestamptz := (date_trunc('month', v_now) + interval '1 month') AT TIME ZONE 'Asia/Kolkata';
  v_30d_ago     timestamptz := (v_now - interval '30 days') AT TIME ZONE 'Asia/Kolkata';
BEGIN
  INSERT INTO app.buyer_app_snapshot (
    tenant_id,
    enabled_buyers, total_buyers, opened_app_mtd, ordered_mtd, repeat_mtd,
    app_gmv_mtd, app_orders_mtd, total_gmv_mtd,
    estimates_app_value_mtd, estimates_app_count_mtd,
    converted_order_value_mtd, converted_order_count_mtd,
    invoiced_app_value_mtd, invoiced_app_count_mtd,
    not_ordering_buyers, top_app_buyers_callout, no_app_buyers,
    top_app_buyers_card, top_locations,
    refreshed_at
  )
  SELECT
    p_tenant_id,
    (SELECT COUNT(DISTINCT bu.buyer_id)
     FROM app.buyer_users bu JOIN app.buyers b ON b.id = bu.buyer_id
     WHERE b.tenant_id = p_tenant_id AND bu.is_active = true AND b.deleted_at IS NULL),
    (SELECT COUNT(*) FROM app.buyers
     WHERE tenant_id = p_tenant_id AND deleted_at IS NULL AND is_active = true),
    (SELECT COUNT(DISTINCT bu.buyer_id)
     FROM app.buyer_users bu JOIN app.buyers b ON b.id = bu.buyer_id
     WHERE b.tenant_id = p_tenant_id AND bu.is_active = true
       AND bu.updated_at >= v_month_start AND b.deleted_at IS NULL),
    (SELECT COUNT(DISTINCT buyer_id) FROM app.orders
     WHERE tenant_id = p_tenant_id AND source = 'buyer_app'
       AND placed_at >= v_month_start AND placed_at < v_month_end AND deleted_at IS NULL),
    (SELECT COUNT(*) FROM (
       SELECT buyer_id FROM app.orders
       WHERE tenant_id = p_tenant_id AND source = 'buyer_app'
         AND placed_at >= v_month_start AND placed_at < v_month_end AND deleted_at IS NULL
       GROUP BY buyer_id HAVING COUNT(*) >= 2
     ) r),
    COALESCE((SELECT SUM(total_amount) FROM app.orders
     WHERE tenant_id = p_tenant_id AND source = 'buyer_app'
       AND placed_at >= v_month_start AND placed_at < v_month_end AND deleted_at IS NULL), 0),
    (SELECT COUNT(*) FROM app.orders
     WHERE tenant_id = p_tenant_id AND source = 'buyer_app'
       AND placed_at >= v_month_start AND placed_at < v_month_end AND deleted_at IS NULL),
    COALESCE((SELECT SUM(total_amount) FROM app.orders
     WHERE tenant_id = p_tenant_id
       AND placed_at >= v_month_start AND placed_at < v_month_end AND deleted_at IS NULL), 0),
    COALESCE((SELECT SUM(total_amount) FROM app.estimates
     WHERE tenant_id = p_tenant_id AND source = 'buyer_app'
       AND created_at >= v_month_start AND created_at < v_month_end AND deleted_at IS NULL), 0),
    (SELECT COUNT(*) FROM app.estimates
     WHERE tenant_id = p_tenant_id AND source = 'buyer_app'
       AND created_at >= v_month_start AND created_at < v_month_end AND deleted_at IS NULL),
    COALESCE((SELECT SUM(total_amount) FROM app.orders
     WHERE tenant_id = p_tenant_id AND source = 'buyer_app'
       AND placed_at >= v_month_start AND placed_at < v_month_end
       AND status IN ('confirmed','partially_dispatched','dispatched','delivered','invoiced','partially_invoiced')
       AND deleted_at IS NULL), 0),
    (SELECT COUNT(*) FROM app.orders
     WHERE tenant_id = p_tenant_id AND source = 'buyer_app'
       AND placed_at >= v_month_start AND placed_at < v_month_end
       AND status IN ('confirmed','partially_dispatched','dispatched','delivered','invoiced','partially_invoiced')
       AND deleted_at IS NULL),
    COALESCE((SELECT SUM(i.total_amount)
     FROM app.invoices i JOIN app.estimates e ON i.estimate_id = e.id
     WHERE i.tenant_id = p_tenant_id AND e.source = 'buyer_app'
       AND i.invoice_date >= v_month_start AND i.invoice_date < v_month_end
       AND i.deleted_at IS NULL), 0),
    (SELECT COUNT(*)
     FROM app.invoices i JOIN app.estimates e ON i.estimate_id = e.id
     WHERE i.tenant_id = p_tenant_id AND e.source = 'buyer_app'
       AND i.invoice_date >= v_month_start AND i.invoice_date < v_month_end
       AND i.deleted_at IS NULL),
    COALESCE((
      SELECT jsonb_agg(row_to_json(s) ORDER BY s.days_inactive DESC)
      FROM (
        SELECT b.id AS buyer_id, b.name,
          upper(left(b.name, 2)) AS initials,
          to_char(MIN(bu.created_at), 'DD Mon YYYY') AS enabled_date,
          EXTRACT(DAY FROM now() - COALESCE(MAX(o.placed_at), MIN(bu.created_at)))::int AS days_inactive
        FROM app.buyers b
        JOIN app.buyer_users bu ON bu.buyer_id = b.id AND bu.is_active = true
        LEFT JOIN app.orders o ON o.buyer_id = b.id AND o.source = 'buyer_app'
          AND o.placed_at >= v_30d_ago AND o.deleted_at IS NULL
        WHERE b.tenant_id = p_tenant_id AND b.deleted_at IS NULL AND b.is_active = true
        GROUP BY b.id, b.name
        HAVING MAX(o.id) IS NULL
        ORDER BY days_inactive DESC
        LIMIT 3
      ) s
    ), '[]'),
    COALESCE((
      SELECT jsonb_agg(row_to_json(s))
      FROM (
        SELECT b.id AS buyer_id, b.name,
          upper(left(b.name, 2)) AS initials,
          COALESCE(SUM(o.total_amount), 0) AS gmv,
          COUNT(o.id) AS orders
        FROM app.buyers b
        JOIN app.orders o ON o.buyer_id = b.id
        WHERE b.tenant_id = p_tenant_id AND b.deleted_at IS NULL
          AND o.source = 'buyer_app'
          AND o.placed_at >= v_month_start AND o.placed_at < v_month_end
          AND o.deleted_at IS NULL
        GROUP BY b.id, b.name
        ORDER BY gmv DESC LIMIT 2
      ) s
    ), '[]'),
    COALESCE((
      SELECT jsonb_agg(row_to_json(s))
      FROM (
        SELECT b.id AS buyer_id, b.name,
          upper(left(b.name, 2)) AS initials,
          COALESCE(SUM(o.total_amount), 0) AS offline_gmv
        FROM app.buyers b
        LEFT JOIN app.buyer_users bu ON bu.buyer_id = b.id AND bu.is_active = true
        LEFT JOIN app.orders o ON o.buyer_id = b.id
          AND o.placed_at >= v_month_start AND o.placed_at < v_month_end
          AND o.deleted_at IS NULL
        WHERE b.tenant_id = p_tenant_id AND b.deleted_at IS NULL AND b.is_active = true
          AND bu.id IS NULL
        GROUP BY b.id, b.name
        ORDER BY offline_gmv DESC LIMIT 3
      ) s
    ), '[]'),
    COALESCE((
      SELECT jsonb_agg(row_to_json(s))
      FROM (
        SELECT b.id AS buyer_id, b.name,
          upper(left(b.name, 2)) AS initials,
          COALESCE(b.city, '') AS city,
          COALESCE(SUM(o.total_amount), 0) AS gmv,
          COUNT(o.id) AS orders
        FROM app.buyers b
        JOIN app.orders o ON o.buyer_id = b.id
        WHERE b.tenant_id = p_tenant_id AND b.deleted_at IS NULL
          AND o.source = 'buyer_app'
          AND o.placed_at >= v_month_start AND o.placed_at < v_month_end
          AND o.deleted_at IS NULL
        GROUP BY b.id, b.name, b.city
        ORDER BY gmv DESC LIMIT 5
      ) s
    ), '[]'),
    COALESCE((
      SELECT jsonb_agg(row_to_json(s))
      FROM (
        SELECT l.id AS location_id, l.name,
          COUNT(o.id) AS app_orders,
          COALESCE(SUM(o.total_amount), 0) AS app_gmv,
          ROUND(100.0 * COALESCE(SUM(o.total_amount), 0) /
            NULLIF((SELECT SUM(total_amount) FROM app.orders
                    WHERE tenant_id = p_tenant_id AND source = 'buyer_app'
                      AND placed_at >= v_month_start AND placed_at < v_month_end
                      AND deleted_at IS NULL), 0), 1) AS share_pct
        FROM app.locations l
        JOIN app.orders o ON o.location_id = l.id
        WHERE l.tenant_id = p_tenant_id AND l.deleted_at IS NULL
          AND o.source = 'buyer_app'
          AND o.placed_at >= v_month_start AND o.placed_at < v_month_end
          AND o.deleted_at IS NULL
        GROUP BY l.id, l.name
        ORDER BY app_gmv DESC LIMIT 5
      ) s
    ), '[]'),
    now()
  ON CONFLICT (tenant_id) DO UPDATE SET
    enabled_buyers            = EXCLUDED.enabled_buyers,
    total_buyers              = EXCLUDED.total_buyers,
    opened_app_mtd            = EXCLUDED.opened_app_mtd,
    ordered_mtd               = EXCLUDED.ordered_mtd,
    repeat_mtd                = EXCLUDED.repeat_mtd,
    app_gmv_mtd               = EXCLUDED.app_gmv_mtd,
    app_orders_mtd            = EXCLUDED.app_orders_mtd,
    total_gmv_mtd             = EXCLUDED.total_gmv_mtd,
    estimates_app_value_mtd   = EXCLUDED.estimates_app_value_mtd,
    estimates_app_count_mtd   = EXCLUDED.estimates_app_count_mtd,
    converted_order_value_mtd = EXCLUDED.converted_order_value_mtd,
    converted_order_count_mtd = EXCLUDED.converted_order_count_mtd,
    invoiced_app_value_mtd    = EXCLUDED.invoiced_app_value_mtd,
    invoiced_app_count_mtd    = EXCLUDED.invoiced_app_count_mtd,
    not_ordering_buyers       = EXCLUDED.not_ordering_buyers,
    top_app_buyers_callout    = EXCLUDED.top_app_buyers_callout,
    no_app_buyers             = EXCLUDED.no_app_buyers,
    top_app_buyers_card       = EXCLUDED.top_app_buyers_card,
    top_locations             = EXCLUDED.top_locations,
    refreshed_at              = EXCLUDED.refreshed_at;
END;
$$;
