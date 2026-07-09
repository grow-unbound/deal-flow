-- Phase 1 Recommendation Engine: Serving RPCs
-- All RPCs read pre-computed tables only (pure reads, no runtime computation).
-- tenant_id is always read from jwt_tenant_id() inside RPCs — never trusted from client.

-- ── app.reco_get_bestsellers ──────────────────────────────────────────────────
-- Returns top products ranked by weighted_score_30d (invoice×2 + order×1 + estimate×0.5).
-- Used as W1 (Bestsellers) and as fallback by other RPCs.
CREATE OR REPLACE FUNCTION app.reco_get_bestsellers(
  p_tenant_id   uuid,
  p_category_id uuid DEFAULT NULL,
  p_limit       int  DEFAULT 20
)
RETURNS TABLE(tenant_product_id uuid, weighted_score_30d numeric, category_rank_30d int)
LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT
    pop.tenant_product_id,
    pop.weighted_score_30d,
    pop.category_rank_30d
  FROM app.reco_product_popularity pop
  JOIN app.tenant_products tp ON tp.id = pop.tenant_product_id
  WHERE pop.tenant_id = p_tenant_id
    AND pop.weighted_score_30d > 0
    AND tp.is_active = true
    AND (p_category_id IS NULL OR tp.tenant_category_id = p_category_id)
  ORDER BY pop.weighted_score_30d DESC
  LIMIT p_limit;
$$;

-- ── app.reco_get_product_page ─────────────────────────────────────────────────
-- Single call returns all recommendation carousels for a product detail page.
-- Returns jsonb: { co_order: [uuid], co_buyer: [uuid], same_category: [uuid] }
-- tenant_id read from JWT — never from caller.
CREATE OR REPLACE FUNCTION app.reco_get_product_page(
  p_tenant_product_id uuid,
  p_buyer_id          uuid,
  p_widget_types      text[]  DEFAULT ARRAY['co_order', 'co_buyer', 'same_category'],
  p_limit             int     DEFAULT 8
)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER AS $$
DECLARE
  v_tenant_id   uuid;
  v_category_id uuid;
  result        jsonb := '{}'::jsonb;
BEGIN
  v_tenant_id := app.jwt_tenant_id();

  SELECT tp.tenant_category_id INTO v_category_id
  FROM app.tenant_products tp
  WHERE tp.id = p_tenant_product_id AND tp.tenant_id = v_tenant_id;

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
          WHERE r.tenant_id = v_tenant_id
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
          WHERE r.tenant_id = v_tenant_id
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
          WHERE p.tenant_id = v_tenant_id
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

-- ── app.reco_get_home ─────────────────────────────────────────────────────────
-- Returns home-page recommendation data: bestsellers (W1) + buy_again (W4).
-- Returns jsonb: { bestsellers: [uuid], buy_again: [uuid] }
CREATE OR REPLACE FUNCTION app.reco_get_home(
  p_tenant_id uuid,
  p_buyer_id  uuid
)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER AS $$
DECLARE
  result jsonb := '{}'::jsonb;
BEGIN
  result := jsonb_build_object(
    -- W1: Bestsellers — top products by weighted_score_30d across the tenant
    'bestsellers',
    COALESCE((
      SELECT jsonb_agg(a.tenant_product_id ORDER BY a.weighted_score_30d DESC)
      FROM (
        SELECT p.tenant_product_id, p.weighted_score_30d
        FROM app.reco_product_popularity p
        JOIN app.tenant_products tp ON tp.id = p.tenant_product_id
        WHERE p.tenant_id = p_tenant_id
          AND p.weighted_score_30d > 0
          AND tp.is_active = true
        ORDER BY p.weighted_score_30d DESC
        LIMIT 20
      ) a
    ), '[]'::jsonb),

    -- W4: Buy Again — top products from this buyer's purchase history
    'buy_again',
    COALESCE((
      SELECT jsonb_agg((elem->>'product_id')::text)
      FROM app.reco_buyer_profiles bp,
           jsonb_array_elements(bp.top_products) AS elem
      WHERE bp.tenant_id = p_tenant_id
        AND bp.buyer_id = p_buyer_id
    ), '[]'::jsonb)
  );

  RETURN result;
END;
$$;
