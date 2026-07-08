-- Catalog schema RLS hardening + platform admin foundation.
-- Tenants: read-only public master catalog (is_public = true).
-- Platform admins: full catalog access via app.platform_admins + JWT claim.
--
-- After deploy, bootstrap your platform admin user (re-login required for JWT claim):
--   INSERT INTO app.platform_admins (user_id)
--   SELECT id FROM auth.users WHERE email = 'you@example.com';

-- ── Platform admins registry ────────────────────────────────────────────────

CREATE TABLE app.platform_admins (
  user_id    uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

COMMENT ON TABLE app.platform_admins IS
  'DealFlow platform operators who can write to catalog.* (master catalog promotion). '
  'Bootstrap: INSERT INTO app.platform_admins (user_id) VALUES (''<auth.users.id>'');';

ALTER TABLE app.platform_admins ENABLE ROW LEVEL SECURITY;

-- ── JWT helper ──────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION app.is_platform_admin()
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT COALESCE((auth.jwt() ->> 'is_platform_admin')::boolean, false)
$$;

-- ── custom_access_token_hook: inject is_platform_admin claim ────────────────

CREATE OR REPLACE FUNCTION public.custom_access_token_hook(event jsonb)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, app
AS $$
DECLARE
  claims           jsonb;
  v_user_id        uuid;
  v_current_tid    uuid;
  v_current_bid    uuid;
  v_tenant_id      uuid;
  v_role           text;
  v_buyer_id       uuid;
  v_location_ids   uuid[];
  v_platform_admin boolean := false;
BEGIN
  claims := COALESCE(event -> 'claims', '{}'::jsonb);
  IF jsonb_typeof(claims) <> 'object' THEN
    claims := '{}'::jsonb;
  END IF;

  v_user_id := (event ->> 'user_id')::uuid;

  SELECT EXISTS (
    SELECT 1 FROM app.platform_admins pa WHERE pa.user_id = v_user_id
  )
  INTO v_platform_admin;

  v_current_tid := (claims -> 'app_metadata' ->> 'current_tenant_id')::uuid;
  v_current_bid := (claims -> 'app_metadata' ->> 'current_buyer_id')::uuid;

  IF v_current_tid IS NOT NULL THEN
    SELECT tu.tenant_id, tu.role, tu.location_ids
    INTO   v_tenant_id, v_role, v_location_ids
    FROM   app.tenant_users tu
    WHERE  tu.user_id = v_user_id
      AND  tu.tenant_id = v_current_tid
      AND  tu.is_active = true
    LIMIT 1;
  END IF;

  IF v_tenant_id IS NULL THEN
    SELECT tu.tenant_id, tu.role, tu.location_ids
    INTO   v_tenant_id, v_role, v_location_ids
    FROM   app.tenant_users tu
    WHERE  tu.user_id = v_user_id
      AND  tu.is_active = true
    ORDER BY tu.created_at
    LIMIT 1;
  END IF;

  IF v_tenant_id IS NULL THEN
    SELECT b.tenant_id, bu.role, bu.buyer_id
    INTO   v_tenant_id, v_role, v_buyer_id
    FROM   app.buyer_users bu
    JOIN   app.buyers b ON b.id = bu.buyer_id
    WHERE  bu.user_id = v_user_id
      AND  bu.is_active = true
      AND  b.is_active = true
      AND  b.buyer_app_enabled = true
      AND  b.deleted_at IS NULL
      AND  (v_current_tid IS NULL OR b.tenant_id = v_current_tid)
      AND  (v_current_bid IS NULL OR bu.buyer_id = v_current_bid)
    ORDER BY
      CASE WHEN bu.buyer_id = v_current_bid THEN 0 ELSE 1 END,
      CASE WHEN b.tenant_id = v_current_tid THEN 0 ELSE 1 END,
      bu.created_at
    LIMIT 1;
  END IF;

  IF v_tenant_id IS NULL THEN
    SELECT b.tenant_id, bu.role, bu.buyer_id
    INTO   v_tenant_id, v_role, v_buyer_id
    FROM   app.buyer_users bu
    JOIN   app.buyers b ON b.id = bu.buyer_id
    WHERE  bu.user_id = v_user_id
      AND  bu.is_active = true
      AND  b.is_active = true
      AND  b.buyer_app_enabled = true
      AND  b.deleted_at IS NULL
    ORDER BY bu.created_at
    LIMIT 1;
  END IF;

  claims := claims - 'tenant_id' - 'user_role' - 'is_platform_admin';

  IF v_tenant_id IS NOT NULL THEN
    claims := jsonb_set(claims, '{tenant_id}', to_jsonb(v_tenant_id::text));
  END IF;

  IF v_role IS NOT NULL THEN
    claims := jsonb_set(claims, '{user_role}', to_jsonb(v_role));
  END IF;

  IF v_buyer_id IS NOT NULL THEN
    claims := jsonb_set(claims, '{buyer_id}', to_jsonb(v_buyer_id::text));
  ELSE
    claims := claims - 'buyer_id';
  END IF;

  IF v_location_ids IS NOT NULL THEN
    claims := jsonb_set(claims, '{location_ids}', to_jsonb(v_location_ids));
  ELSE
    claims := claims - 'location_ids';
  END IF;

  IF v_platform_admin THEN
    claims := jsonb_set(claims, '{is_platform_admin}', 'true'::jsonb);
  END IF;

  IF claims IS NULL OR jsonb_typeof(claims) <> 'object' THEN
    claims := '{}'::jsonb;
  END IF;

  RETURN jsonb_set(event, '{claims}', claims);
END;
$$;

GRANT EXECUTE ON FUNCTION public.custom_access_token_hook(jsonb) TO supabase_auth_admin;
GRANT SELECT ON app.platform_admins TO supabase_auth_admin;

-- ── Drop legacy seller-write policies on catalog core tables ────────────────

DROP POLICY IF EXISTS catalog_brands_seller_insert ON catalog.brands;
DROP POLICY IF EXISTS catalog_products_seller_insert ON catalog.products;
DROP POLICY IF EXISTS catalog_brands_seller_update ON catalog.brands;
DROP POLICY IF EXISTS catalog_products_seller_update ON catalog.products;

-- ── Replace tenant SELECT policies (public master catalog only) ─────────────

DROP POLICY IF EXISTS catalog_brands_public_select ON catalog.brands;
CREATE POLICY catalog_brands_public_select ON catalog.brands
  FOR SELECT
  USING (is_public = true AND deleted_at IS NULL);

DROP POLICY IF EXISTS catalog_categories_public_select ON catalog.categories;
CREATE POLICY catalog_categories_public_select ON catalog.categories
  FOR SELECT
  USING (is_public = true AND deleted_at IS NULL);

DROP POLICY IF EXISTS catalog_products_public_select ON catalog.products;
CREATE POLICY catalog_products_public_select ON catalog.products
  FOR SELECT
  USING (is_public = true AND deleted_at IS NULL);

DROP POLICY IF EXISTS catalog_product_aliases_select ON catalog.product_aliases;
CREATE POLICY catalog_product_aliases_select ON catalog.product_aliases
  FOR SELECT
  USING (
    deleted_at IS NULL
    AND EXISTS (
      SELECT 1
      FROM catalog.products p
      WHERE p.id = product_id
        AND p.is_public = true
        AND p.deleted_at IS NULL
    )
  );

-- ── Platform-admin ALL policies (core catalog tables) ───────────────────────

CREATE POLICY catalog_brands_platform_all ON catalog.brands
  FOR ALL
  USING (app.is_platform_admin())
  WITH CHECK (app.is_platform_admin());

CREATE POLICY catalog_categories_platform_all ON catalog.categories
  FOR ALL
  USING (app.is_platform_admin())
  WITH CHECK (app.is_platform_admin());

CREATE POLICY catalog_products_platform_all ON catalog.products
  FOR ALL
  USING (app.is_platform_admin())
  WITH CHECK (app.is_platform_admin());

CREATE POLICY catalog_product_aliases_platform_all ON catalog.product_aliases
  FOR ALL
  USING (app.is_platform_admin())
  WITH CHECK (app.is_platform_admin());

-- ── Image tables: enable RLS + tenant read + platform admin ─────────────────

ALTER TABLE catalog.product_images ENABLE ROW LEVEL SECURITY;
ALTER TABLE catalog.brand_images ENABLE ROW LEVEL SECURITY;
ALTER TABLE catalog.category_images ENABLE ROW LEVEL SECURITY;

CREATE POLICY catalog_product_images_public_select ON catalog.product_images
  FOR SELECT
  USING (
    deleted_at IS NULL
    AND status = 'approved'
    AND EXISTS (
      SELECT 1
      FROM catalog.products p
      WHERE p.id = product_id
        AND p.is_public = true
        AND p.deleted_at IS NULL
    )
  );

CREATE POLICY catalog_brand_images_public_select ON catalog.brand_images
  FOR SELECT
  USING (
    deleted_at IS NULL
    AND status = 'approved'
    AND EXISTS (
      SELECT 1
      FROM catalog.brands b
      WHERE b.id = brand_id
        AND b.is_public = true
        AND b.deleted_at IS NULL
    )
  );

CREATE POLICY catalog_category_images_public_select ON catalog.category_images
  FOR SELECT
  USING (
    deleted_at IS NULL
    AND status = 'approved'
    AND EXISTS (
      SELECT 1
      FROM catalog.categories c
      WHERE c.id = category_id
        AND c.is_public = true
        AND c.deleted_at IS NULL
    )
  );

CREATE POLICY catalog_product_images_platform_all ON catalog.product_images
  FOR ALL
  USING (app.is_platform_admin())
  WITH CHECK (app.is_platform_admin());

CREATE POLICY catalog_brand_images_platform_all ON catalog.brand_images
  FOR ALL
  USING (app.is_platform_admin())
  WITH CHECK (app.is_platform_admin());

CREATE POLICY catalog_category_images_platform_all ON catalog.category_images
  FOR ALL
  USING (app.is_platform_admin())
  WITH CHECK (app.is_platform_admin());

-- ── embedding_queue: deny authenticated/anon (service_role only) ───────────

ALTER TABLE catalog.embedding_queue ENABLE ROW LEVEL SECURITY;

CREATE POLICY catalog_embedding_queue_platform_all ON catalog.embedding_queue
  FOR ALL
  USING (app.is_platform_admin())
  WITH CHECK (app.is_platform_admin());
