-- Rollback-only behavioral checks for Metrics V2 Phase 4 capture-only staging.
--
-- Prerequisite: Phase 0A, Phase 2, Phase 3, and Phase 4 migrations are
-- applied in order. This fixture exercises dirty capture only; it does not
-- enable the dispatcher, deploy an Edge Function, or schedule Cron.

BEGIN;

SET LOCAL ROLE service_role;

INSERT INTO app.tenants (id, slug, business_name, created_at, updated_at)
VALUES (
  '41000000-0000-4000-8000-000000000001'::uuid,
  'metrics-phase4-capture',
  'Metrics Phase 4 Capture',
  '2026-07-16 00:00:00+00'::timestamptz,
  '2026-07-16 00:00:00+00'::timestamptz
);

INSERT INTO app.buyers (id, tenant_id, business_name, phone, is_active, buyer_app_enabled, external_ref, created_at, updated_at)
VALUES
  ('41000000-0000-4000-8000-000000000002'::uuid, '41000000-0000-4000-8000-000000000001'::uuid, 'Metrics Phase 4 Buyer A', '9999999401', true, true, 'metrics-phase4-buyer-a', '2026-07-16 00:00:00+00', '2026-07-16 00:00:00+00'),
  ('41000000-0000-4000-8000-000000000003'::uuid, '41000000-0000-4000-8000-000000000001'::uuid, 'Metrics Phase 4 Buyer B', '9999999402', true, true, 'metrics-phase4-buyer-b', '2026-07-16 00:00:00+00', '2026-07-16 00:00:00+00');

INSERT INTO app.locations (id, tenant_id, name, status, is_default, external_ref, created_at, updated_at)
VALUES
  ('41000000-0000-4000-8000-000000000004'::uuid, '41000000-0000-4000-8000-000000000001'::uuid, 'Metrics Phase 4 Location A', 'active', true, 'metrics-phase4-location-a', '2026-07-16 00:00:00+00', '2026-07-16 00:00:00+00'),
  ('41000000-0000-4000-8000-000000000005'::uuid, '41000000-0000-4000-8000-000000000001'::uuid, 'Metrics Phase 4 Location B', 'active', false, 'metrics-phase4-location-b', '2026-07-16 00:00:00+00', '2026-07-16 00:00:00+00');

INSERT INTO app.warehouses (id, tenant_id, location_id, name, status, is_default, external_ref, created_at, updated_at)
VALUES
  ('41000000-0000-4000-8000-000000000006'::uuid, '41000000-0000-4000-8000-000000000001'::uuid, '41000000-0000-4000-8000-000000000004'::uuid, 'Metrics Phase 4 Warehouse A', 'active', true, 'metrics-phase4-warehouse-a', '2026-07-16 00:00:00+00', '2026-07-16 00:00:00+00'),
  ('41000000-0000-4000-8000-000000000007'::uuid, '41000000-0000-4000-8000-000000000001'::uuid, '41000000-0000-4000-8000-000000000005'::uuid, 'Metrics Phase 4 Warehouse B', 'active', false, 'metrics-phase4-warehouse-b', '2026-07-16 00:00:00+00', '2026-07-16 00:00:00+00');

INSERT INTO app.tenant_brands (id, tenant_id, display_name_override, is_active, external_ref, created_at, updated_at)
VALUES (
  '41000000-0000-4000-8000-000000000008'::uuid,
  '41000000-0000-4000-8000-000000000001'::uuid,
  'Metrics Phase 4 Brand',
  true,
  'metrics-phase4-brand',
  '2026-07-16 00:00:00+00'::timestamptz,
  '2026-07-16 00:00:00+00'::timestamptz
);

