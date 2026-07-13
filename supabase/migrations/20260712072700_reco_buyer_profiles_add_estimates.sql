-- Extend reco_refresh_buyer_profiles to include estimates (weight 0.5).
--
-- Gaps fixed:
-- 1. Buyer loop now includes buyers who only have estimates (no orders/invoices).
-- 2. top_products CTE adds estimate arm: weight 0.5, unconverted estimates only.
-- 3. top_categories CTE same addition.
--
-- Dedup: estimates where converted_to_invoice_id IS NOT NULL or
-- converted_to_order_id IS NOT NULL are excluded — those already count
-- as their higher-weight invoice/order counterpart.
--
-- Rewritten set-based (single INSERT...SELECT per tenant instead of a
-- per-buyer PL/pgSQL loop with two correlated subqueries each) — at ~10K
-- buyers/tenant the loop version ran ~20K sub-scans per tenant per call;
-- this collapses to one execution. Window shrunk 12 months -> 30 days,
-- which now meaningfully cuts cost since it directly shrinks the one-pass
-- GROUP BY input (it barely helped the old loop version, since that was
-- dominated by buyer-count iteration, not per-buyer scan size).

CREATE OR REPLACE FUNCTION app.reco_refresh_buyer_profiles(p_tenant_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
AS $$
BEGIN
  WITH buyers AS (
    SELECT buyer_id FROM app.invoices
      WHERE tenant_id = p_tenant_id AND deleted_at IS NULL
        AND invoice_date >= NOW() - INTERVAL '30 days'
    UNION
    SELECT buyer_id FROM app.orders
      WHERE tenant_id = p_tenant_id AND deleted_at IS NULL
        AND placed_at >= NOW() - INTERVAL '30 days'
    UNION
    SELECT buyer_id FROM app.estimates
      WHERE tenant_id = p_tenant_id AND deleted_at IS NULL
        AND created_at >= NOW() - INTERVAL '30 days'
        AND buyer_id IS NOT NULL
  ),
  events AS (
    SELECT inv.buyer_id, ii.tenant_product_id, 2::numeric AS weight_count, inv.invoice_date AS event_date
    FROM app.invoice_items ii
    JOIN app.invoices inv ON inv.id = ii.invoice_id
    WHERE inv.tenant_id = p_tenant_id AND inv.deleted_at IS NULL AND ii.deleted_at IS NULL
      AND inv.invoice_date >= NOW() - INTERVAL '30 days'
    UNION ALL
    SELECT o.buyer_id, oi.tenant_product_id, 1::numeric AS weight_count, o.placed_at AS event_date
    FROM app.order_items oi
    JOIN app.orders o ON o.id = oi.order_id
    WHERE o.tenant_id = p_tenant_id AND o.deleted_at IS NULL AND oi.deleted_at IS NULL
      AND o.placed_at >= NOW() - INTERVAL '30 days'
    UNION ALL
    SELECT e.buyer_id, ei.tenant_product_id, 0.5::numeric AS weight_count, e.created_at AS event_date
    FROM app.estimate_items ei
    JOIN app.estimates e ON e.id = ei.estimate_id
    WHERE e.tenant_id = p_tenant_id AND e.deleted_at IS NULL AND ei.deleted_at IS NULL
      AND e.created_at >= NOW() - INTERVAL '30 days'
      AND e.converted_to_invoice_id IS NULL
      AND e.converted_to_order_id   IS NULL
      AND e.buyer_id IS NOT NULL
  ),
  product_agg AS (
    SELECT
      ev.buyer_id,
      ev.tenant_product_id                     AS product_id,
      SUM(ev.weight_count)                      AS weighted_count,
      MAX(ev.event_date)                        AS last_ordered_at,
      MAX(COALESCE(tp.name_override, cp.name))  AS product_name
    FROM events ev
    JOIN app.tenant_products tp ON tp.id = ev.tenant_product_id
    LEFT JOIN catalog.products cp ON cp.id = tp.master_product_id
    GROUP BY ev.buyer_id, ev.tenant_product_id
  ),
  product_ranked AS (
    SELECT
      buyer_id, product_id, weighted_count, last_ordered_at, product_name,
      ROW_NUMBER() OVER (PARTITION BY buyer_id ORDER BY weighted_count DESC, last_ordered_at DESC) AS rn
    FROM product_agg
  ),
  top_products AS (
    SELECT buyer_id, jsonb_agg(row_to_json(pr) ORDER BY weighted_count DESC, last_ordered_at DESC) AS top_products
    FROM (
      SELECT buyer_id, product_id, weighted_count, last_ordered_at, product_name
      FROM product_ranked WHERE rn <= 10
    ) pr
    GROUP BY buyer_id
  ),
  category_agg AS (
    SELECT
      ev.buyer_id,
      tp.tenant_category_id AS category_id,
      SUM(ev.weight_count)  AS weighted_count,
      MAX(ev.event_date)    AS last_ordered_at
    FROM events ev
    JOIN app.tenant_products tp ON tp.id = ev.tenant_product_id
    WHERE tp.tenant_category_id IS NOT NULL
    GROUP BY ev.buyer_id, tp.tenant_category_id
  ),
  category_ranked AS (
    SELECT
      buyer_id, category_id, weighted_count, last_ordered_at,
      ROW_NUMBER() OVER (PARTITION BY buyer_id ORDER BY weighted_count DESC) AS rn
    FROM category_agg
  ),
  top_categories AS (
    SELECT buyer_id, jsonb_agg(row_to_json(cr) ORDER BY weighted_count DESC) AS top_categories
    FROM (
      SELECT buyer_id, category_id, weighted_count, last_ordered_at
      FROM category_ranked WHERE rn <= 5
    ) cr
    GROUP BY buyer_id
  )
  INSERT INTO app.reco_buyer_profiles (tenant_id, buyer_id, top_products, top_categories, refreshed_at)
  SELECT
    p_tenant_id,
    b.buyer_id,
    COALESCE(tpj.top_products, '[]'::jsonb),
    COALESCE(tcj.top_categories, '[]'::jsonb),
    NOW()
  FROM buyers b
  LEFT JOIN top_products   tpj ON tpj.buyer_id = b.buyer_id
  LEFT JOIN top_categories tcj ON tcj.buyer_id = b.buyer_id
  ON CONFLICT (tenant_id, buyer_id) DO UPDATE SET
    top_products   = EXCLUDED.top_products,
    top_categories = EXCLUDED.top_categories,
    refreshed_at   = NOW();
END;
$$;
