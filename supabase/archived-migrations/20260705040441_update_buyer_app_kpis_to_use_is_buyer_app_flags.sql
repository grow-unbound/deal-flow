-- Swap buyer-app KPI aggregates from raw `source = 'buyer_app'` checks to the
-- new is_buyer_app_estimate / is_buyer_app_order / is_buyer_app_invoice flags
-- (added in 20260705040222_add_zoho_field_mappings_and_buyer_app_flags.sql).
--
-- Why: once a tenant syncs Zoho, a buyer-app-originated estimate/order/invoice
-- lands with source = 'zoho_import', not 'buyer_app'. Every query below that
-- still filtered on raw `source = 'buyer_app'` would silently undercount
-- buyer-app contribution to GMV/estimate/invoice KPIs for that tenant. The
-- invoice join to app.estimates (`i.estimate_id = e.id AND e.source =
-- 'buyer_app'`) is also replaced by a direct `i.is_buyer_app_invoice` check —
-- invoices now carry their own flag, so the join is no longer needed.
--
-- Also fixes an optimization bug in the two AFTER-trigger dispatchers
-- (dispatch_from_orders, dispatch_from_estimates): they skip recomputing
-- kpi_buyer_app_daily when the changed row "isn't buyer_app" — that check
-- used to read raw `source`, so it would have kept skipping the recompute
-- for a Zoho-imported buyer-app row even after this migration updates the
-- aggregate queries themselves. It now reads the same is_buyer_app_* flag
-- the aggregate queries use.

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. refresh_buyer_app_daily
-- ═══════════════════════════════════════════════════════════════════════════
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
              WHERE tenant_id = p_tenant_id AND is_buyer_app_order
                AND (placed_at AT TIME ZONE 'Asia/Kolkata')::date = p_date
                AND deleted_at IS NULL), 0),
    COALESCE((SELECT COUNT(*) FROM app.orders
              WHERE tenant_id = p_tenant_id AND is_buyer_app_order
                AND (placed_at AT TIME ZONE 'Asia/Kolkata')::date = p_date
                AND deleted_at IS NULL), 0),
    COALESCE((SELECT COUNT(DISTINCT buyer_id) FROM app.orders
              WHERE tenant_id = p_tenant_id AND is_buyer_app_order
                AND (placed_at AT TIME ZONE 'Asia/Kolkata')::date = p_date
                AND deleted_at IS NULL), 0),
    COALESCE((SELECT SUM(total_amount) FROM app.estimates
              WHERE tenant_id = p_tenant_id AND is_buyer_app_estimate
                AND (created_at AT TIME ZONE 'Asia/Kolkata')::date = p_date
                AND deleted_at IS NULL), 0),
    COALESCE((SELECT COUNT(*) FROM app.estimates
              WHERE tenant_id = p_tenant_id AND is_buyer_app_estimate
                AND (created_at AT TIME ZONE 'Asia/Kolkata')::date = p_date
                AND deleted_at IS NULL), 0),
    COALESCE((SELECT SUM(total_amount) FROM app.orders
              WHERE tenant_id = p_tenant_id AND is_buyer_app_order
                AND (placed_at AT TIME ZONE 'Asia/Kolkata')::date = p_date
                AND status IN ('confirmed','partially_dispatched','dispatched','delivered','invoiced','partially_invoiced')
                AND deleted_at IS NULL), 0),
    COALESCE((SELECT COUNT(*) FROM app.orders
              WHERE tenant_id = p_tenant_id AND is_buyer_app_order
                AND (placed_at AT TIME ZONE 'Asia/Kolkata')::date = p_date
                AND status IN ('confirmed','partially_dispatched','dispatched','delivered','invoiced','partially_invoiced')
                AND deleted_at IS NULL), 0),
    COALESCE((SELECT SUM(i.total_amount) FROM app.invoices i
              WHERE i.tenant_id = p_tenant_id AND i.is_buyer_app_invoice
                AND (i.invoice_date AT TIME ZONE 'Asia/Kolkata')::date = p_date
                AND i.deleted_at IS NULL), 0),
    COALESCE((SELECT COUNT(*) FROM app.invoices i
              WHERE i.tenant_id = p_tenant_id AND i.is_buyer_app_invoice
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

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. refresh_buyer_app_snapshot
-- ═══════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION app.refresh_buyer_app_snapshot(p_tenant_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = app AS $$
DECLARE
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
     WHERE tenant_id = p_tenant_id AND is_buyer_app_order
       AND placed_at >= v_month_start AND placed_at < v_month_end AND deleted_at IS NULL),
    (SELECT COUNT(*) FROM (
       SELECT buyer_id FROM app.orders
       WHERE tenant_id = p_tenant_id AND is_buyer_app_order
         AND placed_at >= v_month_start AND placed_at < v_month_end AND deleted_at IS NULL
       GROUP BY buyer_id HAVING COUNT(*) >= 2
     ) r),
    COALESCE((SELECT SUM(total_amount) FROM app.orders
     WHERE tenant_id = p_tenant_id AND is_buyer_app_order
       AND placed_at >= v_month_start AND placed_at < v_month_end AND deleted_at IS NULL), 0),
    (SELECT COUNT(*) FROM app.orders
     WHERE tenant_id = p_tenant_id AND is_buyer_app_order
       AND placed_at >= v_month_start AND placed_at < v_month_end AND deleted_at IS NULL),
    COALESCE((SELECT SUM(total_amount) FROM app.orders
     WHERE tenant_id = p_tenant_id
       AND placed_at >= v_month_start AND placed_at < v_month_end AND deleted_at IS NULL), 0),
    COALESCE((SELECT SUM(total_amount) FROM app.estimates
     WHERE tenant_id = p_tenant_id AND is_buyer_app_estimate
       AND created_at >= v_month_start AND created_at < v_month_end AND deleted_at IS NULL), 0),
    (SELECT COUNT(*) FROM app.estimates
     WHERE tenant_id = p_tenant_id AND is_buyer_app_estimate
       AND created_at >= v_month_start AND created_at < v_month_end AND deleted_at IS NULL),
    COALESCE((SELECT SUM(total_amount) FROM app.orders
     WHERE tenant_id = p_tenant_id AND is_buyer_app_order
       AND placed_at >= v_month_start AND placed_at < v_month_end
       AND status IN ('confirmed','partially_dispatched','dispatched','delivered','invoiced','partially_invoiced')
       AND deleted_at IS NULL), 0),
    (SELECT COUNT(*) FROM app.orders
     WHERE tenant_id = p_tenant_id AND is_buyer_app_order
       AND placed_at >= v_month_start AND placed_at < v_month_end
       AND status IN ('confirmed','partially_dispatched','dispatched','delivered','invoiced','partially_invoiced')
       AND deleted_at IS NULL),
    COALESCE((SELECT SUM(i.total_amount) FROM app.invoices i
     WHERE i.tenant_id = p_tenant_id AND i.is_buyer_app_invoice
       AND i.invoice_date >= v_month_start AND i.invoice_date < v_month_end
       AND i.deleted_at IS NULL), 0),
    (SELECT COUNT(*) FROM app.invoices i
     WHERE i.tenant_id = p_tenant_id AND i.is_buyer_app_invoice
       AND i.invoice_date >= v_month_start AND i.invoice_date < v_month_end
       AND i.deleted_at IS NULL),
    COALESCE((
      SELECT jsonb_agg(row_to_json(s) ORDER BY s.days_inactive DESC)
      FROM (
        SELECT b.id AS buyer_id, b.business_name AS name,
          upper(left(b.business_name, 2)) AS initials,
          to_char(MIN(bu.created_at), 'DD Mon YYYY') AS enabled_date,
          EXTRACT(DAY FROM now() - COALESCE(MAX(o.placed_at), MIN(bu.created_at)))::int AS days_inactive
        FROM app.buyers b
        JOIN app.buyer_users bu ON bu.buyer_id = b.id AND bu.is_active = true
        LEFT JOIN app.orders o ON o.buyer_id = b.id AND o.is_buyer_app_order
          AND o.placed_at >= v_30d_ago AND o.deleted_at IS NULL
        WHERE b.tenant_id = p_tenant_id AND b.deleted_at IS NULL AND b.is_active = true
        GROUP BY b.id, b.business_name
        HAVING COUNT(o.id) = 0
        ORDER BY days_inactive DESC
        LIMIT 3
      ) s
    ), '[]'),
    COALESCE((
      SELECT jsonb_agg(row_to_json(s))
      FROM (
        SELECT b.id AS buyer_id, b.business_name AS name,
          upper(left(b.business_name, 2)) AS initials,
          COALESCE(SUM(o.total_amount), 0) AS gmv,
          COUNT(o.id) AS orders
        FROM app.buyers b
        JOIN app.orders o ON o.buyer_id = b.id
        WHERE b.tenant_id = p_tenant_id AND b.deleted_at IS NULL
          AND o.is_buyer_app_order
          AND o.placed_at >= v_month_start AND o.placed_at < v_month_end
          AND o.deleted_at IS NULL
        GROUP BY b.id, b.business_name
        ORDER BY gmv DESC LIMIT 2
      ) s
    ), '[]'),
    COALESCE((
      SELECT jsonb_agg(row_to_json(s))
      FROM (
        SELECT b.id AS buyer_id, b.business_name AS name,
          upper(left(b.business_name, 2)) AS initials,
          COALESCE(SUM(o.total_amount), 0) AS offline_gmv
        FROM app.buyers b
        LEFT JOIN app.buyer_users bu ON bu.buyer_id = b.id AND bu.is_active = true
        LEFT JOIN app.orders o ON o.buyer_id = b.id
          AND o.placed_at >= v_month_start AND o.placed_at < v_month_end
          AND o.deleted_at IS NULL
        WHERE b.tenant_id = p_tenant_id AND b.deleted_at IS NULL AND b.is_active = true
          AND bu.id IS NULL
        GROUP BY b.id, b.business_name
        ORDER BY offline_gmv DESC LIMIT 3
      ) s
    ), '[]'),
    COALESCE((
      SELECT jsonb_agg(row_to_json(s))
      FROM (
        SELECT b.id AS buyer_id, b.business_name AS name,
          upper(left(b.business_name, 2)) AS initials,
          COALESCE(b.geography->>'city', '') AS city,
          COALESCE(SUM(o.total_amount), 0) AS gmv,
          COUNT(o.id) AS orders
        FROM app.buyers b
        JOIN app.orders o ON o.buyer_id = b.id
        WHERE b.tenant_id = p_tenant_id AND b.deleted_at IS NULL
          AND o.is_buyer_app_order
          AND o.placed_at >= v_month_start AND o.placed_at < v_month_end
          AND o.deleted_at IS NULL
        GROUP BY b.id, b.business_name, b.geography
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
                    WHERE tenant_id = p_tenant_id AND is_buyer_app_order
                      AND placed_at >= v_month_start AND placed_at < v_month_end
                      AND deleted_at IS NULL), 0), 1) AS share_pct
        FROM app.locations l
        JOIN app.orders o ON o.location_id = l.id
        WHERE l.tenant_id = p_tenant_id AND l.deleted_at IS NULL
          AND o.is_buyer_app_order
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

-- ═══════════════════════════════════════════════════════════════════════════
-- 3. dispatch_from_orders / dispatch_from_estimates — fix v_is_app gate
-- ═══════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION app.dispatch_from_orders()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = app AS $$
DECLARE
  v_bypass    boolean;
  v_tenant    uuid;
  v_location  uuid;
  v_day       date;
  v_is_app    boolean;
BEGIN
  v_bypass   := app.sync_trigger_bypass_active();
  v_tenant   := COALESCE(NEW.tenant_id,   OLD.tenant_id);
  v_location := COALESCE(NEW.location_id, OLD.location_id);
  v_day      := (COALESCE(NEW.placed_at,  OLD.placed_at) AT TIME ZONE 'Asia/Kolkata')::date;
  v_is_app   := (TG_OP = 'DELETE')
             OR (NEW.is_buyer_app_order)
             OR (OLD IS NOT NULL AND OLD.is_buyer_app_order);

  IF v_tenant IS NOT NULL AND v_day IS NOT NULL THEN
    PERFORM app.refresh_kpi_tenant_daily(v_tenant, v_day);

    IF v_location IS NOT NULL THEN
      PERFORM app.refresh_kpi_location_daily(v_tenant, v_location, v_day);
    END IF;

    IF NOT v_bypass THEN
      IF v_is_app THEN
        PERFORM app.refresh_buyer_app_daily(v_tenant, v_day);
      END IF;
      PERFORM app.refresh_buyer_app_snapshot(v_tenant);
    END IF;
  END IF;

  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION app.dispatch_from_estimates()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = app AS $$
DECLARE
  v_bypass  boolean;
  v_tenant  uuid;
  v_date    date;
  v_is_app  boolean;
BEGIN
  v_bypass := app.sync_trigger_bypass_active();
  v_tenant := COALESCE(NEW.tenant_id, OLD.tenant_id);
  v_date   := (COALESCE(NEW.created_at, OLD.created_at) AT TIME ZONE 'Asia/Kolkata')::date;
  v_is_app := (TG_OP = 'DELETE')
           OR (NEW.is_buyer_app_estimate)
           OR (OLD IS NOT NULL AND OLD.is_buyer_app_estimate);

  PERFORM app.refresh_estimates_snapshot(v_tenant);

  IF NOT v_bypass THEN
    IF v_is_app THEN
      PERFORM app.refresh_buyer_app_daily(v_tenant, v_date);
    END IF;
    PERFORM app.refresh_buyer_app_snapshot(v_tenant);
  END IF;

  RETURN NULL;
END;
$$;
