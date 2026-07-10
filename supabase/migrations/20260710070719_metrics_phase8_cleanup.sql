-- Phase 8 metrics cleanup.
-- Keep aggregate reads on shared metric helpers and remove obsolete rebuild entrypoints
-- that still encoded pre-standardization status/date rules.

CREATE OR REPLACE FUNCTION app.refresh_buyers_snapshot(p_tenant_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app
AS $$
BEGIN
  DELETE FROM app.buyers_snapshot
  WHERE tenant_id = p_tenant_id;

  WITH base_buyers AS (
    SELECT
      b.id AS buyer_id,
      b.is_active,
      COALESCE(b.credit_limit, 0) AS credit_limit
    FROM app.buyers b
    WHERE b.tenant_id = p_tenant_id
      AND b.deleted_at IS NULL
  ),
  tenant_orders AS (
    SELECT
      o.buyer_id,
      COUNT(*) FILTER (WHERE app.order_status_is_open(o.status))::bigint AS open_orders_count,
      MAX(COALESCE((o.order_date::timestamp AT TIME ZONE 'Asia/Kolkata'), o.placed_at, o.created_at)) AS last_order_at
    FROM app.orders o
    WHERE o.tenant_id = p_tenant_id
      AND o.deleted_at IS NULL
      AND o.buyer_id IS NOT NULL
    GROUP BY o.buyer_id
  ),
  tenant_estimates AS (
    SELECT
      e.buyer_id,
      MAX(COALESCE((e.estimate_date::timestamp AT TIME ZONE 'Asia/Kolkata'), e.created_at)) AS last_estimate_at
    FROM app.estimates e
    WHERE e.tenant_id = p_tenant_id
      AND e.deleted_at IS NULL
      AND e.buyer_id IS NOT NULL
    GROUP BY e.buyer_id
  ),
  tenant_invoices AS (
    SELECT
      i.buyer_id,
      COALESCE(SUM(i.outstanding_balance) FILTER (
        WHERE app.invoice_status_has_receivable(i.status, i.outstanding_balance)
      ), 0) AS outstanding_dues,
      COALESCE(SUM(i.outstanding_balance) FILTER (
        WHERE app.invoice_is_overdue(i.status, i.due_date, i.outstanding_balance)
      ), 0) AS overdue_amount,
      MAX(COALESCE((i.invoice_date::timestamp AT TIME ZONE 'Asia/Kolkata'), i.created_at)) AS last_invoice_at
    FROM app.invoices i
    WHERE i.tenant_id = p_tenant_id
      AND i.deleted_at IS NULL
      AND i.buyer_id IS NOT NULL
    GROUP BY i.buyer_id
  ),
  location_orders AS (
    SELECT
      o.buyer_id,
      o.location_id,
      COUNT(*) FILTER (WHERE app.order_status_is_open(o.status))::bigint AS open_orders_count,
      MAX(COALESCE((o.order_date::timestamp AT TIME ZONE 'Asia/Kolkata'), o.placed_at, o.created_at)) AS last_order_at
    FROM app.orders o
    WHERE o.tenant_id = p_tenant_id
      AND o.deleted_at IS NULL
      AND o.buyer_id IS NOT NULL
      AND o.location_id IS NOT NULL
    GROUP BY o.buyer_id, o.location_id
  ),
  location_estimates AS (
    SELECT
      e.buyer_id,
      e.location_id,
      MAX(COALESCE((e.estimate_date::timestamp AT TIME ZONE 'Asia/Kolkata'), e.created_at)) AS last_estimate_at
    FROM app.estimates e
    WHERE e.tenant_id = p_tenant_id
      AND e.deleted_at IS NULL
      AND e.buyer_id IS NOT NULL
      AND e.location_id IS NOT NULL
    GROUP BY e.buyer_id, e.location_id
  ),
  location_invoices AS (
    SELECT
      i.buyer_id,
      i.location_id,
      COALESCE(SUM(i.outstanding_balance) FILTER (
        WHERE app.invoice_status_has_receivable(i.status, i.outstanding_balance)
      ), 0) AS outstanding_dues,
      COALESCE(SUM(i.outstanding_balance) FILTER (
        WHERE app.invoice_is_overdue(i.status, i.due_date, i.outstanding_balance)
      ), 0) AS overdue_amount,
      MAX(COALESCE((i.invoice_date::timestamp AT TIME ZONE 'Asia/Kolkata'), i.created_at)) AS last_invoice_at
    FROM app.invoices i
    WHERE i.tenant_id = p_tenant_id
      AND i.deleted_at IS NULL
      AND i.buyer_id IS NOT NULL
      AND i.location_id IS NOT NULL
    GROUP BY i.buyer_id, i.location_id
  ),
  location_keys AS (
    SELECT buyer_id, location_id FROM location_orders
    UNION
    SELECT buyer_id, location_id FROM location_estimates
    UNION
    SELECT buyer_id, location_id FROM location_invoices
  )
  INSERT INTO app.buyers_snapshot (
    tenant_id,
    buyer_id,
    scope,
    location_id,
    is_active,
    is_dormant,
    outstanding_dues,
    overdue_amount,
    credit_limit,
    open_orders_count,
    last_order_at,
    last_activity_at,
    refreshed_at
  )
  SELECT
    p_tenant_id,
    b.buyer_id,
    'tenant',
    NULL,
    COALESCE(b.is_active, false),
    (
      NULLIF(
        GREATEST(
          COALESCE(o.last_order_at, '-infinity'::timestamptz),
          COALESCE(e.last_estimate_at, '-infinity'::timestamptz),
          COALESCE(i.last_invoice_at, '-infinity'::timestamptz)
        ),
        '-infinity'::timestamptz
      ) IS NULL
      OR NULLIF(
        GREATEST(
          COALESCE(o.last_order_at, '-infinity'::timestamptz),
          COALESCE(e.last_estimate_at, '-infinity'::timestamptz),
          COALESCE(i.last_invoice_at, '-infinity'::timestamptz)
        ),
        '-infinity'::timestamptz
      ) < now() - interval '30 days'
    ),
    COALESCE(i.outstanding_dues, 0),
    COALESCE(i.overdue_amount, 0),
    COALESCE(b.credit_limit, 0),
    COALESCE(o.open_orders_count, 0),
    o.last_order_at,
    NULLIF(
      GREATEST(
        COALESCE(o.last_order_at, '-infinity'::timestamptz),
        COALESCE(e.last_estimate_at, '-infinity'::timestamptz),
        COALESCE(i.last_invoice_at, '-infinity'::timestamptz)
      ),
      '-infinity'::timestamptz
    ),
    now()
  FROM base_buyers b
  LEFT JOIN tenant_orders o ON o.buyer_id = b.buyer_id
  LEFT JOIN tenant_estimates e ON e.buyer_id = b.buyer_id
  LEFT JOIN tenant_invoices i ON i.buyer_id = b.buyer_id

  UNION ALL

  SELECT
    p_tenant_id,
    b.buyer_id,
    'location',
    lk.location_id,
    COALESCE(b.is_active, false),
    (
      NULLIF(
        GREATEST(
          COALESCE(lo.last_order_at, '-infinity'::timestamptz),
          COALESCE(le.last_estimate_at, '-infinity'::timestamptz),
          COALESCE(li.last_invoice_at, '-infinity'::timestamptz)
        ),
        '-infinity'::timestamptz
      ) IS NULL
      OR NULLIF(
        GREATEST(
          COALESCE(lo.last_order_at, '-infinity'::timestamptz),
          COALESCE(le.last_estimate_at, '-infinity'::timestamptz),
          COALESCE(li.last_invoice_at, '-infinity'::timestamptz)
        ),
        '-infinity'::timestamptz
      ) < now() - interval '30 days'
    ),
    COALESCE(li.outstanding_dues, 0),
    COALESCE(li.overdue_amount, 0),
    COALESCE(b.credit_limit, 0),
    COALESCE(lo.open_orders_count, 0),
    lo.last_order_at,
    NULLIF(
      GREATEST(
        COALESCE(lo.last_order_at, '-infinity'::timestamptz),
        COALESCE(le.last_estimate_at, '-infinity'::timestamptz),
        COALESCE(li.last_invoice_at, '-infinity'::timestamptz)
      ),
      '-infinity'::timestamptz
    ),
    now()
  FROM base_buyers b
  JOIN location_keys lk
    ON lk.buyer_id = b.buyer_id
  LEFT JOIN location_orders lo
    ON lo.buyer_id = lk.buyer_id
   AND lo.location_id = lk.location_id
  LEFT JOIN location_estimates le
    ON le.buyer_id = lk.buyer_id
   AND le.location_id = lk.location_id
  LEFT JOIN location_invoices li
    ON li.buyer_id = lk.buyer_id
   AND li.location_id = lk.location_id;
END;
$$;

CREATE OR REPLACE FUNCTION app.refresh_locations_snapshot(p_location_id uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = app
AS $$
  INSERT INTO app.locations_snapshot (
    location_id, tenant_id,
    sku_count, oos_sku_count, low_stock_sku_count,
    outstanding_dues, oldest_unpaid_days, invoice_count,
    refreshed_at
  )
  SELECT
    l.id,
    l.tenant_id,
    COUNT(DISTINCT ti.tenant_product_id),
    COUNT(DISTINCT ti.tenant_product_id) FILTER (WHERE ti.qty_available <= 0),
    COUNT(DISTINCT ti.tenant_product_id) FILTER (
      WHERE ti.qty_available > 0
        AND ti.reorder_point IS NOT NULL
        AND ti.qty_available <= ti.reorder_point
    ),
    COALESCE(SUM(inv.outstanding_balance) FILTER (
      WHERE inv.deleted_at IS NULL
        AND app.invoice_status_has_receivable(inv.status, inv.outstanding_balance)
    ), 0),
    MAX(((now() AT TIME ZONE 'Asia/Kolkata')::date - (inv.due_date AT TIME ZONE 'Asia/Kolkata')::date)) FILTER (
      WHERE inv.deleted_at IS NULL
        AND app.invoice_is_overdue(inv.status, inv.due_date, inv.outstanding_balance)
    ),
    COUNT(inv.id) FILTER (
      WHERE inv.deleted_at IS NULL
        AND app.invoice_status_has_receivable(inv.status, inv.outstanding_balance)
    ),
    now()
  FROM app.locations l
  LEFT JOIN app.warehouses wh
    ON wh.location_id = l.id
   AND wh.deleted_at IS NULL
  LEFT JOIN app.tenant_inventory ti
    ON ti.warehouse_id = wh.id
   AND ti.deleted_at IS NULL
  LEFT JOIN app.invoices inv
    ON inv.location_id = l.id
   AND inv.tenant_id = l.tenant_id
  WHERE l.id = p_location_id
  GROUP BY l.id, l.tenant_id
  ON CONFLICT (location_id) DO UPDATE SET
    tenant_id           = EXCLUDED.tenant_id,
    sku_count           = EXCLUDED.sku_count,
    oos_sku_count       = EXCLUDED.oos_sku_count,
    low_stock_sku_count = EXCLUDED.low_stock_sku_count,
    outstanding_dues    = EXCLUDED.outstanding_dues,
    oldest_unpaid_days  = EXCLUDED.oldest_unpaid_days,
    invoice_count       = EXCLUDED.invoice_count,
    refreshed_at        = EXCLUDED.refreshed_at;
$$;

CREATE OR REPLACE FUNCTION app.get_tenant_aggregate_freshness(
  p_tenant_id uuid,
  p_stale_after interval DEFAULT interval '6 hours'
) RETURNS TABLE (
  aggregate_name text,
  aggregate_kind text,
  row_count bigint,
  latest_data_day date,
  refreshed_at timestamp with time zone,
  updated_at timestamp with time zone,
  age interval,
  is_stale boolean
)
LANGUAGE sql
SECURITY DEFINER
SET search_path TO pg_catalog, app
AS $$
  WITH today_ist AS (
    SELECT (now() AT TIME ZONE 'Asia/Kolkata')::date AS day
  ),
  aggregate_stats(
    aggregate_name,
    aggregate_kind,
    row_count,
    latest_data_day,
    refreshed_at,
    updated_at,
    freshness_ts
  ) AS (
    SELECT 'brands_snapshot'::text, 'snapshot'::text, COUNT(*)::bigint, NULL::date, MAX(refreshed_at), NULL::timestamptz, MAX(refreshed_at) FROM app.brands_snapshot WHERE tenant_id = p_tenant_id
    UNION ALL SELECT 'buyer_app_snapshot', 'snapshot', COUNT(*)::bigint, NULL::date, MAX(refreshed_at), NULL::timestamptz, MAX(refreshed_at) FROM app.buyer_app_snapshot WHERE tenant_id = p_tenant_id
    UNION ALL SELECT 'buyer_current_snapshot', 'snapshot', COUNT(*)::bigint, NULL::date, MAX(refreshed_at), MAX(updated_at), GREATEST(MAX(refreshed_at), MAX(updated_at)) FROM app.buyer_current_snapshot WHERE tenant_id = p_tenant_id
    UNION ALL SELECT 'buyers_snapshot', 'snapshot', COUNT(*)::bigint, NULL::date, MAX(refreshed_at), NULL::timestamptz, MAX(refreshed_at) FROM app.buyers_snapshot WHERE tenant_id = p_tenant_id
    UNION ALL SELECT 'categories_snapshot', 'snapshot', COUNT(*)::bigint, NULL::date, MAX(refreshed_at), NULL::timestamptz, MAX(refreshed_at) FROM app.categories_snapshot WHERE tenant_id = p_tenant_id
    UNION ALL SELECT 'estimates_snapshot', 'snapshot', COUNT(*)::bigint, NULL::date, MAX(refreshed_at), NULL::timestamptz, MAX(refreshed_at) FROM app.estimates_snapshot WHERE tenant_id = p_tenant_id
    UNION ALL SELECT 'invoices_snapshot', 'snapshot', COUNT(*)::bigint, NULL::date, MAX(refreshed_at), NULL::timestamptz, MAX(refreshed_at) FROM app.invoices_snapshot WHERE tenant_id = p_tenant_id
    UNION ALL SELECT 'locations_snapshot', 'snapshot', COUNT(*)::bigint, NULL::date, MAX(refreshed_at), NULL::timestamptz, MAX(refreshed_at) FROM app.locations_snapshot WHERE tenant_id = p_tenant_id
    UNION ALL SELECT 'orders_snapshot', 'snapshot', COUNT(*)::bigint, NULL::date, MAX(refreshed_at), NULL::timestamptz, MAX(refreshed_at) FROM app.orders_snapshot WHERE tenant_id = p_tenant_id
    UNION ALL SELECT 'products_snapshot', 'snapshot', COUNT(*)::bigint, NULL::date, MAX(refreshed_at), NULL::timestamptz, MAX(refreshed_at) FROM app.products_snapshot WHERE tenant_id = p_tenant_id
    UNION ALL SELECT 'warehouses_snapshot', 'snapshot', COUNT(*)::bigint, NULL::date, MAX(refreshed_at), NULL::timestamptz, MAX(refreshed_at) FROM app.warehouses_snapshot WHERE tenant_id = p_tenant_id
    UNION ALL SELECT 'kpi_brand_daily', 'daily_kpi', COUNT(*)::bigint, MAX(day), NULL::timestamptz, MAX(updated_at), MAX(updated_at) FROM app.kpi_brand_daily WHERE tenant_id = p_tenant_id
    UNION ALL SELECT 'kpi_buyer_app_daily', 'daily_kpi', COUNT(*)::bigint, MAX(snapshot_date), NULL::timestamptz, NULL::timestamptz, CASE WHEN MAX(snapshot_date) IS NULL THEN NULL::timestamptz ELSE ((MAX(snapshot_date) + 1)::timestamp AT TIME ZONE 'Asia/Kolkata') END FROM app.kpi_buyer_app_daily WHERE tenant_id = p_tenant_id
    UNION ALL SELECT 'kpi_buyers_daily', 'daily_kpi', COUNT(*)::bigint, MAX(day), NULL::timestamptz, MAX(updated_at), MAX(updated_at) FROM app.kpi_buyers_daily WHERE tenant_id = p_tenant_id
    UNION ALL SELECT 'kpi_category_daily', 'daily_kpi', COUNT(*)::bigint, MAX(day), NULL::timestamptz, MAX(updated_at), MAX(updated_at) FROM app.kpi_category_daily WHERE tenant_id = p_tenant_id
    UNION ALL SELECT 'kpi_estimates_daily', 'daily_kpi', COUNT(*)::bigint, MAX(day), NULL::timestamptz, MAX(updated_at), MAX(updated_at) FROM app.kpi_estimates_daily WHERE tenant_id = p_tenant_id
    UNION ALL SELECT 'kpi_invoices_daily', 'daily_kpi', COUNT(*)::bigint, MAX(day), NULL::timestamptz, MAX(updated_at), MAX(updated_at) FROM app.kpi_invoices_daily WHERE tenant_id = p_tenant_id
    UNION ALL SELECT 'kpi_location_daily', 'daily_kpi', COUNT(*)::bigint, MAX(day), NULL::timestamptz, MAX(updated_at), MAX(updated_at) FROM app.kpi_location_daily WHERE tenant_id = p_tenant_id
    UNION ALL SELECT 'kpi_orders_daily', 'daily_kpi', COUNT(*)::bigint, MAX(day), NULL::timestamptz, MAX(updated_at), MAX(updated_at) FROM app.kpi_orders_daily WHERE tenant_id = p_tenant_id
    UNION ALL SELECT 'kpi_product_daily', 'daily_kpi', COUNT(*)::bigint, MAX(day), NULL::timestamptz, MAX(updated_at), MAX(updated_at) FROM app.kpi_product_daily WHERE tenant_id = p_tenant_id
    UNION ALL SELECT 'kpi_tenant_daily', 'daily_kpi', COUNT(*)::bigint, MAX(day), NULL::timestamptz, MAX(updated_at), MAX(updated_at) FROM app.kpi_tenant_daily WHERE tenant_id = p_tenant_id
    UNION ALL SELECT 'kpi_warehouse_daily', 'daily_kpi', COUNT(*)::bigint, MAX(day), NULL::timestamptz, MAX(updated_at), MAX(updated_at) FROM app.kpi_warehouse_daily WHERE tenant_id = p_tenant_id
  )
  SELECT
    stats.aggregate_name,
    stats.aggregate_kind,
    stats.row_count,
    stats.latest_data_day,
    stats.refreshed_at,
    stats.updated_at,
    CASE
      WHEN stats.freshness_ts IS NULL THEN NULL
      ELSE now() - stats.freshness_ts
    END AS age,
    CASE
      WHEN stats.aggregate_kind = 'daily_kpi' AND stats.row_count = 0 THEN false
      WHEN stats.row_count = 0 THEN true
      WHEN stats.freshness_ts IS NULL THEN true
      WHEN stats.aggregate_name = 'kpi_buyer_app_daily'
        THEN COALESCE(stats.latest_data_day < (SELECT day FROM today_ist), true)
      ELSE now() - stats.freshness_ts > p_stale_after
    END AS is_stale
  FROM aggregate_stats stats
  ORDER BY stats.aggregate_kind, stats.aggregate_name;
$$;

CREATE OR REPLACE FUNCTION app._run_metrics_analysis_for_tenant_range(
  p_tenant_id uuid,
  p_start_day date,
  p_end_day date,
  p_stale_after interval DEFAULT interval '6 hours'
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO pg_catalog, app
AS $$
DECLARE
  v_freshness jsonb;
  v_analysis jsonb;
BEGIN
  PERFORM app._metrics_assert_valid_range(p_start_day, p_end_day);

  WITH freshness AS (
    SELECT *
    FROM app.get_tenant_aggregate_freshness(p_tenant_id, p_stale_after)
  ),
  tenant_order_raw AS (
    SELECT
      app.metric_day_ist(o.order_date, o.created_at) AS day,
      COUNT(*)::bigint AS orders_count,
      COUNT(DISTINCT o.buyer_id)::bigint AS buyers_count,
      COALESCE(SUM(COALESCE(o.total_amount, 0)), 0)::numeric AS gmv
    FROM app.orders o
    WHERE o.tenant_id = p_tenant_id
      AND o.deleted_at IS NULL
      AND app.order_status_in_flow(o.status)
      AND app.metric_day_ist(o.order_date, o.created_at) BETWEEN p_start_day AND p_end_day
    GROUP BY app.metric_day_ist(o.order_date, o.created_at)
  ),
  tenant_item_raw AS (
    SELECT
      app.metric_day_ist(o.order_date, o.created_at) AS day,
      COALESCE(SUM(COALESCE(oi.qty, 0)), 0)::bigint AS items_count
    FROM app.orders o
    JOIN app.order_items oi
      ON oi.order_id = o.id
     AND oi.deleted_at IS NULL
    WHERE o.tenant_id = p_tenant_id
      AND o.deleted_at IS NULL
      AND app.order_status_in_flow(o.status)
      AND app.metric_day_ist(o.order_date, o.created_at) BETWEEN p_start_day AND p_end_day
    GROUP BY app.metric_day_ist(o.order_date, o.created_at)
  ),
  tenant_raw AS (
    SELECT
      COALESCE(o.day, i.day) AS day,
      COALESCE(o.orders_count, 0)::bigint AS orders_count,
      COALESCE(o.buyers_count, 0)::bigint AS buyers_count,
      COALESCE(o.gmv, 0)::numeric AS gmv,
      COALESCE(i.items_count, 0)::bigint AS items_count
    FROM tenant_order_raw o
    FULL OUTER JOIN tenant_item_raw i
      ON i.day = o.day
  ),
  tenant_agg AS (
    SELECT
      ktd.day,
      COALESCE(ktd.orders_count, 0)::bigint AS orders_count,
      COALESCE(ktd.buyers_count, 0)::bigint AS buyers_count,
      COALESCE(ktd.gmv, 0)::numeric AS gmv,
      COALESCE(ktd.items_count, 0)::bigint AS items_count
    FROM app.kpi_tenant_daily ktd
    WHERE ktd.tenant_id = p_tenant_id
      AND ktd.day BETWEEN p_start_day AND p_end_day
  ),
  tenant_compare AS (
    SELECT
      COALESCE(raw.day, agg.day) AS day,
      COALESCE(raw.orders_count, 0) AS raw_orders_count,
      COALESCE(agg.orders_count, 0) AS agg_orders_count,
      COALESCE(raw.buyers_count, 0) AS raw_buyers_count,
      COALESCE(agg.buyers_count, 0) AS agg_buyers_count,
      COALESCE(raw.gmv, 0) AS raw_gmv,
      COALESCE(agg.gmv, 0) AS agg_gmv,
      COALESCE(raw.items_count, 0) AS raw_items_count,
      COALESCE(agg.items_count, 0) AS agg_items_count
    FROM tenant_raw raw
    FULL OUTER JOIN tenant_agg agg
      ON agg.day = raw.day
  ),
  estimates_raw AS (
    SELECT
      app.metric_day_ist(e.estimate_date, e.created_at) AS day,
      COUNT(*)::bigint AS estimates_count,
      COUNT(DISTINCT e.buyer_id)::bigint AS buyers_count,
      COALESCE(SUM(COALESCE(e.total_amount, 0)), 0)::numeric AS gmv,
      COUNT(*) FILTER (WHERE app.estimate_status_is_open(e.status))::bigint AS open_count
    FROM app.estimates e
    WHERE e.tenant_id = p_tenant_id
      AND e.deleted_at IS NULL
      AND app.metric_day_ist(e.estimate_date, e.created_at) BETWEEN p_start_day AND p_end_day
    GROUP BY app.metric_day_ist(e.estimate_date, e.created_at)
  ),
  estimates_agg AS (
    SELECT
      ked.day,
      COALESCE(ked.estimates_count, 0)::bigint AS estimates_count,
      COALESCE(ked.buyers_count, 0)::bigint AS buyers_count,
      COALESCE(ked.gmv, 0)::numeric AS gmv,
      COALESCE(ked.open_count, 0)::bigint AS open_count
    FROM app.kpi_estimates_daily ked
    WHERE ked.tenant_id = p_tenant_id
      AND ked.scope = 'tenant'
      AND ked.day BETWEEN p_start_day AND p_end_day
  ),
  estimates_compare AS (
    SELECT
      COALESCE(raw.day, agg.day) AS day,
      COALESCE(raw.estimates_count, 0) AS raw_estimates_count,
      COALESCE(agg.estimates_count, 0) AS agg_estimates_count,
      COALESCE(raw.buyers_count, 0) AS raw_buyers_count,
      COALESCE(agg.buyers_count, 0) AS agg_buyers_count,
      COALESCE(raw.gmv, 0) AS raw_gmv,
      COALESCE(agg.gmv, 0) AS agg_gmv,
      COALESCE(raw.open_count, 0) AS raw_open_count,
      COALESCE(agg.open_count, 0) AS agg_open_count
    FROM estimates_raw raw
    FULL OUTER JOIN estimates_agg agg
      ON agg.day = raw.day
  ),
  orders_raw AS (
    SELECT
      app.metric_day_ist(o.order_date, o.created_at) AS day,
      COUNT(*) FILTER (WHERE app.order_status_in_flow(o.status))::bigint AS orders_count,
      COUNT(DISTINCT o.buyer_id) FILTER (WHERE app.order_status_in_flow(o.status))::bigint AS buyers_count,
      COALESCE(SUM(COALESCE(o.total_amount, 0)) FILTER (WHERE app.order_status_in_flow(o.status)), 0)::numeric AS gmv,
      COUNT(*) FILTER (WHERE app.order_status_is_open(o.status))::bigint AS open_count,
      COUNT(*) FILTER (WHERE o.status = 'draft')::bigint AS draft_count,
      COUNT(*) FILTER (WHERE o.status IN ('open', 'accepted', 'received'))::bigint AS received_count,
      COUNT(*) FILTER (WHERE o.status = 'confirmed')::bigint AS confirmed_count,
      COUNT(*) FILTER (WHERE o.status = 'cancelled')::bigint AS cancelled_count
    FROM app.orders o
    WHERE o.tenant_id = p_tenant_id
      AND o.deleted_at IS NULL
      AND app.metric_day_ist(o.order_date, o.created_at) BETWEEN p_start_day AND p_end_day
    GROUP BY app.metric_day_ist(o.order_date, o.created_at)
  ),
  orders_agg AS (
    SELECT
      kod.day,
      COALESCE(kod.orders_count, 0)::bigint AS orders_count,
      COALESCE(kod.buyers_count, 0)::bigint AS buyers_count,
      COALESCE(kod.gmv, 0)::numeric AS gmv,
      COALESCE(kod.open_count, 0)::bigint AS open_count,
      COALESCE(kod.draft_count, 0)::bigint AS draft_count,
      COALESCE(kod.received_count, 0)::bigint AS received_count,
      COALESCE(kod.confirmed_count, 0)::bigint AS confirmed_count,
      COALESCE(kod.cancelled_count, 0)::bigint AS cancelled_count
    FROM app.kpi_orders_daily kod
    WHERE kod.tenant_id = p_tenant_id
      AND kod.scope = 'tenant'
      AND kod.day BETWEEN p_start_day AND p_end_day
  ),
  orders_compare AS (
    SELECT
      COALESCE(raw.day, agg.day) AS day,
      COALESCE(raw.orders_count, 0) AS raw_orders_count,
      COALESCE(agg.orders_count, 0) AS agg_orders_count,
      COALESCE(raw.buyers_count, 0) AS raw_buyers_count,
      COALESCE(agg.buyers_count, 0) AS agg_buyers_count,
      COALESCE(raw.gmv, 0) AS raw_gmv,
      COALESCE(agg.gmv, 0) AS agg_gmv,
      COALESCE(raw.open_count, 0) AS raw_open_count,
      COALESCE(agg.open_count, 0) AS agg_open_count,
      COALESCE(raw.draft_count, 0) AS raw_draft_count,
      COALESCE(agg.draft_count, 0) AS agg_draft_count,
      COALESCE(raw.received_count, 0) AS raw_received_count,
      COALESCE(agg.received_count, 0) AS agg_received_count,
      COALESCE(raw.confirmed_count, 0) AS raw_confirmed_count,
      COALESCE(agg.confirmed_count, 0) AS agg_confirmed_count,
      COALESCE(raw.cancelled_count, 0) AS raw_cancelled_count,
      COALESCE(agg.cancelled_count, 0) AS agg_cancelled_count
    FROM orders_raw raw
    FULL OUTER JOIN orders_agg agg
      ON agg.day = raw.day
  ),
  invoices_raw AS (
    SELECT
      app.metric_day_ist(i.invoice_date, i.created_at) AS day,
      COUNT(*) FILTER (WHERE app.invoice_status_in_flow(i.status))::bigint AS invoices_count,
      COUNT(DISTINCT i.buyer_id) FILTER (WHERE app.invoice_status_in_flow(i.status))::bigint AS buyers_count,
      COALESCE(SUM(COALESCE(i.total_amount, 0)) FILTER (WHERE app.invoice_status_gmv_included(i.status)), 0)::numeric AS gmv,
      COUNT(*) FILTER (
        WHERE app.invoice_status_has_receivable(i.status, COALESCE(i.outstanding_balance, 0))
      )::bigint AS outstanding_count,
      COALESCE(SUM(COALESCE(i.outstanding_balance, 0)) FILTER (
        WHERE app.invoice_status_has_receivable(i.status, COALESCE(i.outstanding_balance, 0))
      ), 0)::numeric AS outstanding_amount
    FROM app.invoices i
    WHERE i.tenant_id = p_tenant_id
      AND i.deleted_at IS NULL
      AND app.metric_day_ist(i.invoice_date, i.created_at) BETWEEN p_start_day AND p_end_day
    GROUP BY app.metric_day_ist(i.invoice_date, i.created_at)
  ),
  invoices_agg AS (
    SELECT
      kid.day,
      COALESCE(kid.invoices_count, 0)::bigint AS invoices_count,
      COALESCE(kid.buyers_count, 0)::bigint AS buyers_count,
      COALESCE(kid.gmv, 0)::numeric AS gmv,
      COALESCE(kid.outstanding_count, 0)::bigint AS outstanding_count,
      COALESCE(kid.outstanding_amount, 0)::numeric AS outstanding_amount
    FROM app.kpi_invoices_daily kid
    WHERE kid.tenant_id = p_tenant_id
      AND kid.scope = 'tenant'
      AND kid.day BETWEEN p_start_day AND p_end_day
  ),
  invoices_compare AS (
    SELECT
      COALESCE(raw.day, agg.day) AS day,
      COALESCE(raw.invoices_count, 0) AS raw_invoices_count,
      COALESCE(agg.invoices_count, 0) AS agg_invoices_count,
      COALESCE(raw.buyers_count, 0) AS raw_buyers_count,
      COALESCE(agg.buyers_count, 0) AS agg_buyers_count,
      COALESCE(raw.gmv, 0) AS raw_gmv,
      COALESCE(agg.gmv, 0) AS agg_gmv,
      COALESCE(raw.outstanding_count, 0) AS raw_outstanding_count,
      COALESCE(agg.outstanding_count, 0) AS agg_outstanding_count,
      COALESCE(raw.outstanding_amount, 0) AS raw_outstanding_amount,
      COALESCE(agg.outstanding_amount, 0) AS agg_outstanding_amount
    FROM invoices_raw raw
    FULL OUTER JOIN invoices_agg agg
      ON agg.day = raw.day
  ),
  orders_snapshot_raw AS (
    SELECT
      COUNT(*) FILTER (WHERE app.order_status_in_flow(o.status))::bigint AS total_count,
      COUNT(DISTINCT o.buyer_id) FILTER (WHERE app.order_status_in_flow(o.status))::bigint AS buyers_count,
      COALESCE(SUM(COALESCE(o.total_amount, 0)) FILTER (WHERE app.order_status_in_flow(o.status)), 0)::numeric AS total_value,
      COUNT(*) FILTER (WHERE app.order_status_is_open(o.status))::bigint AS open_count
    FROM app.orders o
    WHERE o.tenant_id = p_tenant_id
      AND o.deleted_at IS NULL
  ),
  invoices_snapshot_raw AS (
    SELECT
      COUNT(*) FILTER (WHERE app.invoice_status_in_flow(i.status))::bigint AS total_count,
      COUNT(*) FILTER (
        WHERE app.invoice_status_has_receivable(i.status, COALESCE(i.outstanding_balance, 0))
      )::bigint AS outstanding_count,
      COALESCE(SUM(COALESCE(i.outstanding_balance, 0)) FILTER (
        WHERE app.invoice_status_has_receivable(i.status, COALESCE(i.outstanding_balance, 0))
      ), 0)::numeric AS outstanding_amt,
      COUNT(*) FILTER (
        WHERE app.invoice_is_overdue(i.status, i.due_date, COALESCE(i.outstanding_balance, 0))
      )::bigint AS overdue_count,
      COALESCE(SUM(COALESCE(i.outstanding_balance, 0)) FILTER (
        WHERE app.invoice_is_overdue(i.status, i.due_date, COALESCE(i.outstanding_balance, 0))
      ), 0)::numeric AS overdue_amt
    FROM app.invoices i
    WHERE i.tenant_id = p_tenant_id
      AND i.deleted_at IS NULL
  )
  SELECT
    jsonb_agg(
      jsonb_build_object(
        'aggregate_name', freshness.aggregate_name,
        'aggregate_kind', freshness.aggregate_kind,
        'row_count', freshness.row_count,
        'latest_data_day', freshness.latest_data_day,
        'refreshed_at', freshness.refreshed_at,
        'updated_at', freshness.updated_at,
        'age', freshness.age,
        'is_stale', freshness.is_stale
      )
      ORDER BY freshness.aggregate_kind, freshness.aggregate_name
    ),
    jsonb_build_object(
      'kpi_tenant_daily', (
        SELECT jsonb_build_object(
          'mismatch_days', COUNT(*) FILTER (
            WHERE raw_orders_count <> agg_orders_count
               OR raw_buyers_count <> agg_buyers_count
               OR raw_gmv <> agg_gmv
               OR raw_items_count <> agg_items_count
          ),
          'raw_totals', jsonb_build_object(
            'orders_count', COALESCE(SUM(raw_orders_count), 0),
            'buyers_count', COALESCE(SUM(raw_buyers_count), 0),
            'gmv', COALESCE(SUM(raw_gmv), 0),
            'items_count', COALESCE(SUM(raw_items_count), 0)
          ),
          'aggregate_totals', jsonb_build_object(
            'orders_count', COALESCE(SUM(agg_orders_count), 0),
            'buyers_count', COALESCE(SUM(agg_buyers_count), 0),
            'gmv', COALESCE(SUM(agg_gmv), 0),
            'items_count', COALESCE(SUM(agg_items_count), 0)
          )
        )
        FROM tenant_compare
      ),
      'kpi_estimates_daily', (
        SELECT jsonb_build_object(
          'mismatch_days', COUNT(*) FILTER (
            WHERE raw_estimates_count <> agg_estimates_count
               OR raw_buyers_count <> agg_buyers_count
               OR raw_gmv <> agg_gmv
               OR raw_open_count <> agg_open_count
          ),
          'raw_totals', jsonb_build_object(
            'estimates_count', COALESCE(SUM(raw_estimates_count), 0),
            'buyers_count', COALESCE(SUM(raw_buyers_count), 0),
            'gmv', COALESCE(SUM(raw_gmv), 0),
            'open_count', COALESCE(SUM(raw_open_count), 0)
          ),
          'aggregate_totals', jsonb_build_object(
            'estimates_count', COALESCE(SUM(agg_estimates_count), 0),
            'buyers_count', COALESCE(SUM(agg_buyers_count), 0),
            'gmv', COALESCE(SUM(agg_gmv), 0),
            'open_count', COALESCE(SUM(agg_open_count), 0)
          )
        )
        FROM estimates_compare
      ),
      'kpi_orders_daily', (
        SELECT jsonb_build_object(
          'mismatch_days', COUNT(*) FILTER (
            WHERE raw_orders_count <> agg_orders_count
               OR raw_buyers_count <> agg_buyers_count
               OR raw_gmv <> agg_gmv
               OR raw_open_count <> agg_open_count
               OR raw_draft_count <> agg_draft_count
               OR raw_received_count <> agg_received_count
               OR raw_confirmed_count <> agg_confirmed_count
               OR raw_cancelled_count <> agg_cancelled_count
          ),
          'raw_totals', jsonb_build_object(
            'orders_count', COALESCE(SUM(raw_orders_count), 0),
            'buyers_count', COALESCE(SUM(raw_buyers_count), 0),
            'gmv', COALESCE(SUM(raw_gmv), 0),
            'open_count', COALESCE(SUM(raw_open_count), 0),
            'draft_count', COALESCE(SUM(raw_draft_count), 0),
            'received_count', COALESCE(SUM(raw_received_count), 0),
            'confirmed_count', COALESCE(SUM(raw_confirmed_count), 0),
            'cancelled_count', COALESCE(SUM(raw_cancelled_count), 0)
          ),
          'aggregate_totals', jsonb_build_object(
            'orders_count', COALESCE(SUM(agg_orders_count), 0),
            'buyers_count', COALESCE(SUM(agg_buyers_count), 0),
            'gmv', COALESCE(SUM(agg_gmv), 0),
            'open_count', COALESCE(SUM(agg_open_count), 0),
            'draft_count', COALESCE(SUM(agg_draft_count), 0),
            'received_count', COALESCE(SUM(agg_received_count), 0),
            'confirmed_count', COALESCE(SUM(agg_confirmed_count), 0),
            'cancelled_count', COALESCE(SUM(agg_cancelled_count), 0)
          )
        )
        FROM orders_compare
      ),
      'kpi_invoices_daily', (
        SELECT jsonb_build_object(
          'mismatch_days', COUNT(*) FILTER (
            WHERE raw_invoices_count <> agg_invoices_count
               OR raw_buyers_count <> agg_buyers_count
               OR raw_gmv <> agg_gmv
               OR raw_outstanding_count <> agg_outstanding_count
               OR raw_outstanding_amount <> agg_outstanding_amount
          ),
          'raw_totals', jsonb_build_object(
            'invoices_count', COALESCE(SUM(raw_invoices_count), 0),
            'buyers_count', COALESCE(SUM(raw_buyers_count), 0),
            'gmv', COALESCE(SUM(raw_gmv), 0),
            'outstanding_count', COALESCE(SUM(raw_outstanding_count), 0),
            'outstanding_amount', COALESCE(SUM(raw_outstanding_amount), 0)
          ),
          'aggregate_totals', jsonb_build_object(
            'invoices_count', COALESCE(SUM(agg_invoices_count), 0),
            'buyers_count', COALESCE(SUM(agg_buyers_count), 0),
            'gmv', COALESCE(SUM(agg_gmv), 0),
            'outstanding_count', COALESCE(SUM(agg_outstanding_count), 0),
            'outstanding_amount', COALESCE(SUM(agg_outstanding_amount), 0)
          )
        )
        FROM invoices_compare
      ),
      'orders_snapshot', (
        SELECT jsonb_build_object(
          'raw', jsonb_build_object(
            'total_count', raw.total_count,
            'buyers_count', raw.buyers_count,
            'total_value', raw.total_value,
            'open_count', raw.open_count
          ),
          'aggregate', jsonb_build_object(
            'total_count', COALESCE(os.total_count, 0),
            'buyers_count', COALESCE(os.buyers_count, 0),
            'total_value', COALESCE(os.total_value, 0),
            'open_count', COALESCE(os.open_count, 0)
          )
        )
        FROM orders_snapshot_raw raw
        LEFT JOIN app.orders_snapshot os
          ON os.tenant_id = p_tenant_id
      ),
      'invoices_snapshot', (
        SELECT jsonb_build_object(
          'raw', jsonb_build_object(
            'total_count', raw.total_count,
            'outstanding_count', raw.outstanding_count,
            'outstanding_amt', raw.outstanding_amt,
            'overdue_count', raw.overdue_count,
            'overdue_amt', raw.overdue_amt
          ),
          'aggregate', jsonb_build_object(
            'total_count', COALESCE(isn.total_count, 0),
            'outstanding_count', COALESCE(isn.outstanding_count, 0),
            'outstanding_amt', COALESCE(isn.outstanding_amt, 0),
            'overdue_count', COALESCE(isn.overdue_count, 0),
            'overdue_amt', COALESCE(isn.overdue_amt, 0)
          )
        )
        FROM invoices_snapshot_raw raw
        LEFT JOIN app.invoices_snapshot isn
          ON isn.tenant_id = p_tenant_id
      )
    )
  INTO v_freshness, v_analysis
  FROM freshness;

  RETURN jsonb_build_object(
    'tenant_id', p_tenant_id,
    'start_day', p_start_day,
    'end_day', p_end_day,
    'analyzed_at', now(),
    'freshness', COALESCE(v_freshness, '[]'::jsonb),
    'comparisons', COALESCE(v_analysis, '{}'::jsonb)
  );
END;
$$;

DROP FUNCTION IF EXISTS app.rebuild_kpi_aggregates_for_recent_days(integer);
DROP FUNCTION IF EXISTS app.rebuild_kpi_brand_daily_recent(integer);
DROP FUNCTION IF EXISTS app.rebuild_kpi_category_daily_recent(integer);

DROP FUNCTION IF EXISTS app.get_buyer_home_summary(uuid, uuid, timestamp with time zone);

CREATE FUNCTION app.get_buyer_home_summary(
  p_tenant_id uuid,
  p_buyer_id uuid,
  p_as_of timestamp with time zone DEFAULT now()
) RETURNS TABLE (
  gmv_mtd numeric,
  gmv_ytd numeric,
  invoice_count_ytd bigint,
  trend_vs_last_month_pct integer,
  outstanding_dues numeric,
  open_invoice_count bigint,
  earliest_due_date timestamp with time zone,
  days_until_earliest_due integer,
  credit_limit numeric,
  available_credit numeric,
  credit_used numeric,
  open_orders_count bigint,
  refreshed_at timestamp with time zone
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
      COALESCE(SUM(k.invoices_gmv) FILTER (
        WHERE k.day BETWEEN pb.year_start_ist AND pb.today_ist
      ), 0) AS gmv_ytd,
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
    rollup.gmv_ytd,
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
