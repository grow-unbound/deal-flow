-- pgTAP coverage for Metrics V2 Phase 0A legacy containment.
--
-- Run with:
--   npx supabase test db --local tests/metrics_v2_phase_0a_legacy_containment.sql

BEGIN;

SELECT plan(10);

SELECT has_function(
  'app',
  'refresh_buyers_snapshot_for_buyer',
  ARRAY['uuid', 'uuid'],
  'buyer-scoped buyers snapshot refresh helper exists'
);

SELECT has_function(
  'app',
  'refresh_buyer_current_snapshot_for_buyer',
  ARRAY['uuid', 'uuid'],
  'buyer-scoped buyer current snapshot refresh helper exists'
);

DO $$
DECLARE
  v_tenant uuid := gen_random_uuid();
  v_user uuid := gen_random_uuid();
  v_buyer_a uuid := gen_random_uuid();
  v_buyer_b uuid := gen_random_uuid();
  v_location_a uuid := gen_random_uuid();
  v_location_b uuid := gen_random_uuid();
  v_order uuid := gen_random_uuid();
  v_invoice uuid := gen_random_uuid();
  v_integration uuid := gen_random_uuid();
  v_sync_job uuid := gen_random_uuid();
  v_day date := (now() AT TIME ZONE 'Asia/Kolkata')::date;
  v_due timestamptz := now() - interval '1 day';
BEGIN
  INSERT INTO auth.users (
    id, email, encrypted_password, email_confirmed_at,
    created_at, updated_at, raw_app_meta_data, raw_user_meta_data
  )
  VALUES (
    v_user, 'metrics-phase0a@test.local', 'x', now(),
    now(), now(), '{}'::jsonb, '{}'::jsonb
  );

  INSERT INTO app.tenants (id, slug, business_name, created_at, updated_at)
  VALUES (v_tenant, 'metrics-phase0a', 'Metrics Phase 0A Tenant', now(), now());

  INSERT INTO app.locations (id, tenant_id, name, created_at, updated_at)
  VALUES
    (v_location_a, v_tenant, 'North', now(), now()),
    (v_location_b, v_tenant, 'South', now(), now());

  INSERT INTO app.buyers (
    id, tenant_id, business_name, phone, credit_limit, buyer_app_enabled, is_active, created_at, updated_at
  )
  VALUES
    (v_buyer_a, v_tenant, 'Buyer A', '9999999101', 10000, true, true, now(), now()),
    (v_buyer_b, v_tenant, 'Buyer B', '9999999102', 20000, true, true, now(), now());

  INSERT INTO app.orders (
    id, tenant_id, buyer_id, placed_by, order_number, status, source,
    total_amount, placed_at, order_date, location_id, is_buyer_app_order, created_at, updated_at
  )
  VALUES (
    v_order,
    v_tenant,
    v_buyer_a,
    v_user,
    'SO-PHASE0A-001',
    'confirmed',
    'buyer_app',
    1100,
    now(),
    v_day,
    v_location_a,
    true,
    now(),
    now()
  );

  INSERT INTO app.estimates (
    tenant_id, buyer_id, estimate_number, status, total_amount, source,
    estimate_date, location_id, is_buyer_app_estimate, created_at, updated_at
  )
  VALUES (
    v_tenant,
    v_buyer_a,
    'EST-PHASE0A-001',
    'sent',
    900,
    'buyer_app',
    v_day,
    v_location_a,
    true,
    now(),
    now()
  );

  INSERT INTO app.invoices (
    id, tenant_id, buyer_id, order_id, invoice_number, invoice_date, status,
    total_amount, outstanding_balance, due_date, location_id, is_buyer_app_invoice, created_at, updated_at
  )
  VALUES (
    v_invoice,
    v_tenant,
    v_buyer_a,
    v_order,
    'INV-PHASE0A-001',
    v_day,
    'sent',
    700,
    700,
    v_due,
    v_location_a,
    true,
    now(),
    now()
  );

  PERFORM app.refresh_buyers_snapshot(v_tenant);
  PERFORM app.refresh_buyer_current_snapshot(v_tenant);
  PERFORM app.refresh_buyer_app_snapshot(v_tenant);

  CREATE TEMP TABLE _phase0a_fixture (
    key text PRIMARY KEY,
    uuid_val uuid
  );
  INSERT INTO _phase0a_fixture VALUES
    ('tenant', v_tenant),
    ('buyer_a', v_buyer_a),
    ('buyer_b', v_buyer_b),
    ('location_b', v_location_b),
    ('order', v_order),
    ('integration', v_integration),
    ('sync_job', v_sync_job);

  CREATE TEMP TABLE _phase0a_expected_buyers_snapshot AS
  SELECT
    tenant_id,
    buyer_id,
    scope,
    location_id,
    is_active,
    is_dormant,
    outstanding_dues,
    overdue_amount,
    credit_limit,
    open_orders_count,
    last_order_at,
    last_activity_at
  FROM app.buyers_snapshot
  WHERE tenant_id = v_tenant
    AND buyer_id = v_buyer_a;

  CREATE TEMP TABLE _phase0a_expected_buyer_current AS
  SELECT
    tenant_id,
    buyer_id,
    credit_limit,
    outstanding_dues,
    credit_used,
    available_credit,
    open_invoice_count,
    earliest_due_date,
    overdue_invoice_count,
    overdue_amount,
    open_orders_count
  FROM app.buyer_current_snapshot
  WHERE tenant_id = v_tenant
    AND buyer_id = v_buyer_a;

  DELETE FROM app.buyers_snapshot
  WHERE tenant_id = v_tenant
    AND buyer_id = v_buyer_a;
  DELETE FROM app.buyer_current_snapshot
  WHERE tenant_id = v_tenant
    AND buyer_id = v_buyer_a;

  PERFORM app.refresh_buyers_snapshot_for_buyer(v_tenant, v_buyer_a);
  PERFORM app.refresh_buyer_current_snapshot_for_buyer(v_tenant, v_buyer_a);

  INSERT INTO catalog.integration_types (
    id, display_name, description, auth_schema, capabilities, connectivity_mode, is_active, created_at, updated_at
  )
  VALUES (
    'phase0a_zoho', 'Phase 0A Zoho', 'test integration type', '{}'::jsonb, '{}'::jsonb, 'cloud', true, now(), now()
  );

  INSERT INTO app.tenant_integrations (
    id, tenant_id, integration_type_id, status, config, created_at, updated_at
  )
  VALUES (
    v_integration, v_tenant, 'phase0a_zoho', 'connected', '{}'::jsonb, now(), now()
  );

  INSERT INTO app.integration_sync_jobs (
    id, tenant_id, tenant_integration_id, job_type, status, progress, phase, since_date, created_at, updated_at
  )
  VALUES (
    v_sync_job,
    v_tenant,
    v_integration,
    'incremental',
    'running',
    '{}'::jsonb,
    'analysis',
    now() - interval '2 days',
    now(),
    now()
  );
