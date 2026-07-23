-- cohort_members SCD2 fix: app.get_seller_brand_landing_rows' cohort-facet scoping must only
-- match a buyer's currently-active cohort membership. Full function body reproduced verbatim
-- from supabase/migrations/20260714113113_seller_brand_category_landing_read_models.sql with
-- only the cohort_members join patched (cm.valid_until IS NULL added).

CREATE OR REPLACE FUNCTION app.get_seller_brand_landing_rows(
  p_tenant_id uuid,
  p_brand_ids uuid[],
  p_location_ids uuid[] DEFAULT NULL,
  p_current_start date DEFAULT CURRENT_DATE,
  p_current_end date DEFAULT CURRENT_DATE + 1,
  p_previous_start date DEFAULT CURRENT_DATE - 1,
  p_previous_end date DEFAULT CURRENT_DATE
)
RETURNS TABLE(id uuid, row_data jsonb)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = pg_catalog, app, catalog
SET statement_timeout = '10s'
SET lock_timeout = '2s'
AS $$
WITH requested AS MATERIALIZED (
  SELECT requested_id AS id, ord
  FROM unnest(COALESCE(p_brand_ids, ARRAY[]::uuid[])) WITH ORDINALITY AS ids(requested_id, ord)
  WHERE requested_id IS NOT NULL
  LIMIT 100
),
brand_base AS MATERIALIZED (
  SELECT tb.*, r.ord,
    cb.id AS master_id, cb.name AS master_name, cb.slug AS master_slug,
    cb.logo_url AS master_logo_url, cb.description AS master_description
  FROM requested r
  JOIN app.tenant_brands tb ON tb.id = r.id
  LEFT JOIN catalog.brands cb ON cb.id = tb.master_brand_id AND cb.deleted_at IS NULL
  WHERE tb.tenant_id = p_tenant_id AND tb.deleted_at IS NULL AND tb.is_active = true
),
scoped_products AS MATERIALIZED (
  SELECT tp.id, tp.tenant_brand_id, tp.master_product_id, tp.tenant_category_id
  FROM app.tenant_products tp
  JOIN requested r ON r.id = tp.tenant_brand_id
  WHERE tp.tenant_id = p_tenant_id AND tp.deleted_at IS NULL AND tp.is_active = true
    AND (
      p_location_ids IS NULL
      OR EXISTS (
        SELECT 1
        FROM app.tenant_inventory ti
        JOIN app.warehouses w ON w.id = ti.warehouse_id
          AND w.tenant_id = p_tenant_id AND w.deleted_at IS NULL
        WHERE ti.tenant_product_id = tp.id AND ti.deleted_at IS NULL
          AND w.location_id = ANY(p_location_ids)
      )
      OR EXISTS (
        SELECT 1
        FROM app.order_items oi
        JOIN app.orders o ON o.id = oi.order_id
        WHERE oi.tenant_product_id = tp.id AND oi.deleted_at IS NULL
          AND o.tenant_id = p_tenant_id AND o.deleted_at IS NULL
          AND o.location_id = ANY(p_location_ids) AND app.order_status_in_flow(o.status)
          AND app.metric_day_ist(o.order_date, o.created_at) >= LEAST(p_previous_start, p_current_start)
          AND app.metric_day_ist(o.order_date, o.created_at) < GREATEST(p_previous_end, p_current_end)
      )
    )
),
product_rollup AS (
  SELECT sp.tenant_brand_id,
    count(*)::bigint AS sku_count,
    COALESCE(
      jsonb_agg(DISTINCT COALESCE(tc.name, cc.name, 'Uncategorized')),
      '["Uncategorized"]'::jsonb
    ) AS categories
  FROM scoped_products sp
  LEFT JOIN app.tenant_categories tc ON tc.id = sp.tenant_category_id
    AND tc.tenant_id = p_tenant_id AND tc.deleted_at IS NULL
  LEFT JOIN catalog.products cp ON cp.id = sp.master_product_id AND cp.deleted_at IS NULL
  LEFT JOIN catalog.categories cc ON cc.id = cp.category_id AND cc.deleted_at IS NULL
  GROUP BY sp.tenant_brand_id
),
inventory_rollup AS (
  SELECT sp.tenant_brand_id,
    count(DISTINCT sp.id) FILTER (
      WHERE ti.reorder_point IS NOT NULL AND COALESCE(ti.qty_available, 0) <= ti.reorder_point
    )::bigint AS low_stock_skus
  FROM scoped_products sp
  LEFT JOIN app.tenant_inventory ti ON ti.tenant_product_id = sp.id AND ti.deleted_at IS NULL
  LEFT JOIN app.warehouses w ON w.id = ti.warehouse_id
    AND w.tenant_id = p_tenant_id AND w.deleted_at IS NULL
  WHERE p_location_ids IS NULL OR w.location_id = ANY(p_location_ids)
  GROUP BY sp.tenant_brand_id
),
admin_sales AS (
  SELECT k.tenant_brand_id,
    COALESCE(sum(k.gmv) FILTER (WHERE k.day >= p_current_start AND k.day < p_current_end), 0)::numeric AS current_gmv,
    COALESCE(sum(k.gmv) FILTER (WHERE k.day >= p_previous_start AND k.day < p_previous_end), 0)::numeric AS previous_gmv,
    COALESCE(sum(k.buyers_count) FILTER (WHERE k.day >= p_current_start AND k.day < p_current_end), 0)::bigint AS active_buyers
  FROM app.kpi_brand_daily k
  JOIN requested r ON r.id = k.tenant_brand_id
  WHERE p_location_ids IS NULL AND k.tenant_id = p_tenant_id
    AND k.day >= LEAST(p_previous_start, p_current_start)
    AND k.day < GREATEST(p_previous_end, p_current_end)
  GROUP BY k.tenant_brand_id
),
assistant_sales AS (
  SELECT tp.tenant_brand_id,
    COALESCE(sum(COALESCE(oi.line_total, oi.qty * oi.unit_price)) FILTER (
      WHERE app.metric_day_ist(o.order_date, o.created_at) >= p_current_start
        AND app.metric_day_ist(o.order_date, o.created_at) < p_current_end
    ), 0)::numeric AS current_gmv,
    COALESCE(sum(COALESCE(oi.line_total, oi.qty * oi.unit_price)) FILTER (
      WHERE app.metric_day_ist(o.order_date, o.created_at) >= p_previous_start
        AND app.metric_day_ist(o.order_date, o.created_at) < p_previous_end
    ), 0)::numeric AS previous_gmv,
    count(DISTINCT o.buyer_id) FILTER (
      WHERE app.metric_day_ist(o.order_date, o.created_at) >= p_current_start
        AND app.metric_day_ist(o.order_date, o.created_at) < p_current_end
    )::bigint AS active_buyers
  FROM app.orders o
  JOIN app.order_items oi ON oi.order_id = o.id AND oi.deleted_at IS NULL
  JOIN app.tenant_products tp ON tp.id = oi.tenant_product_id
    AND tp.tenant_id = p_tenant_id AND tp.deleted_at IS NULL
  JOIN requested r ON r.id = tp.tenant_brand_id
  WHERE p_location_ids IS NOT NULL
    AND o.tenant_id = p_tenant_id AND o.deleted_at IS NULL
    AND o.location_id = ANY(p_location_ids) AND app.order_status_in_flow(o.status)
    AND app.metric_day_ist(o.order_date, o.created_at) >= LEAST(p_previous_start, p_current_start)
    AND app.metric_day_ist(o.order_date, o.created_at) < GREATEST(p_previous_end, p_current_end)
  GROUP BY tp.tenant_brand_id
),
sales AS (
  SELECT * FROM admin_sales
  UNION ALL
  SELECT * FROM assistant_sales
),
portfolio AS (
  SELECT COALESCE(sum(k.gmv), 0)::numeric AS current_gmv
  FROM app.kpi_brand_daily k
  WHERE p_location_ids IS NULL AND k.tenant_id = p_tenant_id
    AND k.day >= p_current_start AND k.day < p_current_end
  UNION ALL
  SELECT COALESCE(sum(COALESCE(oi.line_total, oi.qty * oi.unit_price)), 0)::numeric
  FROM app.orders o
  JOIN app.order_items oi ON oi.order_id = o.id AND oi.deleted_at IS NULL
  WHERE p_location_ids IS NOT NULL AND o.tenant_id = p_tenant_id AND o.deleted_at IS NULL
    AND o.location_id = ANY(p_location_ids) AND app.order_status_in_flow(o.status)
    AND app.metric_day_ist(o.order_date, o.created_at) >= p_current_start
    AND app.metric_day_ist(o.order_date, o.created_at) < p_current_end
),
portfolio_total AS (SELECT COALESCE(sum(current_gmv), 0)::numeric AS current_gmv FROM portfolio),
catalog_rollup AS (
  SELECT sp.tenant_brand_id,
    count(*) FILTER (
      WHERE (c.updated_at AT TIME ZONE 'Asia/Kolkata')::date >= p_current_start
        AND (c.updated_at AT TIME ZONE 'Asia/Kolkata')::date < p_current_end
    )::bigint AS current_touches,
    (array_agg(c.name ORDER BY c.updated_at DESC))[1] AS latest_name,
    max(c.updated_at) AS latest_at
  FROM scoped_products sp
  JOIN app.campaign_items ci ON ci.tenant_product_id = sp.id AND ci.deleted_at IS NULL
  JOIN app.campaigns c ON c.id = ci.campaign_id
    AND c.tenant_id = p_tenant_id AND c.deleted_at IS NULL AND c.status = 'published'
  GROUP BY sp.tenant_brand_id
),
scoped_buyers AS MATERIALIZED (
  SELECT b.id, b.default_cohort_id
  FROM app.buyers b
  WHERE b.tenant_id = p_tenant_id AND b.deleted_at IS NULL
    AND (
      p_location_ids IS NULL
      OR EXISTS (
        SELECT 1 FROM app.orders o
        WHERE o.tenant_id = p_tenant_id AND o.buyer_id = b.id AND o.deleted_at IS NULL
          AND o.location_id = ANY(p_location_ids) AND app.order_status_in_flow(o.status)
          AND app.metric_day_ist(o.order_date, o.created_at) >= LEAST(p_previous_start, p_current_start)
          AND app.metric_day_ist(o.order_date, o.created_at) < GREATEST(p_previous_end, p_current_end)
      )
    )
),
buyer_cohorts AS (
  SELECT id AS buyer_id, default_cohort_id AS cohort_id FROM scoped_buyers WHERE default_cohort_id IS NOT NULL
  UNION
  SELECT sb.id, cm.cohort_id FROM scoped_buyers sb JOIN app.cohort_members cm ON cm.buyer_id = sb.id AND cm.valid_until IS NULL
),
buyer_access AS (
  SELECT r.id AS tenant_brand_id, count(DISTINCT bc.buyer_id)::bigint AS total_buyers
  FROM requested r
  LEFT JOIN buyer_cohorts bc ON true
  LEFT JOIN app.cohorts c ON c.id = bc.cohort_id
    AND c.tenant_id = p_tenant_id AND c.deleted_at IS NULL
    AND (c.allowed_tenant_brand_ids IS NULL OR r.id = ANY(c.allowed_tenant_brand_ids))
  WHERE c.id IS NOT NULL
  GROUP BY r.id
)
SELECT bb.id,
  jsonb_build_object(
    'id', bb.id,
    'tenant_id', bb.tenant_id,
    'master_brand_id', bb.master_brand_id,
    'display_name_override', bb.display_name_override,
    'slug', bb.slug,
    'description', COALESCE(bb.description, bb.description_override),
    'logo_url', COALESCE(bb.logo_url, bb.logo_url_override),
    'margin_pct', bb.margin_pct,
    'exclusivity', bb.exclusivity,
    'is_active', bb.is_active,
    'external_ref', bb.external_ref,
    'principal_name', bb.principal_name,
    'principal_email', bb.principal_email,
    'principal_phone', bb.principal_phone,
    'principal_location', bb.principal_location,
    'contact_name', bb.contact_name,
    'contact_email', bb.contact_email,
    'contact_phone', bb.contact_phone,
    'default_cohort_id', bb.default_cohort_id,
    'created_at', bb.created_at,
    'updated_at', bb.updated_at,
    'master_brand', CASE WHEN bb.master_id IS NULL THEN NULL ELSE jsonb_build_object(
      'id', bb.master_id, 'name', bb.master_name, 'slug', bb.master_slug,
      'logo_url', bb.master_logo_url, 'description', bb.master_description
    ) END,
    'gmv_mtd', COALESCE(s.current_gmv, 0),
    'gmv_prev_mtd', COALESCE(s.previous_gmv, 0),
    'growth_pct', CASE
      WHEN COALESCE(s.previous_gmv, 0) > 0 THEN round(((COALESCE(s.current_gmv, 0) - s.previous_gmv) / s.previous_gmv) * 100)
      WHEN COALESCE(s.current_gmv, 0) > 0 THEN 100 ELSE 0 END,
    'portfolio_share_pct', CASE WHEN pt.current_gmv > 0 THEN round(COALESCE(s.current_gmv, 0) / pt.current_gmv * 100) ELSE 0 END,
    'sku_count', COALESCE(pr.sku_count, 0),
    'active_buyers_mtd', COALESCE(s.active_buyers, 0),
    'total_buyers', COALESCE(ba.total_buyers, 0),
    'catalog_days_ago', CASE WHEN cr.latest_at IS NULL THEN NULL ELSE GREATEST(0, CURRENT_DATE - (cr.latest_at AT TIME ZONE 'Asia/Kolkata')::date) END,
    'categories', COALESCE(pr.categories, '["Uncategorized"]'::jsonb),
    'catalog_name', cr.latest_name,
    'alerts', to_jsonb(array_remove(ARRAY[
      CASE WHEN COALESCE(ir.low_stock_skus, 0) > 0 THEN 'low_stock' END,
      CASE WHEN COALESCE(s.current_gmv, 0) < COALESCE(s.previous_gmv, 0) THEN 'gmv_decline' END,
      CASE WHEN COALESCE(cr.current_touches, 0) = 0 THEN 'not_in_catalog_mtd' END
    ], NULL))
  ) AS row_data
FROM brand_base bb
LEFT JOIN product_rollup pr ON pr.tenant_brand_id = bb.id
LEFT JOIN inventory_rollup ir ON ir.tenant_brand_id = bb.id
LEFT JOIN sales s ON s.tenant_brand_id = bb.id
CROSS JOIN portfolio_total pt
LEFT JOIN catalog_rollup cr ON cr.tenant_brand_id = bb.id
LEFT JOIN buyer_access ba ON ba.tenant_brand_id = bb.id
ORDER BY bb.ord;
$$;
