-- pgTAP tests for custom_access_token_hook
-- Run with: npx supabase test db --file=tests/jwt_claims.sql

BEGIN;

SELECT plan(12);

-- ────────────────────────────────────────────────────────────────────────────
-- Fixtures
-- ────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_tenant_id  uuid := gen_random_uuid();
  v_tenant2_id uuid := gen_random_uuid();
  v_seller_uid uuid := gen_random_uuid();
  v_buyer_uid  uuid := gen_random_uuid();
  v_buyer_id   uuid := gen_random_uuid();
BEGIN
  -- Insert minimal auth.users stubs (requires supabase test environment)
  INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data)
  VALUES
    (v_seller_uid, 'seller@test.local', 'x', now(), now(), now(), '{}', '{}'),
    (v_buyer_uid,  'buyer@test.local',  'x', now(), now(), now(), '{}', '{}');

  INSERT INTO app.tenants (id, slug, business_name, created_at, updated_at)
  VALUES
    (v_tenant_id,  'acme',   'Acme Dist.',   now(), now()),
    (v_tenant2_id, 'globex', 'Globex Dist.', now(), now());

  INSERT INTO app.tenant_users (id, tenant_id, user_id, role, location_ids, is_active, created_at, updated_at)
  VALUES (gen_random_uuid(), v_tenant_id, v_seller_uid, 'seller_admin', NULL, true, now(), now());

  INSERT INTO app.buyers (id, tenant_id, business_name, created_at, updated_at)
  VALUES (v_buyer_id, v_tenant2_id, 'RetailerCo', now(), now());

  INSERT INTO app.buyer_users (id, buyer_id, user_id, role, is_active, created_at, updated_at)
  VALUES (gen_random_uuid(), v_buyer_id, v_buyer_uid, 'buyer_admin', true, now(), now());

  -- Store fixture IDs for use in tests via temp table
  CREATE TEMP TABLE _fixture (key text PRIMARY KEY, val uuid);
  INSERT INTO _fixture VALUES
    ('tenant_id',  v_tenant_id),
    ('tenant2_id', v_tenant2_id),
    ('seller_uid', v_seller_uid),
    ('buyer_uid',  v_buyer_uid),
    ('buyer_id',   v_buyer_id);
END $$;

-- ────────────────────────────────────────────────────────────────────────────
-- Test 1: seller user gets tenant_id and role; no buyer_id in claims
-- ────────────────────────────────────────────────────────────────────────────
SELECT is(
  (
    SELECT (public.custom_access_token_hook(
      jsonb_build_object(
        'user_id', (SELECT val FROM _fixture WHERE key = 'seller_uid'),
        'claims',  jsonb_build_object('app_metadata', '{}'::jsonb)
      )
    ) -> 'claims' ->> 'tenant_id')::uuid
  ),
  (SELECT val FROM _fixture WHERE key = 'tenant_id'),
  'seller user: tenant_id claim matches tenant_users row'
);

SELECT is(
  (
    public.custom_access_token_hook(
      jsonb_build_object(
        'user_id', (SELECT val FROM _fixture WHERE key = 'seller_uid'),
        'claims',  jsonb_build_object('app_metadata', '{}'::jsonb)
      )
    ) -> 'claims' ->> 'user_role'
  ),
  'seller_admin',
  'seller user: user_role claim is seller_admin'
);

SELECT ok(
  NOT (
    public.custom_access_token_hook(
      jsonb_build_object(
        'user_id', (SELECT val FROM _fixture WHERE key = 'seller_uid'),
        'claims',  jsonb_build_object('app_metadata', '{}'::jsonb)
      )
    ) -> 'claims'
  ) ? 'buyer_id',
  'seller user: buyer_id claim is absent'
);

SELECT ok(
  NOT (
    public.custom_access_token_hook(
      jsonb_build_object(
        'user_id', (SELECT val FROM _fixture WHERE key = 'seller_uid'),
        'claims',  jsonb_build_object('app_metadata', '{}'::jsonb)
      )
    ) -> 'claims'
  ) ? 'location_ids',
  'seller admin: location_ids claim is absent'
);

