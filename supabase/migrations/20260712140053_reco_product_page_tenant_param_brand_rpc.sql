-- Fix 1: reco_get_product_page was reading tenant_id from JWT (app.jwt_tenant_id()),
-- which returns NULL when called via service role key (all buyer API routes use supabaseAdmin).
-- Add explicit p_tenant_id parameter — consistent with all other reco_get_* RPCs.
--
-- Fix 2: new reco_get_brand_bestsellers(p_tenant_id, p_brand_id, p_limit) RPC for
-- the brand browse page "Trending in this brand" carousel.

-- Drop old signature first (parameter list changed)
DROP FUNCTION IF EXISTS app.reco_get_product_page(uuid, uuid, text[], integer);

CREATE OR REPLACE FUNCTION app.reco_get_product_page(
  p_tenant_id         uuid,
  p_tenant_product_id uuid,
  p_buyer_id          uuid,
  p_widget_types      text[]  DEFAULT ARRAY['co_order', 'co_buyer', 'same_category'],
  p_limit             int     DEFAULT 8
)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
AS $$
DECLARE
  v_category_id uuid;
  result        jsonb := '{}'::jsonb;
BEGIN
  SELECT tp.tenant_category_id INTO v_category_id
  FROM app.tenant_products tp
  WHERE tp.id = p_tenant_product_id AND tp.tenant_id = p_tenant_id;

  -- W2: Frequently Bought Together (co_order associations, lift > 2)
  IF 'co_order' = ANY(p_widget_types) THEN
    result := result || jsonb_build_object(
      'co_order',
      COALESCE((
        SELECT jsonb_agg(a.product_b_id ORDER BY a.lift_score DESC)
        FROM (
          SELECT r.product_b_id, r.lift_score
          FROM app.reco_product_associations r
          JOIN app.tenant_products tp ON tp.id = r.product_b_id
          WHERE r.tenant_id = p_tenant_id
            AND r.product_a_id = p_tenant_product_id
            AND r.association_type = 'co_order'
            AND r.time_window_days = 90
            AND r.lift_score > 2
            AND r.co_occurrence_count >= 3
            AND tp.is_active = true
          ORDER BY r.lift_score DESC
          LIMIT p_limit
        ) a
      ), '[]'::jsonb)
    );
  END IF;

  -- W3: People Also Bought (co_buyer associations, cross-session)
  IF 'co_buyer' = ANY(p_widget_types) THEN
    result := result || jsonb_build_object(
      'co_buyer',
      COALESCE((
        SELECT jsonb_agg(a.product_b_id ORDER BY a.co_occurrence_count DESC)
        FROM (
          SELECT r.product_b_id, r.co_occurrence_count
          FROM app.reco_product_associations r
          JOIN app.tenant_products tp ON tp.id = r.product_b_id
          WHERE r.tenant_id = p_tenant_id
            AND r.product_a_id = p_tenant_product_id
            AND r.association_type = 'co_buyer'
            AND r.time_window_days = 90
            AND tp.is_active = true
          ORDER BY r.co_occurrence_count DESC
          LIMIT p_limit
        ) a
      ), '[]'::jsonb)
    );
  END IF;

  -- W5: More from this Category (ranked by weighted_score_30d within category)
  IF 'same_category' = ANY(p_widget_types) AND v_category_id IS NOT NULL THEN
    result := result || jsonb_build_object(
      'same_category',
      COALESCE((
        SELECT jsonb_agg(a.tenant_product_id ORDER BY a.category_rank_30d ASC)
        FROM (
          SELECT p.tenant_product_id, p.category_rank_30d
          FROM app.reco_product_popularity p
          JOIN app.tenant_products tp ON tp.id = p.tenant_product_id
          WHERE p.tenant_id = p_tenant_id
            AND tp.tenant_category_id = v_category_id
            AND p.tenant_product_id <> p_tenant_product_id
            AND tp.is_active = true
            AND p.weighted_score_30d > 0
          ORDER BY p.category_rank_30d ASC
          LIMIT p_limit
        ) a
      ), '[]'::jsonb)
    );
  END IF;

  RETURN result;
END;
$$;

-- New: brand-level bestsellers for the "Trending in this brand" carousel.
-- Returns products ordered by weighted_score_30d (invoices x2 / orders x1 / estimates x0.5).
-- Uses tenant_products.tenant_brand_id for the brand filter.
CREATE OR REPLACE FUNCTION app.reco_get_brand_bestsellers(
  p_tenant_id uuid,
  p_brand_id  uuid,
  p_limit     int DEFAULT 8
)
RETURNS TABLE (tenant_product_id uuid, weighted_score_30d numeric)
LANGUAGE plpgsql STABLE SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT pop.tenant_product_id, pop.weighted_score_30d
  FROM app.reco_product_popularity pop
  JOIN app.tenant_products tp ON tp.id = pop.tenant_product_id
  WHERE pop.tenant_id = p_tenant_id
    AND tp.tenant_brand_id = p_brand_id
    AND tp.is_active = true
    AND pop.weighted_score_30d > 0
  ORDER BY pop.weighted_score_30d DESC
  LIMIT p_limit;
END;
$$;
