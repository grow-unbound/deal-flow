ALTER TABLE IF EXISTS app.published_catalogs RENAME TO campaigns;
ALTER TABLE IF EXISTS app.published_catalog_items RENAME TO campaign_items;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'published_catalogs_pkey'
      AND conrelid = 'app.campaigns'::regclass
  ) THEN
    ALTER TABLE app.campaigns RENAME CONSTRAINT published_catalogs_pkey TO campaigns_pkey;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'published_catalog_items_pkey'
      AND conrelid = 'app.campaign_items'::regclass
  ) THEN
    ALTER TABLE app.campaign_items RENAME CONSTRAINT published_catalog_items_pkey TO campaign_items_pkey;
  END IF;

  IF to_regclass('app.idx_published_catalogs_tenant_id') IS NOT NULL THEN
    ALTER INDEX app.idx_published_catalogs_tenant_id RENAME TO idx_campaigns_tenant_id;
  END IF;

  IF to_regclass('app.idx_published_catalogs_share_token') IS NOT NULL THEN
    ALTER INDEX app.idx_published_catalogs_share_token RENAME TO idx_campaigns_share_token;
  END IF;

  IF to_regclass('app.idx_published_catalogs_status') IS NOT NULL THEN
    ALTER INDEX app.idx_published_catalogs_status RENAME TO idx_campaigns_status;
  END IF;

  IF to_regclass('app.idx_published_catalog_items_catalog_id') IS NOT NULL THEN
    ALTER INDEX app.idx_published_catalog_items_catalog_id RENAME TO idx_campaign_items_campaign_id;
  END IF;

  IF to_regclass('app.idx_published_catalog_items_tenant_product_id') IS NOT NULL THEN
    ALTER INDEX app.idx_published_catalog_items_tenant_product_id RENAME TO idx_campaign_items_tenant_product_id;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_trigger
    WHERE tgname = 'published_catalogs_updated_at'
      AND tgrelid = 'app.campaigns'::regclass
  ) THEN
    ALTER TRIGGER published_catalogs_updated_at ON app.campaigns RENAME TO campaigns_updated_at;
  END IF;
END
$$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'app'
      AND table_name = 'campaign_items'
      AND column_name = 'catalog_id'
  ) THEN
    ALTER TABLE app.campaign_items RENAME COLUMN catalog_id TO campaign_id;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'app'
      AND table_name = 'orders'
      AND column_name = 'catalog_id'
  ) THEN
    ALTER TABLE app.orders RENAME COLUMN catalog_id TO campaign_id;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'app'
      AND table_name = 'estimates'
      AND column_name = 'catalog_id'
  ) THEN
    ALTER TABLE app.estimates RENAME COLUMN catalog_id TO campaign_id;
  END IF;
END
$$;

ALTER TABLE IF EXISTS app.cohorts
  ADD COLUMN IF NOT EXISTS allowed_tenant_brand_ids uuid[];

UPDATE app.cohorts
SET allowed_tenant_brand_ids = NULL
WHERE allowed_tenant_brand_ids = '{}';

DROP POLICY IF EXISTS published_catalogs_seller_select ON app.campaigns;
DROP POLICY IF EXISTS published_catalogs_buyer_select ON app.campaigns;
DROP POLICY IF EXISTS published_catalogs_seller_insert ON app.campaigns;
DROP POLICY IF EXISTS published_catalogs_seller_update ON app.campaigns;
DROP POLICY IF EXISTS published_catalogs_seller_delete ON app.campaigns;

CREATE POLICY campaigns_seller_select ON app.campaigns
  FOR SELECT USING (app.is_seller() AND tenant_id = app.jwt_tenant_id());

CREATE POLICY campaigns_buyer_select ON app.campaigns
  FOR SELECT USING (
    app.is_buyer()
    AND tenant_id = app.jwt_tenant_id()
    AND status = 'published'
    AND (valid_to IS NULL OR valid_to > now())
  );

CREATE POLICY campaigns_seller_insert ON app.campaigns
  FOR INSERT WITH CHECK (app.is_seller() AND tenant_id = app.jwt_tenant_id());

CREATE POLICY campaigns_seller_update ON app.campaigns
  FOR UPDATE USING (app.is_seller() AND tenant_id = app.jwt_tenant_id())
  WITH CHECK (app.is_seller() AND tenant_id = app.jwt_tenant_id());

CREATE POLICY campaigns_seller_delete ON app.campaigns
  FOR DELETE USING (app.is_seller() AND tenant_id = app.jwt_tenant_id());

DROP POLICY IF EXISTS published_catalog_items_seller_select ON app.campaign_items;
DROP POLICY IF EXISTS published_catalog_items_buyer_select ON app.campaign_items;
DROP POLICY IF EXISTS published_catalog_items_seller_insert ON app.campaign_items;
DROP POLICY IF EXISTS published_catalog_items_seller_update ON app.campaign_items;
DROP POLICY IF EXISTS published_catalog_items_seller_delete ON app.campaign_items;

