-- app.kpi_product_daily confirmed dead by the same test as
-- metrics_product_snapshot: no active writer path (refresh_kpi_product_
-- daily / rebuild_kpi_product_daily_for_tenant / prune_kpi_daily_old_rows
-- are only reachable through the also-dead tick_repair_jobs ->
-- rebuild_metrics_for_tenant_range chain, not cron-scheduled or app-
-- triggered anywhere) -- Wine Yard has exactly 1 row, last day
-- 2026-08-18, 12 days stale as of this writing. Same silent-staleness bug
-- class as the metrics_product_snapshot fix earlier this session, just
-- not yet caught because nothing had visibly broken.
--
-- Three live functions read it for month-to-date units/revenue (feeding
-- days_cover / growth_pct): app.search_brand_products_detail,
-- app.search_catalog_products_detail, app._metrics_v4_refresh_landing_kpis.
-- Rewired all three to app.metrics_product_period_summary (grain='month'),
-- which the v4 tick keeps genuinely current -- invoice_units/invoice_value
-- for the current-month row already give exactly the "month to date"
-- figures kpi_product_daily was summed to produce, without the extra
-- daily-granularity table. Inventory (on_hand/available/reorder_point)
-- was already fixed to read live app.tenant_inventory in the prior
-- metrics_product_snapshot commits -- unaffected here.

CREATE OR REPLACE FUNCTION app.search_brand_products_detail(p_tenant_id uuid, p_brand_id uuid, p_query text DEFAULT NULL::text, p_stock text DEFAULT NULL::text, p_sort text DEFAULT 'gmv_desc'::text, p_limit integer DEFAULT 50, p_offset integer DEFAULT 0)
 RETURNS TABLE(tenant_product_id uuid, product_name text, sku text, category_name text, mrp numeric, base_selling_price numeric, cost_price numeric, on_hand numeric, days_cover numeric, units_mtd bigint, gmv_mtd numeric, growth_pct numeric, total_count bigint)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
 SET statement_timeout TO '10s'
AS $function$
  with query_terms as materialized (
    select case when nullif(btrim(p_query), '') is null then null else websearch_to_tsquery('english', btrim(p_query)) end exact_query,
           case when prefix_text is null then null else to_tsquery('english', prefix_text) end prefix_query
    from (select string_agg(quote_literal(lexeme) || ':*', ' & ' order by lexeme) prefix_text
          from unnest(tsvector_to_array(to_tsvector('english', coalesce(nullif(btrim(p_query), ''), '')))) x(lexeme)) p
  ), inventory as materialized (
    select i.tenant_product_id, sum(greatest(coalesce(i.qty_available, 0) - coalesce(i.qty_reserved, 0), 0))::numeric on_hand,
           sum(coalesce(i.reorder_point, 0))::numeric reorder_point
    from app.tenant_inventory i
    join app.tenant_products inventory_product
     on inventory_product.id = i.tenant_product_id
     and inventory_product.tenant_id = p_tenant_id
     and inventory_product.tenant_brand_id = p_brand_id
     and inventory_product.deleted_at is null
    where i.deleted_at is null
    group by i.tenant_product_id
  ), metrics as materialized (
    select
      coalesce(cur.tenant_product_id, prev.tenant_product_id) as tenant_product_id,
      coalesce(cur.invoice_units, 0)::bigint as units_mtd,
      coalesce(cur.invoice_value, 0)::numeric as gmv_mtd,
      coalesce(prev.invoice_value, 0)::numeric as gmv_prev
    from (
      select ps.tenant_product_id, ps.invoice_units, ps.invoice_value
      from app.metrics_product_period_summary ps
      join app.tenant_products metric_product
        on metric_product.id = ps.tenant_product_id and metric_product.tenant_id = p_tenant_id
       and metric_product.tenant_brand_id = p_brand_id and metric_product.deleted_at is null
      where ps.tenant_id = p_tenant_id and ps.grain = 'month'
        and ps.period_start = date_trunc('month', current_date)::date and ps.deleted_at is null
    ) cur
    full outer join (
      select ps.tenant_product_id, ps.invoice_value
      from app.metrics_product_period_summary ps
      join app.tenant_products metric_product
        on metric_product.id = ps.tenant_product_id and metric_product.tenant_id = p_tenant_id
       and metric_product.tenant_brand_id = p_brand_id and metric_product.deleted_at is null
      where ps.tenant_id = p_tenant_id and ps.grain = 'month'
        and ps.period_start = (date_trunc('month', current_date) - interval '1 month')::date and ps.deleted_at is null
    ) prev on prev.tenant_product_id = cur.tenant_product_id
  ), filtered as materialized (
    select tp.id, coalesce(nullif(tp.name_override, ''), cp.name, tp.internal_sku) product_name,
      tp.internal_sku sku, coalesce(nullif(tc.name, ''), cc.name, 'Uncategorized') category_name,
      tp.mrp, tp.base_selling_price, tp.cost_price, coalesce(i.on_hand, 0) on_hand,
      case when coalesce(m.units_mtd, 0) > 0 then round(coalesce(i.on_hand, 0) / (m.units_mtd / greatest(extract(day from current_date)::numeric, 1)), 1) else 0 end days_cover,
      coalesce(m.units_mtd, 0) units_mtd, coalesce(m.gmv_mtd, 0) gmv_mtd,
      case when coalesce(m.gmv_prev, 0) = 0 then 0 else round(((m.gmv_mtd - m.gmv_prev) / m.gmv_prev) * 100, 1) end growth_pct,
      ts_rank_cd(tp.search_vector, coalesce(q.exact_query, q.prefix_query)) rank
    from app.tenant_products tp
    cross join query_terms q
    left join catalog.products cp on cp.id = tp.master_product_id
    left join app.tenant_categories tc on tc.id = tp.tenant_category_id and tc.deleted_at is null
    left join catalog.categories cc on cc.id = tc.master_category_id
    left join inventory i on i.tenant_product_id = tp.id
    left join metrics m on m.tenant_product_id = tp.id
    where tp.tenant_id = p_tenant_id and tp.tenant_brand_id = p_brand_id and tp.deleted_at is null
      and (q.exact_query is null or tp.search_vector @@ q.exact_query or tp.search_vector @@ q.prefix_query)
      and (nullif(p_stock, '') is null
        or (p_stock = 'low_stock' and coalesce(i.on_hand, 0) > 0 and coalesce(i.on_hand, 0) <= greatest(coalesce(i.reorder_point, 0), 0))
        or (p_stock = 'out_of_stock' and coalesce(i.on_hand, 0) <= 0)
        or (p_stock = 'in_stock' and coalesce(i.on_hand, 0) > 0))
  )
  select f.id, f.product_name, f.sku, f.category_name, f.mrp, f.base_selling_price, f.cost_price,
    f.on_hand, f.days_cover, f.units_mtd, f.gmv_mtd, f.growth_pct, count(*) over ()::bigint
  from filtered f
  order by case when nullif(btrim(p_query), '') is not null then f.rank end desc,
    case when p_sort = 'gmv_asc' then f.gmv_mtd end asc,
    case when p_sort = 'growth_desc' then f.growth_pct end desc,
    case when p_sort = 'on_hand_asc' then f.on_hand end asc,
    case when p_sort not in ('gmv_asc', 'growth_desc', 'on_hand_asc') then f.gmv_mtd end desc,
    f.product_name, f.id
  limit least(greatest(coalesce(p_limit, 50), 1), 100) offset greatest(coalesce(p_offset, 0), 0);
$function$;

CREATE OR REPLACE FUNCTION app.search_catalog_products_detail(p_tenant_id uuid, p_catalog_id uuid, p_query text DEFAULT NULL::text, p_member text DEFAULT 'yes'::text, p_brand text[] DEFAULT NULL::text[], p_category text[] DEFAULT NULL::text[], p_stock text[] DEFAULT NULL::text[], p_sort text DEFAULT 'catalog_order'::text, p_limit integer DEFAULT 50, p_offset integer DEFAULT 0)
 RETURNS TABLE(item_id uuid, tenant_product_id uuid, product_name text, sku text, brand_name text, category_name text, mrp numeric, base_selling_price numeric, override_price numeric, catalog_order integer, on_hand numeric, days_cover numeric, catalog_units_sold bigint, catalog_gmv numeric, item_tag text, is_member boolean, image_url text, stock_status text, cost_price numeric, discount_pct numeric, margin_pct numeric, total_count bigint)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
 SET statement_timeout TO '10s'
