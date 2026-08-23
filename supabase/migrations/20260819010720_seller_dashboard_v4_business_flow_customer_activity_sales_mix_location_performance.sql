-- Seller Dashboard v4 cutover: Business flow, Customer activity, Sales mix,
-- Location performance. Each card gets its own independent RPC (not one
-- combined call) so a slow card never blocks the others -- same principle
-- already applied to the KPI strip's separate get_landing_metrics_v4 route.
--
-- Every function here reads ONLY precomputed v4 period/now-summary tables,
-- each already unique-indexed on (tenant_id, ..., grain, period_start) or
-- (tenant_id, ...) -- no raw invoices/orders/estimates, no v1/v2 snapshot
-- tables (metrics_buyer_snapshot etc). Target: <100ms per card, single
-- indexed lookup or small GROUP BY over an already tenant-scoped table.

-- 1. Business flow: trailing 6 months, Sales + Demand series in one payload
-- (both live in the same metrics_tenant_period_summary/metrics_location_period_summary
-- rows, so returning both costs nothing extra over returning one -- no
-- lazy-split needed, the toggle is a pure client-side render switch).
CREATE OR REPLACE FUNCTION app.get_seller_dashboard_business_flow_v4(
  p_tenant_id uuid,
  p_location_ids uuid[] DEFAULT NULL
) RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, app, pg_temp
AS $$
  WITH months AS (
    SELECT (date_trunc('month', now()) - (n || ' months')::interval)::date AS period_start
    FROM generate_series(0, 5) AS n
  ),
  tenant_src AS (
    SELECT period_start, invoice_value, invoice_count, primary_demand_value, primary_demand_count
    FROM app.metrics_tenant_period_summary
    WHERE tenant_id = p_tenant_id AND grain = 'month' AND deleted_at IS NULL
      AND p_location_ids IS NULL
  ),
  location_src AS (
    SELECT period_start,
      SUM(invoice_value) AS invoice_value,
      SUM(invoice_count) AS invoice_count,
      SUM(primary_demand_value) AS primary_demand_value,
      SUM(primary_demand_count) AS primary_demand_count
    FROM app.metrics_location_period_summary
    WHERE tenant_id = p_tenant_id AND grain = 'month' AND deleted_at IS NULL
      AND p_location_ids IS NOT NULL AND location_id = ANY(p_location_ids)
    GROUP BY period_start
  ),
  src AS (
    SELECT * FROM tenant_src
    UNION ALL
    SELECT * FROM location_src
  )
  SELECT jsonb_build_object(
    'primary_demand_kind', app.metrics_v4_primary_demand_kind(p_tenant_id),
    'months', COALESCE(jsonb_agg(jsonb_build_object(
      'period_start', m.period_start,
      'invoice_value', COALESCE(s.invoice_value, 0),
      'invoice_count', COALESCE(s.invoice_count, 0),
      'demand_value', COALESCE(s.primary_demand_value, 0),
      'demand_count', COALESCE(s.primary_demand_count, 0)
    ) ORDER BY m.period_start), '[]'::jsonb)
  )
  FROM months m
  LEFT JOIN src s ON s.period_start = m.period_start;
$$;

