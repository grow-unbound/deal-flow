-- Rollback-only checks for Metrics V2 Phase 5 dashboard portfolio RPCs.
--
-- Prerequisite: Phase 0A, Phase 2, Phase 3, Phase 4, and Phase 5 migrations
-- are applied in order. This fixture validates read contracts only.

BEGIN;

SET LOCAL ROLE service_role;

INSERT INTO app.tenants (id, slug, business_name, created_at, updated_at)
VALUES (
  '45000000-0000-4000-8000-000000000001'::uuid,
  'metrics-phase5-dashboard',
  'Metrics Phase 5 Dashboard',
  '2026-07-16 00:00:00+00'::timestamptz,
  '2026-07-16 00:00:00+00'::timestamptz
);

INSERT INTO app.tenant_settings (tenant_id, settings, created_at, updated_at)
VALUES (
  '45000000-0000-4000-8000-000000000001'::uuid,
  jsonb_build_object(
    'orders', jsonb_build_object(
      'features', jsonb_build_object('enquiries', true, 'sales_orders', true, 'invoices', true)
    ),
    'buyer_app', jsonb_build_object('enabled', true)
  ),
  '2026-07-16 00:00:00+00'::timestamptz,
  '2026-07-16 00:00:00+00'::timestamptz
);

INSERT INTO app.locations (id, tenant_id, name, status, is_default, external_ref, created_at, updated_at)
VALUES
  ('45000000-0000-4000-8000-000000000002'::uuid, '45000000-0000-4000-8000-000000000001'::uuid, 'North', 'active', true, 'phase5-north', '2026-07-16 00:00:00+00', '2026-07-16 00:00:00+00'),
  ('45000000-0000-4000-8000-000000000003'::uuid, '45000000-0000-4000-8000-000000000001'::uuid, 'South', 'active', false, 'phase5-south', '2026-07-16 00:00:00+00', '2026-07-16 00:00:00+00');

INSERT INTO app.buyers (id, tenant_id, business_name, phone, is_active, buyer_app_enabled, external_ref, created_at, updated_at)
VALUES
  ('45000000-0000-4000-8000-000000000004'::uuid, '45000000-0000-4000-8000-000000000001'::uuid, 'Buyer With App', '9999999501', true, true, 'phase5-buyer-app', '2026-07-16 00:00:00+00', '2026-07-16 00:00:00+00'),
  ('45000000-0000-4000-8000-000000000005'::uuid, '45000000-0000-4000-8000-000000000001'::uuid, 'Buyer Without App', '9999999502', true, false, 'phase5-buyer-assisted', '2026-07-16 00:00:00+00', '2026-07-16 00:00:00+00');

INSERT INTO app.metrics_tenant_commercial_snapshot (
  tenant_id, external_ref, calendar_month, current_month_estimate_count,
  current_month_estimate_value, current_month_order_count, current_month_order_value,
  current_month_invoice_count, current_month_invoice_value, open_estimate_count,
  open_estimate_value, open_order_count, open_order_value, receivable_invoice_count,
  receivable_amount, overdue_invoice_count, overdue_amount, purchasing_buyers_90d,
  source_watermark, computed_at
) VALUES (
  '45000000-0000-4000-8000-000000000001'::uuid,
  'metrics:tenant:commercial:phase5',
  '2026-07-01'::date,
  2, 900, 3, 1200, 4, 1500, 1, 250, 2, 800, 2, 700, 1, 300, 2,
  '2026-07-16 00:00:00+00'::timestamptz,
  '2026-07-16 00:00:00+00'::timestamptz
);

INSERT INTO app.metrics_tenant_inventory_snapshot (
  tenant_id, external_ref, active_product_count, stocked_product_count,
  low_stock_product_count, out_of_stock_product_count, sellable_units,
  recent_invoice_stockout_count, source_watermark, computed_at
) VALUES (
  '45000000-0000-4000-8000-000000000001'::uuid,
  'metrics:tenant:inventory:phase5',
  5, 4, 1, 1, 40, 1,
  '2026-07-16 00:00:00+00'::timestamptz,
  '2026-07-16 00:00:00+00'::timestamptz
);

INSERT INTO app.metrics_tenant_buyer_app_snapshot (
  tenant_id, external_ref, enabled_buyer_count, active_buyer_count_90d,
  repeat_buyer_count_90d, app_estimate_count_90d, app_estimate_value_90d,
  app_order_count_90d, app_order_value_90d, app_invoice_count_90d,
  app_invoice_value_90d, assisted_invoice_count_90d, assisted_invoice_value_90d,
  source_watermark, computed_at
) VALUES (
  '45000000-0000-4000-8000-000000000001'::uuid,
  'metrics:tenant:buyer-app:phase5',
  1, 1, 1, 1, 100, 2, 500, 1, 450, 1, 600,
  '2026-07-16 00:00:00+00'::timestamptz,
  '2026-07-16 00:00:00+00'::timestamptz
);

