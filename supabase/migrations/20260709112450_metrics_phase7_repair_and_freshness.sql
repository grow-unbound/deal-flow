CREATE OR REPLACE FUNCTION app._metrics_assert_valid_range(
  p_start_day date,
  p_end_day date
) RETURNS void
LANGUAGE plpgsql
SET search_path TO pg_catalog, app
AS $$
BEGIN
  IF p_start_day IS NULL OR p_end_day IS NULL THEN
    RAISE EXCEPTION 'metric rebuild range requires both start and end day'
      USING ERRCODE = '22023';
  END IF;

  IF p_start_day > p_end_day THEN
    RAISE EXCEPTION 'metric rebuild range start day % is after end day %', p_start_day, p_end_day
      USING ERRCODE = '22023';
  END IF;

  IF p_end_day > (now() AT TIME ZONE 'Asia/Kolkata')::date THEN
    RAISE EXCEPTION 'metric rebuild range end day % cannot be in the future', p_end_day
      USING ERRCODE = '22023';
  END IF;
END;
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
  aggregate_stats AS (
    SELECT
      'brands_snapshot'::text AS aggregate_name,
      'snapshot'::text AS aggregate_kind,
      COUNT(*)::bigint AS row_count,
      NULL::date AS latest_data_day,
      MAX(bs.refreshed_at) AS refreshed_at,
      NULL::timestamptz AS updated_at,
      MAX(bs.refreshed_at) AS freshness_ts
    FROM app.brands_snapshot bs
    WHERE bs.tenant_id = p_tenant_id

    UNION ALL

    SELECT
      'buyer_app_snapshot',
      'snapshot',
      COUNT(*)::bigint,
      NULL::date,
      MAX(bas.refreshed_at),
      NULL::timestamptz,
      MAX(bas.refreshed_at)
    FROM app.buyer_app_snapshot bas
    WHERE bas.tenant_id = p_tenant_id

    UNION ALL

    SELECT
      'buyer_current_snapshot',
      'snapshot',
      COUNT(*)::bigint,
      NULL::date,
      MAX(bcs.refreshed_at),
      MAX(bcs.updated_at),
      GREATEST(MAX(bcs.refreshed_at), MAX(bcs.updated_at))
    FROM app.buyer_current_snapshot bcs
    WHERE bcs.tenant_id = p_tenant_id

    UNION ALL

    SELECT
      'buyers_snapshot',
      'snapshot',
      COUNT(*)::bigint,
      NULL::date,
      MAX(bs.refreshed_at),
      NULL::timestamptz,
      MAX(bs.refreshed_at)
    FROM app.buyers_snapshot bs
    WHERE bs.tenant_id = p_tenant_id

    UNION ALL

    SELECT
      'categories_snapshot',
      'snapshot',
      COUNT(*)::bigint,
      NULL::date,
      MAX(cs.refreshed_at),
      NULL::timestamptz,
      MAX(cs.refreshed_at)
    FROM app.categories_snapshot cs
    WHERE cs.tenant_id = p_tenant_id

    UNION ALL

    SELECT
      'estimates_snapshot',
      'snapshot',
      COUNT(*)::bigint,
      NULL::date,
      MAX(es.refreshed_at),
      NULL::timestamptz,
      MAX(es.refreshed_at)
    FROM app.estimates_snapshot es
    WHERE es.tenant_id = p_tenant_id

    UNION ALL

    SELECT
      'invoices_snapshot',
      'snapshot',
      COUNT(*)::bigint,
      NULL::date,
      MAX(isn.refreshed_at),
      NULL::timestamptz,
      MAX(isn.refreshed_at)
    FROM app.invoices_snapshot isn
    WHERE isn.tenant_id = p_tenant_id

    UNION ALL

    SELECT
      'locations_snapshot',
      'snapshot',
      COUNT(*)::bigint,
      NULL::date,
      MAX(ls.refreshed_at),
      NULL::timestamptz,
      MAX(ls.refreshed_at)
    FROM app.locations_snapshot ls
    WHERE ls.tenant_id = p_tenant_id

    UNION ALL

    SELECT
      'orders_snapshot',
      'snapshot',
      COUNT(*)::bigint,
      NULL::date,
      MAX(os.refreshed_at),
      NULL::timestamptz,
      MAX(os.refreshed_at)
    FROM app.orders_snapshot os
    WHERE os.tenant_id = p_tenant_id

    UNION ALL

    SELECT
      'products_snapshot',
      'snapshot',
      COUNT(*)::bigint,
      NULL::date,
      MAX(ps.refreshed_at),
      NULL::timestamptz,
      MAX(ps.refreshed_at)
    FROM app.products_snapshot ps
    WHERE ps.tenant_id = p_tenant_id

    UNION ALL

    SELECT
      'warehouses_snapshot',
      'snapshot',
      COUNT(*)::bigint,
      NULL::date,
      MAX(ws.refreshed_at),
      NULL::timestamptz,
      MAX(ws.refreshed_at)
    FROM app.warehouses_snapshot ws
    WHERE ws.tenant_id = p_tenant_id

    UNION ALL

    SELECT
      'kpi_brand_daily',
      'daily_kpi',
      COUNT(*)::bigint,
      MAX(kbd.day),
      NULL::timestamptz,
      MAX(kbd.updated_at),
      MAX(kbd.updated_at)
    FROM app.kpi_brand_daily kbd
    WHERE kbd.tenant_id = p_tenant_id

    UNION ALL

    SELECT
      'kpi_buyer_app_daily',
      'daily_kpi',
      COUNT(*)::bigint,
      MAX(kbad.snapshot_date),
      NULL::timestamptz,
      NULL::timestamptz,
      CASE
        WHEN MAX(kbad.snapshot_date) IS NULL THEN NULL::timestamptz
        ELSE ((MAX(kbad.snapshot_date) + 1)::timestamp AT TIME ZONE 'Asia/Kolkata')
      END
    FROM app.kpi_buyer_app_daily kbad
    WHERE kbad.tenant_id = p_tenant_id

    UNION ALL

    SELECT
      'kpi_buyers_daily',
      'daily_kpi',
      COUNT(*)::bigint,
      MAX(kbuy.day),
      NULL::timestamptz,
      MAX(kbuy.updated_at),
      MAX(kbuy.updated_at)
    FROM app.kpi_buyers_daily kbuy
    WHERE kbuy.tenant_id = p_tenant_id

    UNION ALL

    SELECT
      'kpi_category_daily',
      'daily_kpi',
      COUNT(*)::bigint,
      MAX(kcd.day),
      NULL::timestamptz,
      MAX(kcd.updated_at),
      MAX(kcd.updated_at)
    FROM app.kpi_category_daily kcd
    WHERE kcd.tenant_id = p_tenant_id

    UNION ALL

    SELECT
      'kpi_estimates_daily',
      'daily_kpi',
      COUNT(*)::bigint,
      MAX(ked.day),
      NULL::timestamptz,
      MAX(ked.updated_at),
      MAX(ked.updated_at)
    FROM app.kpi_estimates_daily ked
    WHERE ked.tenant_id = p_tenant_id

    UNION ALL

    SELECT
      'kpi_invoices_daily',
      'daily_kpi',
      COUNT(*)::bigint,
      MAX(kid.day),
      NULL::timestamptz,
      MAX(kid.updated_at),
      MAX(kid.updated_at)
    FROM app.kpi_invoices_daily kid
    WHERE kid.tenant_id = p_tenant_id

    UNION ALL

    SELECT
      'kpi_location_daily',
      'daily_kpi',
      COUNT(*)::bigint,
      MAX(kld.day),
      NULL::timestamptz,
      MAX(kld.updated_at),
      MAX(kld.updated_at)
    FROM app.kpi_location_daily kld
    WHERE kld.tenant_id = p_tenant_id

    UNION ALL

    SELECT
      'kpi_orders_daily',
      'daily_kpi',
      COUNT(*)::bigint,
      MAX(kod.day),
      NULL::timestamptz,
      MAX(kod.updated_at),
      MAX(kod.updated_at)
    FROM app.kpi_orders_daily kod
    WHERE kod.tenant_id = p_tenant_id

    UNION ALL

    SELECT
      'kpi_product_daily',
      'daily_kpi',
      COUNT(*)::bigint,
      MAX(kpd.day),
      NULL::timestamptz,
      MAX(kpd.updated_at),
      MAX(kpd.updated_at)
    FROM app.kpi_product_daily kpd
    WHERE kpd.tenant_id = p_tenant_id

    UNION ALL

    SELECT
      'kpi_tenant_daily',
      'daily_kpi',
      COUNT(*)::bigint,
      MAX(ktd.day),
      NULL::timestamptz,
      MAX(ktd.updated_at),
      MAX(ktd.updated_at)
    FROM app.kpi_tenant_daily ktd
    WHERE ktd.tenant_id = p_tenant_id

    UNION ALL

    SELECT
      'kpi_warehouse_daily',
      'daily_kpi',
      COUNT(*)::bigint,
      MAX(kwd.day),
      NULL::timestamptz,
      MAX(kwd.updated_at),
      MAX(kwd.updated_at)
    FROM app.kpi_warehouse_daily kwd
    WHERE kwd.tenant_id = p_tenant_id
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
  tenant_raw AS (
    SELECT
      app.metric_day_ist(o.order_date, o.created_at) AS day,
      COUNT(DISTINCT o.id)::bigint AS orders_count,
      COUNT(DISTINCT o.buyer_id)::bigint AS buyers_count,
      COALESCE(SUM(COALESCE(o.total_amount, 0)), 0)::numeric AS gmv,
      COALESCE(SUM(COALESCE(oi.qty, 0)), 0)::bigint AS items_count
    FROM app.orders o
    LEFT JOIN app.order_items oi
      ON oi.order_id = o.id
     AND oi.deleted_at IS NULL
    WHERE o.tenant_id = p_tenant_id
      AND o.deleted_at IS NULL
      AND app.order_status_in_flow(o.status)
      AND app.metric_day_ist(o.order_date, o.created_at) BETWEEN p_start_day AND p_end_day
    GROUP BY app.metric_day_ist(o.order_date, o.created_at)
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


CREATE OR REPLACE FUNCTION app.run_metrics_analysis_for_tenant(
  p_tenant_id uuid,
  p_days integer DEFAULT 90
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO pg_catalog, app
AS $$
DECLARE
  v_today_ist date := (now() AT TIME ZONE 'Asia/Kolkata')::date;
  v_days integer := GREATEST(COALESCE(p_days, 90), 1);
  v_start_day date := v_today_ist - (v_days - 1);
BEGIN
  RETURN app._run_metrics_analysis_for_tenant_range(
    p_tenant_id,
    v_start_day,
    v_today_ist
  );
END;
$$;


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


COMMENT ON FUNCTION app.get_tenant_aggregate_freshness(uuid, interval)
  IS 'Returns current snapshot/KPI freshness for a tenant using refreshed_at or updated_at ownership metadata.';

COMMENT ON FUNCTION app._run_metrics_analysis_for_tenant_range(uuid, date, date, interval)
  IS 'Internal Phase 7 reconciliation helper for comparing core tenant aggregates against raw transactional sources over a bounded IST date range.';

COMMENT ON FUNCTION app.run_metrics_analysis_for_tenant(uuid, integer)
  IS 'Manual operator analysis entrypoint for rebuilding aggregate comparisons from currently available tenant data over the requested IST day window.';

COMMENT ON FUNCTION app.rebuild_metrics_for_tenant_range(uuid, date, date, boolean, boolean)
  IS 'Operator repair entrypoint for rebuilding tenant metric aggregates over an explicit IST date range.';


REVOKE ALL ON FUNCTION app.get_tenant_aggregate_freshness(uuid, interval) FROM PUBLIC;
REVOKE ALL ON FUNCTION app._run_metrics_analysis_for_tenant_range(uuid, date, date, interval) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.run_metrics_analysis_for_tenant(uuid, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.rebuild_metrics_for_tenant_range(uuid, date, date, boolean, boolean) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION app.get_tenant_aggregate_freshness(uuid, interval) TO service_role;
GRANT EXECUTE ON FUNCTION app.run_metrics_analysis_for_tenant(uuid, integer) TO service_role;
GRANT EXECUTE ON FUNCTION app.rebuild_metrics_for_tenant_range(uuid, date, date, boolean, boolean) TO service_role;
