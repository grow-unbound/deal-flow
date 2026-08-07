-- Fix a real perf bug found post-deploy in the price_lists_now block of
-- app._metrics_v4_refresh_setup_now: the 'all_buyers' UNION branch joined
-- app.buyers unconditionally, so every price list on a tenant paid for a full
-- buyers-table scan even when it had no 'all_buyers' assignment at all.
-- Measured on wine-yard-technologies (11,261 buyers, 4 price lists):
-- 470ms -> 9.9ms after gating the buyers scan behind an EXISTS check the
-- planner can short-circuit (confirmed via EXPLAIN: buyers_pkey scan goes
-- from executed-per-price-list to "never executed" for lists with no
-- all_buyers assignment).

CREATE OR REPLACE FUNCTION app._metrics_v4_refresh_setup_now(
  p_tenant_id uuid,
  p_as_of timestamptz DEFAULT clock_timestamp()
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, app, pg_temp
AS $$
DECLARE
  v_now timestamptz := COALESCE(p_as_of, clock_timestamp());
  v_quarter_start date := date_trunc('quarter', (COALESCE(p_as_of, clock_timestamp()) AT TIME ZONE 'Asia/Kolkata'))::date;
  v_rows integer := 0;
  v_count integer;
  v_watermark timestamptz;
BEGIN
  SELECT MAX(x.updated_at) INTO v_watermark
  FROM (
    SELECT MAX(updated_at) AS updated_at FROM app.buyers WHERE tenant_id = p_tenant_id
    UNION ALL SELECT MAX(bu.updated_at) FROM app.buyer_users bu JOIN app.buyers b ON b.id = bu.buyer_id WHERE b.tenant_id = p_tenant_id
    UNION ALL SELECT MAX(updated_at) FROM app.tenant_brands WHERE tenant_id = p_tenant_id
    UNION ALL SELECT MAX(updated_at) FROM app.tenant_products WHERE tenant_id = p_tenant_id
    UNION ALL SELECT MAX(updated_at) FROM app.locations WHERE tenant_id = p_tenant_id
    UNION ALL SELECT MAX(updated_at) FROM app.warehouses WHERE tenant_id = p_tenant_id
    UNION ALL SELECT MAX(updated_at) FROM app.campaigns WHERE tenant_id = p_tenant_id
    UNION ALL SELECT MAX(updated_at) FROM app.cohorts WHERE tenant_id = p_tenant_id
    UNION ALL SELECT MAX(updated_at) FROM app.price_lists WHERE tenant_id = p_tenant_id
    UNION ALL SELECT MAX(updated_at) FROM app.invoices WHERE tenant_id = p_tenant_id
    UNION ALL SELECT MAX(updated_at) FROM app.estimates WHERE tenant_id = p_tenant_id
    UNION ALL SELECT MAX(updated_at) FROM app.orders WHERE tenant_id = p_tenant_id
    UNION ALL SELECT MAX(ti.updated_at) FROM app.tenant_inventory ti JOIN app.tenant_products tp ON tp.id = ti.tenant_product_id WHERE tp.tenant_id = p_tenant_id
  ) x;

  INSERT INTO app.metrics_tenant_now_summary (
    tenant_id, external_ref,
    receivable_amount, receivable_invoice_count, receivable_buyer_count,
    overdue_amount, overdue_invoice_count, overdue_buyer_count,
    open_estimate_count, open_estimate_value, open_order_count, open_order_value,
    active_buyer_count, active_brand_count, active_product_count, active_category_count, active_location_count,
    active_warehouse_count, active_campaign_count, active_cohort_count, active_price_list_count,
    enabled_buyer_count, sellable_units, sellable_sku_count, low_stock_product_count, oos_product_count,
    source_watermark, computed_at, updated_at, deleted_at
  )
  SELECT
    p_tenant_id, concat_ws(':', p_tenant_id::text, 'tenant-now'),
    COALESCE((SELECT SUM(receivable_amount) FROM app.metrics_buyer_now_summary WHERE tenant_id = p_tenant_id AND deleted_at IS NULL),0),
    COALESCE((SELECT COUNT(*) FROM app.invoices i WHERE i.tenant_id = p_tenant_id AND i.deleted_at IS NULL AND app.invoice_status_has_receivable(i.status, i.outstanding_balance)),0),
    COALESCE((SELECT COUNT(*) FROM app.metrics_buyer_now_summary WHERE tenant_id = p_tenant_id AND receivable_amount > 0 AND deleted_at IS NULL),0),
    COALESCE((SELECT SUM(overdue_amount) FROM app.metrics_buyer_now_summary WHERE tenant_id = p_tenant_id AND deleted_at IS NULL),0),
    COALESCE((SELECT COUNT(*) FROM app.invoices i WHERE i.tenant_id = p_tenant_id AND i.deleted_at IS NULL AND app.invoice_is_overdue(i.status, i.due_date, i.outstanding_balance)),0),
    COALESCE((SELECT COUNT(*) FROM app.metrics_buyer_now_summary WHERE tenant_id = p_tenant_id AND overdue_amount > 0 AND deleted_at IS NULL),0),
    COALESCE((SELECT COUNT(*) FROM app.estimates e WHERE e.tenant_id = p_tenant_id AND e.deleted_at IS NULL AND app.estimate_status_is_open(e.status)),0),
    COALESCE((SELECT SUM(e.total_amount) FROM app.estimates e WHERE e.tenant_id = p_tenant_id AND e.deleted_at IS NULL AND app.estimate_status_is_open(e.status)),0),
    COALESCE((SELECT COUNT(*) FROM app.orders o WHERE o.tenant_id = p_tenant_id AND o.deleted_at IS NULL AND app.order_status_is_open(o.status)),0),
    COALESCE((SELECT SUM(o.total_amount) FROM app.orders o WHERE o.tenant_id = p_tenant_id AND o.deleted_at IS NULL AND app.order_status_is_open(o.status)),0),
    COALESCE((SELECT COUNT(*) FROM app.buyers WHERE tenant_id = p_tenant_id AND deleted_at IS NULL),0),
    COALESCE((SELECT COUNT(*) FROM app.tenant_brands WHERE tenant_id = p_tenant_id AND deleted_at IS NULL),0),
    COALESCE((SELECT COUNT(*) FROM app.tenant_products WHERE tenant_id = p_tenant_id AND deleted_at IS NULL),0),
    COALESCE((SELECT COUNT(*) FROM app.tenant_categories WHERE tenant_id = p_tenant_id AND deleted_at IS NULL AND is_active),0),
    COALESCE((SELECT COUNT(*) FROM app.locations WHERE tenant_id = p_tenant_id AND deleted_at IS NULL),0),
    COALESCE((SELECT COUNT(*) FROM app.warehouses WHERE tenant_id = p_tenant_id AND deleted_at IS NULL),0),
    COALESCE((SELECT COUNT(*) FROM app.campaigns WHERE tenant_id = p_tenant_id AND deleted_at IS NULL AND status = 'published'),0),
    COALESCE((SELECT COUNT(*) FROM app.cohorts WHERE tenant_id = p_tenant_id AND deleted_at IS NULL),0),
    COALESCE((SELECT COUNT(*) FROM app.price_lists WHERE tenant_id = p_tenant_id AND deleted_at IS NULL),0),
    COALESCE((SELECT COUNT(DISTINCT bu.buyer_id) FROM app.buyer_users bu JOIN app.buyers b ON b.id = bu.buyer_id WHERE b.tenant_id = p_tenant_id AND bu.deleted_at IS NULL AND b.deleted_at IS NULL),0),
    COALESCE((SELECT SUM(ti.qty_available) FROM app.tenant_inventory ti JOIN app.tenant_products tp ON tp.id = ti.tenant_product_id WHERE tp.tenant_id = p_tenant_id AND ti.deleted_at IS NULL AND tp.deleted_at IS NULL AND ti.qty_available > 0),0),
    COALESCE((SELECT COUNT(DISTINCT ti.tenant_product_id) FROM app.tenant_inventory ti JOIN app.tenant_products tp ON tp.id = ti.tenant_product_id WHERE tp.tenant_id = p_tenant_id AND ti.deleted_at IS NULL AND tp.deleted_at IS NULL AND ti.qty_available > 0),0),
    COALESCE((SELECT COUNT(DISTINCT ti.tenant_product_id) FROM app.tenant_inventory ti JOIN app.tenant_products tp ON tp.id = ti.tenant_product_id WHERE tp.tenant_id = p_tenant_id AND ti.deleted_at IS NULL AND tp.deleted_at IS NULL AND ti.qty_available > 0 AND ti.qty_available <= 10),0),
    COALESCE((SELECT COUNT(*) FROM (SELECT tp.id FROM app.tenant_products tp LEFT JOIN app.tenant_inventory ti ON ti.tenant_product_id = tp.id AND ti.deleted_at IS NULL WHERE tp.tenant_id = p_tenant_id AND tp.deleted_at IS NULL GROUP BY tp.id HAVING COALESCE(SUM(ti.qty_available),0) <= 0) oos),0),
    v_watermark, v_now, v_now, NULL
  ON CONFLICT (tenant_id) WHERE deleted_at IS NULL DO UPDATE SET
    receivable_amount = EXCLUDED.receivable_amount,
    receivable_invoice_count = EXCLUDED.receivable_invoice_count,
    receivable_buyer_count = EXCLUDED.receivable_buyer_count,
    overdue_amount = EXCLUDED.overdue_amount,
    overdue_invoice_count = EXCLUDED.overdue_invoice_count,
    overdue_buyer_count = EXCLUDED.overdue_buyer_count,
    open_estimate_count = EXCLUDED.open_estimate_count,
    open_estimate_value = EXCLUDED.open_estimate_value,
    open_order_count = EXCLUDED.open_order_count,
    open_order_value = EXCLUDED.open_order_value,
    active_buyer_count = EXCLUDED.active_buyer_count,
    active_brand_count = EXCLUDED.active_brand_count,
    active_product_count = EXCLUDED.active_product_count,
    active_category_count = EXCLUDED.active_category_count,
    active_location_count = EXCLUDED.active_location_count,
    active_warehouse_count = EXCLUDED.active_warehouse_count,
    active_campaign_count = EXCLUDED.active_campaign_count,
    active_cohort_count = EXCLUDED.active_cohort_count,
    active_price_list_count = EXCLUDED.active_price_list_count,
    enabled_buyer_count = EXCLUDED.enabled_buyer_count,
    sellable_units = EXCLUDED.sellable_units,
    sellable_sku_count = EXCLUDED.sellable_sku_count,
    low_stock_product_count = EXCLUDED.low_stock_product_count,
    oos_product_count = EXCLUDED.oos_product_count,
    source_watermark = EXCLUDED.source_watermark,
    computed_at = EXCLUDED.computed_at,
    generation_id = gen_random_uuid(),
    updated_at = EXCLUDED.updated_at,
    deleted_at = NULL;
  GET DIAGNOSTICS v_count = ROW_COUNT; v_rows := v_rows + v_count;

  INSERT INTO app.metrics_brand_now_summary (
    tenant_id, tenant_brand_id, external_ref,
    member_product_count, selling_product_out_of_stock_count, low_stock_product_count,
    source_watermark, computed_at, updated_at, deleted_at
  )
  SELECT
    p_tenant_id, tb.id, concat_ws(':', p_tenant_id::text, tb.id::text, 'brand-now'),
    COALESCE(prod.member_product_count, 0),
    COALESCE(prod.selling_out_of_stock_count, 0),
    COALESCE(prod.low_stock_count, 0),
    v_watermark, v_now, v_now, NULL
  FROM app.tenant_brands tb
  LEFT JOIN LATERAL (
    SELECT
      COUNT(*)::bigint AS member_product_count,
      COUNT(*) FILTER (
        WHERE COALESCE(stock.qty_available, 0) <= 0
          AND EXISTS (
            SELECT 1 FROM app.metrics_product_period_summary qps
            WHERE qps.tenant_product_id = tp.id AND qps.grain = 'quarter'
              AND qps.period_start = v_quarter_start AND qps.deleted_at IS NULL AND qps.invoice_count > 0
          )
      )::bigint AS selling_out_of_stock_count,
      COUNT(*) FILTER (WHERE stock.qty_available > 0 AND stock.qty_available <= 10)::bigint AS low_stock_count
    FROM app.tenant_products tp
    LEFT JOIN LATERAL (
      SELECT SUM(ti.qty_available) AS qty_available
      FROM app.tenant_inventory ti
      WHERE ti.tenant_product_id = tp.id AND ti.deleted_at IS NULL
    ) stock ON true
    WHERE tp.tenant_brand_id = tb.id AND tp.deleted_at IS NULL
  ) prod ON true
  WHERE tb.tenant_id = p_tenant_id AND tb.deleted_at IS NULL
  ON CONFLICT (tenant_id, tenant_brand_id) WHERE deleted_at IS NULL DO UPDATE SET
    member_product_count = EXCLUDED.member_product_count,
    selling_product_out_of_stock_count = EXCLUDED.selling_product_out_of_stock_count,
    low_stock_product_count = EXCLUDED.low_stock_product_count,
    source_watermark = EXCLUDED.source_watermark,
    computed_at = EXCLUDED.computed_at,
    generation_id = gen_random_uuid(),
    updated_at = EXCLUDED.updated_at,
    deleted_at = NULL;
  GET DIAGNOSTICS v_count = ROW_COUNT; v_rows := v_rows + v_count;

  INSERT INTO app.metrics_category_now_summary (
    tenant_id, tenant_category_id, external_ref,
    product_count, brand_count, source_watermark, computed_at, updated_at, deleted_at
  )
  SELECT
    p_tenant_id, tc.id, concat_ws(':', p_tenant_id::text, tc.id::text, 'category-now'),
    COALESCE(agg.product_count, 0), COALESCE(agg.brand_count, 0),
    v_watermark, v_now, v_now, NULL
  FROM app.tenant_categories tc
  LEFT JOIN LATERAL (
    SELECT COUNT(*)::bigint AS product_count, COUNT(DISTINCT tp.tenant_brand_id)::bigint AS brand_count
    FROM app.tenant_products tp
    WHERE tp.tenant_category_id = tc.id AND tp.deleted_at IS NULL
  ) agg ON true
  WHERE tc.tenant_id = p_tenant_id AND tc.deleted_at IS NULL
  ON CONFLICT (tenant_id, tenant_category_id) WHERE deleted_at IS NULL DO UPDATE SET
    product_count = EXCLUDED.product_count,
    brand_count = EXCLUDED.brand_count,
    source_watermark = EXCLUDED.source_watermark,
    computed_at = EXCLUDED.computed_at,
    generation_id = gen_random_uuid(),
    updated_at = EXCLUDED.updated_at,
    deleted_at = NULL;
  GET DIAGNOSTICS v_count = ROW_COUNT; v_rows := v_rows + v_count;

  INSERT INTO app.metrics_warehouse_now_summary (
    tenant_id, warehouse_id, external_ref,
    available_product_count, in_stock_product_count, sellable_units,
    low_stock_product_count, out_of_stock_product_count, idle_stock_product_count, idle_stock_units,
    source_watermark, computed_at, updated_at, deleted_at
  )
  SELECT
    p_tenant_id, wh.id, concat_ws(':', p_tenant_id::text, wh.id::text, 'warehouse-now'),
    COALESCE(agg.available_product_count, 0), COALESCE(agg.in_stock_product_count, 0), COALESCE(agg.sellable_units, 0),
    COALESCE(agg.low_stock_product_count, 0), COALESCE(agg.out_of_stock_product_count, 0),
    COALESCE(agg.idle_stock_product_count, 0), COALESCE(agg.idle_stock_units, 0),
    v_watermark, v_now, v_now, NULL
  FROM app.warehouses wh
  LEFT JOIN LATERAL (
    SELECT
      COUNT(*) FILTER (WHERE ti.qty_available > 0)::bigint AS available_product_count,
      COUNT(*) FILTER (WHERE ti.qty_available > 0)::bigint AS in_stock_product_count,
      COALESCE(SUM(ti.qty_available) FILTER (WHERE ti.qty_available > 0), 0)::numeric AS sellable_units,
      COUNT(*) FILTER (WHERE ti.qty_available > 0 AND ti.qty_available <= 10)::bigint AS low_stock_product_count,
      COUNT(*) FILTER (WHERE COALESCE(ti.qty_available,0) <= 0)::bigint AS out_of_stock_product_count,
      COUNT(*) FILTER (
        WHERE ti.qty_available > 0
          AND NOT EXISTS (
            SELECT 1 FROM app.metrics_product_period_summary qps
            WHERE qps.tenant_product_id = ti.tenant_product_id AND qps.grain = 'quarter'
              AND qps.period_start = v_quarter_start AND qps.deleted_at IS NULL AND qps.invoice_count > 0
          )
      )::bigint AS idle_stock_product_count,
      COALESCE(SUM(ti.qty_available) FILTER (
        WHERE ti.qty_available > 0
          AND NOT EXISTS (
            SELECT 1 FROM app.metrics_product_period_summary qps
            WHERE qps.tenant_product_id = ti.tenant_product_id AND qps.grain = 'quarter'
              AND qps.period_start = v_quarter_start AND qps.deleted_at IS NULL AND qps.invoice_count > 0
          )
      ), 0)::numeric AS idle_stock_units
    FROM app.tenant_inventory ti
    JOIN app.tenant_products tp ON tp.id = ti.tenant_product_id AND tp.tenant_id = p_tenant_id AND tp.deleted_at IS NULL
    WHERE ti.warehouse_id = wh.id AND ti.deleted_at IS NULL
  ) agg ON true
  WHERE wh.tenant_id = p_tenant_id AND wh.deleted_at IS NULL
  ON CONFLICT (tenant_id, warehouse_id) WHERE deleted_at IS NULL DO UPDATE SET
    available_product_count = EXCLUDED.available_product_count,
    in_stock_product_count = EXCLUDED.in_stock_product_count,
    sellable_units = EXCLUDED.sellable_units,
    low_stock_product_count = EXCLUDED.low_stock_product_count,
    out_of_stock_product_count = EXCLUDED.out_of_stock_product_count,
    idle_stock_product_count = EXCLUDED.idle_stock_product_count,
    idle_stock_units = EXCLUDED.idle_stock_units,
    source_watermark = EXCLUDED.source_watermark,
    computed_at = EXCLUDED.computed_at,
    generation_id = gen_random_uuid(),
    updated_at = EXCLUDED.updated_at,
    deleted_at = NULL;
  GET DIAGNOSTICS v_count = ROW_COUNT; v_rows := v_rows + v_count;

  -- assigned_buyer_count de-dupes buyers reachable through more than one
  -- assignment (a direct buyer assignment AND a cohort they also belong to)
  -- via UNION over the three target_type branches before counting distinct.
  -- The 'all_buyers' branch is gated behind an EXISTS check on this specific
  -- price list's assignments so the planner can skip the app.buyers scan
  -- entirely for the common case (no all_buyers assignment) instead of
  -- paying for a full tenant-wide buyers scan per price list regardless.
  INSERT INTO app.metrics_price_lists_now_summary (
    tenant_id, price_list_id, external_ref,
    member_product_count, assigned_cohort_count, assigned_buyer_count,
    avg_discount_pct, avg_margin_pct,
    source_watermark, computed_at, updated_at, deleted_at
  )
  SELECT
    p_tenant_id, pl.id, concat_ws(':', p_tenant_id::text, pl.id::text, 'price-list-now'),
    COALESCE(items.member_product_count, 0),
    COALESCE(cohort_ct.assigned_cohort_count, 0),
    COALESCE(buyer_ct.assigned_buyer_count, 0),
    COALESCE(items.avg_discount_pct, 0),
    COALESCE(items.avg_margin_pct, 0),
    v_watermark, v_now, v_now, NULL
  FROM app.price_lists pl
  LEFT JOIN LATERAL (
    SELECT
      COUNT(*)::bigint AS member_product_count,
      COALESCE(AVG(
        CASE WHEN tp.base_selling_price > 0 THEN (tp.base_selling_price - pli.price) / tp.base_selling_price * 100 END
      ), 0)::numeric AS avg_discount_pct,
      COALESCE(AVG(
        CASE WHEN pli.price > 0 AND tp.cost_price IS NOT NULL THEN (pli.price - tp.cost_price) / pli.price * 100 END
      ), 0)::numeric AS avg_margin_pct
    FROM app.price_list_items pli
    JOIN app.tenant_products tp ON tp.id = pli.tenant_product_id AND tp.deleted_at IS NULL
    WHERE pli.price_list_id = pl.id AND pli.deleted_at IS NULL
  ) items ON true
  LEFT JOIN LATERAL (
    SELECT COUNT(*) FILTER (WHERE a.target_type = 'cohort')::bigint AS assigned_cohort_count
    FROM app.price_list_assignments a
    WHERE a.price_list_id = pl.id AND a.deleted_at IS NULL
  ) cohort_ct ON true
  LEFT JOIN LATERAL (
    SELECT COUNT(DISTINCT buyer_id)::bigint AS assigned_buyer_count
    FROM (
      SELECT a.target_id AS buyer_id
      FROM app.price_list_assignments a
      WHERE a.price_list_id = pl.id AND a.deleted_at IS NULL AND a.target_type = 'buyer'
      UNION
      SELECT cm.buyer_id
      FROM app.price_list_assignments a
      JOIN app.cohort_members_active cm ON cm.cohort_id = a.target_id
      WHERE a.price_list_id = pl.id AND a.deleted_at IS NULL AND a.target_type = 'cohort'
      UNION
      SELECT b.id
      FROM app.buyers b
      WHERE b.tenant_id = p_tenant_id AND b.deleted_at IS NULL
        AND EXISTS (
          SELECT 1 FROM app.price_list_assignments a2
          WHERE a2.price_list_id = pl.id AND a2.deleted_at IS NULL AND a2.target_type = 'all_buyers'
        )
    ) buyer_ids
  ) buyer_ct ON true
  WHERE pl.tenant_id = p_tenant_id AND pl.deleted_at IS NULL
  ON CONFLICT (tenant_id, price_list_id) WHERE deleted_at IS NULL DO UPDATE SET
    member_product_count = EXCLUDED.member_product_count,
    assigned_cohort_count = EXCLUDED.assigned_cohort_count,
    assigned_buyer_count = EXCLUDED.assigned_buyer_count,
    avg_discount_pct = EXCLUDED.avg_discount_pct,
    avg_margin_pct = EXCLUDED.avg_margin_pct,
    source_watermark = EXCLUDED.source_watermark,
    computed_at = EXCLUDED.computed_at,
    generation_id = gen_random_uuid(),
    updated_at = EXCLUDED.updated_at,
    deleted_at = NULL;
  GET DIAGNOSTICS v_count = ROW_COUNT; v_rows := v_rows + v_count;

  RETURN v_rows;
END;
$$;