INSERT INTO app.metrics_tenant_setup_snapshot (
  tenant_id, external_ref, active_buyer_count, active_product_count,
  active_brand_count, active_category_count, active_location_count,
  active_warehouse_count, active_campaign_count, active_cohort_count,
  active_price_list_count, source_watermark, computed_at
) VALUES (
  '45000000-0000-4000-8000-000000000001'::uuid,
  'metrics:tenant:setup:phase5',
  2, 5, 1, 1, 2, 1, 0, 0, 0,
  '2026-07-16 00:00:00+00'::timestamptz,
  '2026-07-16 00:00:00+00'::timestamptz
);

INSERT INTO app.metrics_location_snapshot (
  tenant_id, location_id, external_ref, invoice_count_90d, invoice_value_90d,
  purchasing_buyers_90d, open_estimate_count, open_estimate_value,
  open_order_count, open_order_value, receivable_amount, overdue_amount,
  source_watermark, computed_at
) VALUES
  ('45000000-0000-4000-8000-000000000001'::uuid, '45000000-0000-4000-8000-000000000002'::uuid, 'metrics:location:north:phase5', 2, 1000, 1, 1, 250, 1, 400, 500, 200, '2026-07-16 00:00:00+00', '2026-07-16 00:00:00+00'),
  ('45000000-0000-4000-8000-000000000001'::uuid, '45000000-0000-4000-8000-000000000003'::uuid, 'metrics:location:south:phase5', 1, 500, 1, 0, 0, 1, 400, 200, 100, '2026-07-16 00:00:00+00', '2026-07-16 00:00:00+00');

INSERT INTO app.metrics_buyer_snapshot (
  tenant_id, buyer_id, external_ref, invoice_count_90d, invoice_value_90d,
  order_count_90d, order_value_90d, receivable_amount, overdue_amount,
  credit_limit, credit_available, buyer_app_enabled, app_invoice_value_90d,
  assisted_invoice_value_90d, source_watermark, computed_at
) VALUES
  ('45000000-0000-4000-8000-000000000001'::uuid, '45000000-0000-4000-8000-000000000004'::uuid, 'metrics:buyer:with-app:phase5', 2, 900, 2, 700, 100, 0, 1000, 900, true, 450, 0, '2026-07-16 00:00:00+00', '2026-07-16 00:00:00+00'),
  ('45000000-0000-4000-8000-000000000001'::uuid, '45000000-0000-4000-8000-000000000005'::uuid, 'metrics:buyer:no-app:phase5', 1, 600, 1, 500, 600, 300, 1000, 400, false, 0, 600, '2026-07-16 00:00:00+00', '2026-07-16 00:00:00+00');

DO $$
DECLARE
  v_seller jsonb;
  v_buyer_app jsonb;
BEGIN
  v_seller := app.get_metrics_v2_seller_dashboard(
    '45000000-0000-4000-8000-000000000001'::uuid,
    'seller_admin',
    NULL,
    '2026-07-16 12:00:00+05:30'::timestamptz
  );

  IF v_seller->>'primary_demand_kind' <> 'orders' THEN
    RAISE EXCEPTION 'expected orders as primary demand, got %', v_seller->>'primary_demand_kind';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM jsonb_array_elements(v_seller->'metrics') item
    WHERE item->>'id' = 'open_primary_demand_value'
      AND (item->>'value')::numeric = 800
  ) THEN
    RAISE EXCEPTION 'seller open primary demand metric missing or wrong: %', v_seller->'metrics';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM jsonb_array_elements(v_seller->'explore') item
    WHERE item->>'id' = 'location_comparison'
      AND jsonb_array_length(item->'meta'->'locations') = 2
  ) THEN
    RAISE EXCEPTION 'seller location comparison foundation missing: %', v_seller->'explore';
  END IF;

  v_buyer_app := app.get_metrics_v2_buyer_app_dashboard(
    '45000000-0000-4000-8000-000000000001'::uuid,
    'seller_admin',
    NULL,
    '2026-07-16 12:00:00+05:30'::timestamptz
  );

  IF NOT EXISTS (
    SELECT 1 FROM jsonb_array_elements(v_buyer_app->'metrics') item
    WHERE item->>'id' = 'demand_cancellation_rate'
      AND item->>'feasibility' = 'CONDITIONAL'
  ) THEN
    RAISE EXCEPTION 'buyer app conditional cancellation metric missing: %', v_buyer_app->'metrics';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM jsonb_array_elements(v_buyer_app->'explore') item
    WHERE item->>'id' = 'adoption_by_location'
  ) THEN
    RAISE EXCEPTION 'buyer app adoption by location foundation missing: %', v_buyer_app->'explore';
  END IF;
END $$;

ROLLBACK;