AS $function$
  WITH catalog AS MATERIALIZED (
    SELECT c.id
    FROM app.campaigns c
    WHERE c.id = p_catalog_id
      AND c.tenant_id = p_tenant_id
      AND c.deleted_at IS NULL
  ), query_terms AS MATERIALIZED (
    SELECT
      CASE WHEN NULLIF(BTRIM(p_query), '') IS NULL THEN NULL ELSE websearch_to_tsquery('english', BTRIM(p_query)) END AS exact_query,
      CASE WHEN prefix_text IS NULL THEN NULL ELSE to_tsquery('english', prefix_text) END AS prefix_query
    FROM (
      SELECT string_agg(quote_literal(lexeme) || ':*', ' & ' ORDER BY lexeme) AS prefix_text
      FROM unnest(tsvector_to_array(to_tsvector('english', COALESCE(NULLIF(BTRIM(p_query), ''), '')))) terms(lexeme)
    ) prefixes
  ), sales AS MATERIALIZED (
    SELECT x.tenant_product_id, SUM(x.units)::bigint AS units, SUM(x.gmv)::numeric AS gmv
    FROM (
      SELECT oi.tenant_product_id, COALESCE(SUM(oi.qty), 0)::numeric AS units,
        COALESCE(SUM(COALESCE(oi.line_total, COALESCE(oi.qty, 0) * COALESCE(oi.unit_price, 0))), 0)::numeric AS gmv
      FROM app.orders o
      JOIN app.order_items oi ON oi.order_id = o.id AND oi.deleted_at IS NULL
      JOIN app.campaign_items ci ON ci.campaign_id = p_catalog_id AND ci.tenant_product_id = oi.tenant_product_id AND ci.deleted_at IS NULL
      WHERE o.tenant_id = p_tenant_id
        AND o.campaign_id = p_catalog_id
        AND o.deleted_at IS NULL
        AND o.status <> 'cancelled'
      GROUP BY oi.tenant_product_id
      UNION ALL
      SELECT ei.tenant_product_id, COALESCE(SUM(ei.qty), 0)::numeric AS units,
        COALESCE(SUM(COALESCE(ei.line_total, COALESCE(ei.qty, 0) * COALESCE(ei.unit_price, 0))), 0)::numeric AS gmv
      FROM app.estimates e
      JOIN app.estimate_items ei ON ei.estimate_id = e.id AND ei.deleted_at IS NULL
      JOIN app.campaign_items ci ON ci.campaign_id = p_catalog_id AND ci.tenant_product_id = ei.tenant_product_id AND ci.deleted_at IS NULL
      WHERE e.tenant_id = p_tenant_id
        AND e.campaign_id = p_catalog_id
        AND e.deleted_at IS NULL
        AND e.status NOT IN ('pending', 'void')
        AND e.converted_to_order_id IS NULL
      GROUP BY ei.tenant_product_id
    ) x
    GROUP BY x.tenant_product_id
  ), inventory AS MATERIALIZED (
    SELECT
      i.tenant_product_id,
      SUM(GREATEST(COALESCE(i.qty_available, 0) - COALESCE(i.qty_reserved, 0), 0))::numeric AS available,
      SUM(COALESCE(i.reorder_point, 0))::numeric AS reorder_point
    FROM app.tenant_inventory i
    JOIN app.tenant_products inv_tp ON inv_tp.id = i.tenant_product_id AND inv_tp.tenant_id = p_tenant_id AND inv_tp.deleted_at IS NULL
    WHERE i.deleted_at IS NULL
    GROUP BY i.tenant_product_id
  ), velocity AS MATERIALIZED (
    SELECT ps.tenant_product_id, SUM(ps.invoice_units)::numeric AS units_mtd
    FROM app.metrics_product_period_summary ps
    JOIN app.tenant_products vel_tp ON vel_tp.id = ps.tenant_product_id AND vel_tp.tenant_id = p_tenant_id AND vel_tp.deleted_at IS NULL
    WHERE ps.tenant_id = p_tenant_id AND ps.grain = 'month' AND ps.period_start = date_trunc('month', now())::date AND ps.deleted_at IS NULL
    GROUP BY ps.tenant_product_id
  ), scoped AS MATERIALIZED (
    SELECT
      ci.id AS item_id,
      tp.id AS tenant_product_id,
      COALESCE(NULLIF(tp.name_override, ''), cp.name, tp.internal_sku) AS product_name,
      tp.internal_sku AS sku,
      COALESCE(NULLIF(tb.display_name_override, ''), cb.name, '—') AS brand_name,
      COALESCE(tc.name, cc.name, '—') AS category_name,
      tp.mrp,
      tp.base_selling_price,
      ci.price_override AS override_price,
      COALESCE(ci.display_order, 2147483647) AS catalog_order,
      COALESCE(inv.available, 0) AS on_hand,
      CASE WHEN COALESCE(vel.units_mtd, 0) > 0
        THEN ROUND(COALESCE(inv.available, 0) / (vel.units_mtd / GREATEST(EXTRACT(day FROM now())::numeric, 1)), 1)
        ELSE 0
      END AS days_cover,
      COALESCE(s.units, 0)::bigint AS units,
      COALESCE(s.gmv, 0)::numeric AS gmv,
      CASE
        WHEN ci.is_featured THEN 'new'
        WHEN app.product_is_new_stock_today(tp.id) THEN 'new_stock'
        ELSE 'none'
      END AS item_tag,
      (ci.id IS NOT NULL) AS is_member,
      COALESCE(tp.r2_thumb_key, tp.r2_small_key, tp.image_urls[1], cp.image_urls[1]) AS image_url,
      CASE
        WHEN app.product_is_new_stock_today(tp.id) THEN 'new_stock'
        WHEN COALESCE(inv.available, 0) <= 0 THEN 'out_of_stock'
        WHEN COALESCE(inv.available, 0) > 0 AND COALESCE(inv.available, 0) <= COALESCE(inv.reorder_point, 0) THEN 'low_stock'
        ELSE 'in_stock'
      END AS stock_status,
      tp.cost_price,
      ts_rank_cd(tp.search_vector, COALESCE(q.exact_query, q.prefix_query)) AS rank
    FROM catalog c
    CROSS JOIN query_terms q
    JOIN app.tenant_products tp ON tp.tenant_id = p_tenant_id AND tp.deleted_at IS NULL
    LEFT JOIN app.campaign_items ci ON ci.campaign_id = c.id AND ci.tenant_product_id = tp.id AND ci.deleted_at IS NULL
    LEFT JOIN catalog.products cp ON cp.id = tp.master_product_id
    LEFT JOIN app.tenant_brands tb ON tb.id = tp.tenant_brand_id AND tb.deleted_at IS NULL
    LEFT JOIN catalog.brands cb ON cb.id = tb.master_brand_id
    LEFT JOIN app.tenant_categories tc ON tc.id = tp.tenant_category_id AND tc.deleted_at IS NULL
    LEFT JOIN catalog.categories cc ON cc.id = cp.category_id
    LEFT JOIN inventory inv ON inv.tenant_product_id = tp.id
    LEFT JOIN velocity vel ON vel.tenant_product_id = tp.id
    LEFT JOIN sales s ON s.tenant_product_id = tp.id
    WHERE (q.exact_query IS NULL OR tp.search_vector @@ q.exact_query OR tp.search_vector @@ q.prefix_query)
  ), priced AS MATERIALIZED (
    SELECT
      s.*,
      COALESCE(s.override_price, s.base_selling_price) AS campaign_price,
      CASE WHEN COALESCE(s.base_selling_price, 0) > 0 THEN ROUND(((s.base_selling_price - COALESCE(s.override_price, s.base_selling_price)) / s.base_selling_price) * 100, 2) END AS discount_pct,
      CASE WHEN COALESCE(COALESCE(s.override_price, s.base_selling_price), 0) > 0 AND COALESCE(s.cost_price, 0) > 0 THEN ROUND(((COALESCE(s.override_price, s.base_selling_price) - s.cost_price) / COALESCE(s.override_price, s.base_selling_price)) * 100, 2) END AS margin_pct
    FROM scoped s
  ), filtered AS MATERIALIZED (
    SELECT *
    FROM priced
    WHERE (COALESCE(NULLIF(p_member, ''), 'yes') = 'all'
        OR (p_member = 'yes' AND is_member)
        OR (p_member = 'no' AND NOT is_member))
      AND (COALESCE(cardinality(p_brand), 0) = 0 OR brand_name = ANY(p_brand))
      AND (COALESCE(cardinality(p_category), 0) = 0 OR category_name = ANY(p_category))
      AND (COALESCE(cardinality(p_stock), 0) = 0 OR stock_status = ANY(p_stock))
  )
  SELECT
    f.item_id,
    f.tenant_product_id,
    f.product_name,
    f.sku,
    f.brand_name,
    f.category_name,
    f.mrp,
    f.base_selling_price,
    f.override_price,
    f.catalog_order,
    f.on_hand,
    f.days_cover,
    f.units,
    f.gmv,
    f.item_tag,
    f.is_member,
    f.image_url,
    f.stock_status,
    f.cost_price,
    f.discount_pct,
    f.margin_pct,
    count(*) OVER ()::bigint
  FROM filtered f
  ORDER BY
    CASE WHEN NULLIF(BTRIM(p_query), '') IS NOT NULL THEN f.rank END DESC,
    CASE WHEN p_sort = 'brand_asc' THEN f.brand_name END,
    CASE WHEN p_sort = 'units_desc' THEN f.units END DESC,
    CASE WHEN p_sort = 'sales_desc' THEN f.gmv END DESC,
    CASE WHEN p_sort = 'days_cover_asc' THEN f.days_cover END ASC,
    CASE WHEN p_sort NOT IN ('brand_asc', 'units_desc', 'sales_desc', 'days_cover_asc') THEN f.catalog_order END,
    f.product_name,
    f.tenant_product_id
  LIMIT LEAST(GREATEST(COALESCE(p_limit, 50), 1), 100)
  OFFSET GREATEST(COALESCE(p_offset, 0), 0);
$function$;

-- _metrics_v4_refresh_landing_kpis: swapped its two product_velocity CTEs
-- (previously SUM(units_sold) from kpi_product_daily since month-start)
-- to app.metrics_product_period_summary at grain='quarter' (this function
-- already scopes everything else to v_quarter -- matching that instead of
-- introducing a month-vs-quarter mismatch), using invoice_units for the
-- current quarter-to-date row and days-elapsed-in-quarter as the divisor.
-- Rest of this large function (commercial/buyer_app/brands/locations/
-- warehouses domains) is untouched, copied verbatim from the live
-- definition applied by 20260830051504.

CREATE OR REPLACE FUNCTION app._metrics_v4_refresh_landing_kpis(p_tenant_id uuid, p_as_of timestamp with time zone DEFAULT clock_timestamp(), p_domain text DEFAULT NULL::text, p_dirty_days date[] DEFAULT NULL::date[])
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'app', 'pg_temp'
AS $function$
DECLARE
  v_rows integer := 0;
  v_period record;
  v_quarter record;
  v_primary text := app.metrics_v4_primary_demand_kind(p_tenant_id);
  v_now_summary app.metrics_tenant_now_summary%ROWTYPE;
  v_now timestamptz := COALESCE(p_as_of, clock_timestamp());
  v_watermark timestamptz;
  v_run_commercial boolean := (p_domain IS NULL OR p_domain = 'commercial');
  v_run_inventory boolean := (p_domain IS NULL OR p_domain = 'inventory');
  v_run_buyer_app boolean := (p_domain IS NULL OR p_domain = 'buyer_app');
  v_due_7_count bigint;
  v_due_7_value numeric;
  v_due_7_buyers bigint;
  v_est_awaiting_count bigint;
  v_est_awaiting_value numeric;
  v_est_awaiting_buyers bigint;
  v_est_expiring_count bigint;
  v_est_expiring_value numeric;
  v_est_expiring_buyers bigint;
  v_ord_waiting_count bigint;
  v_ord_waiting_value numeric;
  v_ord_waiting_buyers bigint;
  v_ord_dispatch_count bigint;
  v_ord_dispatch_value numeric;
  v_ord_dispatch_buyers bigint;
  v_active_customers bigint;
  v_dormant_customers bigint;
  v_top80_customers bigint;
  v_sold_products bigint;
  v_oos_products bigint;
  v_low_products bigint;
  v_no_sale_products bigint;
  v_sold_categories bigint;
  v_oos_categories bigint;
  v_low_categories bigint;
  v_no_sale_categories bigint;
  v_live_campaigns bigint;
  v_live_campaigns_expiring bigint;
  v_campaign_views bigint;
  v_campaign_openers bigint;
  v_campaign_demand_count bigint;
  v_campaign_demand_value numeric;
  v_campaign_demand_buyers bigint;
  v_campaign_invoice_count bigint;
  v_campaign_invoice_value numeric;
  v_campaign_invoice_buyers bigint;
  v_active_groups bigint;
  v_grouped_buyers bigint;
  v_valuable_no_group bigint;
  v_grouped_purchased bigint;
  v_custom_price_products bigint;
  v_custom_price_buyers bigint;
  v_below_base_products bigint;
  v_expiring_price_lists bigint;
  v_active_brands bigint;
  v_top80_brands bigint;
  v_no_sale_brands bigint;
  v_dormant_brands bigint;
  v_top80_locations bigint;
  v_sellable_units numeric;
  v_warehouse_skus bigint;
  v_warehouse_oos bigint;
  v_warehouse_no_sales bigint;