INSERT INTO app.tenant_products (id, tenant_id, tenant_brand_id, internal_sku, name_override, is_active, external_ref, created_at, updated_at)
VALUES
  ('41000000-0000-4000-8000-000000000009'::uuid, '41000000-0000-4000-8000-000000000001'::uuid, '41000000-0000-4000-8000-000000000008'::uuid, 'METRICS-PHASE4-A', 'Metrics Phase 4 Product A', true, 'metrics-phase4-product-a', '2026-07-16 00:00:00+00', '2026-07-16 00:00:00+00'),
  ('41000000-0000-4000-8000-000000000010'::uuid, '41000000-0000-4000-8000-000000000001'::uuid, '41000000-0000-4000-8000-000000000008'::uuid, 'METRICS-PHASE4-B', 'Metrics Phase 4 Product B', true, 'metrics-phase4-product-b', '2026-07-16 00:00:00+00', '2026-07-16 00:00:00+00');

INSERT INTO app.tenant_inventory (id, tenant_product_id, warehouse_id, qty_available, qty_reserved, reorder_point, updated_at)
VALUES (
  '41000000-0000-4000-8000-000000000011'::uuid,
  '41000000-0000-4000-8000-000000000009'::uuid,
  '41000000-0000-4000-8000-000000000006'::uuid,
  15,
  1,
  5,
  '2026-07-16 00:00:00+00'::timestamptz
);

INSERT INTO app.orders (
  id, tenant_id, buyer_id, order_number, status, source, subtotal, total_amount,
  created_at, updated_at, location_id, order_date, is_buyer_app_order
) VALUES (
  '41000000-0000-4000-8000-000000000012'::uuid,
  '41000000-0000-4000-8000-000000000001'::uuid,
  '41000000-0000-4000-8000-000000000002'::uuid,
  'M4-ORDER-001',
  'received',
  'buyer_app',
  100,
  100,
  '2026-07-10 08:00:00+00'::timestamptz,
  '2026-07-10 08:00:00+00'::timestamptz,
  '41000000-0000-4000-8000-000000000004'::uuid,
  '2026-07-10'::date,
  true
);

INSERT INTO app.order_items (id, order_id, tenant_product_id, qty, unit_price, line_total, created_at, updated_at)
VALUES (
  '41000000-0000-4000-8000-000000000013'::uuid,
  '41000000-0000-4000-8000-000000000012'::uuid,
  '41000000-0000-4000-8000-000000000009'::uuid,
  2,
  50,
  100,
  '2026-07-10 08:00:00+00'::timestamptz,
  '2026-07-10 08:00:00+00'::timestamptz
);

UPDATE app.orders
SET buyer_id = '41000000-0000-4000-8000-000000000003'::uuid,
    location_id = '41000000-0000-4000-8000-000000000005'::uuid,
    order_date = '2026-07-11'::date
WHERE id = '41000000-0000-4000-8000-000000000012'::uuid;

UPDATE app.order_items
SET tenant_product_id = '41000000-0000-4000-8000-000000000010'::uuid,
    qty = 3,
    line_total = 150
WHERE id = '41000000-0000-4000-8000-000000000013'::uuid;

UPDATE app.tenant_inventory
SET tenant_product_id = '41000000-0000-4000-8000-000000000010'::uuid,
    warehouse_id = '41000000-0000-4000-8000-000000000007'::uuid,
    qty_available = 20
WHERE id = '41000000-0000-4000-8000-000000000011'::uuid;

DO $$
DECLARE
  v_count int;
