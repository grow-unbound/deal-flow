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

CREATE OR REPLACE FUNCTION app.reco_refresh_buyer_profiles(p_tenant_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN (
    SELECT DISTINCT buyer_id FROM (
      SELECT buyer_id FROM app.invoices
        WHERE tenant_id = p_tenant_id AND deleted_at IS NULL
          AND invoice_date >= NOW() - INTERVAL '12 months'
      UNION
      SELECT buyer_id FROM app.orders
        WHERE tenant_id = p_tenant_id AND deleted_at IS NULL
          AND placed_at >= NOW() - INTERVAL '12 months'
      UNION
      SELECT buyer_id FROM app.estimates
        WHERE tenant_id = p_tenant_id AND deleted_at IS NULL
          AND created_at >= NOW() - INTERVAL '12 months'
          AND buyer_id IS NOT NULL
    ) buyers
  ) LOOP
    INSERT INTO app.reco_buyer_profiles (tenant_id, buyer_id, top_products, top_categories, refreshed_at)
    VALUES (
      p_tenant_id,
      r.buyer_id,
      -- top_products: invoices x2 + orders x1 + unconverted estimates x0.5
      COALESCE((
        SELECT jsonb_agg(row_to_json(t))
        FROM (
          SELECT
            src.tenant_product_id                    AS product_id,
            SUM(src.weight_count)                    AS weighted_count,
            MAX(src.event_date)                      AS last_ordered_at,
            MAX(COALESCE(tp.name_override, cp.name)) AS product_name
          FROM (
            SELECT ii.tenant_product_id, 2::numeric AS weight_count, inv.invoice_date AS event_date
            FROM app.invoice_items ii
            JOIN app.invoices inv ON inv.id = ii.invoice_id
            WHERE inv.tenant_id = p_tenant_id AND inv.buyer_id = r.buyer_id
              AND inv.deleted_at IS NULL AND ii.deleted_at IS NULL
              AND inv.invoice_date >= NOW() - INTERVAL '12 months'
            UNION ALL
            SELECT oi.tenant_product_id, 1::numeric AS weight_count, o.placed_at AS event_date
            FROM app.order_items oi
            JOIN app.orders o ON o.id = oi.order_id
            WHERE o.tenant_id = p_tenant_id AND o.buyer_id = r.buyer_id
              AND o.deleted_at IS NULL AND oi.deleted_at IS NULL
              AND o.placed_at >= NOW() - INTERVAL '12 months'
            UNION ALL
            SELECT ei.tenant_product_id, 0.5::numeric AS weight_count, e.created_at AS event_date
            FROM app.estimate_items ei
            JOIN app.estimates e ON e.id = ei.estimate_id
            WHERE e.tenant_id = p_tenant_id AND e.buyer_id = r.buyer_id
              AND e.deleted_at IS NULL AND ei.deleted_at IS NULL
              AND e.created_at >= NOW() - INTERVAL '12 months'
              AND e.converted_to_invoice_id IS NULL
              AND e.converted_to_order_id   IS NULL
          ) src
          JOIN app.tenant_products tp ON tp.id = src.tenant_product_id
          LEFT JOIN catalog.products cp ON cp.id = tp.master_product_id
          GROUP BY src.tenant_product_id
          ORDER BY weighted_count DESC, last_ordered_at DESC
          LIMIT 10
        ) t
      ), '[]'::jsonb),
      -- top_categories: invoices x2 + orders x1 + unconverted estimates x0.5
      COALESCE((
        SELECT jsonb_agg(row_to_json(t))
        FROM (
          SELECT
            tp.tenant_category_id   AS category_id,
            SUM(src.weight_count)   AS weighted_count,
            MAX(src.event_date)     AS last_ordered_at
          FROM (
            SELECT ii.tenant_product_id, 2::numeric AS weight_count, inv.invoice_date AS event_date
            FROM app.invoice_items ii
            JOIN app.invoices inv ON inv.id = ii.invoice_id
            WHERE inv.tenant_id = p_tenant_id AND inv.buyer_id = r.buyer_id
              AND inv.deleted_at IS NULL AND ii.deleted_at IS NULL
              AND inv.invoice_date >= NOW() - INTERVAL '12 months'
            UNION ALL
            SELECT oi.tenant_product_id, 1::numeric AS weight_count, o.placed_at AS event_date
            FROM app.order_items oi
            JOIN app.orders o ON o.id = oi.order_id
            WHERE o.tenant_id = p_tenant_id AND o.buyer_id = r.buyer_id
              AND o.deleted_at IS NULL AND oi.deleted_at IS NULL
              AND o.placed_at >= NOW() - INTERVAL '12 months'
            UNION ALL
            SELECT ei.tenant_product_id, 0.5::numeric AS weight_count, e.created_at AS event_date
            FROM app.estimate_items ei
            JOIN app.estimates e ON e.id = ei.estimate_id
            WHERE e.tenant_id = p_tenant_id AND e.buyer_id = r.buyer_id
              AND e.deleted_at IS NULL AND ei.deleted_at IS NULL
              AND e.created_at >= NOW() - INTERVAL '12 months'
              AND e.converted_to_invoice_id IS NULL
              AND e.converted_to_order_id   IS NULL
          ) src
          JOIN app.tenant_products tp ON tp.id = src.tenant_product_id
          WHERE tp.tenant_category_id IS NOT NULL
          GROUP BY tp.tenant_category_id
          ORDER BY weighted_count DESC
          LIMIT 5
        ) t
      ), '[]'::jsonb),
      NOW()
    )
    ON CONFLICT (tenant_id, buyer_id) DO UPDATE SET
      top_products   = EXCLUDED.top_products,
      top_categories = EXCLUDED.top_categories,
      refreshed_at   = NOW();
  END LOOP;
END;
$$;