-- ────────────────────────────────────────────────────────────────────────────
-- Test 2: buyer user gets buyer_id and tenant_id derived from buyer record
-- ────────────────────────────────────────────────────────────────────────────
SELECT is(
  (
    SELECT (public.custom_access_token_hook(
      jsonb_build_object(
        'user_id', (SELECT val FROM _fixture WHERE key = 'buyer_uid'),
        'claims',  jsonb_build_object('app_metadata', '{}'::jsonb)
      )
    ) -> 'claims' ->> 'buyer_id')::uuid
  ),
  (SELECT val FROM _fixture WHERE key = 'buyer_id'),
  'buyer user: buyer_id claim matches buyer_users row'
);

-- ────────────────────────────────────────────────────────────────────────────
-- Test 3: current_tenant_id in app_metadata is respected
-- ────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_seller_uid uuid := (SELECT val FROM _fixture WHERE key = 'seller_uid');
  v_tenant2_id uuid := (SELECT val FROM _fixture WHERE key = 'tenant2_id');
BEGIN
  -- Give the seller a second tenant membership
  INSERT INTO app.locations (id, tenant_id, name, created_at, updated_at, created_by, updated_by)
  VALUES (gen_random_uuid(), v_tenant2_id, 'Warehouse A', now(), now(), v_seller_uid, v_seller_uid);

  INSERT INTO app.tenant_users (id, tenant_id, user_id, role, location_ids, is_active, created_at, updated_at)
  VALUES (
    gen_random_uuid(),
    v_tenant2_id,
    v_seller_uid,
    'seller_assistant',
    ARRAY[(SELECT id FROM app.locations WHERE tenant_id = v_tenant2_id LIMIT 1)],
    true,
    now() + interval '1 second',
    now()
  );
END $$;

SELECT is(
  (
    SELECT (public.custom_access_token_hook(
      jsonb_build_object(
        'user_id', (SELECT val FROM _fixture WHERE key = 'seller_uid'),
        'claims',  jsonb_build_object(
          'app_metadata', jsonb_build_object(
            'current_tenant_id', (SELECT val FROM _fixture WHERE key = 'tenant2_id')
          )
        )
      )
    ) -> 'claims' ->> 'tenant_id')::uuid
  ),
  (SELECT val FROM _fixture WHERE key = 'tenant2_id'),
  'current_tenant_id in app_metadata overrides default tenant selection'
);

SELECT is(
  (
    public.custom_access_token_hook(
      jsonb_build_object(
        'user_id', (SELECT val FROM _fixture WHERE key = 'seller_uid'),
        'claims',  jsonb_build_object(
          'app_metadata', jsonb_build_object(
            'current_tenant_id', (SELECT val FROM _fixture WHERE key = 'tenant2_id')
          )
        )
      )
    ) -> 'claims' -> 'location_ids' ->> 0
  ),
  (
    SELECT (id)::text FROM app.locations
    WHERE tenant_id = (SELECT val FROM _fixture WHERE key = 'tenant2_id')
    LIMIT 1
  ),
  'seller assistant: location_ids claim matches tenant_users row'
);

-- ────────────────────────────────────────────────────────────────────────────
-- Test 4: null/missing claims input still returns an object
-- ────────────────────────────────────────────────────────────────────────────
SELECT is(
  jsonb_typeof(
    public.custom_access_token_hook(
      jsonb_build_object(
        'user_id', (SELECT val FROM _fixture WHERE key = 'seller_uid'),
        'claims',  'null'::jsonb
      )
    ) -> 'claims'
  ),
  'object',
  'null claims input: output claims is still a JSON object'
);

-- ────────────────────────────────────────────────────────────────────────────
-- Test 5: user with no workspace membership returns object without tenant_id
-- ────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_orphan_uid uuid := gen_random_uuid();
BEGIN
  INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data)
  VALUES (v_orphan_uid, 'orphan@test.local', 'x', now(), now(), now(), '{}', '{}');

  INSERT INTO _fixture VALUES ('orphan_uid', v_orphan_uid);
