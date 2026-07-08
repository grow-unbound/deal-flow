-- pgTAP tests for EP-11-002: RLS Policies on all app.* tables
-- Spec requirement: "Write 5 cross-tenant isolation tests on day 1 — run on every PR"
--
-- Run with: npx supabase test db --file=tests/rls_policies.sql

BEGIN;

SELECT plan(20);

-- ────────────────────────────────────────────────────────────────────────────
-- Fixtures: two tenants, one seller each, one buyer each
-- ────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_tenant_a uuid := gen_random_uuid();
  v_tenant_b uuid := gen_random_uuid();
  v_seller_a uuid := gen_random_uuid(); -- seller_admin for tenant A
  v_seller_b uuid := gen_random_uuid(); -- seller_admin for tenant B
  v_asst_a   uuid := gen_random_uuid(); -- seller_assistant for tenant A
  v_buyer_a  uuid := gen_random_uuid(); -- buyer record in tenant A
  v_buyer_user_a uuid := gen_random_uuid(); -- auth user with buyer_admin role
  v_order_a  uuid := gen_random_uuid();
  v_cohort_a uuid := gen_random_uuid();
  v_price_list_a uuid := gen_random_uuid();
BEGIN
  -- Auth users
  INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data)
  VALUES
    (v_seller_a, 'seller-a@test.local', 'x', now(), now(), now(), '{}', '{}'),
    (v_seller_b, 'seller-b@test.local', 'x', now(), now(), now(), '{}', '{}'),
    (v_asst_a,   'asst-a@test.local',   'x', now(), now(), now(), '{}', '{}'),
    (v_buyer_user_a, 'buyer-a@test.local', 'x', now(), now(), now(), '{}', '{}');

  -- Tenants
  INSERT INTO app.tenants (id, slug, business_name, created_at, updated_at)
  VALUES
    (v_tenant_a, 'acme',   'Acme Dist.',   now(), now()),
    (v_tenant_b, 'globex', 'Globex Dist.', now(), now());

  -- Seller users
  INSERT INTO app.tenant_users (id, tenant_id, user_id, role, is_active, created_at, updated_at)
  VALUES
    (gen_random_uuid(), v_tenant_a, v_seller_a, 'seller_admin',     true, now(), now()),
    (gen_random_uuid(), v_tenant_a, v_asst_a,   'seller_assistant', true, now(), now()),
    (gen_random_uuid(), v_tenant_b, v_seller_b, 'seller_admin',     true, now(), now());

  -- Buyer
  INSERT INTO app.buyers (id, tenant_id, business_name, created_at, updated_at)
  VALUES (v_buyer_a, v_tenant_a, 'RetailCo', now(), now());

  INSERT INTO app.buyer_users (id, buyer_id, user_id, role, is_active, created_at, updated_at)
  VALUES (gen_random_uuid(), v_buyer_a, v_buyer_user_a, 'buyer_admin', true, now(), now());

  -- Cohort (tenant A only)
  INSERT INTO app.cohorts (id, tenant_id, name, created_at, updated_at)
  VALUES (v_cohort_a, v_tenant_a, 'North Delhi A-class', now(), now());

  -- Price list (tenant A only)
  INSERT INTO app.price_lists (id, tenant_id, name, valid_from, created_at, updated_at)
  VALUES (v_price_list_a, v_tenant_a, 'Summer 2026', now(), now(), now());

  -- Order
  INSERT INTO app.orders (id, tenant_id, buyer_id, placed_by, order_number, status, order_date, created_at, updated_at)
  VALUES (v_order_a, v_tenant_a, v_buyer_a, v_seller_a, 'DF-2026-00001', 'received', current_date, now(), now());

  -- Store fixture IDs
  CREATE TEMP TABLE _rls_fixture (key text PRIMARY KEY, val uuid);
  INSERT INTO _rls_fixture VALUES
    ('tenant_a',      v_tenant_a),
    ('tenant_b',      v_tenant_b),
    ('seller_a',      v_seller_a),
    ('seller_b',      v_seller_b),
    ('asst_a',        v_asst_a),
    ('buyer_a',       v_buyer_a),
    ('buyer_user_a',  v_buyer_user_a),
    ('order_a',       v_order_a),
    ('cohort_a',      v_cohort_a),
    ('price_list_a',  v_price_list_a);
END $$;

-- Helper: build a mock JWT payload for set_config
CREATE OR REPLACE FUNCTION _mock_jwt(
  p_tenant_id uuid,
  p_role text,
  p_buyer_id uuid DEFAULT NULL
) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  PERFORM set_config(
    'request.jwt.claims',
    json_build_object(
      'sub',       p_tenant_id::text, -- reuse tenant as sub for test simplicity
      'tenant_id', p_tenant_id::text,
      'role',      p_role,
      'buyer_id',  p_buyer_id::text
    )::text,
    true  -- local to transaction
  );
END $$;

-- ════════════════════════════════════════════════════════════════════════════
-- CROSS-TENANT ISOLATION TESTS (Spec requirement: 5 tests minimum)
-- ════════════════════════════════════════════════════════════════════════════