BEGIN
  SELECT COUNT(*) INTO v_count
  FROM app.metrics_dirty_work
  WHERE tenant_id = '41000000-0000-4000-8000-000000000001'::uuid
    AND domain = 'commercial'
    AND source_type = 'order'
    AND source_id = '41000000-0000-4000-8000-000000000012'::uuid
    AND old_buyer_id = '41000000-0000-4000-8000-000000000002'::uuid
    AND new_buyer_id = '41000000-0000-4000-8000-000000000003'::uuid
    AND old_location_id = '41000000-0000-4000-8000-000000000004'::uuid
    AND new_location_id = '41000000-0000-4000-8000-000000000005'::uuid
    AND old_day = '2026-07-10'::date
    AND new_day = '2026-07-11'::date;

  IF v_count <> 1 THEN
    RAISE EXCEPTION 'order header capture did not preserve old/new scalar keys: %', v_count;
  END IF;

  SELECT COUNT(*) INTO v_count
  FROM app.metrics_dirty_work
  WHERE tenant_id = '41000000-0000-4000-8000-000000000001'::uuid
    AND domain = 'commercial'
    AND source_type = 'order_item'
    AND source_id = '41000000-0000-4000-8000-000000000013'::uuid
    AND old_tenant_product_id = '41000000-0000-4000-8000-000000000009'::uuid
    AND new_tenant_product_id = '41000000-0000-4000-8000-000000000010'::uuid;

  IF v_count <> 1 THEN
    RAISE EXCEPTION 'order item capture did not preserve old/new product keys: %', v_count;
  END IF;

  SELECT COUNT(*) INTO v_count
  FROM app.metrics_dirty_work
  WHERE tenant_id = '41000000-0000-4000-8000-000000000001'::uuid
    AND domain = 'buyer_app'
    AND source_type = 'order'
    AND source_id = '41000000-0000-4000-8000-000000000012'::uuid;

  IF v_count <> 1 THEN
    RAISE EXCEPTION 'buyer app parent order capture should coalesce to one source row: %', v_count;
  END IF;

  SELECT COUNT(*) INTO v_count
  FROM app.metrics_dirty_work
  WHERE tenant_id = '41000000-0000-4000-8000-000000000001'::uuid
    AND domain = 'inventory'
    AND source_type = 'inventory'
    AND source_id = '41000000-0000-4000-8000-000000000011'::uuid
    AND old_tenant_product_id = '41000000-0000-4000-8000-000000000009'::uuid
    AND new_tenant_product_id = '41000000-0000-4000-8000-000000000010'::uuid
    AND old_location_id = '41000000-0000-4000-8000-000000000004'::uuid
    AND new_location_id = '41000000-0000-4000-8000-000000000005'::uuid;

  IF v_count <> 1 THEN
    RAISE EXCEPTION 'inventory capture did not preserve old/new product/location keys: %', v_count;
  END IF;
END $$;

-- Sync bypass must skip row-level capture. The existing sync-completion marker
-- remains the only bulk-sync path that emits V2 dirty work.
SELECT set_config('app.integration_sync_bypass_triggers', 'on', true);

INSERT INTO app.estimates (
  id, tenant_id, buyer_id, estimate_number, status, source, subtotal, total_amount,
  created_at, updated_at, estimate_date, location_id, is_buyer_app_estimate
) VALUES (
  '41000000-0000-4000-8000-000000000014'::uuid,
  '41000000-0000-4000-8000-000000000001'::uuid,
  '41000000-0000-4000-8000-000000000002'::uuid,
  'M4-EST-001',
  'sent',
  'buyer_app',
  90,
  90,
  '2026-07-12 08:00:00+00'::timestamptz,
  '2026-07-12 08:00:00+00'::timestamptz,
  '2026-07-12'::date,
  '41000000-0000-4000-8000-000000000004'::uuid,
  true
);

SELECT set_config('app.integration_sync_bypass_triggers', 'off', true);

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM app.metrics_dirty_work
    WHERE source_id = '41000000-0000-4000-8000-000000000014'::uuid
  ) THEN
    RAISE EXCEPTION 'sync bypass did not suppress row capture';
  END IF;
END $$;

SELECT app.metrics_mark_sync_completion(
  '41000000-0000-4000-8000-000000000015'::uuid,
  '41000000-0000-4000-8000-000000000001'::uuid,
  'transaction_line_items',
  '2026-07-01 00:00:00+00'::timestamptz,
  '2026-07-16 00:00:00+00'::timestamptz
);

DO $$
DECLARE
  v_count int;
BEGIN
  SELECT COUNT(*) INTO v_count
  FROM app.metrics_dirty_work
  WHERE tenant_id = '41000000-0000-4000-8000-000000000001'::uuid
    AND source_type = 'sync_job'
    AND source_id = '41000000-0000-4000-8000-000000000015'::uuid
    AND dirty_from = '2026-07-01'::date
    AND dirty_to = '2026-07-16'::date;

  IF v_count < 2 OR v_count > 5 THEN
    RAISE EXCEPTION 'sync completion marker should stay bounded by domain/range, got % rows', v_count;
  END IF;
END $$;

ROLLBACK;
