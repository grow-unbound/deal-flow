-- pgTAP coverage for Phase 3 aggregate foundation completion.
--
-- Run with:
--   npx supabase test db --file tests/metrics_aggregation_phase3_foundation.sql

BEGIN;

SELECT plan(8);

SELECT ok(app.order_status_in_flow('draft'), 'draft orders remain part of flow metrics');
SELECT ok(NOT app.order_status_in_flow('cancelled'), 'cancelled orders are excluded from flow metrics');
SELECT ok(app.order_status_is_open('dispatched'), 'dispatched orders remain open until terminal completion');
SELECT ok(NOT app.order_status_is_open('delivered'), 'delivered orders are terminal for open-order metrics');

DO $$
DECLARE
  v_tenant uuid := gen_random_uuid();
  v_user uuid := gen_random_uuid();
  v_buyer uuid := gen_random_uuid();
  v_location_old uuid := gen_random_uuid();
  v_location_new uuid := gen_random_uuid();
  v_order uuid := gen_random_uuid();
  v_day_old date := DATE '2026-07-02';
  v_day_new date := DATE '2026-07-05';
BEGIN
  INSERT INTO auth.users (
    id, email, encrypted_password, email_confirmed_at,
    created_at, updated_at, raw_app_meta_data, raw_user_meta_data
  )
  VALUES (
    v_user, 'phase3-foundation@test.local', 'x', now(),
    now(), now(), '{}'::jsonb, '{}'::jsonb
  );

  INSERT INTO app.tenants (id, slug, business_name, created_at, updated_at)
  VALUES (v_tenant, 'phase3-foundation', 'Phase 3 Foundation Tenant', now(), now());

  INSERT INTO app.locations (id, tenant_id, name, created_at, updated_at)
  VALUES
    (v_location_old, v_tenant, 'Old Hub', now(), now()),
    (v_location_new, v_tenant, 'New Hub', now(), now());

  INSERT INTO app.buyers (
    id, tenant_id, business_name, phone, is_active, created_at, updated_at
  )
  VALUES (
    v_buyer, v_tenant, 'Phase 3 Buyer', '+919888888888', true, now(), now()
  );

  INSERT INTO app.orders (
    id, tenant_id, buyer_id, placed_by, order_number, status, source,
    total_amount, placed_at, order_date, location_id, created_at, updated_at
  )
  VALUES (
    v_order,
    v_tenant,
    v_buyer,
    v_user,
    'SO-PHASE3-001',
    'draft',
    'cockpit_manual',
    1250,
    make_timestamptz(2026, 7, 2, 12, 0, 0, 'Asia/Kolkata'),
    v_day_old,
    v_location_old,
    make_timestamptz(2026, 7, 2, 12, 0, 0, 'Asia/Kolkata'),
    now()
  );

  CREATE TEMP TABLE _phase3_foundation_fixture (key text PRIMARY KEY, val uuid, day_val date);
  INSERT INTO _phase3_foundation_fixture VALUES
    ('tenant', v_tenant, NULL),
    ('location_old', v_location_old, NULL),
    ('location_new', v_location_new, NULL),
    ('order', v_order, NULL),
    ('day_old', NULL, v_day_old),
    ('day_new', NULL, v_day_new);

  UPDATE app.orders
  SET
    order_date = v_day_new,
    placed_at = make_timestamptz(2026, 7, 5, 12, 0, 0, 'Asia/Kolkata'),
    location_id = v_location_new,
    updated_at = now()
  WHERE id = v_order;
END $$;

SELECT is(
  (
    SELECT COUNT(*)::int
    FROM app.kpi_tenant_daily
    WHERE tenant_id = (SELECT val FROM _phase3_foundation_fixture WHERE key = 'tenant')
      AND day = (SELECT day_val FROM _phase3_foundation_fixture WHERE key = 'day_old')
  ),
  0,
  'tenant daily rows are cleared from the old order day when canonical order_date changes'
);

SELECT is(
  (
    SELECT COUNT(*)::int
    FROM app.kpi_location_daily
    WHERE tenant_id = (SELECT val FROM _phase3_foundation_fixture WHERE key = 'tenant')
      AND location_id = (SELECT val FROM _phase3_foundation_fixture WHERE key = 'location_old')
      AND day = (SELECT day_val FROM _phase3_foundation_fixture WHERE key = 'day_old')
  ),
  0,
  'location daily rows are cleared from the old location/day bucket after moves'
);

SELECT is(
  (
    SELECT orders_count::int
    FROM app.kpi_orders_daily
    WHERE tenant_id = (SELECT val FROM _phase3_foundation_fixture WHERE key = 'tenant')
      AND scope = 'location'
      AND location_id = (SELECT val FROM _phase3_foundation_fixture WHERE key = 'location_new')
      AND day = (SELECT day_val FROM _phase3_foundation_fixture WHERE key = 'day_new')
  ),
  1,
  'orders daily rows rebuild onto the new location/day bucket after moves'
);

SELECT is(
  app.sync_job_rebuild_days('incremental', now() - interval '9 days', 2),
  10,
  'sync-triggered rebuild depth expands to cover historical since_date windows'
);

SELECT * FROM finish();
ROLLBACK;
