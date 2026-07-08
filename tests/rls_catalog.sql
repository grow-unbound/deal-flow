-- pgTAP tests for catalog schema RLS hardening.
-- Tenants read public master catalog only; platform admins get full catalog access.
--
-- Run with: npx supabase test db --file=tests/rls_catalog.sql

BEGIN;

SELECT plan(14);

-- ────────────────────────────────────────────────────────────────────────────
-- Fixtures
-- ────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_tenant_a uuid := gen_random_uuid();
  v_tenant_b uuid := gen_random_uuid();
  v_seller_a uuid := gen_random_uuid();
  v_seller_b uuid := gen_random_uuid();
  v_platform_admin uuid := gen_random_uuid();
  v_public_brand uuid := gen_random_uuid();
  v_private_brand_a uuid := gen_random_uuid();
  v_public_product uuid := gen_random_uuid();
  v_pending_image uuid := gen_random_uuid();
  v_approved_image uuid := gen_random_uuid();
  v_queue_id bigint;
BEGIN
  INSERT INTO auth.users (
    id, email, encrypted_password, email_confirmed_at,
    created_at, updated_at, raw_app_meta_data, raw_user_meta_data
  )
  VALUES
    (v_seller_a, 'catalog-seller-a@test.local', 'x', now(), now(), now(), '{}'::jsonb, '{}'::jsonb),
    (v_seller_b, 'catalog-seller-b@test.local', 'x', now(), now(), now(), '{}'::jsonb, '{}'::jsonb),
    (v_platform_admin, 'catalog-platform@test.local', 'x', now(), now(), now(), '{}'::jsonb, '{}'::jsonb);

  INSERT INTO app.tenants (id, slug, business_name, created_at, updated_at)
  VALUES
    (v_tenant_a, 'catalog-acme', 'Catalog Acme', now(), now()),
    (v_tenant_b, 'catalog-globex', 'Catalog Globex', now(), now());

  INSERT INTO app.tenant_users (id, tenant_id, user_id, role, is_active, created_at, updated_at)
  VALUES
    (gen_random_uuid(), v_tenant_a, v_seller_a, 'seller_admin', true, now(), now()),
    (gen_random_uuid(), v_tenant_b, v_seller_b, 'seller_admin', true, now(), now());

  INSERT INTO app.platform_admins (user_id)
  VALUES (v_platform_admin);

  INSERT INTO catalog.brands (
    id, name, slug, is_public, origin_tenant_id, created_at, updated_at
  )
  VALUES
    (v_public_brand, 'Public Master Brand', 'public-master-brand', true, NULL, now(), now()),
    (v_private_brand_a, 'Private Tenant A Brand', 'private-tenant-a-brand', false, v_tenant_a, now(), now());

  INSERT INTO catalog.products (
    id, brand_id, master_sku, name, is_public, created_at, updated_at
  )
  VALUES (
    v_public_product, v_public_brand, 'PUB-SKU-1', 'Public Master Product', true, now(), now()
  );

  INSERT INTO catalog.brand_images (
    id, brand_id, image_type, status, r2_thumb_key, created_at, updated_at
  )
  VALUES
    (v_pending_image, v_public_brand, 'logo', 'pending', 'pending-thumb-key', now(), now()),
    (v_approved_image, v_public_brand, 'logo', 'approved', 'approved-thumb-key', now(), now());

  INSERT INTO catalog.embedding_queue (entity_type, entity_id)
  VALUES ('catalog.brands', v_public_brand)
  RETURNING id INTO v_queue_id;

  CREATE TEMP TABLE _catalog_fixture (key text PRIMARY KEY, val uuid);
  INSERT INTO _catalog_fixture VALUES
    ('tenant_a', v_tenant_a),
    ('tenant_b', v_tenant_b),
    ('seller_a', v_seller_a),
    ('seller_b', v_seller_b),
    ('platform_admin', v_platform_admin),
    ('public_brand', v_public_brand),
    ('private_brand_a', v_private_brand_a),
    ('public_product', v_public_product),
    ('pending_image', v_pending_image),
    ('approved_image', v_approved_image);

  CREATE TEMP TABLE _catalog_fixture_bigint (key text PRIMARY KEY, val bigint);
  INSERT INTO _catalog_fixture_bigint VALUES ('queue_id', v_queue_id);
END $$;

CREATE OR REPLACE FUNCTION app._mock_jwt_catalog(
  p_tenant_id uuid,
  p_role text,
  p_buyer_id uuid DEFAULT NULL,
  p_is_platform_admin boolean DEFAULT false
) RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  v_claims jsonb;
BEGIN
  v_claims := jsonb_build_object(
    'sub', COALESCE(p_buyer_id, p_tenant_id)::text,
    'tenant_id', p_tenant_id::text,
    'user_role', p_role,
    'role', p_role
  );

  IF p_buyer_id IS NOT NULL THEN
    v_claims := v_claims || jsonb_build_object('buyer_id', p_buyer_id::text);
  END IF;

  IF p_is_platform_admin THEN
    v_claims := v_claims || jsonb_build_object('is_platform_admin', true);
  END IF;

  PERFORM set_config('request.jwt.claims', v_claims::text, true);
END $$;

-- ════════════════════════════════════════════════════════════════════════════
-- Scenario 1: seller sees public brand; not private brand (own origin_tenant)
-- ════════════════════════════════════════════════════════════════════════════
SELECT ok(
  (
    SELECT count(*) = 1 FROM (
      SELECT app._mock_jwt_catalog(
        (SELECT val FROM _catalog_fixture WHERE key = 'tenant_a'),
        'seller_admin'
      )
    ) AS _setup,
    catalog.brands b
    WHERE b.id = (SELECT val FROM _catalog_fixture WHERE key = 'public_brand')
  ),
  'Scenario 1: seller A can SELECT public master brand'
);