END $$;

SELECT is(
  (
    SELECT COUNT(*)::int
    FROM (
      (
        SELECT * FROM _phase0a_expected_buyers_snapshot
        EXCEPT
        SELECT
          tenant_id,
          buyer_id,
          scope,
          location_id,
          is_active,
          is_dormant,
          outstanding_dues,
          overdue_amount,
          credit_limit,
          open_orders_count,
          last_order_at,
          last_activity_at
        FROM app.buyers_snapshot
        WHERE tenant_id = (SELECT uuid_val FROM _phase0a_fixture WHERE key = 'tenant')
          AND buyer_id = (SELECT uuid_val FROM _phase0a_fixture WHERE key = 'buyer_a')
      )
      UNION ALL
      (
        SELECT
          tenant_id,
          buyer_id,
          scope,
          location_id,
          is_active,
          is_dormant,
          outstanding_dues,
          overdue_amount,
          credit_limit,
          open_orders_count,
          last_order_at,
          last_activity_at
        FROM app.buyers_snapshot
        WHERE tenant_id = (SELECT uuid_val FROM _phase0a_fixture WHERE key = 'tenant')
          AND buyer_id = (SELECT uuid_val FROM _phase0a_fixture WHERE key = 'buyer_a')
        EXCEPT
        SELECT * FROM _phase0a_expected_buyers_snapshot
      )
    ) diff
  ),
  0,
  'buyer-scoped buyers snapshot refresh matches tenant-wide output for the affected buyer'
);