-- Test 1: Seller A cannot SELECT tenant B's tenant record
SELECT is(
  (
    SELECT count(*)::int FROM (
      SELECT app._mock_jwt(
        (SELECT val FROM _rls_fixture WHERE key = 'tenant_a'),
        'seller_admin'
      )
    ) AS _setup,
    app.tenants t
    WHERE t.id = (SELECT val FROM _rls_fixture WHERE key = 'tenant_b')
  ),
  0,
  'Cross-tenant isolation #1: seller A cannot read tenant B record'
);

-- Test 2: Seller A cannot SELECT orders belonging to tenant B
-- (set up order in B first)
DO $$
DECLARE
  v_buyer_b uuid := gen_random_uuid();
  v_user_b  uuid := (SELECT val FROM _rls_fixture WHERE key = 'seller_b');
BEGIN
  INSERT INTO app.buyers (id, tenant_id, business_name, created_at, updated_at)
  VALUES (v_buyer_b, (SELECT val FROM _rls_fixture WHERE key = 'tenant_b'), 'BuyerB', now(), now());
  INSERT INTO _rls_fixture VALUES ('buyer_b', v_buyer_b);

  INSERT INTO app.orders (id, tenant_id, buyer_id, placed_by, order_number, status, order_date, created_at, updated_at)
  VALUES (gen_random_uuid(),
    (SELECT val FROM _rls_fixture WHERE key = 'tenant_b'),
    v_buyer_b, v_user_b, 'DF-2026-00099', 'received', current_date, now(), now());
END $$;

SELECT is(
  (
    SELECT count(*)::int FROM (
      SELECT app._mock_jwt(
        (SELECT val FROM _rls_fixture WHERE key = 'tenant_a'),
        'seller_admin'
      )
    ) AS _setup,
    app.orders o
    WHERE o.tenant_id = (SELECT val FROM _rls_fixture WHERE key = 'tenant_b')
  ),
  0,
  'Cross-tenant isolation #2: seller A cannot read tenant B orders'
);

-- Test 3: Seller A cannot SELECT cohorts belonging to tenant B
DO $$
BEGIN
  INSERT INTO app.cohorts (id, tenant_id, name, created_at, updated_at)
  VALUES (gen_random_uuid(),
    (SELECT val FROM _rls_fixture WHERE key = 'tenant_b'),
    'Globex VIP cohort', now(), now());
END $$;

SELECT is(
  (
    SELECT count(*)::int FROM (
      SELECT app._mock_jwt(
        (SELECT val FROM _rls_fixture WHERE key = 'tenant_a'),
        'seller_admin'
      )
    ) AS _setup,
    app.cohorts c
    WHERE c.tenant_id = (SELECT val FROM _rls_fixture WHERE key = 'tenant_b')
  ),
  0,
  'Cross-tenant isolation #3: seller A cannot read tenant B cohorts'
);

