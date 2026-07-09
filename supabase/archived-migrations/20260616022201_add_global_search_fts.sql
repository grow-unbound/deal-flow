-- Global search FTS infrastructure: search_vector columns, triggers, and global_search RPC.

-- ── catalog.products: populate existing search_doc column ───────────────────

CREATE OR REPLACE FUNCTION catalog.products_search_doc_update()
RETURNS TRIGGER AS $$
BEGIN
  NEW.search_doc :=
    setweight(to_tsvector('english', coalesce(NEW.name, '')),        'A') ||
    setweight(to_tsvector('english', coalesce(NEW.master_sku, '')),  'B') ||
    setweight(to_tsvector('english', coalesce(NEW.description, '')), 'C');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS products_search_doc_update ON catalog.products;
CREATE TRIGGER products_search_doc_update
  BEFORE INSERT OR UPDATE OF name, master_sku, description ON catalog.products
  FOR EACH ROW EXECUTE FUNCTION catalog.products_search_doc_update();

-- Backfill existing rows
UPDATE catalog.products SET
  search_doc =
    setweight(to_tsvector('english', coalesce(name, '')),        'A') ||
    setweight(to_tsvector('english', coalesce(master_sku, '')),  'B') ||
    setweight(to_tsvector('english', coalesce(description, '')), 'C');

-- ── app.tenant_products: add search_vector ───────────────────────────────────

ALTER TABLE app.tenant_products ADD COLUMN IF NOT EXISTS search_vector tsvector;

CREATE INDEX IF NOT EXISTS idx_tenant_products_search_vector
  ON app.tenant_products USING GIN(search_vector);

CREATE OR REPLACE FUNCTION app.tenant_products_search_vector_update()
RETURNS TRIGGER AS $$
DECLARE
  v_master_name text;
  v_brand_name  text;
  v_text        text;
BEGIN
  SELECT cp.name INTO v_master_name
  FROM catalog.products cp
  WHERE cp.id = NEW.master_product_id;

  SELECT cb.name INTO v_brand_name
  FROM app.tenant_brands tb
  JOIN catalog.brands cb ON cb.id = tb.master_brand_id
  WHERE tb.id = NEW.tenant_brand_id;

  v_text := concat_ws(' ',
    COALESCE(NEW.name_override, v_master_name, ''),
    COALESCE(NEW.internal_sku, ''),
    COALESCE(v_brand_name, '')
  );

  NEW.search_vector := to_tsvector('english', v_text);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS tenant_products_search_vector_update ON app.tenant_products;
CREATE TRIGGER tenant_products_search_vector_update
  BEFORE INSERT OR UPDATE OF name_override, internal_sku, master_product_id, tenant_brand_id
  ON app.tenant_products
  FOR EACH ROW EXECUTE FUNCTION app.tenant_products_search_vector_update();

-- Backfill existing tenant_products rows
-- CTE pre-joins all related tables so the UPDATE target alias can't conflict.
WITH src AS (
  SELECT
    tp.id,
    to_tsvector('english',
      concat_ws(' ',
        COALESCE(tp.name_override, cp.name, ''),
        COALESCE(tp.internal_sku, ''),
        COALESCE(cb.name, '')
      )
    ) AS sv
  FROM app.tenant_products tp
  LEFT JOIN app.tenant_brands  tb ON tb.id  = tp.tenant_brand_id
  LEFT JOIN catalog.brands     cb ON cb.id  = tb.master_brand_id
  LEFT JOIN catalog.products   cp ON cp.id  = tp.master_product_id
)
UPDATE app.tenant_products
SET search_vector = src.sv
FROM src
WHERE app.tenant_products.id = src.id;

-- ── app.buyers: add search_vector ────────────────────────────────────────────

ALTER TABLE app.buyers ADD COLUMN IF NOT EXISTS search_vector tsvector;

CREATE INDEX IF NOT EXISTS idx_buyers_search_vector
  ON app.buyers USING GIN(search_vector);

