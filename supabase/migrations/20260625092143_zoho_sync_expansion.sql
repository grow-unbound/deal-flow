ALTER TABLE app.tenant_products
  DROP COLUMN IF EXISTS category_name;

ALTER TABLE app.buyers
  ADD COLUMN IF NOT EXISTS gst_treatment text,
  ADD COLUMN IF NOT EXISTS status text,
  ADD COLUMN IF NOT EXISTS billing_address jsonb,
  ADD COLUMN IF NOT EXISTS shipping_address jsonb;

ALTER TABLE app.buyer_users
  DROP COLUMN IF EXISTS mobile;

ALTER TABLE app.buyer_users
  ADD COLUMN IF NOT EXISTS search_vector tsvector;

CREATE INDEX IF NOT EXISTS idx_buyer_users_search_vector
  ON app.buyer_users USING gin (search_vector);

ALTER TABLE app.price_lists
  ADD COLUMN IF NOT EXISTS external_ref text,
  ADD COLUMN IF NOT EXISTS description text,
  ADD COLUMN IF NOT EXISTS pricebook_type text,
  ADD COLUMN IF NOT EXISTS source_updated_at timestamptz,
  ADD COLUMN IF NOT EXISTS source_payload jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE app.price_list_items
  ADD COLUMN IF NOT EXISTS external_ref text,
  ADD COLUMN IF NOT EXISTS source_updated_at timestamptz,
  ADD COLUMN IF NOT EXISTS source_payload jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE app.price_list_assignments
  ADD COLUMN IF NOT EXISTS external_ref text,
  ADD COLUMN IF NOT EXISTS source_payload jsonb NOT NULL DEFAULT '{}'::jsonb;

CREATE UNIQUE INDEX IF NOT EXISTS price_lists_tenant_external_ref_unfiltered_upsert
  ON app.price_lists (tenant_id, external_ref);

CREATE UNIQUE INDEX IF NOT EXISTS price_list_assignments_zoho_upsert
  ON app.price_list_assignments (price_list_id, target_type, target_id, external_ref);

ALTER TABLE app.integration_entity_map
  DROP CONSTRAINT IF EXISTS integration_entity_map_entity_type_check;
ALTER TABLE app.integration_entity_map
  ADD CONSTRAINT integration_entity_map_entity_type_check CHECK (
    entity_type IN (
      'locations',
      'categories',
      'brands',
      'products',
      'pricelists',
      'customers',
      'contact_persons',
      'estimates',
      'orders',
      'invoices'
    )
  );

ALTER TABLE app.integration_data_flows
  DROP CONSTRAINT IF EXISTS integration_data_flows_entity_type_check;
ALTER TABLE app.integration_data_flows
  ADD CONSTRAINT integration_data_flows_entity_type_check CHECK (
    entity_type IN (
      'locations',
      'categories',
      'brands',
      'products',
      'pricelists',
      'customers',
      'contact_persons',
      'estimates',
      'orders',
      'invoices'
    )
  );

ALTER TABLE app.price_lists
  DROP CONSTRAINT IF EXISTS price_lists_pricing_strategy_check;

ALTER TABLE app.price_lists
  ADD CONSTRAINT price_lists_pricing_strategy_check CHECK (
    pricing_strategy IN (
      'edit_each',
      'margin_from_mrp',
      'flat_off_base',
      'per_item',
      'percentage'
    )
  );

CREATE OR REPLACE FUNCTION app.tenant_products_search_vector_update()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_master_name text;
  v_brand_name text;
  v_category_name text;
  v_text text;