SELECT is(
  (
    SELECT COUNT(*)::int
    FROM (
      (
        SELECT * FROM _phase0a_expected_buyer_current
        EXCEPT
        SELECT
          tenant_id,
          buyer_id,
          credit_limit,
          outstanding_dues,
          credit_used,
          available_credit,
          open_invoice_count,
          earliest_due_date,
          overdue_invoice_count,
          overdue_amount,
          open_orders_count
        FROM app.buyer_current_snapshot
        WHERE tenant_id = (SELECT uuid_val FROM _phase0a_fixture WHERE key = 'tenant')
          AND buyer_id = (SELECT uuid_val FROM _phase0a_fixture WHERE key = 'buyer_a')
      )
      UNION ALL
      (
        SELECT
          tenant_id,
          buyer_id,
          credit_limit,
          outstanding_dues,
          credit_used,
          available_credit,
          open_invoice_count,
          earliest_due_date,
          overdue_invoice_count,
          overdue_amount,
          open_orders_count
        FROM app.buyer_current_snapshot
        WHERE tenant_id = (SELECT uuid_val FROM _phase0a_fixture WHERE key = 'tenant')
          AND buyer_id = (SELECT uuid_val FROM _phase0a_fixture WHERE key = 'buyer_a')
        EXCEPT
        SELECT * FROM _phase0a_expected_buyer_current
      )
    ) diff
  ),
  0,
  'buyer-scoped current snapshot refresh matches tenant-wide output for the affected buyer'
);

UPDATE app.orders
SET buyer_id = (SELECT uuid_val FROM _phase0a_fixture WHERE key = 'buyer_b'),
    location_id = (SELECT uuid_val FROM _phase0a_fixture WHERE key = 'location_b'),
    updated_at = now()
WHERE id = (SELECT uuid_val FROM _phase0a_fixture WHERE key = 'order');

SELECT is(
  (
    SELECT COALESCE(SUM(open_orders_count), 0)::int
    FROM app.buyers_snapshot
    WHERE tenant_id = (SELECT uuid_val FROM _phase0a_fixture WHERE key = 'tenant')
      AND buyer_id = (SELECT uuid_val FROM _phase0a_fixture WHERE key = 'buyer_a')
      AND scope = 'tenant'
  ),
  0,
  'moving an order away refreshes the old buyer snapshot'
);

SELECT is(
  (
    SELECT COALESCE(SUM(open_orders_count), 0)::int
    FROM app.buyer_current_snapshot
    WHERE tenant_id = (SELECT uuid_val FROM _phase0a_fixture WHERE key = 'tenant')
      AND buyer_id = (SELECT uuid_val FROM _phase0a_fixture WHERE key = 'buyer_b')
  ),
  1,
  'moving an order to a new buyer refreshes the new buyer current snapshot'
);

UPDATE app.buyers
SET deleted_at = now(),
    updated_at = now()
WHERE id = (SELECT uuid_val FROM _phase0a_fixture WHERE key = 'buyer_b');

SELECT is(
  (
    SELECT COUNT(*)::int
    FROM app.buyers_snapshot
    WHERE tenant_id = (SELECT uuid_val FROM _phase0a_fixture WHERE key = 'tenant')
      AND buyer_id = (SELECT uuid_val FROM _phase0a_fixture WHERE key = 'buyer_b')
  ),
  0,
  'soft-deleting a buyer removes only that buyer snapshot rows'
);

UPDATE app.buyer_app_snapshot
SET opened_app_mtd = 42,
    repeat_mtd = 42,
    refreshed_at = '2026-07-01 00:00:00+05:30'::timestamptz
WHERE tenant_id = (SELECT uuid_val FROM _phase0a_fixture WHERE key = 'tenant');

SELECT ok(
  app.record_buyer_app_activity(
    (SELECT uuid_val FROM _phase0a_fixture WHERE key = 'tenant'),
    (SELECT uuid_val FROM _phase0a_fixture WHERE key = 'buyer_a'),
    'session_started',
    now(),
    NULL,
    '{}'::jsonb,
    'phase0a-session-started',
    true
  ) IS NOT NULL,
  'record_buyer_app_activity still records activity after containment'
);

SELECT is(
  (
    SELECT opened_app_mtd::int
    FROM app.buyer_app_snapshot
    WHERE tenant_id = (SELECT uuid_val FROM _phase0a_fixture WHERE key = 'tenant')
  ),
  42,
  'record_buyer_app_activity does not refresh tenant-wide buyer_app_snapshot inline'
);

UPDATE app.integration_sync_jobs
SET status = 'completed',
    updated_at = now()
WHERE id = (SELECT uuid_val FROM _phase0a_fixture WHERE key = 'sync_job');

SELECT is(
  (
    SELECT progress #>> '{meta,post_sync_rebuild_deferred}'
    FROM app.integration_sync_jobs
    WHERE id = (SELECT uuid_val FROM _phase0a_fixture WHERE key = 'sync_job')
  ),
  'true',
  'sync completion records deferred post-sync rebuild metadata'
);

SELECT * FROM finish();
ROLLBACK;
