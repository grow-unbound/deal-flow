-- ============================================================
-- Migration 002: RLS policies + atomic tenant-creation RPC
-- ============================================================

-- ------------------------------------------------------------------
-- Helper: returns the set of tenant_ids the current user belongs to.
-- SECURITY DEFINER avoids the RLS recursion problem on tenant_users.
-- ------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.get_user_tenant_ids()
RETURNS SETOF uuid
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = app
AS $$
  SELECT tenant_id
  FROM app.tenant_users
  WHERE user_id = auth.uid()
    AND is_active = true;
$$;

-- ------------------------------------------------------------------
-- Atomic tenant + seller_admin creation.
-- Called from the Next.js API route after Supabase Auth sign-up.
-- SECURITY DEFINER so it can INSERT without the caller needing
-- direct write permissions on app.tenants or app.tenant_users.
-- ------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.create_tenant_and_admin(
  p_user_id       uuid,
  p_slug          text,
  p_business_name text,
  p_primary_state text DEFAULT NULL,
  p_gstin         text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app
AS $$
DECLARE
  v_tenant_id uuid;
  v_subdomain  text;
BEGIN
  v_subdomain := p_slug || '.dealflow.in';

  INSERT INTO app.tenants (
    slug, business_name, gstin, primary_state,
    subdomain, created_by, updated_by
  ) VALUES (
    p_slug, p_business_name, p_gstin, p_primary_state,
    v_subdomain, p_user_id, p_user_id
  )
  RETURNING id INTO v_tenant_id;

  INSERT INTO app.tenant_users (
    tenant_id, user_id, role, joined_at, created_by, updated_by
  ) VALUES (
    v_tenant_id, p_user_id, 'seller_admin', now(), p_user_id, p_user_id
  );

  RETURN jsonb_build_object(
    'tenant_id', v_tenant_id,
    'slug',      p_slug,
    'subdomain', v_subdomain
  );
END;
$$;

-- ------------------------------------------------------------------
-- RLS: app.tenants
-- ------------------------------------------------------------------
ALTER TABLE app.tenants ENABLE ROW LEVEL SECURITY;

-- Sellers can read their own tenant row
CREATE POLICY "tenants_select_own"
  ON app.tenants
  FOR SELECT
  USING (id IN (SELECT app.get_user_tenant_ids()));

-- seller_admin can update their own tenant settings
CREATE POLICY "tenants_update_admin"
  ON app.tenants
  FOR UPDATE
  USING (
    id IN (
      SELECT tenant_id
      FROM app.tenant_users
      WHERE user_id = auth.uid()
        AND role = 'seller_admin'
        AND is_active = true
    )
  );

-- INSERT is intentionally blocked at the row level.
-- All tenant creation goes through app.create_tenant_and_admin (SECURITY DEFINER).

-- ------------------------------------------------------------------
-- RLS: app.tenant_users
-- ------------------------------------------------------------------
ALTER TABLE app.tenant_users ENABLE ROW LEVEL SECURITY;

-- Any active member of a tenant can see all users in that tenant
CREATE POLICY "tenant_users_select_own_tenant"
  ON app.tenant_users
  FOR SELECT
  USING (tenant_id IN (SELECT app.get_user_tenant_ids()));

-- seller_admin can update user membership within their tenant
CREATE POLICY "tenant_users_update_admin"
  ON app.tenant_users
  FOR UPDATE
  USING (
    tenant_id IN (
      SELECT tenant_id
      FROM app.tenant_users
      WHERE user_id = auth.uid()
        AND role = 'seller_admin'
        AND is_active = true
    )
  );

-- ------------------------------------------------------------------
-- RLS: app.buyers
-- ------------------------------------------------------------------
ALTER TABLE app.buyers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "buyers_select_own_tenant"
  ON app.buyers FOR SELECT
  USING (tenant_id IN (SELECT app.get_user_tenant_ids()));

CREATE POLICY "buyers_insert_seller"
  ON app.buyers FOR INSERT
  WITH CHECK (tenant_id IN (SELECT app.get_user_tenant_ids()));

CREATE POLICY "buyers_update_seller"
  ON app.buyers FOR UPDATE
  USING (tenant_id IN (SELECT app.get_user_tenant_ids()));

-- ------------------------------------------------------------------
-- RLS: app.tenant_brands
-- ------------------------------------------------------------------
ALTER TABLE app.tenant_brands ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant_brands_select_own_tenant"
  ON app.tenant_brands FOR SELECT
  USING (tenant_id IN (SELECT app.get_user_tenant_ids()));

CREATE POLICY "tenant_brands_insert_seller"
  ON app.tenant_brands FOR INSERT
  WITH CHECK (tenant_id IN (SELECT app.get_user_tenant_ids()));

CREATE POLICY "tenant_brands_update_seller"
  ON app.tenant_brands FOR UPDATE
  USING (tenant_id IN (SELECT app.get_user_tenant_ids()));

-- ------------------------------------------------------------------
-- RLS: app.tenant_products
-- ------------------------------------------------------------------
ALTER TABLE app.tenant_products ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant_products_select_own_tenant"
  ON app.tenant_products FOR SELECT
  USING (tenant_id IN (SELECT app.get_user_tenant_ids()));

CREATE POLICY "tenant_products_insert_seller"
  ON app.tenant_products FOR INSERT
  WITH CHECK (tenant_id IN (SELECT app.get_user_tenant_ids()));

CREATE POLICY "tenant_products_update_seller"
  ON app.tenant_products FOR UPDATE
  USING (tenant_id IN (SELECT app.get_user_tenant_ids()));

-- ------------------------------------------------------------------
-- RLS: app.orders
-- ------------------------------------------------------------------
ALTER TABLE app.orders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "orders_select_own_tenant"
  ON app.orders FOR SELECT
  USING (tenant_id IN (SELECT app.get_user_tenant_ids()));

CREATE POLICY "orders_insert_seller"
  ON app.orders FOR INSERT
  WITH CHECK (tenant_id IN (SELECT app.get_user_tenant_ids()));

CREATE POLICY "orders_update_seller"
  ON app.orders FOR UPDATE
  USING (tenant_id IN (SELECT app.get_user_tenant_ids()));

-- ------------------------------------------------------------------
-- RLS: app.published_catalogs (buyers can read via share_token — no RLS on that path)
-- ------------------------------------------------------------------
ALTER TABLE app.published_catalogs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "catalogs_select_own_tenant"
  ON app.published_catalogs FOR SELECT
  USING (tenant_id IN (SELECT app.get_user_tenant_ids()));

CREATE POLICY "catalogs_insert_seller"
  ON app.published_catalogs FOR INSERT
  WITH CHECK (tenant_id IN (SELECT app.get_user_tenant_ids()));

CREATE POLICY "catalogs_update_seller"
  ON app.published_catalogs FOR UPDATE
  USING (tenant_id IN (SELECT app.get_user_tenant_ids()));

-- ------------------------------------------------------------------
-- RLS: app.cohorts
-- ------------------------------------------------------------------
ALTER TABLE app.cohorts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "cohorts_select_own_tenant"
  ON app.cohorts FOR SELECT
  USING (tenant_id IN (SELECT app.get_user_tenant_ids()));

CREATE POLICY "cohorts_insert_seller"
  ON app.cohorts FOR INSERT
  WITH CHECK (tenant_id IN (SELECT app.get_user_tenant_ids()));

CREATE POLICY "cohorts_update_seller"
  ON app.cohorts FOR UPDATE
  USING (tenant_id IN (SELECT app.get_user_tenant_ids()));

-- ------------------------------------------------------------------
-- RLS: app.price_lists
-- ------------------------------------------------------------------
ALTER TABLE app.price_lists ENABLE ROW LEVEL SECURITY;

CREATE POLICY "price_lists_select_own_tenant"
  ON app.price_lists FOR SELECT
  USING (tenant_id IN (SELECT app.get_user_tenant_ids()));

CREATE POLICY "price_lists_insert_seller"
  ON app.price_lists FOR INSERT
  WITH CHECK (tenant_id IN (SELECT app.get_user_tenant_ids()));

CREATE POLICY "price_lists_update_seller"
  ON app.price_lists FOR UPDATE
  USING (tenant_id IN (SELECT app.get_user_tenant_ids()));

-- ------------------------------------------------------------------
-- catalog schema: public brands/products are globally readable
-- ------------------------------------------------------------------
ALTER TABLE catalog.brands ENABLE ROW LEVEL SECURITY;
CREATE POLICY "brands_public_read" ON catalog.brands FOR SELECT
  USING (is_public = true OR origin_tenant_id IN (SELECT app.get_user_tenant_ids()));

ALTER TABLE catalog.categories ENABLE ROW LEVEL SECURITY;
CREATE POLICY "categories_public_read" ON catalog.categories FOR SELECT
  USING (is_public = true);

ALTER TABLE catalog.products ENABLE ROW LEVEL SECURITY;
CREATE POLICY "products_public_read" ON catalog.products FOR SELECT
  USING (is_public = true);
