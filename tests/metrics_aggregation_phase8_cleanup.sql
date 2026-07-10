-- pgTAP coverage for Phase 8 metrics aggregation cleanup.
--
-- Run with:
--   npx supabase test db --file tests/metrics_aggregation_phase8_cleanup.sql

BEGIN;

SELECT plan(11);

SELECT ok(app.invoice_status_has_receivable('sent', 100), 'sent invoices with balance are receivable');
SELECT ok(app.invoice_status_has_receivable('viewed', 100), 'viewed invoices with balance are receivable');
SELECT ok(app.invoice_status_has_receivable('unpaid', 100), 'unpaid invoices with balance are receivable');
SELECT ok(app.invoice_status_has_receivable('overdue', 100), 'overdue invoices with balance are receivable');
SELECT ok(app.invoice_status_has_receivable('partially_paid', 100), 'partially paid invoices with balance are receivable');
SELECT ok(NOT app.invoice_status_has_receivable('paid', 100), 'paid invoices are not receivable even with stale balance');
SELECT ok(NOT app.invoice_status_has_receivable('void', 100), 'void invoices are not receivable');

DO $$
DECLARE
  v_tenant uuid := gen_random_uuid();
  v_sparse_tenant uuid := gen_random_uuid();
  v_user uuid := gen_random_uuid();
  v_buyer uuid := gen_random_uuid();
  v_location uuid := gen_random_uuid();
  v_brand uuid := gen_random_uuid();
  v_product uuid := gen_random_uuid();
  v_order uuid := gen_random_uuid();
  v_day date := ((now() AT TIME ZONE 'Asia/Kolkata')::date - 1);
  v_due timestamp with time zone := make_timestamptz(
    EXTRACT(YEAR FROM ((now() AT TIME ZONE 'Asia/Kolkata')::date - 1))::int,
    EXTRACT(MONTH FROM ((now() AT TIME ZONE 'Asia/Kolkata')::date - 1))::int,
    EXTRACT(DAY FROM ((now() AT TIME ZONE 'Asia/Kolkata')::date - 1))::int,
    9,
    0,
    0,
    'Asia/Kolkata'
  );
  v_analysis jsonb;