BEGIN
  SELECT * INTO v_period FROM app.metrics_v4_period_bounds('this_month', p_as_of);
  SELECT * INTO v_quarter FROM app.metrics_v4_period_bounds('this_quarter', p_as_of);
  SELECT * INTO v_now_summary FROM app.metrics_tenant_now_summary WHERE tenant_id = p_tenant_id AND deleted_at IS NULL ORDER BY computed_at DESC LIMIT 1;

  SELECT MAX(source_watermark) INTO v_watermark FROM (
    SELECT source_watermark FROM app.metrics_tenant_period_summary WHERE tenant_id = p_tenant_id
    UNION ALL SELECT source_watermark FROM app.metrics_buyer_period_summary WHERE tenant_id = p_tenant_id
    UNION ALL SELECT source_watermark FROM app.metrics_product_period_summary WHERE tenant_id = p_tenant_id
  ) x;

  IF v_run_commercial THEN
  SELECT
    COUNT(*) FILTER (WHERE app.invoice_status_has_receivable(i.status, i.outstanding_balance) AND i.due_date < v_now + interval '7 days')::bigint,
    COALESCE(SUM(i.outstanding_balance) FILTER (WHERE app.invoice_status_has_receivable(i.status, i.outstanding_balance) AND i.due_date < v_now + interval '7 days'), 0)::numeric,
    COUNT(DISTINCT i.buyer_id) FILTER (WHERE app.invoice_status_has_receivable(i.status, i.outstanding_balance) AND i.due_date < v_now + interval '7 days')::bigint
  INTO v_due_7_count, v_due_7_value, v_due_7_buyers
  FROM app.invoices i WHERE i.tenant_id = p_tenant_id AND i.deleted_at IS NULL;

  SELECT
    COUNT(*) FILTER (WHERE e.status = 'sent' AND COALESCE(e.sent_at, e.created_at) < v_now - interval '3 days')::bigint,
    COALESCE(SUM(e.total_amount) FILTER (WHERE e.status = 'sent' AND COALESCE(e.sent_at, e.created_at) < v_now - interval '3 days'),0)::numeric,
    COUNT(DISTINCT e.buyer_id) FILTER (WHERE e.status = 'sent' AND COALESCE(e.sent_at, e.created_at) < v_now - interval '3 days')::bigint,
    COUNT(*) FILTER (WHERE (app.estimate_status_is_open(e.status) OR e.status = 'accepted') AND e.valid_until <= (v_now AT TIME ZONE 'Asia/Kolkata')::date + 7)::bigint,
    COALESCE(SUM(e.total_amount) FILTER (WHERE (app.estimate_status_is_open(e.status) OR e.status = 'accepted') AND e.valid_until <= (v_now AT TIME ZONE 'Asia/Kolkata')::date + 7),0)::numeric,
    COUNT(DISTINCT e.buyer_id) FILTER (WHERE (app.estimate_status_is_open(e.status) OR e.status = 'accepted') AND e.valid_until <= (v_now AT TIME ZONE 'Asia/Kolkata')::date + 7)::bigint
  INTO v_est_awaiting_count, v_est_awaiting_value, v_est_awaiting_buyers, v_est_expiring_count, v_est_expiring_value, v_est_expiring_buyers
  FROM app.estimates e WHERE e.tenant_id = p_tenant_id AND e.deleted_at IS NULL;

  SELECT
    COUNT(*) FILTER (WHERE o.status = 'received')::bigint,
    COALESCE(SUM(o.total_amount) FILTER (WHERE o.status = 'received'),0)::numeric,
    COUNT(DISTINCT o.buyer_id) FILTER (WHERE o.status = 'received')::bigint,
    COUNT(*) FILTER (WHERE o.status = 'confirmed' AND COALESCE(o.confirmed_at, o.updated_at, o.created_at) < v_now - interval '3 days')::bigint,
    COALESCE(SUM(o.total_amount) FILTER (WHERE o.status = 'confirmed' AND COALESCE(o.confirmed_at, o.updated_at, o.created_at) < v_now - interval '3 days'),0)::numeric,
    COUNT(DISTINCT o.buyer_id) FILTER (WHERE o.status = 'confirmed' AND COALESCE(o.confirmed_at, o.updated_at, o.created_at) < v_now - interval '3 days')::bigint
  INTO v_ord_waiting_count, v_ord_waiting_value, v_ord_waiting_buyers, v_ord_dispatch_count, v_ord_dispatch_value, v_ord_dispatch_buyers
  FROM app.orders o WHERE o.tenant_id = p_tenant_id AND o.deleted_at IS NULL;

  SELECT COUNT(*) FILTER (WHERE bps.invoice_count > 0)::bigint
  INTO v_active_customers
  FROM app.metrics_buyer_period_summary bps
  WHERE bps.tenant_id = p_tenant_id AND bps.grain = 'quarter' AND bps.period_start = v_quarter.period_start AND bps.deleted_at IS NULL;
  SELECT GREATEST(COALESCE(v_now_summary.active_buyer_count, 0) - COALESCE(v_active_customers, 0), 0) INTO v_dormant_customers;
  SELECT COALESCE(top80.top80_count, 0) INTO v_top80_customers
  FROM app.metrics_tenant_top80_cache top80
  WHERE top80.tenant_id = p_tenant_id AND top80.entity_kind = 'customers' AND top80.grain = 'quarter' AND top80.period_start = v_quarter.period_start;

  -- metrics_product_snapshot (formerly joined here for available/low_stock/days_cover)
  -- has had no writer anywhere in the schema since 2026-08 and was silently serving
  -- month-stale stock state to these KPIs. Replaced with the same live tenant_inventory
  -- + app.kpi_product_daily computation already used by search_brand_products_detail.
  WITH product_stock AS (
    SELECT
      i.tenant_product_id,
      SUM(GREATEST(COALESCE(i.qty_available, 0) - COALESCE(i.qty_reserved, 0), 0))::numeric AS available,
      SUM(COALESCE(i.reorder_point, 0))::numeric AS reorder_point
    FROM app.tenant_inventory i
    JOIN app.tenant_products tp ON tp.id = i.tenant_product_id AND tp.tenant_id = p_tenant_id AND tp.deleted_at IS NULL
    WHERE i.deleted_at IS NULL
    GROUP BY i.tenant_product_id
  ), product_velocity AS (
    SELECT ps_v.tenant_product_id, ps_v.invoice_units::numeric AS units_period
    FROM app.metrics_product_period_summary ps_v
    WHERE ps_v.tenant_id = p_tenant_id AND ps_v.grain = 'quarter' AND ps_v.period_start = v_quarter.period_start AND ps_v.deleted_at IS NULL
  )
  SELECT
    COUNT(*) FILTER (WHERE ps.invoice_count > 0)::bigint,
    COUNT(*) FILTER (WHERE ps.invoice_count > 0 AND COALESCE(pst.available, 0) <= 0)::bigint,
    COUNT(*) FILTER (WHERE ps.invoice_count > 0 AND (
      (COALESCE(pst.available, 0) > 0 AND COALESCE(pst.available, 0) <= COALESCE(pst.reorder_point, 0))
      OR CASE WHEN COALESCE(pv.units_period, 0) > 0
           THEN COALESCE(pst.available, 0) / (pv.units_period / GREATEST((v_now::date - v_quarter.period_start)::numeric + 1, 1))
           ELSE 999999
         END <= 14
    ))::bigint
  INTO v_sold_products, v_oos_products, v_low_products
  FROM app.metrics_product_period_summary ps
  LEFT JOIN product_stock pst ON pst.tenant_product_id = ps.tenant_product_id
  LEFT JOIN product_velocity pv ON pv.tenant_product_id = ps.tenant_product_id
  WHERE ps.tenant_id = p_tenant_id AND ps.grain = 'quarter' AND ps.period_start = v_quarter.period_start AND ps.deleted_at IS NULL;

  WITH product_stock AS (
    SELECT
      i.tenant_product_id,
      SUM(GREATEST(COALESCE(i.qty_available, 0) - COALESCE(i.qty_reserved, 0), 0))::numeric AS available
    FROM app.tenant_inventory i
    JOIN app.tenant_products tp ON tp.id = i.tenant_product_id AND tp.tenant_id = p_tenant_id AND tp.deleted_at IS NULL
    WHERE i.deleted_at IS NULL
    GROUP BY i.tenant_product_id
  )
  SELECT COUNT(*)::bigint INTO v_no_sale_products
  FROM app.tenant_products tp
  LEFT JOIN product_stock pst ON pst.tenant_product_id = tp.id
  WHERE tp.tenant_id = p_tenant_id AND tp.deleted_at IS NULL AND tp.is_active AND COALESCE(pst.available, 0) > 0
    AND NOT EXISTS (
      SELECT 1 FROM app.metrics_product_period_summary ps
      WHERE ps.tenant_id = p_tenant_id AND ps.tenant_product_id = tp.id
        AND ps.grain = 'quarter' AND ps.period_start = v_quarter.period_start AND ps.deleted_at IS NULL AND ps.invoice_count > 0
    );

  SELECT COUNT(*) FILTER (WHERE cps.invoice_count > 0)::bigint INTO v_sold_categories
  FROM app.metrics_category_period_summary cps
  WHERE cps.tenant_id = p_tenant_id AND cps.grain = 'quarter' AND cps.period_start = v_quarter.period_start AND cps.deleted_at IS NULL;

  WITH product_stock AS (
    SELECT
      i.tenant_product_id,
      SUM(GREATEST(COALESCE(i.qty_available, 0) - COALESCE(i.qty_reserved, 0), 0))::numeric AS available,
      SUM(COALESCE(i.reorder_point, 0))::numeric AS reorder_point
    FROM app.tenant_inventory i
    JOIN app.tenant_products tp ON tp.id = i.tenant_product_id AND tp.tenant_id = p_tenant_id AND tp.deleted_at IS NULL
    WHERE i.deleted_at IS NULL
    GROUP BY i.tenant_product_id
  ), product_velocity AS (
    SELECT ps_v.tenant_product_id, ps_v.invoice_units::numeric AS units_period
    FROM app.metrics_product_period_summary ps_v
    WHERE ps_v.tenant_id = p_tenant_id AND ps_v.grain = 'quarter' AND ps_v.period_start = v_quarter.period_start AND ps_v.deleted_at IS NULL
  )
  SELECT
    COUNT(DISTINCT tp.tenant_category_id) FILTER (WHERE COALESCE(pst.available, 0) <= 0)::bigint,
    COUNT(DISTINCT tp.tenant_category_id) FILTER (WHERE
      (COALESCE(pst.available, 0) > 0 AND COALESCE(pst.available, 0) <= COALESCE(pst.reorder_point, 0))
      OR CASE WHEN COALESCE(pv.units_period, 0) > 0
           THEN COALESCE(pst.available, 0) / (pv.units_period / GREATEST((v_now::date - v_quarter.period_start)::numeric + 1, 1))
           ELSE 999999
         END <= 14
    )::bigint
  INTO v_oos_categories, v_low_categories
  FROM app.metrics_product_period_summary ps
  JOIN app.tenant_products tp ON tp.id = ps.tenant_product_id
  LEFT JOIN product_stock pst ON pst.tenant_product_id = ps.tenant_product_id
  LEFT JOIN product_velocity pv ON pv.tenant_product_id = ps.tenant_product_id
  WHERE ps.tenant_id = p_tenant_id AND ps.grain = 'quarter' AND ps.period_start = v_quarter.period_start AND ps.deleted_at IS NULL AND ps.invoice_count > 0;
  SELECT COUNT(*)::bigint INTO v_no_sale_categories
  FROM app.tenant_categories tc
  WHERE tc.tenant_id = p_tenant_id AND tc.deleted_at IS NULL AND tc.is_active
    AND NOT EXISTS (
      SELECT 1 FROM app.metrics_category_period_summary cps
      WHERE cps.tenant_id = p_tenant_id AND cps.tenant_category_id = tc.id
        AND cps.grain = 'quarter' AND cps.period_start = v_quarter.period_start AND cps.deleted_at IS NULL
    );

  SELECT COUNT(DISTINCT pli.tenant_product_id)::bigint,
         COUNT(DISTINCT pli.tenant_product_id) FILTER (WHERE pli.price < tp.base_selling_price)::bigint
  INTO v_custom_price_products, v_below_base_products
  FROM app.price_list_items pli
  JOIN app.price_lists pl ON pl.id = pli.price_list_id
  JOIN app.tenant_products tp ON tp.id = pli.tenant_product_id
  WHERE pl.tenant_id = p_tenant_id AND pl.deleted_at IS NULL AND pli.deleted_at IS NULL
    AND pl.is_active AND pl.valid_from <= v_now AND (pl.valid_to IS NULL OR pl.valid_to >= v_now);
  SELECT COUNT(DISTINCT buyer_id)::bigint INTO v_custom_price_buyers FROM (
    SELECT pla.target_id AS buyer_id
    FROM app.price_list_assignments pla
    JOIN app.price_lists pl ON pl.id = pla.price_list_id
    WHERE pl.tenant_id = p_tenant_id AND pla.deleted_at IS NULL AND pla.target_type = 'buyer'
      AND pl.deleted_at IS NULL AND pl.is_active AND pl.valid_from <= v_now AND (pl.valid_to IS NULL OR pl.valid_to >= v_now)
    UNION
    SELECT cm.buyer_id
    FROM app.price_list_assignments pla
    JOIN app.price_lists pl ON pl.id = pla.price_list_id
    JOIN app.cohort_members_active cm ON cm.cohort_id = pla.target_id
    WHERE pl.tenant_id = p_tenant_id AND pla.deleted_at IS NULL AND pla.target_type = 'cohort'
      AND pl.deleted_at IS NULL AND pl.is_active AND pl.valid_from <= v_now AND (pl.valid_to IS NULL OR pl.valid_to >= v_now)
  ) x WHERE buyer_id IS NOT NULL;
  SELECT COUNT(*)::bigint INTO v_expiring_price_lists
  FROM app.price_lists pl WHERE pl.tenant_id = p_tenant_id AND pl.deleted_at IS NULL AND pl.is_active
    AND pl.valid_to IS NOT NULL AND pl.valid_to >= v_now AND pl.valid_to < v_now + interval '7 days';

  SELECT COUNT(*)::bigint INTO v_active_brands
  FROM app.metrics_brand_period_summary bps WHERE bps.tenant_id = p_tenant_id AND bps.grain = 'month' AND bps.period_start = v_period.period_start AND bps.deleted_at IS NULL;
  SELECT COALESCE(top80.top80_count, 0) INTO v_top80_brands
  FROM app.metrics_tenant_top80_cache top80
  WHERE top80.tenant_id = p_tenant_id AND top80.entity_kind = 'brands' AND top80.grain = 'month' AND top80.period_start = v_period.period_start;
  SELECT GREATEST(COALESCE(v_now_summary.active_brand_count,0) - COALESCE(v_active_brands,0), 0) INTO v_no_sale_brands;
  SELECT COUNT(*)::bigint INTO v_dormant_brands
  FROM app.metrics_brand_period_summary prev
  WHERE prev.tenant_id = p_tenant_id AND prev.grain = 'month' AND prev.period_start = v_period.previous_start AND prev.deleted_at IS NULL
    AND NOT EXISTS (
      SELECT 1 FROM app.metrics_brand_period_summary cur
      WHERE cur.tenant_id = p_tenant_id AND cur.tenant_brand_id = prev.tenant_brand_id
        AND cur.grain = 'month' AND cur.period_start = v_period.period_start AND cur.deleted_at IS NULL
    );
  END IF;

  IF v_run_buyer_app THEN
  SELECT COUNT(*)::bigint,
         COUNT(*) FILTER (WHERE c.valid_to IS NOT NULL AND c.valid_to < v_now + interval '7 days')::bigint
  INTO v_live_campaigns, v_live_campaigns_expiring
  FROM app.campaigns c
  WHERE c.tenant_id = p_tenant_id AND c.deleted_at IS NULL AND c.status = 'published'
    AND c.valid_from <= v_now AND (c.valid_to IS NULL OR c.valid_to >= v_now);
  SELECT
    COALESCE(SUM(view_count),0)::bigint, COALESCE(SUM(viewed_buyer_count),0)::bigint,
    COALESCE(SUM(estimate_count + order_count),0)::bigint, COALESCE(SUM(estimate_value + order_value),0)::numeric,
    COALESCE(SUM(demand_buyer_count),0)::bigint,
    COALESCE(SUM(invoice_count),0)::bigint, COALESCE(SUM(invoice_value),0)::numeric, COALESCE(SUM(revenue_buyer_count),0)::bigint
  INTO v_campaign_views, v_campaign_openers, v_campaign_demand_count, v_campaign_demand_value, v_campaign_demand_buyers,
       v_campaign_invoice_count, v_campaign_invoice_value, v_campaign_invoice_buyers
  FROM app.metrics_campaign_period_summary
  WHERE tenant_id = p_tenant_id AND grain = 'quarter' AND period_start = v_quarter.period_start AND deleted_at IS NULL;
  END IF;

  IF v_run_commercial OR v_run_buyer_app THEN
  SELECT COUNT(*)::bigint INTO v_active_groups FROM app.cohorts c WHERE c.tenant_id = p_tenant_id AND c.deleted_at IS NULL;
  SELECT COUNT(DISTINCT cm.buyer_id)::bigint INTO v_grouped_buyers
  FROM app.cohorts c JOIN app.cohort_members_active cm ON cm.cohort_id = c.id
  WHERE c.tenant_id = p_tenant_id AND c.deleted_at IS NULL;
  SELECT COUNT(*)::bigint INTO v_valuable_no_group
  FROM app.metrics_buyer_period_summary bps
  WHERE bps.tenant_id = p_tenant_id AND bps.grain = 'quarter' AND bps.period_start = v_quarter.period_start
    AND bps.deleted_at IS NULL AND bps.invoice_value > 0
    AND NOT EXISTS (SELECT 1 FROM app.cohort_members_active cm WHERE cm.buyer_id = bps.buyer_id);
  SELECT COUNT(DISTINCT cps.cohort_id)::bigint INTO v_grouped_purchased
  FROM app.metrics_cohort_period_summary cps
  WHERE cps.tenant_id = p_tenant_id AND cps.grain = 'quarter' AND cps.period_start = v_quarter.period_start
    AND cps.deleted_at IS NULL AND cps.active_member_count > 0;
  END IF;

  IF v_run_commercial OR v_run_inventory THEN
  SELECT COALESCE(top80.top80_count, 0) INTO v_top80_locations
  FROM app.metrics_tenant_top80_cache top80
  WHERE top80.tenant_id = p_tenant_id AND top80.entity_kind = 'locations' AND top80.grain = 'month' AND top80.period_start = v_period.period_start;
  END IF;

  IF v_run_inventory THEN
  SELECT COALESCE(SUM(ws.sellable_units),0), COALESCE(SUM(ws.tracked_skus),0), COALESCE(SUM(ws.stockout_skus),0)
  INTO v_sellable_units, v_warehouse_skus, v_warehouse_oos
  FROM app.warehouses_snapshot ws WHERE ws.tenant_id = p_tenant_id;
  SELECT COUNT(*)::bigint INTO v_warehouse_no_sales
  FROM app.warehouses_snapshot ws
  WHERE ws.tenant_id = p_tenant_id AND ws.sellable_units > 0
    AND NOT EXISTS (
      SELECT 1 FROM app.metrics_warehouse_period_summary wps
      WHERE wps.tenant_id = p_tenant_id AND wps.warehouse_id = ws.warehouse_id
        AND wps.grain = 'quarter' AND wps.period_start = v_quarter.period_start AND wps.deleted_at IS NULL
    );
  END IF;

  IF v_run_commercial THEN
  v_rows := v_rows + app._metrics_v4_upsert_landing_kpis(p_tenant_id, 'dashboard', 'this_month', v_period.period_start, jsonb_build_array(
    app.metrics_v4_kpi('invoiced_sales', COALESCE((SELECT invoice_value FROM app.metrics_tenant_period_summary WHERE tenant_id = p_tenant_id AND grain = 'month' AND period_start = v_period.period_start AND deleted_at IS NULL),0), COALESCE((SELECT invoice_buyer_count FROM app.metrics_tenant_period_summary WHERE tenant_id = p_tenant_id AND grain = 'month' AND period_start = v_period.period_start AND deleted_at IS NULL),0), COALESCE((SELECT invoice_count FROM app.metrics_tenant_period_summary WHERE tenant_id = p_tenant_id AND grain = 'month' AND period_start = v_period.period_start AND deleted_at IS NULL),0), NULL, 'month', jsonb_build_object('target','invoices','date_period','this_month')),
    app.metrics_v4_kpi('demand', COALESCE((SELECT primary_demand_value FROM app.metrics_tenant_period_summary WHERE tenant_id = p_tenant_id AND grain = 'month' AND period_start = v_period.period_start AND deleted_at IS NULL),0), COALESCE((SELECT primary_demand_buyer_count FROM app.metrics_tenant_period_summary WHERE tenant_id = p_tenant_id AND grain = 'month' AND period_start = v_period.period_start AND deleted_at IS NULL),0), COALESCE((SELECT primary_demand_count FROM app.metrics_tenant_period_summary WHERE tenant_id = p_tenant_id AND grain = 'month' AND period_start = v_period.period_start AND deleted_at IS NULL),0), NULL, 'month', jsonb_build_object('target', v_primary, 'date_period','this_month')),
    app.metrics_v4_kpi('outstanding_dues', COALESCE(v_now_summary.receivable_amount,0), COALESCE((SELECT COUNT(*) FROM app.metrics_buyer_now_summary WHERE tenant_id = p_tenant_id AND receivable_amount > 0 AND deleted_at IS NULL),0), COALESCE(v_now_summary.receivable_invoice_count,0), NULL, 'now', jsonb_build_object('target','invoices','balance_gt',0)),
    app.metrics_v4_kpi('overdue_receivables', COALESCE(v_now_summary.overdue_amount,0), COALESCE((SELECT COUNT(*) FROM app.metrics_buyer_now_summary WHERE tenant_id = p_tenant_id AND overdue_amount > 0 AND deleted_at IS NULL),0), COALESCE(v_now_summary.overdue_invoice_count,0), NULL, 'now', jsonb_build_object('target','invoices','overdue',true))
  ), v_watermark);

  v_rows := v_rows + app._metrics_v4_upsert_landing_kpis(p_tenant_id, 'estimates', 'this_month', v_period.period_start, jsonb_build_array(
    app.metrics_v4_kpi('estimate_value_created', COALESCE((SELECT estimate_value FROM app.metrics_tenant_period_summary WHERE tenant_id = p_tenant_id AND grain = 'month' AND period_start = v_period.period_start AND deleted_at IS NULL),0), COALESCE((SELECT estimate_buyer_count FROM app.metrics_tenant_period_summary WHERE tenant_id = p_tenant_id AND grain = 'month' AND period_start = v_period.period_start AND deleted_at IS NULL),0), COALESCE((SELECT estimate_count FROM app.metrics_tenant_period_summary WHERE tenant_id = p_tenant_id AND grain = 'month' AND period_start = v_period.period_start AND deleted_at IS NULL),0), NULL, 'month', jsonb_build_object('date_period','this_month')),
    app.metrics_v4_kpi('open_estimates', COALESCE(v_now_summary.open_estimate_value,0), COALESCE((SELECT COUNT(DISTINCT buyer_id) FROM app.estimates WHERE tenant_id = p_tenant_id AND deleted_at IS NULL AND app.estimate_status_is_open(status)),0), COALESCE(v_now_summary.open_estimate_count,0), NULL, 'now', jsonb_build_object('status','open')),
    app.metrics_v4_kpi('awaiting_action_3d', v_est_awaiting_value, v_est_awaiting_buyers, v_est_awaiting_count, NULL, 'now', jsonb_build_object('status','sent','age_gte_days',3)),
    app.metrics_v4_kpi('expiring_7d', v_est_expiring_value, v_est_expiring_buyers, v_est_expiring_count, NULL, 'now', jsonb_build_object('expiry_lte_days',7))
  ), v_watermark);

  v_rows := v_rows + app._metrics_v4_upsert_landing_kpis(p_tenant_id, 'orders', 'this_month', v_period.period_start, jsonb_build_array(
    app.metrics_v4_kpi('order_value_created', COALESCE((SELECT order_value FROM app.metrics_tenant_period_summary WHERE tenant_id = p_tenant_id AND grain = 'month' AND period_start = v_period.period_start AND deleted_at IS NULL),0), COALESCE((SELECT order_buyer_count FROM app.metrics_tenant_period_summary WHERE tenant_id = p_tenant_id AND grain = 'month' AND period_start = v_period.period_start AND deleted_at IS NULL),0), COALESCE((SELECT order_count FROM app.metrics_tenant_period_summary WHERE tenant_id = p_tenant_id AND grain = 'month' AND period_start = v_period.period_start AND deleted_at IS NULL),0), NULL, 'month', jsonb_build_object('date_period','this_month')),
    app.metrics_v4_kpi('open_orders', COALESCE(v_now_summary.open_order_value,0), COALESCE((SELECT COUNT(DISTINCT buyer_id) FROM app.orders WHERE tenant_id = p_tenant_id AND deleted_at IS NULL AND app.order_status_is_open(status)),0), COALESCE(v_now_summary.open_order_count,0), NULL, 'now', jsonb_build_object('status','open')),
    app.metrics_v4_kpi('waiting_confirmation', v_ord_waiting_value, v_ord_waiting_buyers, v_ord_waiting_count, NULL, 'now', jsonb_build_object('status','received')),
    app.metrics_v4_kpi('awaiting_dispatch_3d', v_ord_dispatch_value, v_ord_dispatch_buyers, v_ord_dispatch_count, NULL, 'now', jsonb_build_object('status','confirmed','age_gte_days',3))
  ), v_watermark);

  v_rows := v_rows + app._metrics_v4_upsert_landing_kpis(p_tenant_id, 'invoices', 'this_month', v_period.period_start, jsonb_build_array(
    app.metrics_v4_kpi('invoiced_sales', COALESCE((SELECT invoice_value FROM app.metrics_tenant_period_summary WHERE tenant_id = p_tenant_id AND grain = 'month' AND period_start = v_period.period_start AND deleted_at IS NULL),0), COALESCE((SELECT invoice_buyer_count FROM app.metrics_tenant_period_summary WHERE tenant_id = p_tenant_id AND grain = 'month' AND period_start = v_period.period_start AND deleted_at IS NULL),0), COALESCE((SELECT invoice_count FROM app.metrics_tenant_period_summary WHERE tenant_id = p_tenant_id AND grain = 'month' AND period_start = v_period.period_start AND deleted_at IS NULL),0), NULL, 'month', jsonb_build_object('date_period','this_month')),
    app.metrics_v4_kpi('outstanding_dues', COALESCE(v_now_summary.receivable_amount,0), COALESCE((SELECT COUNT(*) FROM app.metrics_buyer_now_summary WHERE tenant_id = p_tenant_id AND receivable_amount > 0 AND deleted_at IS NULL),0), COALESCE(v_now_summary.receivable_invoice_count,0), NULL, 'now', jsonb_build_object('balance_gt',0)),
    app.metrics_v4_kpi('overdue_receivables', COALESCE(v_now_summary.overdue_amount,0), COALESCE((SELECT COUNT(*) FROM app.metrics_buyer_now_summary WHERE tenant_id = p_tenant_id AND overdue_amount > 0 AND deleted_at IS NULL),0), COALESCE(v_now_summary.overdue_invoice_count,0), NULL, 'now', jsonb_build_object('overdue',true)),
    app.metrics_v4_kpi('due_7d', v_due_7_value, v_due_7_buyers, v_due_7_count, NULL, 'now', jsonb_build_object('due_lte_days',7))
  ), v_watermark);

  v_rows := v_rows + app._metrics_v4_upsert_landing_kpis(p_tenant_id, 'customers', 'this_quarter', v_quarter.period_start, jsonb_build_array(
    app.metrics_v4_kpi('active_customers', v_active_customers, v_active_customers, NULL, NULL, 'quarter', jsonb_build_object('purchased_gte',1,'period','this_quarter')),
    app.metrics_v4_kpi('dormant_customers', v_dormant_customers, v_dormant_customers, NULL, NULL, 'quarter', jsonb_build_object('dormant_period','this_quarter')),
    app.metrics_v4_kpi('overdue_receivables', COALESCE(v_now_summary.overdue_amount,0), COALESCE((SELECT COUNT(*) FROM app.metrics_buyer_now_summary WHERE tenant_id = p_tenant_id AND overdue_amount > 0 AND deleted_at IS NULL),0), COALESCE(v_now_summary.overdue_invoice_count,0), NULL, 'now', jsonb_build_object('overdue',true)),
    app.metrics_v4_kpi('top80_customers', v_top80_customers, v_top80_customers, NULL, NULL, 'quarter', jsonb_build_object('sort','invoice_value_desc','cutoff','top80'))
  ), v_watermark);

  v_rows := v_rows + app._metrics_v4_upsert_landing_kpis(p_tenant_id, 'products', 'this_quarter', v_quarter.period_start, jsonb_build_array(
    app.metrics_v4_kpi('products_sold', v_sold_products, v_sold_products, NULL, NULL, 'quarter', jsonb_build_object('sold_gte',1,'period','this_quarter')),
    app.metrics_v4_kpi('recently_sold_oos', v_oos_products, v_oos_products, NULL, NULL, 'quarter_now', jsonb_build_object('sold_period','this_quarter','stock','out')),
    app.metrics_v4_kpi('running_low', v_low_products, v_low_products, NULL, NULL, 'quarter_now', jsonb_build_object('sold_period','this_quarter','stock','low')),
    app.metrics_v4_kpi('did_not_sell', v_no_sale_products, v_no_sale_products, NULL, NULL, 'quarter_now', jsonb_build_object('not_sold_period','this_quarter','stock_gt',0))
  ), v_watermark);

  -- buyer_app KPIs stored under 'this_quarter' since all 4 cards are NOW or quarter-scoped
  v_rows := v_rows + app._metrics_v4_upsert_landing_kpis(p_tenant_id, 'buyer_app', 'this_quarter', v_quarter.period_start, jsonb_build_array(
    app.metrics_v4_kpi('customers_with_access', COALESCE(v_now_summary.enabled_buyer_count,0), COALESCE(v_now_summary.enabled_buyer_count,0), NULL, COALESCE(v_now_summary.active_buyer_count,0), 'now', jsonb_build_object('buyer_app_enabled',true)),
    app.metrics_v4_kpi('app_sourced_demand_qtd', COALESCE((SELECT app_estimate_value + app_order_value FROM app.metrics_tenant_period_summary WHERE tenant_id = p_tenant_id AND grain = 'quarter' AND period_start = v_quarter.period_start AND deleted_at IS NULL),0), COALESCE((SELECT app_estimate_buyer_count + app_order_buyer_count FROM app.metrics_tenant_period_summary WHERE tenant_id = p_tenant_id AND grain = 'quarter' AND period_start = v_quarter.period_start AND deleted_at IS NULL),0), COALESCE((SELECT app_estimate_count + app_order_count FROM app.metrics_tenant_period_summary WHERE tenant_id = p_tenant_id AND grain = 'quarter' AND period_start = v_quarter.period_start AND deleted_at IS NULL),0), COALESCE((SELECT estimate_value + order_value FROM app.metrics_tenant_period_summary WHERE tenant_id = p_tenant_id AND grain = 'quarter' AND period_start = v_quarter.period_start AND deleted_at IS NULL),0), 'quarter', jsonb_build_object('source','buyer_app','period','this_quarter')),
    app.metrics_v4_kpi('app_sourced_invoiced_sales_qtd', COALESCE((SELECT SUM(i.total_amount) FROM app.invoices i WHERE i.tenant_id = p_tenant_id AND i.is_buyer_app_invoice = true AND app.invoice_status_gmv_included(i.status) AND i.deleted_at IS NULL AND i.invoice_date >= v_quarter.period_start AND i.invoice_date < v_quarter.period_end_exclusive),0), COALESCE((SELECT COUNT(DISTINCT i.buyer_id) FROM app.invoices i WHERE i.tenant_id = p_tenant_id AND i.is_buyer_app_invoice = true AND app.invoice_status_gmv_included(i.status) AND i.deleted_at IS NULL AND i.invoice_date >= v_quarter.period_start AND i.invoice_date < v_quarter.period_end_exclusive),0), COALESCE((SELECT COUNT(*) FROM app.invoices i WHERE i.tenant_id = p_tenant_id AND i.is_buyer_app_invoice = true AND app.invoice_status_gmv_included(i.status) AND i.deleted_at IS NULL AND i.invoice_date >= v_quarter.period_start AND i.invoice_date < v_quarter.period_end_exclusive),0), COALESCE((SELECT invoice_value FROM app.metrics_tenant_period_summary WHERE tenant_id = p_tenant_id AND grain = 'quarter' AND period_start = v_quarter.period_start AND deleted_at IS NULL),0), 'quarter', jsonb_build_object('source','buyer_app','period','this_quarter','is_buyer_app_invoice',true)),
    app.metrics_v4_kpi('app_no_order_customers_qtd', GREATEST(COALESCE(v_now_summary.enabled_buyer_count,0) - COALESCE((SELECT COUNT(*) FROM app.metrics_buyer_period_summary WHERE tenant_id = p_tenant_id AND grain = 'quarter' AND period_start = v_quarter.period_start AND app_demand_count >= 1 AND deleted_at IS NULL),0), 0), GREATEST(COALESCE(v_now_summary.enabled_buyer_count,0) - COALESCE((SELECT COUNT(*) FROM app.metrics_buyer_period_summary WHERE tenant_id = p_tenant_id AND grain = 'quarter' AND period_start = v_quarter.period_start AND app_demand_count >= 1 AND deleted_at IS NULL),0), 0), NULL, COALESCE(v_now_summary.enabled_buyer_count,0), 'quarter', jsonb_build_object('source','buyer_app','period','this_quarter','buyer_app_enabled',true,'app_demand_count_is_zero',true))
  ), v_watermark);
  END IF;

  IF v_run_buyer_app THEN
  v_rows := v_rows + app._metrics_v4_upsert_landing_kpis(p_tenant_id, 'campaigns', 'this_quarter', v_quarter.period_start, jsonb_build_array(
    app.metrics_v4_kpi('live_campaigns', v_live_campaigns, v_live_campaigns, NULL, v_live_campaigns_expiring, 'now', jsonb_build_object('status','live')),
    app.metrics_v4_kpi('campaign_open_rate', v_campaign_openers, v_campaign_openers, v_campaign_views, NULL, 'quarter', jsonb_build_object('period','this_quarter','has_views',true)),
    app.metrics_v4_kpi('campaign_demand', v_campaign_demand_value, v_campaign_demand_buyers, v_campaign_demand_count, NULL, 'quarter', jsonb_build_object('period','this_quarter','has_demand',true)),
    app.metrics_v4_kpi('campaign_revenue', v_campaign_invoice_value, v_campaign_invoice_buyers, v_campaign_invoice_count, NULL, 'quarter', jsonb_build_object('period','this_quarter','has_revenue',true))
  ), v_watermark);
  END IF;

  IF v_run_commercial OR v_run_buyer_app THEN
  v_rows := v_rows + app._metrics_v4_upsert_landing_kpis(p_tenant_id, 'customer_groups', 'this_quarter', v_quarter.period_start, jsonb_build_array(
    app.metrics_v4_kpi('active_groups', v_active_groups, v_active_groups, NULL, v_grouped_buyers, 'now', jsonb_build_object('status','active')),
    app.metrics_v4_kpi('customers_assigned', v_grouped_buyers, v_grouped_buyers, NULL, COALESCE(v_now_summary.active_buyer_count,0), 'now', jsonb_build_object('group','not_null')),
    app.metrics_v4_kpi('valuable_no_group', v_valuable_no_group, v_valuable_no_group, NULL, NULL, 'quarter_now', jsonb_build_object('group','none','valuable_period','this_quarter')),
    app.metrics_v4_kpi('grouped_purchased', v_grouped_purchased, v_grouped_purchased, NULL, NULL, 'quarter', jsonb_build_object('member_purchased_period','this_quarter'))
  ), v_watermark);
  END IF;

  IF v_run_commercial THEN
  v_rows := v_rows + app._metrics_v4_upsert_landing_kpis(p_tenant_id, 'price_lists', 'now', (v_now AT TIME ZONE 'Asia/Kolkata')::date, jsonb_build_array(
    app.metrics_v4_kpi('custom_price_products', v_custom_price_products, v_custom_price_products, NULL, COALESCE(v_now_summary.active_product_count,0), 'now', jsonb_build_object('has_custom_price',true)),
    app.metrics_v4_kpi('custom_price_customers', v_custom_price_buyers, v_custom_price_buyers, NULL, COALESCE(v_now_summary.active_buyer_count,0), 'now', jsonb_build_object('has_custom_pricing',true)),
    app.metrics_v4_kpi('below_base_products', v_below_base_products, v_below_base_products, NULL, NULL, 'now', jsonb_build_object('price_below_base',true)),
    app.metrics_v4_kpi('expiring_7d', v_expiring_price_lists, v_expiring_price_lists, NULL, NULL, 'now', jsonb_build_object('expiry_lte_days',7))
  ), v_watermark);

  v_rows := v_rows + app._metrics_v4_upsert_landing_kpis(p_tenant_id, 'brands', 'this_month', v_period.period_start, jsonb_build_array(
    app.metrics_v4_kpi('active_brands', v_active_brands, v_active_brands, NULL, COALESCE(v_now_summary.active_brand_count,0), 'month', jsonb_build_object('sold_period','this_month')),
    app.metrics_v4_kpi('top80_brands', v_top80_brands, v_top80_brands, NULL, NULL, 'month', jsonb_build_object('sort','invoice_value_desc','cutoff','top80')),
    app.metrics_v4_kpi('did_not_sell', v_no_sale_brands, v_no_sale_brands, NULL, NULL, 'month', jsonb_build_object('not_sold_period','this_month')),
    app.metrics_v4_kpi('dormant_brands', v_dormant_brands, v_dormant_brands, NULL, NULL, 'month', jsonb_build_object('sold_previous_period',true,'sold_current_period',false))
  ), v_watermark);
  END IF;

  IF v_run_commercial OR v_run_inventory THEN
  v_rows := v_rows + app._metrics_v4_upsert_landing_kpis(p_tenant_id, 'locations', 'this_month', v_period.period_start, jsonb_build_array(
    app.metrics_v4_kpi('invoiced_sales', COALESCE((SELECT SUM(invoice_value) FROM app.metrics_location_period_summary WHERE tenant_id = p_tenant_id AND grain = 'month' AND period_start = v_period.period_start AND deleted_at IS NULL),0), COALESCE((SELECT COUNT(*) FROM app.metrics_location_period_summary WHERE tenant_id = p_tenant_id AND grain = 'month' AND period_start = v_period.period_start AND invoice_value > 0 AND deleted_at IS NULL),0), COALESCE((SELECT SUM(invoice_count)::bigint FROM app.metrics_location_period_summary WHERE tenant_id = p_tenant_id AND grain = 'month' AND period_start = v_period.period_start AND deleted_at IS NULL),0), NULL, 'month', jsonb_build_object('target','invoices','period','this_month')),
    app.metrics_v4_kpi('open_demand', COALESCE(v_now_summary.open_estimate_value,0) + COALESCE(v_now_summary.open_order_value,0), COALESCE((SELECT COUNT(*) FROM app.metrics_location_now_summary WHERE tenant_id = p_tenant_id AND (open_estimate_count + open_order_count) > 0 AND deleted_at IS NULL),0), COALESCE(v_now_summary.open_estimate_count,0) + COALESCE(v_now_summary.open_order_count,0), NULL, 'now', jsonb_build_object('open_demand',true)),
    app.metrics_v4_kpi('overdue_receivables', COALESCE(v_now_summary.overdue_amount,0), COALESCE((SELECT COUNT(*) FROM app.metrics_location_now_summary WHERE tenant_id = p_tenant_id AND overdue_amount > 0 AND deleted_at IS NULL),0), COALESCE(v_now_summary.overdue_invoice_count,0), NULL, 'now', jsonb_build_object('overdue',true)),
    app.metrics_v4_kpi('top80_locations', v_top80_locations, v_top80_locations, NULL, NULL, 'month', jsonb_build_object('sort','invoice_value_desc','cutoff','top80'))
  ), v_watermark);
  END IF;

  IF v_run_inventory THEN
  v_rows := v_rows + app._metrics_v4_upsert_landing_kpis(p_tenant_id, 'warehouses', 'this_quarter', v_quarter.period_start, jsonb_build_array(
    app.metrics_v4_kpi('sellable_units', v_sellable_units, COALESCE(v_warehouse_skus,0), NULL, NULL, 'now', jsonb_build_object('stock','sellable')),
    app.metrics_v4_kpi('unique_skus', COALESCE(v_warehouse_skus,0), COALESCE(v_now_summary.active_warehouse_count,0), NULL, NULL, 'now', jsonb_build_object('context','unique_skus')),
    app.metrics_v4_kpi('recently_sold_oos', COALESCE(v_warehouse_oos,0), COALESCE(v_warehouse_oos,0), NULL, NULL, 'quarter_now', jsonb_build_object('sold_period','this_quarter','stock','out')),
    app.metrics_v4_kpi('no_sales', v_warehouse_no_sales, v_warehouse_no_sales, NULL, NULL, 'quarter_now', jsonb_build_object('not_sold_period','this_quarter','stock_gt',0))
  ), v_watermark);
  END IF;

  IF v_run_commercial THEN
  v_rows := v_rows + app._metrics_v4_upsert_landing_kpis(p_tenant_id, 'categories', 'this_quarter', v_quarter.period_start, jsonb_build_array(
    app.metrics_v4_kpi('categories_sold', v_sold_categories, v_sold_categories, NULL, COALESCE(v_now_summary.active_category_count,0), 'quarter', jsonb_build_object('sold_period','this_quarter')),
    app.metrics_v4_kpi('recently_sold_oos', v_oos_categories, v_oos_categories, NULL, NULL, 'quarter_now', jsonb_build_object('sold_period','this_quarter','stock','out')),
    app.metrics_v4_kpi('running_low', v_low_categories, v_low_categories, NULL, NULL, 'quarter_now', jsonb_build_object('sold_period','this_quarter','stock','low')),
    app.metrics_v4_kpi('did_not_sell', v_no_sale_categories, v_no_sale_categories, NULL, NULL, 'quarter_now', jsonb_build_object('not_sold_period','this_quarter','stock_gt',0))
  ), v_watermark);

  FOR v_period IN SELECT * FROM app.metrics_v4_period_windows(p_as_of)
  LOOP
    IF p_dirty_days IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM unnest(p_dirty_days) d WHERE d >= v_period.period_start AND d < v_period.period_end_exclusive
    ) THEN
      CONTINUE;
    END IF;

    v_rows := v_rows + app._metrics_v4_upsert_landing_kpis(p_tenant_id, 'dashboard', v_period.period_key, v_period.period_start, jsonb_build_array(
      app.metrics_v4_kpi('invoiced_sales', COALESCE((SELECT invoice_value FROM app.metrics_tenant_period_summary WHERE tenant_id = p_tenant_id AND grain = v_period.grain AND period_start = v_period.period_start AND deleted_at IS NULL),0), COALESCE((SELECT invoice_buyer_count FROM app.metrics_tenant_period_summary WHERE tenant_id = p_tenant_id AND grain = v_period.grain AND period_start = v_period.period_start AND deleted_at IS NULL),0), COALESCE((SELECT invoice_count FROM app.metrics_tenant_period_summary WHERE tenant_id = p_tenant_id AND grain = v_period.grain AND period_start = v_period.period_start AND deleted_at IS NULL),0), NULL, v_period.grain, jsonb_build_object('target','invoices','date_period',v_period.period_key)),
      app.metrics_v4_kpi('demand', COALESCE((SELECT primary_demand_value FROM app.metrics_tenant_period_summary WHERE tenant_id = p_tenant_id AND grain = v_period.grain AND period_start = v_period.period_start AND deleted_at IS NULL),0), COALESCE((SELECT primary_demand_buyer_count FROM app.metrics_tenant_period_summary WHERE tenant_id = p_tenant_id AND grain = v_period.grain AND period_start = v_period.period_start AND deleted_at IS NULL),0), COALESCE((SELECT primary_demand_count FROM app.metrics_tenant_period_summary WHERE tenant_id = p_tenant_id AND grain = v_period.grain AND period_start = v_period.period_start AND deleted_at IS NULL),0), NULL, v_period.grain, jsonb_build_object('target', v_primary, 'date_period',v_period.period_key)),
      app.metrics_v4_kpi('outstanding_dues', COALESCE(v_now_summary.receivable_amount,0), COALESCE((SELECT COUNT(*) FROM app.metrics_buyer_now_summary WHERE tenant_id = p_tenant_id AND receivable_amount > 0 AND deleted_at IS NULL),0), COALESCE(v_now_summary.receivable_invoice_count,0), NULL, 'now', jsonb_build_object('target','invoices','balance_gt',0)),
      app.metrics_v4_kpi('overdue_receivables', COALESCE(v_now_summary.overdue_amount,0), COALESCE((SELECT COUNT(*) FROM app.metrics_buyer_now_summary WHERE tenant_id = p_tenant_id AND overdue_amount > 0 AND deleted_at IS NULL),0), COALESCE(v_now_summary.overdue_invoice_count,0), NULL, 'now', jsonb_build_object('target','invoices','overdue',true))
    ), v_watermark);

    v_rows := v_rows + app._metrics_v4_upsert_landing_kpis(p_tenant_id, 'estimates', v_period.period_key, v_period.period_start, jsonb_build_array(
      app.metrics_v4_kpi('estimate_value_created', COALESCE((SELECT estimate_value FROM app.metrics_tenant_period_summary WHERE tenant_id = p_tenant_id AND grain = v_period.grain AND period_start = v_period.period_start AND deleted_at IS NULL),0), COALESCE((SELECT estimate_buyer_count FROM app.metrics_tenant_period_summary WHERE tenant_id = p_tenant_id AND grain = v_period.grain AND period_start = v_period.period_start AND deleted_at IS NULL),0), COALESCE((SELECT estimate_count FROM app.metrics_tenant_period_summary WHERE tenant_id = p_tenant_id AND grain = v_period.grain AND period_start = v_period.period_start AND deleted_at IS NULL),0), NULL, v_period.grain, jsonb_build_object('date_period',v_period.period_key)),
      app.metrics_v4_kpi('open_estimates', COALESCE(v_now_summary.open_estimate_value,0), COALESCE((SELECT COUNT(DISTINCT buyer_id) FROM app.estimates WHERE tenant_id = p_tenant_id AND deleted_at IS NULL AND app.estimate_status_is_open(status)),0), COALESCE(v_now_summary.open_estimate_count,0), NULL, 'now', jsonb_build_object('status','open')),
      app.metrics_v4_kpi('awaiting_action_3d', v_est_awaiting_value, v_est_awaiting_buyers, v_est_awaiting_count, NULL, 'now', jsonb_build_object('status','sent','age_gte_days',3)),
      app.metrics_v4_kpi('expiring_7d', v_est_expiring_value, v_est_expiring_buyers, v_est_expiring_count, NULL, 'now', jsonb_build_object('expiry_lte_days',7))
    ), v_watermark);

    v_rows := v_rows + app._metrics_v4_upsert_landing_kpis(p_tenant_id, 'orders', v_period.period_key, v_period.period_start, jsonb_build_array(
      app.metrics_v4_kpi('order_value_created', COALESCE((SELECT order_value FROM app.metrics_tenant_period_summary WHERE tenant_id = p_tenant_id AND grain = v_period.grain AND period_start = v_period.period_start AND deleted_at IS NULL),0), COALESCE((SELECT order_buyer_count FROM app.metrics_tenant_period_summary WHERE tenant_id = p_tenant_id AND grain = v_period.grain AND period_start = v_period.period_start AND deleted_at IS NULL),0), COALESCE((SELECT order_count FROM app.metrics_tenant_period_summary WHERE tenant_id = p_tenant_id AND grain = v_period.grain AND period_start = v_period.period_start AND deleted_at IS NULL),0), NULL, v_period.grain, jsonb_build_object('date_period',v_period.period_key)),
      app.metrics_v4_kpi('open_orders', COALESCE(v_now_summary.open_order_value,0), COALESCE((SELECT COUNT(DISTINCT buyer_id) FROM app.orders WHERE tenant_id = p_tenant_id AND deleted_at IS NULL AND app.order_status_is_open(status)),0), COALESCE(v_now_summary.open_order_count,0), NULL, 'now', jsonb_build_object('status','open')),
      app.metrics_v4_kpi('waiting_confirmation', v_ord_waiting_value, v_ord_waiting_buyers, v_ord_waiting_count, NULL, 'now', jsonb_build_object('status','received')),
      app.metrics_v4_kpi('awaiting_dispatch_3d', v_ord_dispatch_value, v_ord_dispatch_buyers, v_ord_dispatch_count, NULL, 'now', jsonb_build_object('status','confirmed','age_gte_days',3))
    ), v_watermark);

    v_rows := v_rows + app._metrics_v4_upsert_landing_kpis(p_tenant_id, 'invoices', v_period.period_key, v_period.period_start, jsonb_build_array(
      app.metrics_v4_kpi('invoiced_sales', COALESCE((SELECT invoice_value FROM app.metrics_tenant_period_summary WHERE tenant_id = p_tenant_id AND grain = v_period.grain AND period_start = v_period.period_start AND deleted_at IS NULL),0), COALESCE((SELECT invoice_buyer_count FROM app.metrics_tenant_period_summary WHERE tenant_id = p_tenant_id AND grain = v_period.grain AND period_start = v_period.period_start AND deleted_at IS NULL),0), COALESCE((SELECT invoice_count FROM app.metrics_tenant_period_summary WHERE tenant_id = p_tenant_id AND grain = v_period.grain AND period_start = v_period.period_start AND deleted_at IS NULL),0), NULL, v_period.grain, jsonb_build_object('date_period',v_period.period_key)),
      app.metrics_v4_kpi('outstanding_dues', COALESCE(v_now_summary.receivable_amount,0), COALESCE((SELECT COUNT(*) FROM app.metrics_buyer_now_summary WHERE tenant_id = p_tenant_id AND receivable_amount > 0 AND deleted_at IS NULL),0), COALESCE(v_now_summary.receivable_invoice_count,0), NULL, 'now', jsonb_build_object('balance_gt',0)),
      app.metrics_v4_kpi('overdue_receivables', COALESCE(v_now_summary.overdue_amount,0), COALESCE((SELECT COUNT(*) FROM app.metrics_buyer_now_summary WHERE tenant_id = p_tenant_id AND overdue_amount > 0 AND deleted_at IS NULL),0), COALESCE(v_now_summary.overdue_invoice_count,0), NULL, 'now', jsonb_build_object('overdue',true)),
      app.metrics_v4_kpi('due_7d', v_due_7_value, v_due_7_buyers, v_due_7_count, NULL, 'now', jsonb_build_object('due_lte_days',7))
    ), v_watermark);

    -- buyer_app in the period loop: always use v_quarter data since all 4 cards are NOW or quarter
    v_rows := v_rows + app._metrics_v4_upsert_landing_kpis(p_tenant_id, 'buyer_app', v_period.period_key, v_period.period_start, jsonb_build_array(
      app.metrics_v4_kpi('customers_with_access', COALESCE(v_now_summary.enabled_buyer_count,0), COALESCE(v_now_summary.enabled_buyer_count,0), NULL, COALESCE(v_now_summary.active_buyer_count,0), 'now', jsonb_build_object('buyer_app_enabled',true)),
      app.metrics_v4_kpi('app_sourced_demand_qtd', COALESCE((SELECT app_estimate_value + app_order_value FROM app.metrics_tenant_period_summary WHERE tenant_id = p_tenant_id AND grain = 'quarter' AND period_start = v_quarter.period_start AND deleted_at IS NULL),0), COALESCE((SELECT app_estimate_buyer_count + app_order_buyer_count FROM app.metrics_tenant_period_summary WHERE tenant_id = p_tenant_id AND grain = 'quarter' AND period_start = v_quarter.period_start AND deleted_at IS NULL),0), COALESCE((SELECT app_estimate_count + app_order_count FROM app.metrics_tenant_period_summary WHERE tenant_id = p_tenant_id AND grain = 'quarter' AND period_start = v_quarter.period_start AND deleted_at IS NULL),0), COALESCE((SELECT estimate_value + order_value FROM app.metrics_tenant_period_summary WHERE tenant_id = p_tenant_id AND grain = 'quarter' AND period_start = v_quarter.period_start AND deleted_at IS NULL),0), 'quarter', jsonb_build_object('source','buyer_app','period','this_quarter')),
      app.metrics_v4_kpi('app_sourced_invoiced_sales_qtd', COALESCE((SELECT SUM(i.total_amount) FROM app.invoices i WHERE i.tenant_id = p_tenant_id AND i.is_buyer_app_invoice = true AND app.invoice_status_gmv_included(i.status) AND i.deleted_at IS NULL AND i.invoice_date >= v_quarter.period_start AND i.invoice_date < v_quarter.period_end_exclusive),0), COALESCE((SELECT COUNT(DISTINCT i.buyer_id) FROM app.invoices i WHERE i.tenant_id = p_tenant_id AND i.is_buyer_app_invoice = true AND app.invoice_status_gmv_included(i.status) AND i.deleted_at IS NULL AND i.invoice_date >= v_quarter.period_start AND i.invoice_date < v_quarter.period_end_exclusive),0), COALESCE((SELECT COUNT(*) FROM app.invoices i WHERE i.tenant_id = p_tenant_id AND i.is_buyer_app_invoice = true AND app.invoice_status_gmv_included(i.status) AND i.deleted_at IS NULL AND i.invoice_date >= v_quarter.period_start AND i.invoice_date < v_quarter.period_end_exclusive),0), COALESCE((SELECT invoice_value FROM app.metrics_tenant_period_summary WHERE tenant_id = p_tenant_id AND grain = 'quarter' AND period_start = v_quarter.period_start AND deleted_at IS NULL),0), 'quarter', jsonb_build_object('source','buyer_app','period','this_quarter','is_buyer_app_invoice',true)),
      app.metrics_v4_kpi('app_no_order_customers_qtd', GREATEST(COALESCE(v_now_summary.enabled_buyer_count,0) - COALESCE((SELECT COUNT(*) FROM app.metrics_buyer_period_summary WHERE tenant_id = p_tenant_id AND grain = 'quarter' AND period_start = v_quarter.period_start AND app_demand_count >= 1 AND deleted_at IS NULL),0), 0), GREATEST(COALESCE(v_now_summary.enabled_buyer_count,0) - COALESCE((SELECT COUNT(*) FROM app.metrics_buyer_period_summary WHERE tenant_id = p_tenant_id AND grain = 'quarter' AND period_start = v_quarter.period_start AND app_demand_count >= 1 AND deleted_at IS NULL),0), 0), NULL, COALESCE(v_now_summary.enabled_buyer_count,0), 'quarter', jsonb_build_object('source','buyer_app','period','this_quarter','buyer_app_enabled',true,'app_demand_count_is_zero',true))
    ), v_watermark);

    IF v_period.grain IN ('month','quarter') THEN
      v_rows := v_rows + app._metrics_v4_upsert_landing_kpis(p_tenant_id, 'brands', v_period.period_key, v_period.period_start, jsonb_build_array(
        app.metrics_v4_kpi('active_brands', COALESCE((SELECT COUNT(*) FROM app.metrics_brand_period_summary WHERE tenant_id = p_tenant_id AND grain = v_period.grain AND period_start = v_period.period_start AND deleted_at IS NULL),0), COALESCE((SELECT COUNT(*) FROM app.metrics_brand_period_summary WHERE tenant_id = p_tenant_id AND grain = v_period.grain AND period_start = v_period.period_start AND deleted_at IS NULL),0), NULL, COALESCE(v_now_summary.active_brand_count,0), v_period.grain, jsonb_build_object('sold_period',v_period.period_key)),
        app.metrics_v4_kpi('top80_brands', COALESCE((SELECT COUNT(*) FROM (SELECT tenant_brand_id, SUM(invoice_value) OVER (ORDER BY invoice_value DESC) AS running, SUM(invoice_value) OVER () AS total FROM app.metrics_brand_period_summary WHERE tenant_id = p_tenant_id AND grain = v_period.grain AND period_start = v_period.period_start AND deleted_at IS NULL AND invoice_value > 0) ranked WHERE total > 0 AND running <= total * 0.8),0), COALESCE((SELECT COUNT(*) FROM (SELECT tenant_brand_id, SUM(invoice_value) OVER (ORDER BY invoice_value DESC) AS running, SUM(invoice_value) OVER () AS total FROM app.metrics_brand_period_summary WHERE tenant_id = p_tenant_id AND grain = v_period.grain AND period_start = v_period.period_start AND deleted_at IS NULL AND invoice_value > 0) ranked WHERE total > 0 AND running <= total * 0.8),0), NULL, NULL, v_period.grain, jsonb_build_object('sort','invoice_value_desc','cutoff','top80')),
        app.metrics_v4_kpi('did_not_sell', GREATEST(COALESCE(v_now_summary.active_brand_count,0) - COALESCE((SELECT COUNT(*) FROM app.metrics_brand_period_summary WHERE tenant_id = p_tenant_id AND grain = v_period.grain AND period_start = v_period.period_start AND deleted_at IS NULL),0), 0), GREATEST(COALESCE(v_now_summary.active_brand_count,0) - COALESCE((SELECT COUNT(*) FROM app.metrics_brand_period_summary WHERE tenant_id = p_tenant_id AND grain = v_period.grain AND period_start = v_period.period_start AND deleted_at IS NULL),0), 0), NULL, NULL, v_period.grain, jsonb_build_object('not_sold_period',v_period.period_key)),
        app.metrics_v4_kpi('dormant_brands', COALESCE((SELECT COUNT(*) FROM app.metrics_brand_period_summary prev WHERE prev.tenant_id = p_tenant_id AND prev.grain = v_period.grain AND prev.period_start = CASE WHEN v_period.grain = 'month' THEN (v_period.period_start - interval '1 month')::date ELSE (v_period.period_start - interval '3 months')::date END AND prev.deleted_at IS NULL AND NOT EXISTS (SELECT 1 FROM app.metrics_brand_period_summary cur WHERE cur.tenant_id = p_tenant_id AND cur.tenant_brand_id = prev.tenant_brand_id AND cur.grain = v_period.grain AND cur.period_start = v_period.period_start AND cur.deleted_at IS NULL)),0), COALESCE((SELECT COUNT(*) FROM app.metrics_brand_period_summary prev WHERE prev.tenant_id = p_tenant_id AND prev.grain = v_period.grain AND prev.period_start = CASE WHEN v_period.grain = 'month' THEN (v_period.period_start - interval '1 month')::date ELSE (v_period.period_start - interval '3 months')::date END AND prev.deleted_at IS NULL AND NOT EXISTS (SELECT 1 FROM app.metrics_brand_period_summary cur WHERE cur.tenant_id = p_tenant_id AND cur.tenant_brand_id = prev.tenant_brand_id AND cur.grain = v_period.grain AND cur.period_start = v_period.period_start AND cur.deleted_at IS NULL)),0), NULL, NULL, v_period.grain, jsonb_build_object('sold_previous_period',true,'sold_current_period',false))
      ), v_watermark);
    END IF;
  END LOOP;
  END IF;

  RETURN v_rows;
END;
$function$
;
