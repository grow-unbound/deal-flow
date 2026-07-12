CREATE OR REPLACE FUNCTION app.global_search(
  p_query text,
  p_tenant_id uuid,
  p_role text DEFAULT 'seller_admin',
  p_items_per_group int DEFAULT 5,
  p_query_embedding vector(1536) DEFAULT NULL
)
RETURNS TABLE (
  entity_type text,
  id uuid,
  label text,
  sublabel text,
  url_path text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, catalog, public
AS $$
DECLARE
  v_like text;
BEGIN
  IF p_query IS NULL OR trim(p_query) = '' THEN
    RETURN;
  END IF;

  v_like := '%' || lower(trim(p_query)) || '%';

  RETURN QUERY
  WITH all_matches AS (
    SELECT
      'product'::text AS entity_type,
      sp.tenant_product_id AS id,
      sp.product_name AS label,
      concat_ws(' · ', sp.brand_name, sp.sku) AS sublabel,
      '/products/' || sp.tenant_product_id::text AS url_path,
      sp.search_rank AS rank
    FROM app.search_products(
      p_tenant_id,
      p_query,
      NULL,
      NULL,
      p_items_per_group * 3,
      p_query_embedding,
      NULL
    ) sp

    UNION ALL

    SELECT
      'brand'::text,
      tb.id,
      cb.name,
      COALESCE(cb.description, ''),
      '/brands/' || tb.id::text,
      CASE WHEN lower(cb.name) LIKE v_like THEN 0.8::float8 ELSE 0.1::float8 END
    FROM app.tenant_brands tb
    JOIN catalog.brands cb ON cb.id = tb.master_brand_id
    WHERE tb.tenant_id = p_tenant_id
      AND tb.is_active = true
      AND lower(cb.name) LIKE v_like

    UNION ALL

    SELECT
      'customer'::text,
      b.id,
      b.business_name,
      concat_ws(' · ', NULLIF(COALESCE(b.contact_name, ''), ''), NULLIF(COALESCE(b.geography->>'city', ''), '')),
      '/customers/' || b.id::text,
      CASE
        WHEN b.search_vector @@ plainto_tsquery('english', trim(p_query))
          THEN ts_rank(b.search_vector, plainto_tsquery('english', trim(p_query)))::float8
        ELSE 0.1::float8
      END
    FROM app.buyers b
    WHERE b.tenant_id = p_tenant_id
      AND b.is_active = true
      AND (
        lower(b.business_name) LIKE v_like
        OR lower(COALESCE(b.contact_name, '')) LIKE v_like
      )

    UNION ALL

    SELECT
      'category'::text,
      tc.id,
      tc.name,
      concat_ws(' · ', tc.description, CASE WHEN tc.is_active THEN 'Active' ELSE 'Inactive' END),
      '/categories/' || tc.id::text,
      CASE WHEN lower(tc.name) LIKE v_like THEN 0.75::float8 ELSE 0.1::float8 END
    FROM app.tenant_categories tc
    WHERE tc.tenant_id = p_tenant_id
      AND tc.deleted_at IS NULL
      AND p_role = 'seller_admin'
      AND lower(tc.name) LIKE v_like

    UNION ALL

    SELECT
      'location'::text,
      l.id,
      l.name,
      concat_ws(
        ' · ',
        NULLIF(COALESCE(l.address->>'city', ''), ''),
        NULLIF(COALESCE(l.address->>'state', ''), '')
      ),
      '/locations/' || l.id::text,
      CASE WHEN lower(l.name) LIKE v_like THEN 0.75::float8 ELSE 0.1::float8 END
    FROM app.locations l
    WHERE l.tenant_id = p_tenant_id
      AND l.deleted_at IS NULL
      AND p_role = 'seller_admin'
      AND lower(l.name) LIKE v_like

    UNION ALL

    SELECT
      'warehouse'::text,
      w.id,
      w.name,
      concat_ws(
        ' · ',
        NULLIF(COALESCE(w.address->>'city', ''), ''),
        NULLIF(COALESCE(w.address->>'state', ''), '')
      ),
      '/warehouses/' || w.id::text,
      CASE WHEN lower(w.name) LIKE v_like THEN 0.75::float8 ELSE 0.1::float8 END
    FROM app.warehouses w
    WHERE w.tenant_id = p_tenant_id
      AND w.deleted_at IS NULL
      AND p_role = 'seller_admin'
      AND lower(w.name) LIKE v_like

    UNION ALL

    SELECT
      'cohort'::text,
      c.id,
      c.name,
      COALESCE(c.description, ''),
      '/customer-groups/' || c.id::text,
      CASE WHEN lower(c.name) LIKE v_like THEN 0.8::float8 ELSE 0.1::float8 END
    FROM app.cohorts c
    WHERE c.tenant_id = p_tenant_id
      AND c.deleted_at IS NULL
      AND lower(c.name) LIKE v_like

    UNION ALL

    SELECT
      'campaign'::text,
      c.id,
      c.name,
      COALESCE(c.status, ''),
      '/campaigns/' || c.id::text,
      CASE WHEN lower(c.name) LIKE v_like THEN 0.8::float8 ELSE 0.1::float8 END
    FROM app.campaigns c
    WHERE c.tenant_id = p_tenant_id
      AND c.deleted_at IS NULL
      AND lower(c.name) LIKE v_like

    UNION ALL

    SELECT
      'price_list'::text,
      pl.id,
      pl.name,
      COALESCE(pl.status, ''),
      '/price-lists/' || pl.id::text,
      CASE WHEN lower(pl.name) LIKE v_like THEN 0.8::float8 ELSE 0.1::float8 END
    FROM app.price_lists pl
    WHERE pl.tenant_id = p_tenant_id
      AND pl.deleted_at IS NULL
      AND lower(pl.name) LIKE v_like

    UNION ALL

    SELECT
      'order'::text,
      o.id,
      o.order_number,
      COALESCE(bu.business_name, ''),
      '/sales-orders/' || o.id::text,
      1.0::float8
    FROM app.orders o
    LEFT JOIN app.buyers bu ON bu.id = o.buyer_id
    WHERE o.tenant_id = p_tenant_id
      AND lower(o.order_number) LIKE v_like

    UNION ALL

    SELECT
      'invoice'::text,
      i.id,
      i.invoice_number,
      COALESCE(bu.business_name, ''),
      '/invoices/' || i.id::text,
      1.0::float8
    FROM app.invoices i
    LEFT JOIN app.buyers bu ON bu.id = i.buyer_id
    WHERE i.tenant_id = p_tenant_id
      AND i.deleted_at IS NULL
      AND lower(i.invoice_number) LIKE v_like

    UNION ALL

    SELECT
      'estimate'::text,
      e.id,
      COALESCE(e.estimate_number, ''),
      COALESCE(bu.business_name, ''),
      '/estimates/' || e.id::text,
      1.0::float8
    FROM app.estimates e
    LEFT JOIN app.buyers bu ON bu.id = e.buyer_id
    WHERE e.tenant_id = p_tenant_id
      AND e.deleted_at IS NULL
      AND p_role = 'seller_admin'
      AND lower(COALESCE(e.estimate_number, '')) LIKE v_like
  ),
  ranked AS (
    SELECT
      m.entity_type,
      m.id,
      m.label,
      m.sublabel,
      m.url_path,
      ROW_NUMBER() OVER (PARTITION BY m.entity_type ORDER BY m.rank DESC, m.label ASC) AS rn
    FROM all_matches m
  )
  SELECT
    r.entity_type,
    r.id,
    r.label,
    r.sublabel,
    r.url_path
  FROM ranked r
  WHERE r.rn <= p_items_per_group
  ORDER BY r.entity_type, r.rn;
END;
$$;

GRANT EXECUTE ON FUNCTION app.global_search(text, uuid, text, int, vector) TO authenticated;