CREATE POLICY campaign_items_seller_select ON app.campaign_items
  FOR SELECT USING (
    app.is_seller() AND EXISTS (
      SELECT 1 FROM app.campaigns c
      WHERE c.id = campaign_id AND c.tenant_id = app.jwt_tenant_id()
    )
  );

CREATE POLICY campaign_items_buyer_select ON app.campaign_items
  FOR SELECT USING (
    app.is_buyer() AND EXISTS (
      SELECT 1 FROM app.campaigns c
      WHERE c.id = campaign_id
        AND c.tenant_id = app.jwt_tenant_id()
        AND c.status = 'published'
        AND (c.valid_to IS NULL OR c.valid_to > now())
    )
  );

CREATE POLICY campaign_items_seller_insert ON app.campaign_items
  FOR INSERT WITH CHECK (
    app.is_seller() AND EXISTS (
      SELECT 1 FROM app.campaigns c
      WHERE c.id = campaign_id AND c.tenant_id = app.jwt_tenant_id()
    )
  );

CREATE POLICY campaign_items_seller_update ON app.campaign_items
  FOR UPDATE USING (
    app.is_seller() AND EXISTS (
      SELECT 1 FROM app.campaigns c
      WHERE c.id = campaign_id AND c.tenant_id = app.jwt_tenant_id()
    )
  )
  WITH CHECK (
    app.is_seller() AND EXISTS (
      SELECT 1 FROM app.campaigns c
      WHERE c.id = campaign_id AND c.tenant_id = app.jwt_tenant_id()
    )
  );

CREATE POLICY campaign_items_seller_delete ON app.campaign_items
  FOR DELETE USING (
    app.is_seller() AND EXISTS (
      SELECT 1 FROM app.campaigns c
      WHERE c.id = campaign_id AND c.tenant_id = app.jwt_tenant_id()
    )
  );

CREATE OR REPLACE FUNCTION app.resolve_price(
  p_tenant_product_id uuid,
  p_buyer_id uuid,
  p_qty numeric DEFAULT 1
) RETURNS numeric
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = app, catalog, public
AS $$
DECLARE
  v_price numeric;
BEGIN
  SELECT pli.price INTO v_price
  FROM app.price_list_items pli
  JOIN app.price_lists pl ON pl.id = pli.price_list_id
  JOIN app.price_list_assignments pla ON pla.price_list_id = pl.id
  WHERE pli.tenant_product_id = p_tenant_product_id
    AND pli.min_qty <= p_qty
    AND (pli.max_qty IS NULL OR pli.max_qty >= p_qty)
    AND pla.target_type = 'buyer'
    AND pla.target_id = p_buyer_id
    AND pl.is_active = true
    AND pl.valid_from <= now()
    AND (pl.valid_to IS NULL OR pl.valid_to > now())
  ORDER BY pl.priority DESC, pli.min_qty DESC
  LIMIT 1;

  IF v_price IS NOT NULL THEN RETURN v_price; END IF;

  SELECT pli.price INTO v_price
  FROM app.price_list_items pli
  JOIN app.price_lists pl ON pl.id = pli.price_list_id
  JOIN app.price_list_assignments pla ON pla.price_list_id = pl.id
  JOIN app.cohort_members cm ON cm.cohort_id = pla.target_id
  WHERE pli.tenant_product_id = p_tenant_product_id
    AND pli.min_qty <= p_qty
    AND (pli.max_qty IS NULL OR pli.max_qty >= p_qty)
    AND pla.target_type = 'cohort'
    AND cm.buyer_id = p_buyer_id
    AND pl.is_active = true
    AND pl.valid_from <= now()
    AND (pl.valid_to IS NULL OR pl.valid_to > now())
  ORDER BY pl.priority DESC, pli.min_qty DESC
  LIMIT 1;

  IF v_price IS NOT NULL THEN RETURN v_price; END IF;

  SELECT pli.price INTO v_price
  FROM app.price_list_items pli
  JOIN app.price_lists pl ON pl.id = pli.price_list_id
  JOIN app.price_list_assignments pla ON pla.price_list_id = pl.id
  WHERE pli.tenant_product_id = p_tenant_product_id
    AND pli.min_qty <= p_qty
    AND (pli.max_qty IS NULL OR pli.max_qty >= p_qty)
    AND pla.target_type = 'all_buyers'
    AND pl.is_active = true
    AND pl.valid_from <= now()
    AND (pl.valid_to IS NULL OR pl.valid_to > now())
  ORDER BY pl.priority DESC, pli.min_qty DESC
  LIMIT 1;

  IF v_price IS NOT NULL THEN RETURN v_price; END IF;

  SELECT base_selling_price INTO v_price
  FROM app.tenant_products
  WHERE id = p_tenant_product_id;

  RETURN v_price;
END;
$$;
