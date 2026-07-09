-- pgTAP coverage for Phase 7 reconciliation and aggregate repair.
--
-- Run with:
--   npx supabase test db --file tests/metrics_aggregation_phase7_reconciliation.sql

BEGIN;

SELECT plan(11);

DO $$
DECLARE
  v_tenant uuid := gen_random_uuid();
  v_user uuid := gen_random_uuid();
  v_buyer_1 uuid := gen_random_uuid();
  v_buyer_2 uuid := gen_random_uuid();
  v_buyer_3 uuid := gen_random_uuid();
  v_location_1 uuid := gen_random_uuid();
  v_location_2 uuid := gen_random_uuid();
  v_order_1 uuid := gen_random_uuid();
  v_order_2 uuid := gen_random_uuid();
  v_estimate_1 uuid := gen_random_uuid();
  v_estimate_2 uuid := gen_random_uuid();
  v_invoice_1 uuid := gen_random_uuid();
  v_invoice_2 uuid := gen_random_uuid();
  v_day date := ((now() AT TIME ZONE 'Asia/Kolkata')::date - 1);
BEGIN
  INSERT INTO auth.users (
    id, email, encrypted_password, email_confirmed_at,
    created_at, updated_at, raw_app_meta_data, raw_user_meta_data
  )
  VALUES (
    v_user, 'phase7-reconciliation@test.local', 'x', now(),
    now(), now(), '{}'::jsonb, '{}'::jsonb
  );

  INSERT INTO app.tenants (id, slug, business_name, created_at, updated_at)
  VALUES (v_tenant, 'phase7-reconciliation', 'Phase 7 Reconciliation Tenant', now(), now());

  INSERT INTO app.locations (id, tenant_id, name, created_at, updated_at)
  VALUES
    (v_location_1, v_tenant, 'North Hub', now(), now()),
    (v_location_2, v_tenant, 'South Hub', now(), now());

  INSERT INTO app.buyers (
    id, tenant_id, business_name, phone, credit_limit, buyer_app_enabled, is_active, created_at, updated_at
  )
  VALUES
    (v_buyer_1, v_tenant, 'Buyer One', '9999999991', 1000, true, true, now(), now()),
    (v_buyer_2, v_tenant, 'Buyer Two', '9999999992', 2000, true, true, now(), now()),
    (v_buyer_3, v_tenant, 'Buyer Three', '9999999993', 500, false, true, now(), now());

  INSERT INTO app.orders (
    id, tenant_id, buyer_id, placed_by, order_number, status, source,
    total_amount, placed_at, order_date, location_id, is_buyer_app_order, created_at, updated_at
  )
  VALUES
    (
      v_order_1,
      v_tenant,
      v_buyer_1,
      v_user,
      'SO-PHASE7-001',
      'draft',
      'buyer_app',
      1000,
      make_timestamptz(EXTRACT(YEAR FROM v_day)::int, EXTRACT(MONTH FROM v_day)::int, EXTRACT(DAY FROM v_day)::int, 10, 0, 0, 'Asia/Kolkata'),
      v_day,
      v_location_1,
      true,
      now(),
      now()
    ),
    (
      v_order_2,
      v_tenant,
      v_buyer_2,
      v_user,
      'SO-PHASE7-002',
      'confirmed',
      'cockpit_manual',
      2000,
      make_timestamptz(EXTRACT(YEAR FROM v_day)::int, EXTRACT(MONTH FROM v_day)::int, EXTRACT(DAY FROM v_day)::int, 13, 0, 0, 'Asia/Kolkata'),
      v_day,
      v_location_2,
      false,
      now(),
      now()
    );

  INSERT INTO app.estimates (
    id, tenant_id, buyer_id, estimate_number, status, total_amount, source,
    estimate_date, location_id, is_buyer_app_estimate, created_at, updated_at
  )
  VALUES
    (
      v_estimate_1,
      v_tenant,
      v_buyer_1,
      'EST-PHASE7-001',
      'draft',
      500,
      'buyer_app',
      v_day,
      v_location_1,
      true,
      now(),
      now()
    ),
    (
      v_estimate_2,
      v_tenant,
      v_buyer_2,
      'EST-PHASE7-002',
      'converted',
      700,
      'seller',
      v_day,
      v_location_2,
      false,
      now(),
      now()
    );

  INSERT INTO app.invoices (
    id, tenant_id, buyer_id, order_id, invoice_number, invoice_date, status,
    total_amount, outstanding_balance, due_date, location_id, is_buyer_app_invoice, created_at, updated_at
  )
  VALUES
    (
      v_invoice_1,
      v_tenant,
      v_buyer_1,
      v_order_1,
      'INV-PHASE7-001',
      v_day,
      'sent',
      1000,
      300,
      make_timestamptz(EXTRACT(YEAR FROM v_day)::int, EXTRACT(MONTH FROM v_day)::int, EXTRACT(DAY FROM v_day)::int, 9, 0, 0, 'Asia/Kolkata'),
      v_location_1,
      true,
      now(),
      now()
    ),
    (
      v_invoice_2,
      v_tenant,
      v_buyer_2,
      v_order_2,
      'INV-PHASE7-002',
      v_day,
      'paid',
      2000,
      0,
      make_timestamptz(EXTRACT(YEAR FROM v_day)::int, EXTRACT(MONTH FROM v_day)::int, EXTRACT(DAY FROM v_day)::int, 15, 0, 0, 'Asia/Kolkata'),
      v_location_2,
      false,
      now(),
      now()
    );

  CREATE TEMP TABLE _phase7_fixture (key text PRIMARY KEY, uuid_val uuid, day_val date);
  INSERT INTO _phase7_fixture VALUES
    ('tenant', v_tenant, NULL),
    ('buyer_1', v_buyer_1, NULL),
    ('buyer_3', v_buyer_3, NULL),
    ('location_1', v_location_1, NULL),
    ('day', NULL, v_day);

  UPDATE app.orders_snapshot
  SET total_count = 0, total_value = 0, open_count = 0
  WHERE tenant_id = v_tenant;

  UPDATE app.estimates_snapshot
  SET open_count = 0
  WHERE tenant_id = v_tenant;

  UPDATE app.invoices_snapshot
  SET outstanding_amt = 0, overdue_amt = 0, overdue_count = 0
  WHERE tenant_id = v_tenant;

  DELETE FROM app.buyer_current_snapshot
  WHERE tenant_id = v_tenant
    AND buyer_id = v_buyer_1;

  UPDATE app.kpi_orders_daily
  SET orders_count = 0, gmv = 0, open_count = 0
  WHERE tenant_id = v_tenant
    AND day = v_day;

  UPDATE app.kpi_estimates_daily
  SET gmv = 0, open_count = 0
  WHERE tenant_id = v_tenant
    AND day = v_day;

  UPDATE app.kpi_invoices_daily
  SET overdue_amount = 0, outstanding_amount = 0
  WHERE tenant_id = v_tenant
    AND day = v_day;

  DELETE FROM app.kpi_buyers_daily
  WHERE tenant_id = v_tenant
    AND buyer_id = v_buyer_1
    AND day = v_day;

  PERFORM app.refresh_orders_snapshot(v_tenant);
  PERFORM app.refresh_estimates_snapshot(v_tenant);
  PERFORM app.refresh_invoices_snapshot(v_tenant);
  PERFORM app.refresh_buyer_current_snapshot(v_tenant);
  PERFORM app.rebuild_kpi_orders_daily_for_tenant(v_tenant, 7);
  PERFORM app.rebuild_kpi_estimates_daily_for_tenant(v_tenant, 7);
  PERFORM app.rebuild_kpi_invoices_daily_for_tenant(v_tenant, 7);
  PERFORM app.rebuild_kpi_buyers_daily_for_tenant(v_tenant, 7);
