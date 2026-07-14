CREATE OR REPLACE FUNCTION app.search_seller_location_landing_ids(
  p_tenant_id uuid,
  p_query text DEFAULT NULL,
  p_statuses text[] DEFAULT NULL,
  p_stock_modes text[] DEFAULT NULL,
  p_dues_modes text[] DEFAULT NULL,
  p_location_ids uuid[] DEFAULT NULL,
  p_limit integer DEFAULT 50,
  p_offset integer DEFAULT 0
)
RETURNS TABLE(id uuid, total_count bigint)
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = pg_catalog, app
SET statement_timeout = '10s'
SET lock_timeout = '2s'
AS $$
DECLARE
  v_query text := NULLIF(btrim(p_query), '');
  v_ts_query tsquery;
  v_prefix_ts_query tsquery;
  v_prefix_text text;
  v_statuses text[] := ARRAY(SELECT lower(btrim(value)) FROM unnest(COALESCE(p_statuses, ARRAY[]::text[])) AS value WHERE lower(btrim(value)) IN ('active', 'inactive'));
  v_stock text[] := COALESCE(p_stock_modes, ARRAY[]::text[]);
  v_dues text[] := COALESCE(p_dues_modes, ARRAY[]::text[]);
  v_limit integer := LEAST(GREATEST(COALESCE(p_limit, 50), 1), 100);
  v_offset integer := LEAST(GREATEST(COALESCE(p_offset, 0), 0), 10000);
BEGIN
  IF p_tenant_id IS NULL THEN RAISE EXCEPTION 'p_tenant_id is required'; END IF;
  IF v_query IS NOT NULL THEN
    v_ts_query := websearch_to_tsquery('english', v_query);
    SELECT string_agg(quote_literal(lexeme) || ':*', ' & ' ORDER BY lexeme)
    INTO v_prefix_text FROM unnest(tsvector_to_array(to_tsvector('english', v_query))) AS terms(lexeme);
    IF v_prefix_text IS NOT NULL THEN v_prefix_ts_query := to_tsquery('english', v_prefix_text); END IF;
  END IF;

  RETURN QUERY
  WITH candidates AS MATERIALIZED (
    SELECT
      l.id,
      CASE WHEN v_query IS NULL THEN 0::real ELSE GREATEST(
        ts_rank_cd(l.search_vector, v_ts_query), COALESCE(ts_rank_cd(l.search_vector, v_prefix_ts_query), 0)
      ) END AS search_rank,
      l.created_at
    FROM app.locations l
    LEFT JOIN app.locations_snapshot ls ON ls.location_id = l.id AND ls.tenant_id = p_tenant_id
    WHERE l.tenant_id = p_tenant_id
      AND l.deleted_at IS NULL
      AND (p_location_ids IS NULL OR l.id = ANY(p_location_ids))
      AND (cardinality(v_statuses) = 0 OR lower(COALESCE(l.status, 'active')) = ANY(v_statuses))
      AND (v_query IS NULL OR l.search_vector @@ v_ts_query OR l.search_vector @@ v_prefix_ts_query)
      AND (
        cardinality(v_stock) = 0 OR cardinality(v_stock) >= 3
        OR ('In Stock' = ANY(v_stock) AND COALESCE(ls.oos_sku_count, 0) = 0 AND COALESCE(ls.low_stock_sku_count, 0) = 0)
        OR ('Low Stock' = ANY(v_stock) AND COALESCE(ls.oos_sku_count, 0) = 0 AND COALESCE(ls.low_stock_sku_count, 0) > 0)
        OR ('Out of Stock' = ANY(v_stock) AND COALESCE(ls.oos_sku_count, 0) > 0)
      )
      AND (
        cardinality(v_dues) = 0
        OR ('Due' = ANY(v_dues) AND COALESCE(ls.outstanding_dues, 0) > 0)
        OR ('Overdue' = ANY(v_dues) AND COALESCE(ls.outstanding_dues, 0) > 0 AND COALESCE(ls.oldest_unpaid_days, 0) > 30)
      )
  ), totals AS MATERIALIZED (
    SELECT count(*) AS total_count FROM candidates
  ), page AS MATERIALIZED (
    SELECT candidates.id, candidates.search_rank, candidates.created_at
    FROM candidates
    ORDER BY candidates.search_rank DESC, candidates.created_at, candidates.id
    LIMIT v_limit OFFSET v_offset
  )
  SELECT page.id, totals.total_count
  FROM totals
  LEFT JOIN page ON true
  ORDER BY page.search_rank DESC, page.created_at, page.id;
