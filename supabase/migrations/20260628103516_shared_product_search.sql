-- Shared product search for composer UIs and global search.
-- Uses live tenant product joins plus text/vector ranking so the query can
-- match product name, SKU, brand, category, and attribute text consistently.

CREATE OR REPLACE FUNCTION app.tenant_products_search_vector_update()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_master_name text;
  v_brand_name text;
  v_category_name text;
  v_master_attributes text;
  v_text text;
BEGIN
  IF app.sync_trigger_bypass_active() THEN
    RETURN NEW;
  END IF;

  SELECT cp.name, COALESCE(cp.attributes::text, '')
  INTO v_master_name, v_master_attributes
  FROM catalog.products cp
  WHERE cp.id = NEW.master_product_id;

  SELECT COALESCE(tb.display_name_override, cb.name)
  INTO v_brand_name
  FROM app.tenant_brands tb
  LEFT JOIN catalog.brands cb ON cb.id = tb.master_brand_id
  WHERE tb.id = NEW.tenant_brand_id;

  SELECT tc.name
  INTO v_category_name
  FROM app.tenant_categories tc
  WHERE tc.id = NEW.tenant_category_id;

  v_text := concat_ws(
    ' ',
    COALESCE(NEW.name_override, v_master_name, ''),
    COALESCE(NEW.internal_sku, ''),
    COALESCE(v_brand_name, ''),
    COALESCE(v_category_name, ''),
    COALESCE(NEW.hsn_code, ''),
    COALESCE(NEW.attributes_override::text, ''),
    COALESCE(v_master_attributes, '')
  );

  NEW.search_vector := to_tsvector('english', v_text);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tenant_products_search_vector_update ON app.tenant_products;
CREATE TRIGGER tenant_products_search_vector_update
  BEFORE INSERT OR UPDATE OF name_override, internal_sku, master_product_id, tenant_brand_id, tenant_category_id, attributes_override, hsn_code
  ON app.tenant_products
  FOR EACH ROW EXECUTE FUNCTION app.tenant_products_search_vector_update();

CREATE OR REPLACE FUNCTION app.rebuild_tenant_products_search_vectors(
  p_tenant_id uuid,
  p_ids uuid[] DEFAULT NULL
)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = pg_catalog, app, catalog
AS $$
  UPDATE app.tenant_products tp
  SET search_vector = to_tsvector(
    'english',
    concat_ws(
      ' ',
      COALESCE(
        tp.name_override,
        (
          SELECT cp.name
          FROM catalog.products cp
          WHERE cp.id = tp.master_product_id
        ),
        ''
      ),
      COALESCE(tp.internal_sku, ''),
      COALESCE(
        (
          SELECT COALESCE(tb.display_name_override, cb.name)
          FROM app.tenant_brands tb
          LEFT JOIN catalog.brands cb ON cb.id = tb.master_brand_id
          WHERE tb.id = tp.tenant_brand_id
        ),
        ''
      ),
      COALESCE(
        (
          SELECT tc.name
          FROM app.tenant_categories tc
          WHERE tc.id = tp.tenant_category_id
        ),
        ''
      ),
      COALESCE(tp.hsn_code, ''),
      COALESCE(tp.attributes_override::text, ''),
      COALESCE(
        (
          SELECT COALESCE(cp.attributes::text, '')
          FROM catalog.products cp
          WHERE cp.id = tp.master_product_id
        ),
        ''
      )
    )
  )
  WHERE tp.tenant_id = p_tenant_id
    AND tp.deleted_at IS NULL
    AND (p_ids IS NULL OR tp.id = ANY (p_ids));
$$;