BEGIN
  INSERT INTO auth.users (
    id, email, encrypted_password, email_confirmed_at,
    created_at, updated_at, raw_app_meta_data, raw_user_meta_data
  )
  VALUES (
    v_user, 'phase8-cleanup@test.local', 'x', now(),
    now(), now(), '{}'::jsonb, '{}'::jsonb
  );

  INSERT INTO app.tenants (id, slug, business_name, created_at, updated_at)
  VALUES
    (v_tenant, 'phase8-cleanup', 'Phase 8 Cleanup Tenant', now(), now()),
    (v_sparse_tenant, 'phase8-sparse', 'Phase 8 Sparse Tenant', now(), now());

  INSERT INTO app.locations (id, tenant_id, name, created_at, updated_at)
  VALUES (v_location, v_tenant, 'Receivables Hub', now(), now());

  INSERT INTO app.buyers (
    id, tenant_id, business_name, phone, credit_limit, buyer_app_enabled, is_active, created_at, updated_at
  )
  VALUES (
    v_buyer, v_tenant, 'Phase 8 Buyer', '9999999808', 25000, true, true, now(), now()
  );

  INSERT INTO app.tenant_brands (
    id, tenant_id, display_name_override, slug, is_active, created_at, updated_at
  )
  VALUES (v_brand, v_tenant, 'Phase 8 Brand', 'phase8-brand', true, now(), now());

  INSERT INTO app.tenant_products (
    id, tenant_id, tenant_brand_id, internal_sku, name_override, base_selling_price, is_active, created_at, updated_at
  )
  VALUES (v_product, v_tenant, v_brand, 'PHASE8-SKU', 'Phase 8 SKU', 500, true, now(), now());

  INSERT INTO app.orders (
    id, tenant_id, buyer_id, placed_by, order_number, status, source,
    total_amount, placed_at, order_date, location_id, created_at, updated_at
  )
  VALUES (
    v_order,
    v_tenant,
    v_buyer,
    v_user,
    'SO-PHASE8-001',
    'confirmed',
    'cockpit_manual',
    1000,
    make_timestamptz(EXTRACT(YEAR FROM v_day)::int, EXTRACT(MONTH FROM v_day)::int, EXTRACT(DAY FROM v_day)::int, 10, 0, 0, 'Asia/Kolkata'),
    v_day,
    v_location,
    now(),
    now()
  );

  INSERT INTO app.order_items (
    order_id, tenant_product_id, qty, unit_price, line_total, created_at, updated_at
  )
  VALUES
    (v_order, v_product, 1, 600, 600, now(), now()),
    (v_order, v_product, 1, 400, 400, now(), now());

  INSERT INTO app.invoices (
    id, tenant_id, buyer_id, order_id, invoice_number, invoice_date, status,
    total_amount, outstanding_balance, due_date, location_id, created_at, updated_at
  )
  VALUES
    (gen_random_uuid(), v_tenant, v_buyer, v_order, 'INV-PHASE8-SENT', v_day, 'sent', 100, 100, v_due, v_location, now(), now()),
    (gen_random_uuid(), v_tenant, v_buyer, v_order, 'INV-PHASE8-VIEWED', v_day, 'viewed', 200, 200, v_due, v_location, now(), now()),
    (gen_random_uuid(), v_tenant, v_buyer, v_order, 'INV-PHASE8-UNPAID', v_day, 'unpaid', 300, 300, v_due, v_location, now(), now()),
    (gen_random_uuid(), v_tenant, v_buyer, v_order, 'INV-PHASE8-OVERDUE', v_day, 'overdue', 400, 400, v_due, v_location, now(), now()),
    (gen_random_uuid(), v_tenant, v_buyer, v_order, 'INV-PHASE8-PARTIAL', v_day, 'partially_paid', 500, 500, v_due, v_location, now(), now()),
    (gen_random_uuid(), v_tenant, v_buyer, v_order, 'INV-PHASE8-PAID', v_day, 'paid', 600, 600, v_due, v_location, now(), now()),
    (gen_random_uuid(), v_tenant, v_buyer, v_order, 'INV-PHASE8-VOID', v_day, 'void', 700, 700, v_due, v_location, now(), now());

  PERFORM app.refresh_buyers_snapshot(v_tenant);
  PERFORM app.refresh_locations_snapshot(v_location);
  PERFORM app.refresh_kpi_tenant_daily(v_tenant, v_day);

  SELECT app._run_metrics_analysis_for_tenant_range(v_tenant, v_day, v_day)
  INTO v_analysis;

  CREATE TEMP TABLE _phase8_fixture (
    key text PRIMARY KEY,
    uuid_val uuid,
    numeric_val numeric,
    bool_val boolean,
    json_val jsonb
  );

  INSERT INTO _phase8_fixture VALUES
    ('tenant', v_tenant, NULL, NULL, NULL),
    ('sparse_tenant', v_sparse_tenant, NULL, NULL, NULL),
    ('buyer', v_buyer, NULL, NULL, NULL),
    ('location', v_location, NULL, NULL, NULL),
    ('expected_receivable', NULL, 1500, NULL, NULL),
    ('analysis', NULL, NULL, NULL, v_analysis);
END $$;

SELECT is(
  (
    SELECT outstanding_dues
    FROM app.buyers_snapshot
    WHERE tenant_id = (SELECT uuid_val FROM _phase8_fixture WHERE key = 'tenant')
      AND buyer_id = (SELECT uuid_val FROM _phase8_fixture WHERE key = 'buyer')
      AND scope = 'tenant'
  ),
  (SELECT numeric_val FROM _phase8_fixture WHERE key = 'expected_receivable'),
  'buyer tenant snapshot excludes paid and void stale outstanding balances'
);

SELECT is(
  (
    SELECT outstanding_dues
    FROM app.locations_snapshot
    WHERE location_id = (SELECT uuid_val FROM _phase8_fixture WHERE key = 'location')
  ),
  (SELECT numeric_val FROM _phase8_fixture WHERE key = 'expected_receivable'),
  'location snapshot uses canonical receivable helper for outstanding dues'
);

SELECT is(
  (
    SELECT (json_val #>> '{comparisons,kpi_tenant_daily,raw_totals,gmv}')::numeric
    FROM _phase8_fixture
    WHERE key = 'analysis'
  ),
  1000::numeric,
  'phase 8 analysis raw GMV does not duplicate multi-line orders'
);

SELECT is(
  (
    SELECT is_stale
    FROM app.get_tenant_aggregate_freshness((SELECT uuid_val FROM _phase8_fixture WHERE key = 'sparse_tenant'))
    WHERE aggregate_name = 'kpi_product_daily'
  ),
  false,
  'sparse KPI tables with no activity are not stale failures solely because row_count is zero'
);

SELECT * FROM finish();
ROLLBACK;
