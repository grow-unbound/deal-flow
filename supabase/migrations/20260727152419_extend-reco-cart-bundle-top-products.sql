-- Cart gap widget: one bestseller product ID per bundle slot (30d popularity).
-- Gap ranking/merge remains client-side; enrichment happens in GET /api/buyer/reco/cart-bundles.

CREATE OR REPLACE FUNCTION app.reco_get_cart_bundles(p_tenant_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
AS $$
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