END $$;

SELECT is(
  (
    SELECT total_count::int
    FROM app.orders_snapshot
    WHERE tenant_id = (SELECT uuid_val FROM _phase7_fixture WHERE key = 'tenant')
  ),
  2,
  'orders snapshot repair restores flow-count totals from raw orders'
);

SELECT is(
  (
    SELECT total_value
    FROM app.orders_snapshot
    WHERE tenant_id = (SELECT uuid_val FROM _phase7_fixture WHERE key = 'tenant')
  ),
  3000::numeric,
  'orders snapshot repair restores GMV from raw orders'
);

SELECT is(
  (
    SELECT open_count::int
    FROM app.estimates_snapshot
    WHERE tenant_id = (SELECT uuid_val FROM _phase7_fixture WHERE key = 'tenant')
  ),
  1,
  'estimates snapshot repair restores open estimate counts'
);

SELECT is(
  (
    SELECT outstanding_amt
    FROM app.invoices_snapshot
    WHERE tenant_id = (SELECT uuid_val FROM _phase7_fixture WHERE key = 'tenant')
  ),
  300::numeric,
  'invoices snapshot repair restores outstanding dues'
);

SELECT is(
  (
    SELECT overdue_amount
    FROM app.buyer_current_snapshot
    WHERE tenant_id = (SELECT uuid_val FROM _phase7_fixture WHERE key = 'tenant')
      AND buyer_id = (SELECT uuid_val FROM _phase7_fixture WHERE key = 'buyer_1')
  ),
  300::numeric,
  'buyer current snapshot repair restores overdue amount for the affected buyer'
);

