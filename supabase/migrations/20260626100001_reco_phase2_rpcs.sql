-- Recommendation Engine Phase 2: Updated + new serving RPCs
--
-- Role resolution (used in multiple places):
--   resolved_role = COALESCE(tc.recommendation_role, cp.computed_role, 'anchor')
--   1. tenant_categories.recommendation_role  → distributor explicit override (wins always)
--   2. reco_category_profiles.computed_role   → auto-learned from order behavior
--   3. 'anchor'                               → safe default

-- ── app.reco_get_bestsellers (updated) ────────────────────────────────────────
-- Phase 2 change: filters out companion/exclude categories for global bestsellers.
-- Exception: when p_category_id is specified (browsing a category page), companions are
-- included — the buyer navigated to that category intentionally.
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
  LEFT JOIN app.reco_category_profiles cp
    ON cp.tenant_id = p_tenant_id AND cp.tenant_category_id = tp.tenant_category_id
  LEFT JOIN app.tenant_categories tc ON tc.id = tp.tenant_category_id
  WHERE pop.tenant_id = p_tenant_id
    AND pop.weighted_score_30d > 0
    AND tp.is_active = true
    AND (p_category_id IS NULL OR tp.tenant_category_id = p_category_id)
    -- Phase 2 filter: suppress companion + exclude from global bestsellers.
    -- When browsing a specific category (p_category_id IS NOT NULL), allow all roles.
    AND (
      p_category_id IS NOT NULL
      OR COALESCE(tc.recommendation_role, cp.computed_role, 'anchor') = 'anchor'
    )
  ORDER BY pop.weighted_score_30d DESC
  LIMIT p_limit;
$$;

-- ── app.reco_get_home (updated) ───────────────────────────────────────────────
-- Phase 2 change: W1 Bestsellers subquery now filters by resolved role.
CREATE OR REPLACE FUNCTION app.reco_get_home(
  p_tenant_id uuid,
  p_buyer_id  uuid
)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER AS $$
DECLARE
  result jsonb := '{}'::jsonb;
BEGIN
  result := jsonb_build_object(
    -- W1: Bestsellers — anchor-only (Phase 2 role filter applied)
    'bestsellers',
    COALESCE((
      SELECT jsonb_agg(a.tenant_product_id ORDER BY a.weighted_score_30d DESC)
      FROM (
        SELECT p.tenant_product_id, p.weighted_score_30d
        FROM app.reco_product_popularity p
        JOIN app.tenant_products tp ON tp.id = p.tenant_product_id
        LEFT JOIN app.reco_category_profiles cp
          ON cp.tenant_id = p_tenant_id AND cp.tenant_category_id = tp.tenant_category_id
        LEFT JOIN app.tenant_categories tc ON tc.id = tp.tenant_category_id
        WHERE p.tenant_id = p_tenant_id
          AND p.weighted_score_30d > 0
          AND tp.is_active = true
          AND COALESCE(tc.recommendation_role, cp.computed_role, 'anchor') = 'anchor'
        ORDER BY p.weighted_score_30d DESC
        LIMIT 20
      ) a
    ), '[]'::jsonb),

    -- W4: Buy Again (unchanged)
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

-- ── app.reco_get_cart_bundles ─────────────────────────────────────────────────
-- Returns active bundle definitions for a tenant with the top-ranked product per slot.
-- Called once on buyer cart page mount and cached client-side for 30 minutes.
-- Gap computation (which slots are uncovered by cart) is pure JavaScript — no server call.
-- Returns: { bundles: [{ id, name, slots: [{ tenant_category_id, slot_label, is_required,
--             display_order, top_product_id }] }] }
CREATE OR REPLACE FUNCTION app.reco_get_cart_bundles(p_tenant_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER AS $$
DECLARE
  result jsonb;
BEGIN
  SELECT COALESCE(jsonb_agg(bundle_row), '[]'::jsonb) INTO result
  FROM (
    SELECT jsonb_build_object(
      'id',    rb.id,
      'name',  rb.name,
      'slots', COALESCE((
        SELECT jsonb_agg(slot_row ORDER BY rbs.display_order)
        FROM app.reco_bundle_slots rbs
        LEFT JOIN LATERAL (
          SELECT pop.tenant_product_id AS top_product_id
          FROM app.reco_product_popularity pop
          JOIN app.tenant_products tp ON tp.id = pop.tenant_product_id
          WHERE pop.tenant_id = p_tenant_id
            AND tp.tenant_category_id = rbs.tenant_category_id
            AND tp.is_active = true
            AND pop.weighted_score_30d > 0
          ORDER BY pop.weighted_score_30d DESC
          LIMIT 1
        ) top_prod ON true
        CROSS JOIN LATERAL (
          SELECT jsonb_build_object(
            'tenant_category_id', rbs.tenant_category_id,
            'slot_label',         rbs.slot_label,
            'is_required',        rbs.is_required,
            'display_order',      rbs.display_order,
            'top_product_id',     top_prod.top_product_id
          ) AS slot_row
        ) _
        WHERE rbs.bundle_id = rb.id
      ), '[]'::jsonb)
    ) AS bundle_row
    FROM app.reco_bundles rb
    WHERE rb.tenant_id = p_tenant_id AND rb.is_active = true
    ORDER BY rb.created_at
  ) bundles;

  RETURN jsonb_build_object('bundles', COALESCE(result, '[]'::jsonb));
END;
$$;

-- ── app.reco_get_category_roles ───────────────────────────────────────────────
-- Returns categories with their resolved roles for the Settings > Recommendations page.
-- resolved_role: COALESCE(tc.recommendation_role, cp.computed_role, 'anchor')
-- is_auto: true when the distributor has NOT set an explicit override
CREATE OR REPLACE FUNCTION app.reco_get_category_roles(p_tenant_id uuid)
RETURNS TABLE(
  category_id        uuid,
  category_name      text,
  override_role      text,
  computed_role      text,
  resolved_role      text,
  is_auto            boolean,
  weighted_event_count int
)
LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT
    tc.id                                                                AS category_id,
    tc.name                                                              AS category_name,
    tc.recommendation_role                                               AS override_role,
    cp.computed_role,
    COALESCE(tc.recommendation_role, cp.computed_role, 'anchor')        AS resolved_role,
    tc.recommendation_role IS NULL                                       AS is_auto,
    COALESCE(cp.weighted_event_count, 0)                                AS weighted_event_count
  FROM app.tenant_categories tc
  LEFT JOIN app.reco_category_profiles cp
    ON cp.tenant_id = p_tenant_id AND cp.tenant_category_id = tc.id
  WHERE tc.tenant_id = p_tenant_id
    AND tc.deleted_at IS NULL
    AND tc.is_active = true
  ORDER BY tc.name;
$$;
