-- pgTAP tests for buyer-app activity tracking Phase 3.
--
-- Run with:
--   npx supabase test db --file tests/buyer_app_activity_tracking.sql

BEGIN;

SELECT plan(8);

DO $$
DECLARE
  v_tenant uuid := gen_random_uuid();
  v_seller uuid := gen_random_uuid();
  v_buyer_user uuid := gen_random_uuid();
  v_buyer uuid := gen_random_uuid();
  v_buyer_user_row uuid := gen_random_uuid();
  v_estimate uuid := gen_random_uuid();
  v_order uuid := gen_random_uuid();
BEGIN
  INSERT INTO auth.users (
    id, email, encrypted_password, email_confirmed_at,
    created_at, updated_at, raw_app_meta_data, raw_user_meta_data
  )
  VALUES
    (v_seller, 'buyer-app-seller@test.local', 'x', now(), now(), now(), '{}'::jsonb, '{}'::jsonb),
    (v_buyer_user, 'buyer-app-buyer@test.local', 'x', now(), now(), now(), '{}'::jsonb, '{}'::jsonb);

  INSERT INTO app.tenants (id, slug, business_name, created_at, updated_at)
  VALUES (v_tenant, 'buyer-app-activity', 'Buyer App Activity Tenant', now(), now());

  INSERT INTO app.tenant_users (id, tenant_id, user_id, role, is_active, created_at, updated_at)
  VALUES (gen_random_uuid(), v_tenant, v_seller, 'seller_admin', true, now(), now());

  INSERT INTO app.buyers (
    id, tenant_id, business_name, phone, is_active, buyer_app_enabled, created_at, updated_at
  )
  VALUES (
    v_buyer, v_tenant, 'Activity Buyer', '+919999999999', true, true, now(), now()
  );

  INSERT INTO app.buyer_users (id, buyer_id, user_id, role, is_active, created_at, updated_at)
  VALUES (v_buyer_user_row, v_buyer, v_buyer_user, 'buyer_admin', true, now(), now());

  CREATE TEMP TABLE _buyer_app_activity_fixture (key text PRIMARY KEY, val uuid);
  INSERT INTO _buyer_app_activity_fixture VALUES
    ('tenant', v_tenant),
    ('seller', v_seller),
    ('buyer', v_buyer),
    ('buyer_user', v_buyer_user),
    ('estimate', v_estimate),
    ('order', v_order);
END $$;

CREATE OR REPLACE FUNCTION _buyer_app_mock_jwt(
  p_tenant_id uuid,
  p_role text,
  p_buyer_id uuid DEFAULT NULL
) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  PERFORM set_config(
    'request.jwt.claims',
    json_build_object(
      'sub', COALESCE(p_buyer_id, p_tenant_id)::text,
      'tenant_id', p_tenant_id::text,
      'role', p_role,
      'buyer_id', p_buyer_id::text
    )::text,
    true
  );
END $$;

SELECT _buyer_app_mock_jwt(
  (SELECT val FROM _buyer_app_activity_fixture WHERE key = 'tenant'),
  'seller_admin'
);

SELECT app.refresh_buyer_app_snapshot((SELECT val FROM _buyer_app_activity_fixture WHERE key = 'tenant'));

SELECT is(
  (
    SELECT opened_app_mtd::int
    FROM app.buyer_app_snapshot
    WHERE tenant_id = (SELECT val FROM _buyer_app_activity_fixture WHERE key = 'tenant')
  ),
  0,
  'opened_app_mtd does not use buyer_users.updated_at as a proxy anymore'
);

SELECT ok(
  app.record_buyer_app_activity(
    (SELECT val FROM _buyer_app_activity_fixture WHERE key = 'tenant'),
    (SELECT val FROM _buyer_app_activity_fixture WHERE key = 'buyer'),
    'session_opened',
    now(),
    NULL,
    '{"surface":"home"}'::jsonb,
    'buyer-session-open-1',
    true
  ) IS NOT NULL,
  'record_buyer_app_activity inserts a route event'
);

SELECT ok(
  app.record_buyer_app_activity(
    (SELECT val FROM _buyer_app_activity_fixture WHERE key = 'tenant'),
    (SELECT val FROM _buyer_app_activity_fixture WHERE key = 'buyer'),
    'catalog_viewed',
    now() + interval '1 hour',
    NULL,
    '{"surface":"catalog"}'::jsonb,
    'buyer-session-open-2',
    true
  ) IS NOT NULL,
  'record_buyer_app_activity supports repeated qualifying events'
);

SELECT is(
  (
    SELECT opened_app_mtd::int
    FROM app.buyer_app_snapshot
    WHERE tenant_id = (SELECT val FROM _buyer_app_activity_fixture WHERE key = 'tenant')
  ),
  1,
  'opened_app_mtd counts distinct buyers from the activity ledger'
);

SELECT is(
  (
    SELECT repeat_mtd::int
    FROM app.buyer_app_snapshot
    WHERE tenant_id = (SELECT val FROM _buyer_app_activity_fixture WHERE key = 'tenant')
  ),
  1,
  'repeat_mtd counts buyers with two qualifying activity events'
);

SELECT is(
  (
    SELECT active_buyers::int
    FROM app.kpi_buyer_app_daily
    WHERE tenant_id = (SELECT val FROM _buyer_app_activity_fixture WHERE key = 'tenant')
      AND snapshot_date = (now() AT TIME ZONE 'Asia/Kolkata')::date
  ),
  1,
  'kpi_buyer_app_daily.active_buyers reads the activity ledger'
);

INSERT INTO app.estimates (
  id, tenant_id, buyer_id, estimate_number, status, total_amount,
  estimate_date, is_buyer_app_estimate, created_at, updated_at
)
VALUES (
  (SELECT val FROM _buyer_app_activity_fixture WHERE key = 'estimate'),
  (SELECT val FROM _buyer_app_activity_fixture WHERE key = 'tenant'),
  (SELECT val FROM _buyer_app_activity_fixture WHERE key = 'buyer'),
  'EST-ACTIVITY-001',
  'draft',
  1200,
  (now() AT TIME ZONE 'Asia/Kolkata')::date,
  true,
  now(),
  now()
);

SELECT is(
  (
    SELECT count(*)::int
    FROM app.buyer_app_activity
    WHERE tenant_id = (SELECT val FROM _buyer_app_activity_fixture WHERE key = 'tenant')
      AND event_source = 'estimate'
      AND source_entity_id = (SELECT val FROM _buyer_app_activity_fixture WHERE key = 'estimate')
      AND deleted_at IS NULL
  ),
  1,
  'buyer-app estimates sync into the activity ledger'
);

UPDATE app.estimates
SET
  is_buyer_app_estimate = false,
  updated_at = now()
WHERE id = (SELECT val FROM _buyer_app_activity_fixture WHERE key = 'estimate');

SELECT is(
  (
    SELECT count(*)::int
    FROM app.buyer_app_activity
    WHERE tenant_id = (SELECT val FROM _buyer_app_activity_fixture WHERE key = 'tenant')
      AND event_source = 'estimate'
      AND source_entity_id = (SELECT val FROM _buyer_app_activity_fixture WHERE key = 'estimate')
      AND deleted_at IS NULL
  ),
  0,
  'estimate activity rows are retired when the document is no longer buyer-app-qualified'
);

SELECT * FROM finish();
ROLLBACK;