ALTER FUNCTION app.get_seller_dashboard_business_flow_v4(uuid, uuid[]) OWNER TO postgres;
REVOKE ALL ON FUNCTION app.get_seller_dashboard_business_flow_v4(uuid, uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.get_seller_dashboard_business_flow_v4(uuid, uuid[]) TO service_role;

-- 2. Customer activity: purchasing/repeat/inactive/overdue, current
-- quarter-to-date (confirmed with the user -- v4 has no rolling-90d buyer
-- table, only discrete month/quarter grains).
CREATE OR REPLACE FUNCTION app.get_seller_dashboard_customer_activity_v4(
  p_tenant_id uuid
) RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, app, pg_temp
AS $$
  WITH bounds AS (
    SELECT period_start FROM app.metrics_v4_period_bounds('this_quarter', clock_timestamp())
  ),
  buyers AS (
    SELECT bp.invoice_count
    FROM app.metrics_buyer_period_summary bp, bounds b
    WHERE bp.tenant_id = p_tenant_id AND bp.grain = 'quarter' AND bp.period_start = b.period_start
      AND bp.deleted_at IS NULL
  ),
  counts AS (
    SELECT
      COUNT(*) FILTER (WHERE invoice_count > 0) AS purchasing,
      COUNT(*) FILTER (WHERE invoice_count >= 2) AS repeat_buyers
    FROM buyers
  ),
  overdue AS (
    SELECT COUNT(*) AS n
    FROM app.metrics_buyer_now_summary
    WHERE tenant_id = p_tenant_id AND deleted_at IS NULL AND overdue_amount > 0
  ),
  active AS (
    SELECT active_buyer_count
    FROM app.metrics_tenant_now_summary
    WHERE tenant_id = p_tenant_id AND deleted_at IS NULL
  )
  SELECT jsonb_build_object(
    'purchasing', COALESCE((SELECT purchasing FROM counts), 0),
    'repeat', COALESCE((SELECT repeat_buyers FROM counts), 0),
    'inactive', GREATEST(COALESCE((SELECT active_buyer_count FROM active), 0) - COALESCE((SELECT purchasing FROM counts), 0), 0),
    'overdue', COALESCE((SELECT n FROM overdue), 0)
  );
$$;

ALTER FUNCTION app.get_seller_dashboard_customer_activity_v4(uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION app.get_seller_dashboard_customer_activity_v4(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.get_seller_dashboard_customer_activity_v4(uuid) TO service_role;

-- 3. Sales mix: current + prior month, one dimension per call (brand XOR
-- category never both) -- the unused dimension costs nothing until the
-- frontend actually requests/prefetches it.
CREATE OR REPLACE FUNCTION app.get_seller_dashboard_sales_mix_v4(
  p_tenant_id uuid,
  p_dimension text
) RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, app, pg_temp
AS $$
DECLARE
  v_current date := date_trunc('month', now())::date;
  v_prior date := (date_trunc('month', now()) - interval '1 month')::date;
  v_result jsonb;
BEGIN
  IF p_dimension NOT IN ('brands', 'categories') THEN
    RAISE EXCEPTION 'seller_dashboard_sales_mix_dimension_invalid:%', p_dimension USING ERRCODE = '22023';
  END IF;

  IF p_dimension = 'brands' THEN
    SELECT jsonb_build_object('items', COALESCE(jsonb_agg(jsonb_build_object(
      'id', t.tenant_brand_id,
      'name', COALESCE(tb.display_name_override, cb.name, 'Brand'),
      'current_value', COALESCE(t.current_value, 0),
      'prior_value', COALESCE(t.prior_value, 0)
    ) ORDER BY COALESCE(t.current_value, 0) DESC), '[]'::jsonb))
    INTO v_result
    FROM (
      SELECT tenant_brand_id,
        SUM(invoice_value) FILTER (WHERE period_start = v_current) AS current_value,
        SUM(invoice_value) FILTER (WHERE period_start = v_prior) AS prior_value
      FROM app.metrics_brand_period_summary
      WHERE tenant_id = p_tenant_id AND grain = 'month' AND period_start IN (v_current, v_prior) AND deleted_at IS NULL
      GROUP BY tenant_brand_id
    ) t
    JOIN app.tenant_brands tb ON tb.id = t.tenant_brand_id
    LEFT JOIN catalog.brands cb ON cb.id = tb.master_brand_id;
  ELSE
    SELECT jsonb_build_object('items', COALESCE(jsonb_agg(jsonb_build_object(
      'id', t.tenant_category_id,
      'name', COALESCE(tc.name, 'Category'),
      'current_value', COALESCE(t.current_value, 0),
      'prior_value', COALESCE(t.prior_value, 0)
    ) ORDER BY COALESCE(t.current_value, 0) DESC), '[]'::jsonb))
    INTO v_result
    FROM (
      SELECT tenant_category_id,
        SUM(invoice_value) FILTER (WHERE period_start = v_current) AS current_value,
        SUM(invoice_value) FILTER (WHERE period_start = v_prior) AS prior_value
      FROM app.metrics_category_period_summary
      WHERE tenant_id = p_tenant_id AND grain = 'month' AND period_start IN (v_current, v_prior) AND deleted_at IS NULL
      GROUP BY tenant_category_id
    ) t
    JOIN app.tenant_categories tc ON tc.id = t.tenant_category_id;
  END IF;

  RETURN v_result;
END;
$$;

ALTER FUNCTION app.get_seller_dashboard_sales_mix_v4(uuid, text) OWNER TO postgres;
REVOKE ALL ON FUNCTION app.get_seller_dashboard_sales_mix_v4(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.get_seller_dashboard_sales_mix_v4(uuid, text) TO service_role;

-- 4. Location performance: small-multiples source -- sales (current month)
-- + overdue + open demand ("now" state) per location. Reframed as an
-- operational-risk view, not a revenue-share view (replaces "Location
-- comparison"'s RankedList in the same dashboard grid slot).
CREATE OR REPLACE FUNCTION app.get_seller_dashboard_location_performance_v4(
  p_tenant_id uuid
) RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, app, pg_temp
AS $$
  WITH cur AS (
    SELECT location_id, invoice_value
    FROM app.metrics_location_period_summary
    WHERE tenant_id = p_tenant_id AND grain = 'month'
      AND period_start = date_trunc('month', now())::date
      AND deleted_at IS NULL
  )
  SELECT jsonb_build_object('locations', COALESCE(jsonb_agg(jsonb_build_object(
    'location_id', l.id,
    'name', l.name,
    'sales_value', COALESCE(cur.invoice_value, 0),
    'overdue_amount', COALESCE(now_s.overdue_amount, 0),
    'open_demand_value', COALESCE(now_s.open_estimate_value, 0) + COALESCE(now_s.open_order_value, 0)
  ) ORDER BY l.name), '[]'::jsonb))
  FROM app.metrics_location_now_summary now_s
  JOIN app.locations l ON l.id = now_s.location_id
  LEFT JOIN cur ON cur.location_id = now_s.location_id
  WHERE now_s.tenant_id = p_tenant_id AND now_s.deleted_at IS NULL;
$$;

ALTER FUNCTION app.get_seller_dashboard_location_performance_v4(uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION app.get_seller_dashboard_location_performance_v4(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.get_seller_dashboard_location_performance_v4(uuid) TO service_role;
