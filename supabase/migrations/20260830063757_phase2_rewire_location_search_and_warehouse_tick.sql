-- Phase 2 part B: rewire two of the three remaining v2-lineage readers.
-- (The third, search_buyer_app_access_v2, is the big one -- separate
-- migration, next.)

-- 1) _metrics_v4_refresh_landing_kpis: swap its inline warehouses_snapshot
-- read for the live v4 equivalent, metrics_warehouse_now_summary --
-- column names match 1:1 (sellable_units, tracked_skus, stockout_skus,
-- warehouse_id), this is a pure table-name swap plus the deleted_at
-- filter v4 tables use. NOT touching anything else in the tick (fencing,
-- claim, orchestration untouched) -- just this one inline SELECT pair.
DO $$
DECLARE
  v_def text;
  v_new text;
BEGIN
  SELECT pg_get_functiondef(oid) INTO v_def
  FROM pg_proc
  WHERE proname = '_metrics_v4_refresh_landing_kpis' AND pronamespace = 'app'::regnamespace;

  IF v_def IS NULL THEN
    RAISE EXCEPTION 'phase2b: _metrics_v4_refresh_landing_kpis not found';
  END IF;

  v_new := v_def;

  IF (SELECT count(*) FROM regexp_matches(v_new,
        E'FROM app\\.warehouses_snapshot ws WHERE ws\\.tenant_id = p_tenant_id;', 'g')) <> 1 THEN
    RAISE EXCEPTION 'phase2b: tick anchor 1 not found exactly once';
  END IF;
  v_new := replace(v_new,
    E'FROM app.warehouses_snapshot ws WHERE ws.tenant_id = p_tenant_id;',
    E'FROM app.metrics_warehouse_now_summary ws WHERE ws.tenant_id = p_tenant_id AND ws.deleted_at IS NULL;');

  IF (SELECT count(*) FROM regexp_matches(v_new,
        E'FROM app\\.warehouses_snapshot ws\\n  WHERE ws\\.tenant_id = p_tenant_id AND ws\\.sellable_units > 0', 'g')) <> 1 THEN
    RAISE EXCEPTION 'phase2b: tick anchor 2 not found exactly once';
  END IF;
  v_new := replace(v_new,
    E'FROM app.warehouses_snapshot ws\n  WHERE ws.tenant_id = p_tenant_id AND ws.sellable_units > 0',
    E'FROM app.metrics_warehouse_now_summary ws\n  WHERE ws.tenant_id = p_tenant_id AND ws.deleted_at IS NULL AND ws.sellable_units > 0');

  IF v_new = v_def THEN
    RAISE EXCEPTION 'phase2b: no substitutions applied to tick, aborting';
  END IF;

  EXECUTE v_new;
END $$;

-- 2) search_seller_location_landing_ids: metrics_location_snapshot ->
-- metrics_location_now_summary (receivable_amount/overdue_amount, direct
-- swap, now that receivable_amount exists on it) + a live tenant_inventory
-- join for out_of_stock/low_stock product counts -- v4 has no
-- location-grain stock-state column, same live-join pattern used earlier
-- this session for kpi_product_daily's replacement (product-level stock
-- state is presentation-layer, computed from tenant_inventory directly
-- rather than pre-aggregated into a v4 table).
CREATE OR REPLACE FUNCTION app.search_seller_location_landing_ids(p_tenant_id uuid, p_query text DEFAULT NULL::text, p_statuses text[] DEFAULT NULL::text[], p_stock_modes text[] DEFAULT NULL::text[], p_dues_modes text[] DEFAULT NULL::text[], p_location_ids uuid[] DEFAULT NULL::uuid[], p_limit integer DEFAULT 50, p_offset integer DEFAULT 0)
 RETURNS TABLE(id uuid, total_count bigint)
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'pg_catalog', 'app'
 SET statement_timeout TO '15s'
 SET lock_timeout TO '2s'
AS $function$
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
    INTO v_prefix_text
    FROM unnest(tsvector_to_array(to_tsvector('english', v_query))) AS terms(lexeme);
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
    LEFT JOIN app.metrics_location_now_summary ls ON ls.location_id = l.id AND ls.tenant_id = p_tenant_id AND ls.deleted_at IS NULL
    LEFT JOIN LATERAL (
      SELECT
        COUNT(*) FILTER (WHERE stock.avail <= 0) AS out_of_stock_product_count,
        COUNT(*) FILTER (WHERE stock.avail > 0 AND stock.avail <= stock.reorder_point) AS low_stock_product_count
      FROM (
        SELECT ti.tenant_product_id,
          SUM(ti.qty_available - ti.qty_reserved) AS avail,
          SUM(ti.reorder_point) AS reorder_point
        FROM app.tenant_inventory ti
        JOIN app.warehouses w ON w.id = ti.warehouse_id AND w.location_id = l.id
        JOIN app.tenant_products tp ON tp.id = ti.tenant_product_id AND tp.tenant_id = p_tenant_id AND tp.deleted_at IS NULL
        WHERE ti.deleted_at IS NULL
        GROUP BY ti.tenant_product_id
      ) stock
    ) stk ON true
    WHERE l.tenant_id = p_tenant_id
      AND l.deleted_at IS NULL
      AND (p_location_ids IS NULL OR l.id = ANY(p_location_ids))
      AND (cardinality(v_statuses) = 0 OR lower(COALESCE(l.status, 'active')) = ANY(v_statuses))
      AND (v_query IS NULL OR l.search_vector @@ v_ts_query OR l.search_vector @@ v_prefix_ts_query)
      AND (
        cardinality(v_stock) = 0 OR cardinality(v_stock) >= 3
        OR ('In Stock' = ANY(v_stock) AND COALESCE(stk.out_of_stock_product_count, 0) = 0 AND COALESCE(stk.low_stock_product_count, 0) = 0)
        OR ('Low Stock' = ANY(v_stock) AND COALESCE(stk.out_of_stock_product_count, 0) = 0 AND COALESCE(stk.low_stock_product_count, 0) > 0)
        OR ('Out of Stock' = ANY(v_stock) AND COALESCE(stk.out_of_stock_product_count, 0) > 0)
      )
      AND (
        cardinality(v_dues) = 0
        OR ('Due' = ANY(v_dues) AND COALESCE(ls.receivable_amount, 0) > 0)
        OR ('Overdue' = ANY(v_dues) AND COALESCE(ls.overdue_amount, 0) > 0)
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
$function$;