END;
$$;

CREATE OR REPLACE FUNCTION app.get_seller_location_landing_row_metrics(
  p_tenant_id uuid,
  p_location_ids uuid[],
  p_current_start date,
  p_current_end_exclusive date,
  p_previous_start date,
  p_previous_end_exclusive date
)
RETURNS TABLE(
  location_id uuid,
  sku_count bigint,
  oos_sku_count bigint,
  low_stock_sku_count bigint,
  outstanding_dues numeric,
  oldest_unpaid_days integer,
  gmv_current numeric,
  gmv_previous numeric,
  active_buyers bigint
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = pg_catalog, app
SET statement_timeout = '10s'
AS $$
  WITH requested AS MATERIALIZED (
    SELECT l.id
    FROM app.locations l
    WHERE l.tenant_id = p_tenant_id
      AND l.deleted_at IS NULL
      AND l.id = ANY(COALESCE(p_location_ids, ARRAY[]::uuid[]))
    LIMIT 100
  ), location_kpis AS (
    SELECT
      k.location_id,
      COALESCE(sum(k.gmv) FILTER (WHERE k.day >= p_current_start AND k.day < p_current_end_exclusive), 0) AS gmv_current,
      COALESCE(sum(k.gmv) FILTER (WHERE k.day >= p_previous_start AND k.day < p_previous_end_exclusive), 0) AS gmv_previous
    FROM app.kpi_location_daily k
    JOIN requested r ON r.id = k.location_id
    WHERE k.tenant_id = p_tenant_id
      AND k.day >= LEAST(p_current_start, p_previous_start)
      AND k.day < GREATEST(p_current_end_exclusive, p_previous_end_exclusive)
    GROUP BY k.location_id
  ), activity AS (
    SELECT activity_rows.location_id, count(DISTINCT activity_rows.buyer_id)::bigint AS active_buyers
    FROM (
      SELECT o.location_id, o.buyer_id
      FROM app.orders o JOIN requested r ON r.id = o.location_id
      WHERE o.tenant_id = p_tenant_id AND o.deleted_at IS NULL
        AND app.metric_day_ist(o.order_date, o.created_at) >= p_current_start
        AND app.metric_day_ist(o.order_date, o.created_at) < p_current_end_exclusive
      UNION ALL
      SELECT e.location_id, e.buyer_id
      FROM app.estimates e JOIN requested r ON r.id = e.location_id
      WHERE e.tenant_id = p_tenant_id AND e.deleted_at IS NULL
        AND app.metric_day_ist(e.estimate_date, e.created_at) >= p_current_start
        AND app.metric_day_ist(e.estimate_date, e.created_at) < p_current_end_exclusive
      UNION ALL
      SELECT i.location_id, i.buyer_id
      FROM app.invoices i JOIN requested r ON r.id = i.location_id
      WHERE i.tenant_id = p_tenant_id AND i.deleted_at IS NULL
        AND app.metric_day_ist(i.invoice_date, i.created_at) >= p_current_start
        AND app.metric_day_ist(i.invoice_date, i.created_at) < p_current_end_exclusive
    ) activity_rows
    WHERE activity_rows.buyer_id IS NOT NULL
    GROUP BY activity_rows.location_id
  )
  SELECT
    r.id,
    COALESCE(ls.sku_count, 0),
    COALESCE(ls.oos_sku_count, 0),
    COALESCE(ls.low_stock_sku_count, 0),
    COALESCE(ls.outstanding_dues, 0),
    ls.oldest_unpaid_days,
    COALESCE(k.gmv_current, 0),
    COALESCE(k.gmv_previous, 0),
    COALESCE(a.active_buyers, 0)
  FROM requested r
  LEFT JOIN app.locations_snapshot ls ON ls.tenant_id = p_tenant_id AND ls.location_id = r.id
  LEFT JOIN location_kpis k ON k.location_id = r.id
  LEFT JOIN activity a ON a.location_id = r.id;
$$;

CREATE OR REPLACE FUNCTION app.get_seller_locations_landing_summary(
  p_tenant_id uuid,
  p_location_ids uuid[],
  p_current_start date,
  p_current_end_exclusive date,
  p_today date,
  p_expiry_end date
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = pg_catalog, app
SET statement_timeout = '10s'
AS $$
  WITH scoped_locations AS MATERIALIZED (
    SELECT l.id, l.name, l.address
    FROM app.locations l
    WHERE l.tenant_id = p_tenant_id
      AND l.deleted_at IS NULL
      AND (p_location_ids IS NULL OR l.id = ANY(p_location_ids))
  ), location_rollup AS MATERIALIZED (
    SELECT
      l.id,
      l.name,
      COALESCE(l.address ->> 'city', '') AS city,
      COALESCE(ls.outstanding_dues, 0) AS outstanding_dues,
      ls.oldest_unpaid_days,
      COALESCE(ls.invoice_count, 0) AS unpaid_invoice_count,
      COALESCE(ls.oos_sku_count, 0) AS oos_sku_count,
      COALESCE(ls.low_stock_sku_count, 0) AS low_stock_sku_count,
      COALESCE(sum(k.gmv), 0) AS gmv,
      COALESCE(sum(k.orders_count), 0) AS orders_count
    FROM scoped_locations l
    LEFT JOIN app.locations_snapshot ls ON ls.tenant_id = p_tenant_id AND ls.location_id = l.id
    LEFT JOIN app.kpi_location_daily k ON k.tenant_id = p_tenant_id AND k.location_id = l.id
      AND k.day >= p_current_start AND k.day < p_current_end_exclusive
    GROUP BY l.id, l.name, l.address, ls.outstanding_dues, ls.oldest_unpaid_days,
      ls.invoice_count, ls.oos_sku_count, ls.low_stock_sku_count
  ), top_locations AS MATERIALIZED (
    SELECT lr.*
    FROM location_rollup lr
    WHERE lr.orders_count > 0
    ORDER BY lr.gmv DESC, lr.id
    LIMIT 2
  ), top_buyers AS (
    SELECT activity.location_id, count(DISTINCT activity.buyer_id)::bigint AS buyers_count
    FROM (
      SELECT o.location_id, o.buyer_id FROM app.orders o JOIN top_locations t ON t.id = o.location_id
      WHERE o.tenant_id = p_tenant_id AND o.deleted_at IS NULL
        AND app.metric_day_ist(o.order_date, o.created_at) >= p_current_start
        AND app.metric_day_ist(o.order_date, o.created_at) < p_current_end_exclusive
      UNION ALL
      SELECT e.location_id, e.buyer_id FROM app.estimates e JOIN top_locations t ON t.id = e.location_id
      WHERE e.tenant_id = p_tenant_id AND e.deleted_at IS NULL
        AND app.metric_day_ist(e.estimate_date, e.created_at) >= p_current_start
        AND app.metric_day_ist(e.estimate_date, e.created_at) < p_current_end_exclusive
      UNION ALL
      SELECT i.location_id, i.buyer_id FROM app.invoices i JOIN top_locations t ON t.id = i.location_id
      WHERE i.tenant_id = p_tenant_id AND i.deleted_at IS NULL
        AND app.metric_day_ist(i.invoice_date, i.created_at) >= p_current_start
        AND app.metric_day_ist(i.invoice_date, i.created_at) < p_current_end_exclusive
    ) activity
    WHERE activity.buyer_id IS NOT NULL
    GROUP BY activity.location_id
  ), estimate_kpis AS (
    SELECT
      COALESCE(sum(k.estimates_count), 0)::bigint AS total_count,
      COALESCE(sum(k.open_count), 0)::bigint AS open_count
    FROM app.kpi_estimates_daily k
    WHERE k.tenant_id = p_tenant_id
      AND k.scope = 'location'
      AND k.location_id IN (SELECT id FROM scoped_locations)
      AND k.day >= p_current_start AND k.day < p_current_end_exclusive
  ), invoice_total AS (
    SELECT count(*)::bigint AS total_count
    FROM app.invoices i
    WHERE i.tenant_id = p_tenant_id
      AND i.deleted_at IS NULL
      AND i.location_id IN (SELECT id FROM scoped_locations)
  ), conversion_rows AS (
    SELECT e.id, e.estimate_number, e.total_amount, e.expires_at, b.business_name
    FROM app.estimates e
    JOIN scoped_locations l ON l.id = e.location_id
    LEFT JOIN app.buyers b ON b.tenant_id = p_tenant_id AND b.id = e.buyer_id
    WHERE e.tenant_id = p_tenant_id
      AND e.deleted_at IS NULL
      AND e.expires_at >= p_today
      AND e.expires_at <= p_expiry_end
      AND app.estimate_status_is_open(e.status)
    ORDER BY e.expires_at, e.id
    LIMIT 3
  ), totals AS (
    SELECT
      count(*) FILTER (WHERE EXISTS (
        SELECT 1 FROM app.locations active_location
        WHERE active_location.id = location_rollup.id
          AND active_location.tenant_id = p_tenant_id
          AND lower(COALESCE(active_location.status, 'active')) = 'active'
      ))::bigint AS active_locations,
      COALESCE(sum(unpaid_invoice_count), 0)::bigint AS unpaid_invoice_count,
      COALESCE(sum(outstanding_dues), 0) AS outstanding_dues_total,
      count(*) FILTER (WHERE outstanding_dues > 0)::bigint AS dues_location_count,
      COALESCE(sum(gmv), 0) AS total_gmv
    FROM location_rollup
  ), top_one AS (
    SELECT name, gmv FROM location_rollup ORDER BY gmv DESC, id LIMIT 1
  )
  SELECT jsonb_build_object(
    'kpis', jsonb_build_object(
      'active_locations', totals.active_locations,
      'unpaid_invoice_count', totals.unpaid_invoice_count,
      'total_invoice_count', invoice_total.total_count,
      'outstanding_dues_total', totals.outstanding_dues_total,
      'dues_location_count', totals.dues_location_count,
      'open_estimate_count', estimate_kpis.open_count,
      'total_estimate_count', estimate_kpis.total_count,
      'top_location_name', top_one.name,
      'top_location_gmv_share_pct', CASE WHEN totals.total_gmv > 0 THEN round((top_one.gmv / totals.total_gmv) * 100) ELSE 0 END
    ),
    'callouts', jsonb_build_object(
      'conversions', COALESCE((SELECT jsonb_agg(jsonb_build_object(
        'id', c.id, 'name', COALESCE(c.business_name, 'Unknown buyer'), 'city', '',
        'initials', upper(left(regexp_replace(COALESCE(c.business_name, 'Unknown buyer'), '[^[:alnum:]]', '', 'g'), 2)),
        'estimate_number', c.estimate_number, 'expires_in_days', GREATEST((c.expires_at::date - p_today), 0),
        'total_amount', COALESCE(c.total_amount, 0)
      ) ORDER BY c.expires_at, c.id) FROM conversion_rows c), '[]'::jsonb),
      'top_locations', COALESCE((SELECT jsonb_agg(jsonb_build_object(
        'id', t.id, 'name', t.name, 'city', t.city,
        'initials', upper(left(regexp_replace(t.name, '[^[:alnum:]]', '', 'g'), 2)),
        'gmv_mtd', t.gmv, 'orders_count', t.orders_count, 'buyers_count', COALESCE(tb.buyers_count, 0)
      ) ORDER BY t.gmv DESC, t.id) FROM top_locations t LEFT JOIN top_buyers tb ON tb.location_id = t.id), '[]'::jsonb),
      'collections_overdue', COALESCE((SELECT jsonb_agg(row_data ORDER BY outstanding_dues DESC, id) FROM (
        SELECT lr.id, lr.outstanding_dues, jsonb_build_object(
          'id', lr.id, 'name', lr.name, 'city', lr.city,
          'initials', upper(left(regexp_replace(lr.name, '[^[:alnum:]]', '', 'g'), 2)),
          'outstanding_dues', lr.outstanding_dues, 'oldest_unpaid_days', COALESCE(lr.oldest_unpaid_days, 0)
        ) AS row_data
        FROM location_rollup lr
        WHERE lr.outstanding_dues > 0 AND COALESCE(lr.oldest_unpaid_days, 0) > 30
        ORDER BY lr.outstanding_dues DESC, lr.id LIMIT 3
      ) overdue), '[]'::jsonb)
    )
  )
  FROM totals CROSS JOIN estimate_kpis CROSS JOIN invoice_total LEFT JOIN top_one ON true;
$$;

REVOKE ALL ON FUNCTION app.search_seller_location_landing_ids(uuid, text, text[], text[], text[], uuid[], integer, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION app.get_seller_location_landing_row_metrics(uuid, uuid[], date, date, date, date) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION app.get_seller_locations_landing_summary(uuid, uuid[], date, date, date, date) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION app.search_seller_location_landing_ids(uuid, text, text[], text[], text[], uuid[], integer, integer) TO service_role;
GRANT EXECUTE ON FUNCTION app.get_seller_location_landing_row_metrics(uuid, uuid[], date, date, date, date) TO service_role;
GRANT EXECUTE ON FUNCTION app.get_seller_locations_landing_summary(uuid, uuid[], date, date, date, date) TO service_role;

CREATE OR REPLACE FUNCTION app.get_seller_warehouses_landing_summary(
  p_tenant_id uuid,
  p_location_ids uuid[] DEFAULT NULL
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = pg_catalog, app
SET statement_timeout = '10s'
SET lock_timeout = '2s'
AS $$
  WITH scoped AS MATERIALIZED (
    SELECT
      w.id,
      w.name,
      COALESCE(w.address ->> 'city', '') AS city,
      w.status,
      w.updated_at,
      COALESCE(ws.tracked_skus, 0) AS tracked_skus,
      COALESCE(ws.low_stock_skus, 0) AS low_stock_skus,
      COALESCE(ws.stockout_skus, 0) AS stockout_skus,
      COALESCE(ws.idle_stock_skus, 0) AS idle_stock_skus,
      COALESCE(ws.last_inventory_update, w.updated_at) AS last_updated
    FROM app.warehouses w
    LEFT JOIN app.warehouses_snapshot ws
      ON ws.tenant_id = p_tenant_id
      AND ws.warehouse_id = w.id
    WHERE w.tenant_id = p_tenant_id
      AND w.deleted_at IS NULL
      AND (p_location_ids IS NULL OR w.location_id = ANY(p_location_ids))
  ), totals AS (
    SELECT
      count(*) FILTER (WHERE status = 'active')::bigint AS active_warehouses,
      COALESCE(sum(tracked_skus), 0)::bigint AS tracked_skus,
      count(*) FILTER (WHERE low_stock_skus > 0 OR stockout_skus > 0)::bigint AS low_stock_warehouses,
      COALESCE(sum(idle_stock_skus), 0)::bigint AS idle_stock_skus
    FROM scoped
  ), stock_attention AS (
    SELECT id, name, city, low_stock_skus + stockout_skus AS value
    FROM scoped
    WHERE low_stock_skus > 0 OR stockout_skus > 0
    ORDER BY low_stock_skus + stockout_skus DESC, id
    LIMIT 3
  ), idle_stock AS (
    SELECT id, name, city, idle_stock_skus AS value
    FROM scoped
    WHERE idle_stock_skus > 0
    ORDER BY idle_stock_skus DESC, id
    LIMIT 3
  ), recently_replenished AS (
    SELECT id, name, city, tracked_skus AS value, last_updated
    FROM scoped
    ORDER BY last_updated DESC NULLS LAST, id
    LIMIT 3
  )
  SELECT jsonb_build_object(
    'kpis', jsonb_build_object(
      'active_warehouses', totals.active_warehouses,
      'tracked_skus', totals.tracked_skus,
      'low_stock_warehouses', totals.low_stock_warehouses,
      'idle_stock_skus', totals.idle_stock_skus
    ),
    'callouts', jsonb_build_object(
      'stock_attention', COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
          'id', r.id,
          'name', r.name,
          'city', r.city,
          'value', r.value
        ) ORDER BY r.value DESC, r.id)
        FROM stock_attention r
      ), '[]'::jsonb),
      'idle_stock', COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
          'id', r.id,
          'name', r.name,
          'city', r.city,
          'value', r.value
        ) ORDER BY r.value DESC, r.id)
        FROM idle_stock r
      ), '[]'::jsonb),
      'recently_replenished', COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
          'id', r.id,
          'name', r.name,
          'city', r.city,
          'value', r.value,
          'last_updated', r.last_updated
        ) ORDER BY r.last_updated DESC NULLS LAST, r.id)
        FROM recently_replenished r
      ), '[]'::jsonb)
    )
  )
  FROM totals;
$$;

REVOKE ALL ON FUNCTION app.get_seller_warehouses_landing_summary(uuid, uuid[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION app.get_seller_warehouses_landing_summary(uuid, uuid[]) TO service_role;