CREATE OR REPLACE FUNCTION app.search_products(
  p_tenant_id uuid,
  p_query text,
  p_buyer_id uuid DEFAULT NULL,
  p_price_list_id uuid DEFAULT NULL,
  p_limit int DEFAULT 12,
  p_query_embedding vector(1536) DEFAULT NULL,
  p_ids uuid[] DEFAULT NULL
)
RETURNS TABLE (
  tenant_product_id uuid,
  product_name text,
  sku text,
  brand_name text,
  category_name text,
  hsn_code text,
  tax_pct numeric,
  on_hand numeric,
  unit_price numeric,
  mrp numeric,
  base_selling_price numeric,
  default_uom text,
  pack_size numeric,
  search_rank double precision
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = pg_catalog, app, catalog
AS $$
  WITH normalized AS (
    SELECT
      NULLIF(btrim(p_query), '') AS query,
      CASE
        WHEN NULLIF(btrim(p_query), '') IS NULL THEN NULL
        ELSE websearch_to_tsquery('english', NULLIF(btrim(p_query), ''))
      END AS ts_query,
      lower(NULLIF(btrim(p_query), '')) AS like_q,
      p_query_embedding AS query_embedding
  ),
  inventory AS (
    SELECT
      ti.tenant_product_id,
      SUM(COALESCE(ti.qty_available, 0))::numeric AS on_hand
    FROM app.tenant_inventory ti
    JOIN app.tenant_products tp ON tp.id = ti.tenant_product_id
    WHERE tp.tenant_id = p_tenant_id
      AND tp.deleted_at IS NULL
    GROUP BY ti.tenant_product_id
  ),
  scoped_products AS (
    SELECT
      tp.id AS tenant_product_id,
      COALESCE(tp.name_override, cp.name, tp.internal_sku) AS product_name,
      tp.internal_sku AS sku,
      COALESCE(tb.display_name_override, cb.name, 'Brand') AS brand_name,
      COALESCE(tc.name, '') AS category_name,
      COALESCE(tp.hsn_code, cp.hsn_code) AS hsn_code,
      COALESCE(tp.gst_rate, cp.gst_rate) AS tax_pct,
      COALESCE(inv.on_hand, 0) AS on_hand,
      COALESCE(
        pl_override.price,
        CASE
          WHEN p_buyer_id IS NOT NULL THEN app.resolve_price(tp.id, p_buyer_id, 1)
          ELSE NULL
        END,
        tp.base_selling_price,
        0
      ) AS unit_price,
      COALESCE(tp.mrp, 0) AS mrp,
      tp.base_selling_price,
      tp.default_uom,
      tp.pack_size,
      tp.search_vector,
      tp.embedding,
      lower(
        concat_ws(
          ' ',
          COALESCE(tp.name_override, cp.name, ''),
          COALESCE(tp.internal_sku, ''),
          COALESCE(tb.display_name_override, cb.name, ''),
          COALESCE(tc.name, ''),
          COALESCE(tp.hsn_code, cp.hsn_code, ''),
          COALESCE(tp.attributes_override::text, ''),
          COALESCE(cp.attributes::text, '')
        )
      ) AS search_text
    FROM app.tenant_products tp
    LEFT JOIN catalog.products cp ON cp.id = tp.master_product_id
    LEFT JOIN app.tenant_brands tb ON tb.id = tp.tenant_brand_id
    LEFT JOIN catalog.brands cb ON cb.id = tb.master_brand_id
    LEFT JOIN app.tenant_categories tc ON tc.id = tp.tenant_category_id
    LEFT JOIN inventory inv ON inv.tenant_product_id = tp.id
    LEFT JOIN LATERAL (
      SELECT pli.price
      FROM app.price_list_items pli
      WHERE p_price_list_id IS NOT NULL
        AND pli.price_list_id = p_price_list_id
        AND pli.tenant_product_id = tp.id
        AND pli.deleted_at IS NULL
      ORDER BY pli.min_qty DESC, pli.created_at DESC
      LIMIT 1
    ) pl_override ON true
    WHERE tp.tenant_id = p_tenant_id
      AND tp.is_active = true
      AND tp.deleted_at IS NULL
      AND (p_ids IS NULL OR tp.id = ANY (p_ids))
  )
  SELECT
    sp.tenant_product_id,
    sp.product_name,
    sp.sku,
    sp.brand_name,
    sp.category_name,
    sp.hsn_code,
    sp.tax_pct,
    sp.on_hand,
    sp.unit_price,
    sp.mrp,
    sp.base_selling_price,
    sp.default_uom,
    sp.pack_size,
    COALESCE(
      CASE
        WHEN n.ts_query IS NOT NULL AND sp.search_vector @@ n.ts_query
          THEN ts_rank(sp.search_vector, n.ts_query)
        ELSE 0
      END,
      0
    )
    + CASE
        WHEN n.like_q IS NOT NULL AND n.like_q <> ''
          THEN 0.25 * public.similarity(sp.search_text, n.like_q)
        ELSE 0
      END
    + CASE
        WHEN n.query_embedding IS NOT NULL AND sp.embedding IS NOT NULL
          THEN 0.35 * (1 - (sp.embedding OPERATOR(public.<=>) n.query_embedding))
        ELSE 0
      END AS search_rank
  FROM scoped_products sp
  CROSS JOIN normalized n
  WHERE n.query IS NULL
    OR sp.search_text LIKE '%' || n.like_q || '%'
    OR (n.ts_query IS NOT NULL AND sp.search_vector @@ n.ts_query)
    OR (
      n.query_embedding IS NOT NULL
      AND sp.embedding IS NOT NULL
      AND (1 - (sp.embedding OPERATOR(public.<=>) n.query_embedding)) >= 0.15
    )
  ORDER BY
    search_rank DESC,
    sp.product_name ASC,
    sp.sku ASC
  LIMIT GREATEST(p_limit, 1);
$$;

DROP FUNCTION IF EXISTS app.global_search(text, uuid, text, int);

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
      '/products'::text AS url_path,
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

    -- Brands
    SELECT
      'brand'::text,
      tb.id,
      cb.name,
      COALESCE(cb.description, ''),
      '/brands'::text,
      CASE WHEN lower(cb.name) LIKE v_like THEN 0.8::float8 ELSE 0.1::float8 END
    FROM app.tenant_brands tb
    JOIN catalog.brands cb ON cb.id = tb.master_brand_id
    WHERE tb.tenant_id = p_tenant_id
      AND tb.is_active = true
      AND lower(cb.name) LIKE v_like

    UNION ALL

    -- Customers
    SELECT
      'customer'::text,
      b.id,
      b.business_name,
      concat_ws(' · ', NULLIF(COALESCE(b.contact_name, ''), ''), NULLIF(COALESCE(b.geography->>'city', ''), '')),
      '/customers'::text,
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

    -- Orders
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

    -- Invoices
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

    -- Estimates (seller_admin only)
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
      ROW_NUMBER() OVER (PARTITION BY m.entity_type ORDER BY m.rank DESC) AS rn
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

CREATE OR REPLACE FUNCTION app.tenant_product_brand_embedding_queue()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_product_id uuid;
BEGIN
  FOR v_product_id IN
    SELECT tp.id
    FROM app.tenant_products tp
    WHERE tp.tenant_brand_id = NEW.id
      AND tp.deleted_at IS NULL
  LOOP
    PERFORM catalog.enqueue_embedding('app.tenant_products', v_product_id);
  END LOOP;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION app.tenant_category_embedding_queue()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_product_id uuid;
BEGIN
  FOR v_product_id IN
    SELECT tp.id
    FROM app.tenant_products tp
    WHERE tp.tenant_category_id = NEW.id
      AND tp.deleted_at IS NULL
  LOOP
    PERFORM catalog.enqueue_embedding('app.tenant_products', v_product_id);
  END LOOP;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION catalog.product_embedding_queue()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_product_id uuid;
BEGIN
  FOR v_product_id IN
    SELECT tp.id
    FROM app.tenant_products tp
    WHERE tp.master_product_id = NEW.id
      AND tp.deleted_at IS NULL
  LOOP
    PERFORM catalog.enqueue_embedding('app.tenant_products', v_product_id);
  END LOOP;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tenant_product_brand_embedding_queue ON app.tenant_brands;
CREATE TRIGGER tenant_product_brand_embedding_queue
  AFTER INSERT OR UPDATE OF display_name_override, master_brand_id
  ON app.tenant_brands
  FOR EACH ROW EXECUTE FUNCTION app.tenant_product_brand_embedding_queue();

DROP TRIGGER IF EXISTS tenant_category_embedding_queue ON app.tenant_categories;
CREATE TRIGGER tenant_category_embedding_queue
  AFTER INSERT OR UPDATE OF name
  ON app.tenant_categories
  FOR EACH ROW EXECUTE FUNCTION app.tenant_category_embedding_queue();

DROP TRIGGER IF EXISTS products_embedding_queue ON catalog.products;
CREATE TRIGGER products_embedding_queue
  AFTER INSERT OR UPDATE OF name, master_sku, description, attributes, category_id
  ON catalog.products
  FOR EACH ROW EXECUTE FUNCTION catalog.product_embedding_queue();

CREATE OR REPLACE FUNCTION app.tenant_products_embedding_queue()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM catalog.enqueue_embedding('app.tenant_products', NEW.id);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tenant_products_embedding_queue ON app.tenant_products;
CREATE TRIGGER tenant_products_embedding_queue
  AFTER INSERT OR UPDATE OF name_override, internal_sku, attributes_override, tenant_brand_id, tenant_category_id, master_product_id, hsn_code
  ON app.tenant_products
  FOR EACH ROW EXECUTE FUNCTION app.tenant_products_embedding_queue();