CREATE OR REPLACE FUNCTION app.buyers_search_vector_update()
RETURNS TRIGGER AS $$
BEGIN
  NEW.search_vector := to_tsvector('english',
    concat_ws(' ',
      COALESCE(NEW.business_name, ''),
      COALESCE(NEW.contact_name, '')
    )
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS buyers_search_vector_update ON app.buyers;
CREATE TRIGGER buyers_search_vector_update
  BEFORE INSERT OR UPDATE OF business_name, contact_name ON app.buyers
  FOR EACH ROW EXECUTE FUNCTION app.buyers_search_vector_update();

-- Backfill existing buyers
UPDATE app.buyers SET
  search_vector = to_tsvector('english',
    concat_ws(' ', COALESCE(business_name, ''), COALESCE(contact_name, ''))
  );

-- ── app.global_search RPC ────────────────────────────────────────────────────
-- Returns up to p_items_per_group rows per entity type, ordered by relevance.
-- p_role controls whether estimates appear (seller_admin only).
-- SECURITY DEFINER so RLS does not interfere; tenant isolation is enforced
-- by explicit WHERE tenant_id = p_tenant_id on every subquery.

CREATE OR REPLACE FUNCTION app.global_search(
  p_query           text,
  p_tenant_id       uuid,
  p_role            text DEFAULT 'seller_admin',
  p_items_per_group int  DEFAULT 5
)
RETURNS TABLE (
  entity_type  text,
  id           uuid,
  label        text,
  sublabel     text,
  url_path     text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, catalog, public
AS $$
DECLARE
  v_ts_query tsquery;
  v_like     text;
BEGIN
  IF p_query IS NULL OR trim(p_query) = '' THEN
    RETURN;
  END IF;

  v_like := '%' || lower(trim(p_query)) || '%';

  BEGIN
    v_ts_query := plainto_tsquery('english', trim(p_query));
  EXCEPTION WHEN OTHERS THEN
    v_ts_query := NULL;
  END;

  RETURN QUERY
  WITH all_matches AS (

    -- Products
    SELECT
      'product'::text                                              AS entity_type,
      tp.id,
      COALESCE(tp.name_override, cp.name, tp.internal_sku)        AS label,
      tp.internal_sku || COALESCE(' · ' || cb.name, '')           AS sublabel,
      '/products'::text                                            AS url_path,
      CASE
        WHEN v_ts_query IS NOT NULL AND tp.search_vector @@ v_ts_query
          THEN ts_rank(tp.search_vector, v_ts_query)::float8
        ELSE 0.1::float8
      END AS rank
    FROM app.tenant_products tp
    LEFT JOIN catalog.products  cp  ON cp.id  = tp.master_product_id
    LEFT JOIN app.tenant_brands tbb ON tbb.id = tp.tenant_brand_id
    LEFT JOIN catalog.brands    cb  ON cb.id  = tbb.master_brand_id
    WHERE tp.tenant_id = p_tenant_id
      AND tp.is_active = true
      AND (
        (v_ts_query IS NOT NULL AND tp.search_vector @@ v_ts_query)
        OR lower(COALESCE(tp.name_override, cp.name, '')) LIKE v_like
        OR lower(COALESCE(tp.internal_sku, ''))            LIKE v_like
      )

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
      concat_ws(' · ',
        NULLIF(COALESCE(b.contact_name, ''), ''),
        NULLIF(COALESCE(b.geography->>'city', ''), '')
      ),
      '/customers'::text,
      CASE
        WHEN v_ts_query IS NOT NULL AND b.search_vector @@ v_ts_query
          THEN ts_rank(b.search_vector, v_ts_query)::float8
        ELSE 0.1::float8
      END
    FROM app.buyers b
    WHERE b.tenant_id = p_tenant_id
      AND b.is_active = true
      AND (
        (v_ts_query IS NOT NULL AND b.search_vector @@ v_ts_query)
        OR lower(b.business_name)                    LIKE v_like
        OR lower(COALESCE(b.contact_name, ''))        LIKE v_like
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
    WHERE i.tenant_id  = p_tenant_id
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
    WHERE e.tenant_id  = p_tenant_id
      AND e.deleted_at IS NULL
      AND p_role        = 'seller_admin'
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

GRANT EXECUTE ON FUNCTION app.global_search(text, uuid, text, int) TO authenticated;