END $$;

SELECT is(
  jsonb_typeof(
    public.custom_access_token_hook(
      jsonb_build_object(
        'user_id', (SELECT val FROM _fixture WHERE key = 'orphan_uid'),
        'claims',  jsonb_build_object('app_metadata', '{}'::jsonb)
      )
    ) -> 'claims'
  ),
  'object',
  'orphan user: output claims is a JSON object'
);

SELECT ok(
  NOT (
    public.custom_access_token_hook(
      jsonb_build_object(
        'user_id', (SELECT val FROM _fixture WHERE key = 'orphan_uid'),
        'claims',  jsonb_build_object('app_metadata', '{}'::jsonb)
      )
    ) -> 'claims'
  ) ? 'tenant_id',
  'orphan user: tenant_id claim is absent'
);

-- ────────────────────────────────────────────────────────────────────────────
-- Test 6: buyer-owner branch (app.buyers.user_id direct) honors current_buyer_id
-- / current_tenant_id when one auth.users id is shared across multiple buyers
-- rows (fix_buyer_owner_hook_context_preference) — the shape the
-- buyer-identity-consolidation work relies on being safe.
-- ────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_shared_uid uuid := gen_random_uuid();
  v_buyer_a_id uuid := gen_random_uuid();
  v_buyer_b_id uuid := gen_random_uuid();
  v_tenant_id  uuid := (SELECT val FROM _fixture WHERE key = 'tenant_id');
  v_tenant2_id uuid := (SELECT val FROM _fixture WHERE key = 'tenant2_id');
BEGIN
  INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data)
  VALUES (v_shared_uid, 'shared-buyer@test.local', 'x', now(), now(), now(), '{}', '{}');

  -- Same auth.users id linked directly (buyers.user_id) to two different
  -- tenants' buyer records — the case the un-patched hook could not disambiguate.
  INSERT INTO app.buyers (id, tenant_id, business_name, user_id, buyer_app_enabled, is_active, created_at, updated_at)
  VALUES
    (v_buyer_a_id, v_tenant_id,  'Business A', v_shared_uid, true, true, now(), now()),
    (v_buyer_b_id, v_tenant2_id, 'Business B', v_shared_uid, true, true, now() + interval '1 second', now());

  INSERT INTO _fixture VALUES
    ('shared_uid',  v_shared_uid),
    ('buyer_a_id',  v_buyer_a_id),
    ('buyer_b_id',  v_buyer_b_id);
END $$;

SELECT is(
  (
    SELECT (public.custom_access_token_hook(
      jsonb_build_object(
        'user_id', (SELECT val FROM _fixture WHERE key = 'shared_uid'),
        'claims',  jsonb_build_object(
          'app_metadata', jsonb_build_object(
            'current_tenant_id', (SELECT val FROM _fixture WHERE key = 'tenant2_id'),
            'current_buyer_id',  (SELECT val FROM _fixture WHERE key = 'buyer_b_id')
          )
        )
      )
    ) -> 'claims' ->> 'buyer_id')::uuid
  ),
  (SELECT val FROM _fixture WHERE key = 'buyer_b_id'),
  'shared user_id: current_buyer_id=B resolves buyer_id claim to B, not the earlier-created A'
);

SELECT is(
  (
    SELECT (public.custom_access_token_hook(
      jsonb_build_object(
        'user_id', (SELECT val FROM _fixture WHERE key = 'shared_uid'),
        'claims',  jsonb_build_object(
          'app_metadata', jsonb_build_object(
            'current_tenant_id', (SELECT val FROM _fixture WHERE key = 'tenant_id'),
            'current_buyer_id',  (SELECT val FROM _fixture WHERE key = 'buyer_a_id')
          )
        )
      )
    ) -> 'claims' ->> 'buyer_id')::uuid
  ),
  (SELECT val FROM _fixture WHERE key = 'buyer_a_id'),
  'shared user_id: current_buyer_id=A resolves buyer_id claim to A'
);

SELECT * FROM finish();

ROLLBACK;
