-- Fix recommendation popularity refresh.
--
-- The previous implementation aggregated invoices/orders/estimates by
-- (tenant_product_id, buyer_id), then joined those CTEs back to products only
-- on tenant_product_id. For products with multiple buyer rows in more than one
-- signal, that formed a cross-product intermediate, spilled hundreds of MB of
-- temp files per tenant, and inflated scores/counts/revenue. Keep the existing
-- output contract, but combine signal rows with UNION ALL before the final
-- product aggregation.

CREATE OR REPLACE FUNCTION app.reco_compute_popularity(p_tenant_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  window_90d timestamptz := now() - interval '90 days';
  window_30d timestamptz := now() - interval '30 days';
  window_7d  timestamptz := now() - interval '7 days';
BEGIN
  WITH
  invoice_signal AS (
    SELECT
      ii.tenant_product_id,
      inv.buyer_id,
      count(DISTINCT CASE WHEN inv.invoice_date >= window_30d THEN inv.id END)::integer AS invoice_count_30d,
      0::integer AS order_count_7d,
      0::integer AS order_count_30d,
      0::integer AS order_count_90d,
      0::integer AS estimate_count_30d,
      COALESCE(sum(CASE WHEN inv.invoice_date >= window_30d THEN ii.line_total ELSE 0 END), 0)::numeric AS revenue_30d
    FROM app.invoice_items ii
    JOIN app.invoices inv ON inv.id = ii.invoice_id
    WHERE inv.tenant_id = p_tenant_id
      AND inv.deleted_at IS NULL
      AND ii.deleted_at IS NULL
      AND inv.invoice_date >= window_90d
    GROUP BY ii.tenant_product_id, inv.buyer_id
  ),
  order_signal AS (
    SELECT
      oi.tenant_product_id,
      o.buyer_id,
      0::integer AS invoice_count_30d,
      count(DISTINCT CASE WHEN o.placed_at >= window_7d THEN o.id END)::integer AS order_count_7d,
      count(DISTINCT CASE WHEN o.placed_at >= window_30d THEN o.id END)::integer AS order_count_30d,
      count(DISTINCT CASE WHEN o.placed_at >= window_90d THEN o.id END)::integer AS order_count_90d,
      0::integer AS estimate_count_30d,
      0::numeric AS revenue_30d
    FROM app.order_items oi
    JOIN app.orders o ON o.id = oi.order_id
    WHERE o.tenant_id = p_tenant_id
      AND o.deleted_at IS NULL
      AND oi.deleted_at IS NULL
      AND o.placed_at >= window_90d
    GROUP BY oi.tenant_product_id, o.buyer_id
  ),
  estimate_signal AS (
    SELECT
      ei.tenant_product_id,
      e.buyer_id,
      0::integer AS invoice_count_30d,
      0::integer AS order_count_7d,
      0::integer AS order_count_30d,
      0::integer AS order_count_90d,
      count(DISTINCT CASE WHEN e.created_at >= window_30d THEN e.id END)::integer AS estimate_count_30d,
      0::numeric AS revenue_30d
    FROM app.estimate_items ei
    JOIN app.estimates e ON e.id = ei.estimate_id
    WHERE e.tenant_id = p_tenant_id
      AND e.deleted_at IS NULL
      AND ei.deleted_at IS NULL
      AND e.created_at >= window_90d
      AND NOT EXISTS (
        SELECT 1
        FROM app.invoices inv
        WHERE inv.tenant_id = p_tenant_id
          AND inv.estimate_id = e.id
          AND inv.deleted_at IS NULL
      )
    GROUP BY ei.tenant_product_id, e.buyer_id
  ),
  signal_rows AS (
    SELECT * FROM invoice_signal
    UNION ALL
    SELECT * FROM order_signal
    UNION ALL
    SELECT * FROM estimate_signal
  ),
  product_agg AS (
    SELECT
      sr.tenant_product_id,
      tp.tenant_category_id,
      sum(sr.invoice_count_30d)::integer AS invoice_count_30d,
      sum(sr.order_count_30d)::integer AS order_count_30d,
      sum(sr.estimate_count_30d)::integer AS estimate_count_30d,
      (
        sum(sr.invoice_count_30d) * 2.0
        + sum(sr.order_count_30d) * 1.0
        + sum(sr.estimate_count_30d) * 0.5
      )::numeric AS weighted_score_30d,
      sum(sr.order_count_7d)::integer AS order_count_7d,
      sum(sr.order_count_90d)::integer AS order_count_90d,
      sum(sr.revenue_30d)::numeric AS revenue_30d,
      count(DISTINCT sr.buyer_id) FILTER (
        WHERE sr.invoice_count_30d > 0
           OR sr.order_count_30d > 0
           OR sr.estimate_count_30d > 0
      )::integer AS unique_buyer_count_30d
    FROM signal_rows sr
    JOIN app.tenant_products tp
      ON tp.id = sr.tenant_product_id
     AND tp.tenant_id = p_tenant_id
    GROUP BY sr.tenant_product_id, tp.tenant_category_id
    HAVING sum(sr.invoice_count_30d) > 0
        OR sum(sr.order_count_30d) > 0
        OR sum(sr.estimate_count_30d) > 0
  ),
  ranked AS (
    SELECT
      product_agg.*,
      rank() OVER (
        PARTITION BY product_agg.tenant_category_id
        ORDER BY product_agg.weighted_score_30d DESC
      )::integer AS category_rank_30d
    FROM product_agg
  )
  INSERT INTO app.reco_product_popularity (
    tenant_id,
    tenant_product_id,
    invoice_count_30d,
    order_count_30d,
    estimate_count_30d,
    weighted_score_30d,
    order_count_7d,
    order_count_90d,
    revenue_30d,
    unique_buyer_count_30d,
    category_rank_30d,
    computed_at
  )
  SELECT
    p_tenant_id,
    tenant_product_id,
    invoice_count_30d,
    order_count_30d,
    estimate_count_30d,
    weighted_score_30d,
    order_count_7d,
    order_count_90d,
    revenue_30d,
    unique_buyer_count_30d,
    category_rank_30d,
    now()
  FROM ranked
  ON CONFLICT (tenant_id, tenant_product_id) DO UPDATE SET
    invoice_count_30d = EXCLUDED.invoice_count_30d,
    order_count_30d = EXCLUDED.order_count_30d,
    estimate_count_30d = EXCLUDED.estimate_count_30d,
    weighted_score_30d = EXCLUDED.weighted_score_30d,
    order_count_7d = EXCLUDED.order_count_7d,
    order_count_90d = EXCLUDED.order_count_90d,
    revenue_30d = EXCLUDED.revenue_30d,
    unique_buyer_count_30d = EXCLUDED.unique_buyer_count_30d,
    category_rank_30d = EXCLUDED.category_rank_30d,
    computed_at = now()
  WHERE app.reco_product_popularity.invoice_count_30d IS DISTINCT FROM EXCLUDED.invoice_count_30d
     OR app.reco_product_popularity.order_count_30d IS DISTINCT FROM EXCLUDED.order_count_30d
     OR app.reco_product_popularity.estimate_count_30d IS DISTINCT FROM EXCLUDED.estimate_count_30d
     OR app.reco_product_popularity.weighted_score_30d IS DISTINCT FROM EXCLUDED.weighted_score_30d
     OR app.reco_product_popularity.order_count_7d IS DISTINCT FROM EXCLUDED.order_count_7d
     OR app.reco_product_popularity.order_count_90d IS DISTINCT FROM EXCLUDED.order_count_90d
     OR app.reco_product_popularity.revenue_30d IS DISTINCT FROM EXCLUDED.revenue_30d
     OR app.reco_product_popularity.unique_buyer_count_30d IS DISTINCT FROM EXCLUDED.unique_buyer_count_30d
     OR app.reco_product_popularity.category_rank_30d IS DISTINCT FROM EXCLUDED.category_rank_30d;
END;
$$;

ALTER FUNCTION app.reco_compute_popularity(uuid) OWNER TO postgres;
ALTER FUNCTION app.reco_compute_popularity(uuid) SET search_path TO 'pg_catalog', 'app', 'catalog', 'public';
ALTER FUNCTION app.reco_compute_popularity(uuid) SET work_mem TO '64MB';