SELECT is(
  (
    SELECT orders_count::int
    FROM app.kpi_orders_daily
    WHERE tenant_id = (SELECT uuid_val FROM _phase7_fixture WHERE key = 'tenant')
      AND scope = 'tenant'
      AND day = (SELECT day_val FROM _phase7_fixture WHERE key = 'day')
  ),
  2,
  'tenant order daily repair restores document counts for the day'
);

SELECT is(
  (
    SELECT open_count::int
    FROM app.kpi_orders_daily
    WHERE tenant_id = (SELECT uuid_val FROM _phase7_fixture WHERE key = 'tenant')
      AND scope = 'location'
      AND location_id = (SELECT uuid_val FROM _phase7_fixture WHERE key = 'location_1')
      AND day = (SELECT day_val FROM _phase7_fixture WHERE key = 'day')
  ),
  1,
  'location order daily repair restores open-order counts for scoped rows'
);

SELECT is(
  (
    SELECT gmv
    FROM app.kpi_estimates_daily
    WHERE tenant_id = (SELECT uuid_val FROM _phase7_fixture WHERE key = 'tenant')
      AND scope = 'tenant'
      AND day = (SELECT day_val FROM _phase7_fixture WHERE key = 'day')
  ),
  1200::numeric,
  'estimate daily repair restores period GMV from raw estimates'
);

SELECT is(
  (
    SELECT overdue_amount
    FROM app.kpi_invoices_daily
    WHERE tenant_id = (SELECT uuid_val FROM _phase7_fixture WHERE key = 'tenant')
      AND scope = 'tenant'
      AND day = (SELECT day_val FROM _phase7_fixture WHERE key = 'day')
  ),
  300::numeric,
  'invoice daily repair restores overdue amount from receivable invoices'
);

SELECT is(
  (
    SELECT COUNT(*)::int
    FROM app.kpi_buyers_daily
    WHERE tenant_id = (SELECT uuid_val FROM _phase7_fixture WHERE key = 'tenant')
      AND buyer_id = (SELECT uuid_val FROM _phase7_fixture WHERE key = 'buyer_3')
      AND day = (SELECT day_val FROM _phase7_fixture WHERE key = 'day')
  ),
  0,
  'buyer daily facts stay sparse and do not materialize rows for inactive buyers with no activity'
);

SELECT is(
  (
    SELECT orders_count::int
    FROM app.kpi_buyers_daily
    WHERE tenant_id = (SELECT uuid_val FROM _phase7_fixture WHERE key = 'tenant')
      AND buyer_id = (SELECT uuid_val FROM _phase7_fixture WHERE key = 'buyer_1')
      AND scope = 'tenant'
      AND day = (SELECT day_val FROM _phase7_fixture WHERE key = 'day')
  ),
  1,
  'buyer daily repair restores tenant-scoped buyer facts after rows are deleted'
);

SELECT * FROM finish();
ROLLBACK;
