-- Fix: sellable_units was returned as numeric with fractional digits because qty_available/qty_reserved
-- columns are numeric in tenant_inventory and SUM of numerics propagates decimals.
-- TRUNC() strips the fractional part at the SQL layer so all callers receive whole-unit values.

-- 1. Landing row metrics (powers warehouse KPI strip)
CREATE OR REPLACE FUNCTION app.get_seller_warehouse_landing_row_metrics_v2(
  p_tenant_id uuid,
  p_warehouse_ids uuid[]
)
RETURNS TABLE(
  warehouse_id uuid,
  tracked_skus bigint,
  sellable_units numeric,
  low_stock_skus bigint,
  stockout_skus bigint,
  idle_stock_skus bigint,
  last_inventory_update timestamptz
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = pg_catalog, app
SET statement_timeout = '15s'
AS $$
  WITH requested AS MATERIALIZED (
    SELECT w.id
    FROM app.warehouses w
    WHERE w.tenant_id = p_tenant_id
      AND w.deleted_at IS NULL
      AND w.id = ANY(COALESCE(p_warehouse_ids, ARRAY[]::uuid[]))
    LIMIT 100
  ), last_sales AS MATERIALIZED (
    SELECT
      ti.warehouse_id,
      ti.tenant_product_id,
      MAX(app.metric_day_ist(i.invoice_date, i.created_at)) AS last_invoice_day
    FROM app.tenant_inventory ti
    JOIN requested r ON r.id = ti.warehouse_id
    LEFT JOIN app.invoice_items ii
      ON ii.tenant_product_id = ti.tenant_product_id
      AND ii.deleted_at IS NULL
    LEFT JOIN app.invoices i
      ON i.id = ii.invoice_id
      AND i.tenant_id = p_tenant_id
      AND i.deleted_at IS NULL
    WHERE ti.deleted_at IS NULL
    GROUP BY ti.warehouse_id, ti.tenant_product_id
  )
  SELECT
    r.id,
    COUNT(DISTINCT ti.tenant_product_id) AS tracked_skus,
    TRUNC(COALESCE(SUM(COALESCE(ti.qty_available, 0) - COALESCE(ti.qty_reserved, 0)), 0)) AS sellable_units,
    COUNT(DISTINCT ti.tenant_product_id) FILTER (
      WHERE COALESCE(ti.qty_available, 0) > 0
        AND ti.reorder_point IS NOT NULL
        AND COALESCE(ti.qty_available, 0) <= ti.reorder_point
    ) AS low_stock_skus,
    COUNT(DISTINCT ti.tenant_product_id) FILTER (WHERE COALESCE(ti.qty_available, 0) <= 0) AS stockout_skus,
    COUNT(DISTINCT ti.tenant_product_id) FILTER (
      WHERE COALESCE(ti.qty_available, 0) > 0
        AND (ls.last_invoice_day IS NULL OR ls.last_invoice_day < ((CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kolkata')::date - 90))
    ) AS idle_stock_skus,
    MAX(ti.updated_at) AS last_inventory_update
  FROM requested r
  LEFT JOIN app.tenant_inventory ti
    ON ti.warehouse_id = r.id
    AND ti.deleted_at IS NULL
  LEFT JOIN last_sales ls
    ON ls.warehouse_id = ti.warehouse_id
    AND ls.tenant_product_id = ti.tenant_product_id
  GROUP BY r.id;
$$;

-- 2. Per-SKU stock search (powers the Stock tab table)
CREATE OR REPLACE FUNCTION app.search_warehouse_stock_v2(
  p_tenant_id uuid,
  p_warehouse_id uuid,
  p_query text default null,
  p_statuses text[] default null,
  p_sort text default 'product_asc',
  p_limit integer default 50,
  p_offset integer default 0
)
RETURNS TABLE(
  tenant_product_id uuid,
  sku text,
  product_name text,
  brand_name text,
  qty_available numeric,
  qty_reserved numeric,
  sellable_units numeric,
  reorder_point numeric,
  stock_status text,
  last_updated timestamptz,
  total_count bigint
)
language sql
stable
security definer
set search_path = ''
set statement_timeout = '10s'
as $$
  with query_terms as materialized (
    select
      case when nullif(btrim(p_query), '') is null then null
           else websearch_to_tsquery('english', btrim(p_query)) end as exact_query,
      case when prefix_text is null then null else to_tsquery('english', prefix_text) end as prefix_query
    from (
      select string_agg(quote_literal(lexeme) || ':*', ' & ' order by lexeme) as prefix_text
      from unnest(tsvector_to_array(to_tsvector('english', coalesce(nullif(btrim(p_query), ''), '')))) terms(lexeme)
    ) prefixes
  ), hydrated as materialized (
    select
      tp.id as tenant_product_id,
      tp.internal_sku as sku,
      coalesce(nullif(tp.name_override, ''), cp.name, tp.internal_sku) as product_name,
      coalesce(nullif(tb.display_name_override, ''), cb.name, '—') as brand_name,
      trunc(coalesce(i.qty_available, 0))::numeric as qty_available,
      trunc(coalesce(i.qty_reserved, 0))::numeric as qty_reserved,
      trunc(greatest(coalesce(i.qty_available, 0) - coalesce(i.qty_reserved, 0), 0))::numeric as sellable_units,
      i.reorder_point::numeric,
      case when greatest(coalesce(i.qty_available, 0) - coalesce(i.qty_reserved, 0), 0) <= 0 then 'out_of_stock'
           when i.reorder_point is not null and greatest(coalesce(i.qty_available, 0) - coalesce(i.qty_reserved, 0), 0) <= i.reorder_point then 'low_stock'
           else 'clear' end as stock_status,
      i.updated_at as last_updated
    from app.tenant_inventory i
    join app.tenant_products tp
      on tp.id = i.tenant_product_id
     and tp.tenant_id = p_tenant_id
     and tp.deleted_at is null
    left join catalog.products cp on cp.id = tp.master_product_id
    left join app.tenant_brands tb on tb.id = tp.tenant_brand_id and tb.deleted_at is null
    left join catalog.brands cb on cb.id = tb.master_brand_id
    cross join query_terms q
    where i.warehouse_id = p_warehouse_id
      and i.deleted_at is null
      and (q.exact_query is null or tp.search_vector @@ q.exact_query or tp.search_vector @@ q.prefix_query)
      and exists (
        select 1 from app.warehouses w
        where w.id = p_warehouse_id and w.tenant_id = p_tenant_id and w.deleted_at is null
      )
  ), filtered as materialized (
    select h.* from hydrated h
    where coalesce(cardinality(p_statuses), 0) = 0 or h.stock_status = any(p_statuses)
  )
  select
    f.tenant_product_id, f.sku, f.product_name, f.brand_name,
    f.qty_available, f.qty_reserved, f.sellable_units, f.reorder_point,
    f.stock_status, f.last_updated, count(*) over ()::bigint
  from filtered f
  order by
    case when p_sort = 'on_hand_desc' then f.qty_available end desc,
    case when p_sort = 'reserved_desc' then f.qty_reserved end desc,
    case when p_sort = 'sellable_desc' then f.sellable_units end desc,
    case when p_sort = 'reorder_asc' then f.reorder_point end asc nulls last,
    case when p_sort not in ('on_hand_desc', 'reserved_desc', 'sellable_desc', 'reorder_asc') then f.product_name end asc,
    f.tenant_product_id asc
  limit least(greatest(coalesce(p_limit, 50), 1), 100)
  offset greatest(coalesce(p_offset, 0), 0);
$$;

GRANT EXECUTE ON FUNCTION app.get_seller_warehouse_landing_row_metrics_v2(uuid, uuid[]) TO service_role;
GRANT EXECUTE ON FUNCTION app.search_warehouse_stock_v2(uuid, uuid, text, text[], text, integer, integer) TO service_role;