SELECT is(
  (
    SELECT count(*)::int FROM (
      SELECT app._mock_jwt_catalog(
        (SELECT val FROM _catalog_fixture WHERE key = 'tenant_a'),
        'seller_admin'
      )
    ) AS _setup,
    catalog.brands b
    WHERE b.id = (SELECT val FROM _catalog_fixture WHERE key = 'private_brand_a')
  ),
  0,
  'Scenario 1: seller A cannot SELECT private brand even when origin_tenant_id matches'
);

-- ════════════════════════════════════════════════════════════════════════════
-- Scenario 2: seller B cannot see tenant A private brand
-- ════════════════════════════════════════════════════════════════════════════
SELECT is(
  (
    SELECT count(*)::int FROM (
      SELECT app._mock_jwt_catalog(
        (SELECT val FROM _catalog_fixture WHERE key = 'tenant_b'),
        'seller_admin'
      )
    ) AS _setup,
    catalog.brands b
    WHERE b.id = (SELECT val FROM _catalog_fixture WHERE key = 'private_brand_a')
  ),
  0,
  'Scenario 2: seller B cannot SELECT tenant A private brand'
);

-- ════════════════════════════════════════════════════════════════════════════
-- Scenario 3: legacy seller-write policies removed; authenticated lacks INSERT
-- ════════════════════════════════════════════════════════════════════════════
SELECT is(
  (
    SELECT count(*)::int
    FROM pg_policies
    WHERE schemaname = 'catalog'
      AND tablename = 'brands'
      AND policyname = 'catalog_brands_seller_insert'
  ),
  0,
  'Scenario 3: catalog_brands_seller_insert policy removed'
);

SELECT ok(
  NOT has_table_privilege('authenticated', 'catalog.brands', 'INSERT'),
  'Scenario 3: authenticated role has no INSERT grant on catalog.brands'
);

-- ════════════════════════════════════════════════════════════════════════════
-- Scenario 4: platform admin can SELECT private catalog rows
-- ════════════════════════════════════════════════════════════════════════════
SELECT ok(
  (
    SELECT count(*) = 1 FROM (
      SELECT app._mock_jwt_catalog(
        (SELECT val FROM _catalog_fixture WHERE key = 'tenant_a'),
        'seller_admin',
        NULL,
        true
      )
    ) AS _setup,
    catalog.brands b
    WHERE b.id = (SELECT val FROM _catalog_fixture WHERE key = 'private_brand_a')
  ),
  'Scenario 4: platform admin JWT can SELECT private catalog brand'
);

SELECT ok(
  EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'catalog'
      AND tablename = 'brands'
      AND policyname = 'catalog_brands_platform_all'
  ),
  'Scenario 4: catalog_brands_platform_all policy exists'
);

-- ════════════════════════════════════════════════════════════════════════════
-- Scenario 5: embedding_queue hidden from sellers
-- ════════════════════════════════════════════════════════════════════════════
SELECT is(
  (
    SELECT count(*)::int FROM (
      SELECT app._mock_jwt_catalog(
        (SELECT val FROM _catalog_fixture WHERE key = 'tenant_a'),
        'seller_admin'
      )
    ) AS _setup,
    catalog.embedding_queue q
  ),
  0,
  'Scenario 5: seller cannot SELECT catalog.embedding_queue rows'
);

-- ════════════════════════════════════════════════════════════════════════════
-- Scenario 6: brand_images — pending hidden; approved on public brand visible
-- ════════════════════════════════════════════════════════════════════════════
SELECT is(
  (
    SELECT count(*)::int FROM (
      SELECT app._mock_jwt_catalog(
        (SELECT val FROM _catalog_fixture WHERE key = 'tenant_a'),
        'seller_admin'
      )
    ) AS _setup,
    catalog.brand_images bi
    WHERE bi.id = (SELECT val FROM _catalog_fixture WHERE key = 'pending_image')
  ),
  0,
  'Scenario 6: seller cannot SELECT pending brand_images row'
);

SELECT ok(
  (
    SELECT count(*) = 1 FROM (
      SELECT app._mock_jwt_catalog(
        (SELECT val FROM _catalog_fixture WHERE key = 'tenant_a'),
        'seller_admin'
      )
    ) AS _setup,
    catalog.brand_images bi
    WHERE bi.id = (SELECT val FROM _catalog_fixture WHERE key = 'approved_image')
  ),
  'Scenario 6: seller can SELECT approved brand_images on public brand'
);

-- ════════════════════════════════════════════════════════════════════════════
-- RLS enabled checks
-- ════════════════════════════════════════════════════════════════════════════
SELECT ok(
  (SELECT relrowsecurity FROM pg_class WHERE oid = 'catalog.product_images'::regclass),
  'RLS enabled on catalog.product_images'
);
SELECT ok(
  (SELECT relrowsecurity FROM pg_class WHERE oid = 'catalog.brand_images'::regclass),
  'RLS enabled on catalog.brand_images'
);
SELECT ok(
  (SELECT relrowsecurity FROM pg_class WHERE oid = 'catalog.embedding_queue'::regclass),
  'RLS enabled on catalog.embedding_queue'
);

SELECT * FROM finish();

ROLLBACK;