BEGIN
  IF app.sync_trigger_bypass_active() THEN
    RETURN NEW;
  END IF;

  SELECT cp.name
  INTO v_master_name
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
    COALESCE(NEW.hsn_code, '')
  );

  NEW.search_vector := to_tsvector('english', v_text);
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION app.buyers_search_vector_update()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF app.sync_trigger_bypass_active() THEN
    RETURN NEW;
  END IF;

  NEW.search_vector := to_tsvector(
    'english',
    concat_ws(
      ' ',
      COALESCE(NEW.business_name, ''),
      COALESCE(NEW.contact_name, ''),
      COALESCE(NEW.phone, ''),
      COALESCE(NEW.email, ''),
      COALESCE(NEW.gstin, ''),
      COALESCE(NEW.gst_treatment, ''),
      COALESCE(NEW.status, '')
    )
  );
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION app.buyer_users_search_vector_update()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_business_name text;
BEGIN
  IF app.sync_trigger_bypass_active() THEN
    RETURN NEW;
  END IF;

  SELECT b.business_name
  INTO v_business_name
  FROM app.buyers b
  WHERE b.id = NEW.buyer_id;

  NEW.search_vector := to_tsvector(
    'english',
    concat_ws(
      ' ',
      COALESCE(v_business_name, ''),
      COALESCE(NEW.first_name, ''),
      COALESCE(NEW.last_name, ''),
      COALESCE(NEW.email, ''),
      COALESCE(NEW.phone, ''),
      COALESCE(NEW.designation, ''),
      COALESCE(NEW.department, '')
    )
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS buyer_users_search_vector_update ON app.buyer_users;
CREATE TRIGGER buyer_users_search_vector_update
  BEFORE INSERT OR UPDATE ON app.buyer_users
  FOR EACH ROW EXECUTE FUNCTION app.buyer_users_search_vector_update();

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
      COALESCE(tp.hsn_code, '')
    )
  )
  WHERE tp.tenant_id = p_tenant_id
    AND tp.deleted_at IS NULL
    AND (p_ids IS NULL OR tp.id = ANY (p_ids));
$$;

CREATE OR REPLACE FUNCTION app.rebuild_buyers_search_vectors(
  p_tenant_id uuid,
  p_ids uuid[] DEFAULT NULL
)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = pg_catalog, app
AS $$
  UPDATE app.buyers b
  SET search_vector = to_tsvector(
    'english',
    concat_ws(
      ' ',
      COALESCE(b.business_name, ''),
      COALESCE(b.contact_name, ''),
      COALESCE(b.phone, ''),
      COALESCE(b.email, ''),
      COALESCE(b.gstin, ''),
      COALESCE(b.gst_treatment, ''),
      COALESCE(b.status, '')
    )
  )
  WHERE b.tenant_id = p_tenant_id
    AND b.deleted_at IS NULL
    AND (p_ids IS NULL OR b.id = ANY (p_ids));
$$;

CREATE OR REPLACE FUNCTION app.rebuild_buyer_users_search_vectors(
  p_buyer_ids uuid[] DEFAULT NULL,
  p_ids uuid[] DEFAULT NULL
)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = pg_catalog, app
AS $$
  UPDATE app.buyer_users bu
  SET search_vector = to_tsvector(
    'english',
    concat_ws(
      ' ',
      COALESCE(b.business_name, ''),
      COALESCE(bu.first_name, ''),
      COALESCE(bu.last_name, ''),
      COALESCE(bu.email, ''),
      COALESCE(bu.phone, ''),
      COALESCE(bu.designation, ''),
      COALESCE(bu.department, '')
    )
  )
  FROM app.buyers b
  WHERE b.id = bu.buyer_id
    AND bu.deleted_at IS NULL
    AND (p_buyer_ids IS NULL OR bu.buyer_id = ANY (p_buyer_ids))
    AND (p_ids IS NULL OR bu.id = ANY (p_ids));
$$;

SELECT app.rebuild_tenant_products_search_vectors(tp.tenant_id)
FROM (SELECT DISTINCT tenant_id FROM app.tenant_products WHERE deleted_at IS NULL) tp;

SELECT app.rebuild_buyers_search_vectors(b.tenant_id)
FROM (SELECT DISTINCT tenant_id FROM app.buyers WHERE deleted_at IS NULL) b;

SELECT app.rebuild_buyer_users_search_vectors(
  ARRAY(
    SELECT DISTINCT buyer_id
    FROM app.buyer_users
    WHERE deleted_at IS NULL
  )
);