-- Test 4: Buyer from tenant A cannot read orders from tenant A placed by other buyer
-- (buyer should only see their own buyer_id's orders)
DO $$
DECLARE
  v_buyer_other uuid := gen_random_uuid();
BEGIN
  INSERT INTO app.buyers (id, tenant_id, business_name, created_at, updated_at)
  VALUES (v_buyer_other,
    (SELECT val FROM _rls_fixture WHERE key = 'tenant_a'),
    'OtherRetailer', now(), now());

  INSERT INTO app.orders (id, tenant_id, buyer_id, placed_by, order_number, status, order_date, created_at, updated_at)
  VALUES (gen_random_uuid(),
    (SELECT val FROM _rls_fixture WHERE key = 'tenant_a'),
    v_buyer_other,
    (SELECT val FROM _rls_fixture WHERE key = 'seller_a'),
    'DF-2026-00077', 'received', current_date, now(), now());

  INSERT INTO _rls_fixture VALUES ('buyer_other', v_buyer_other);
END $$;

SELECT is(
  (
    SELECT count(*)::int FROM (
      SELECT app._mock_jwt(
        (SELECT val FROM _rls_fixture WHERE key = 'tenant_a'),
        'buyer_admin',
        (SELECT val FROM _rls_fixture WHERE key = 'buyer_a')
      )
    ) AS _setup,
    app.orders o
    WHERE o.buyer_id = (SELECT val FROM _rls_fixture WHERE key = 'buyer_other')
  ),
  0,
  'Cross-tenant isolation #4: buyer A cannot read another buyer''s orders in same tenant'
);

-- Test 5: Seller A cannot read price_lists of tenant B
DO $$
BEGIN
  INSERT INTO app.price_lists (id, tenant_id, name, valid_from, created_at, updated_at)
  VALUES (gen_random_uuid(),
    (SELECT val FROM _rls_fixture WHERE key = 'tenant_b'),
    'Globex Pricing', now(), now(), now());
END $$;

SELECT is(
  (
    SELECT count(*)::int FROM (
      SELECT app._mock_jwt(
        (SELECT val FROM _rls_fixture WHERE key = 'tenant_a'),
        'seller_admin'
      )
    ) AS _setup,
    app.price_lists pl
    WHERE pl.tenant_id = (SELECT val FROM _rls_fixture WHERE key = 'tenant_b')
  ),
  0,
  'Cross-tenant isolation #5: seller A cannot read tenant B price lists'
);

-- ════════════════════════════════════════════════════════════════════════════
-- ROLE SEPARATION TESTS
-- ════════════════════════════════════════════════════════════════════════════

-- Test 6: seller_admin can read cohorts in their tenant
SELECT ok(
  (
    SELECT count(*) > 0 FROM (
      SELECT app._mock_jwt(
        (SELECT val FROM _rls_fixture WHERE key = 'tenant_a'),
        'seller_admin'
      )
    ) AS _setup,
    app.cohorts c
    WHERE c.tenant_id = (SELECT val FROM _rls_fixture WHERE key = 'tenant_a')
  ),
  'seller_admin can SELECT cohorts in own tenant'
);

-- Test 7: seller_assistant can read cohorts (SELECT only)
SELECT ok(
  (
    SELECT count(*) > 0 FROM (
      SELECT app._mock_jwt(
        (SELECT val FROM _rls_fixture WHERE key = 'tenant_a'),
        'seller_assistant'
      )
    ) AS _setup,
    app.cohorts c
    WHERE c.tenant_id = (SELECT val FROM _rls_fixture WHERE key = 'tenant_a')
  ),
  'seller_assistant can SELECT cohorts in own tenant'
);

-- Test 8: buyer cannot read cohorts
SELECT is(
  (
    SELECT count(*)::int FROM (
      SELECT app._mock_jwt(
        (SELECT val FROM _rls_fixture WHERE key = 'tenant_a'),
        'buyer_admin',
        (SELECT val FROM _rls_fixture WHERE key = 'buyer_a')
      )
    ) AS _setup,
    app.cohorts c
    WHERE c.tenant_id = (SELECT val FROM _rls_fixture WHERE key = 'tenant_a')
  ),
  0,
  'buyer_admin cannot SELECT cohorts (seller-internal)'
);

-- Test 9: buyer cannot read price_lists
SELECT is(
  (
    SELECT count(*)::int FROM (
      SELECT app._mock_jwt(
        (SELECT val FROM _rls_fixture WHERE key = 'tenant_a'),
        'buyer_admin',
        (SELECT val FROM _rls_fixture WHERE key = 'buyer_a')
      )
    ) AS _setup,
    app.price_lists pl
    WHERE pl.tenant_id = (SELECT val FROM _rls_fixture WHERE key = 'tenant_a')
  ),
  0,
  'buyer_admin cannot SELECT price_lists (seller-internal)'
);

-- Test 10: buyer cannot read tenant_users
SELECT is(
  (
    SELECT count(*)::int FROM (
      SELECT app._mock_jwt(
        (SELECT val FROM _rls_fixture WHERE key = 'tenant_a'),
        'buyer_admin',
        (SELECT val FROM _rls_fixture WHERE key = 'buyer_a')
      )
    ) AS _setup,
    app.tenant_users tu
    WHERE tu.tenant_id = (SELECT val FROM _rls_fixture WHERE key = 'tenant_a')
  ),
  0,
  'buyer_admin cannot SELECT tenant_users (seller-internal)'
);

-- ════════════════════════════════════════════════════════════════════════════
-- RLS ENABLED CHECKS — ensure no table was missed
-- ════════════════════════════════════════════════════════════════════════════

SELECT ok(
  (SELECT relrowsecurity FROM pg_class WHERE oid = 'app.tenants'::regclass),
  'RLS enabled on app.tenants'
);
SELECT ok(
  (SELECT relrowsecurity FROM pg_class WHERE oid = 'app.tenant_users'::regclass),
  'RLS enabled on app.tenant_users'
);
SELECT ok(
  (SELECT relrowsecurity FROM pg_class WHERE oid = 'app.tenant_brands'::regclass),
  'RLS enabled on app.tenant_brands'
);
SELECT ok(
  (SELECT relrowsecurity FROM pg_class WHERE oid = 'app.locations'::regclass),
  'RLS enabled on app.locations'
);
SELECT ok(
  (SELECT relrowsecurity FROM pg_class WHERE oid = 'app.tenant_products'::regclass),
  'RLS enabled on app.tenant_products'
);
SELECT ok(
  (SELECT relrowsecurity FROM pg_class WHERE oid = 'app.tenant_inventory'::regclass),
  'RLS enabled on app.tenant_inventory'
);
SELECT ok(
  (SELECT relrowsecurity FROM pg_class WHERE oid = 'app.buyers'::regclass),
  'RLS enabled on app.buyers'
);
SELECT ok(
  (SELECT relrowsecurity FROM pg_class WHERE oid = 'app.buyer_users'::regclass),
  'RLS enabled on app.buyer_users'
);
SELECT ok(
  (SELECT relrowsecurity FROM pg_class WHERE oid = 'app.cohorts'::regclass),
  'RLS enabled on app.cohorts'
);
SELECT ok(
  (SELECT relrowsecurity FROM pg_class WHERE oid = 'app.price_lists'::regclass),
  'RLS enabled on app.price_lists'
);

SELECT * FROM finish();

ROLLBACK;
