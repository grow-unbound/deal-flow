-- last_sales CTE had no date bound at all -- scanned the tenant's entire invoice
-- history per warehouse per page load (mean 2.7s, growing every month). idle_stock_skus
-- only checks "last_invoice_day < today - 90" below, so anything older than 90d never
-- changed the output -- bounding to the same 90d-trailing convention used across
-- metrics_v2 removes the unbounded scan without changing any returned value.
--
-- No per-warehouse snapshot exists yet (metrics_product_location_snapshot is keyed by
-- app.locations, not app.warehouses -- confirmed via its location_id FK; locations and
-- warehouses are distinct entities here). Eliminating this function's remaining raw-table
-- touch needs a new metrics_product_warehouse_snapshot table + pipeline wiring -- flagged
-- as a follow-up, not built in this pass.
CREATE OR REPLACE FUNCTION app.get_seller_warehouse_landing_row_metrics_v2(p_tenant_id uuid, p_warehouse_ids uuid[])
 RETURNS TABLE(warehouse_id uuid, tracked_skus bigint, sellable_units numeric, low_stock_skus bigint, stockout_skus bigint, idle_stock_skus bigint, last_inventory_update timestamp with time zone)
 LANGUAGE sql
 STABLE
 SET search_path TO 'pg_catalog', 'app'
 SET statement_timeout TO '15s'
AS $function$
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
      AND app.metric_day_ist(i.invoice_date, i.created_at) >= (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kolkata')::date - 89
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
$function$;
