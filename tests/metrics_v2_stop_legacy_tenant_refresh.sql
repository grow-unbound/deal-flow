-- pgTAP coverage for the migration that strips the remaining tenant-wide V1
-- refresh calls out of the interactive order/invoice/estimate dispatch
-- triggers (20260717080952_metrics_v2_stop_legacy_tenant_refresh.sql).
--
-- Run with:
--   npx supabase test db --local tests/metrics_v2_stop_legacy_tenant_refresh.sql

BEGIN;

SELECT plan(15);

-- Removed: tenant-wide snapshot/KPI rebuilds must no longer be called from
-- any of the three dispatch functions.
SELECT ok(
  position('refresh_orders_snapshot' in pg_get_functiondef('app.dispatch_from_orders'::regproc)) = 0,
  'dispatch_from_orders no longer calls refresh_orders_snapshot'
);
SELECT ok(
  position('refresh_kpi_orders_daily' in pg_get_functiondef('app.dispatch_from_orders'::regproc)) = 0,
  'dispatch_from_orders no longer calls refresh_kpi_orders_daily'
);
SELECT ok(
  position('refresh_kpi_tenant_daily' in pg_get_functiondef('app.dispatch_from_orders'::regproc)) = 0,
  'dispatch_from_orders no longer calls refresh_kpi_tenant_daily'
);
SELECT ok(
  position('refresh_kpi_location_daily' in pg_get_functiondef('app.dispatch_from_orders'::regproc)) = 0,
  'dispatch_from_orders no longer calls refresh_kpi_location_daily'
);
SELECT ok(
  position('refresh_kpi_buyers_daily' in pg_get_functiondef('app.dispatch_from_orders'::regproc)) = 0,
  'dispatch_from_orders no longer calls refresh_kpi_buyers_daily'
);
SELECT ok(
  position('refresh_buyer_app_daily' in pg_get_functiondef('app.dispatch_from_orders'::regproc)) = 0,
  'dispatch_from_orders no longer calls refresh_buyer_app_daily'
);

SELECT ok(
  position('refresh_invoices_snapshot' in pg_get_functiondef('app.dispatch_from_invoices'::regproc)) = 0,
  'dispatch_from_invoices no longer calls refresh_invoices_snapshot'
);
SELECT ok(
  position('refresh_locations_snapshot' in pg_get_functiondef('app.dispatch_from_invoices'::regproc)) = 0,
  'dispatch_from_invoices no longer calls refresh_locations_snapshot'
);
SELECT ok(
  position('refresh_kpi_invoices_daily' in pg_get_functiondef('app.dispatch_from_invoices'::regproc)) = 0,
  'dispatch_from_invoices no longer calls refresh_kpi_invoices_daily'
);

SELECT ok(
  position('refresh_estimates_snapshot' in pg_get_functiondef('app.dispatch_from_estimates'::regproc)) = 0,
  'dispatch_from_estimates no longer calls refresh_estimates_snapshot'
);
SELECT ok(
  position('refresh_kpi_estimates_daily' in pg_get_functiondef('app.dispatch_from_estimates'::regproc)) = 0,
  'dispatch_from_estimates no longer calls refresh_kpi_estimates_daily'
);

-- Preserved: buyer-scoped refresh + buyer-app-activity sync must remain.
SELECT ok(
  position('refresh_buyers_snapshot_for_buyer' in pg_get_functiondef('app.dispatch_from_orders'::regproc)) > 0
  AND position('refresh_buyer_current_snapshot_for_buyer' in pg_get_functiondef('app.dispatch_from_orders'::regproc)) > 0
  AND position('sync_buyer_app_activity_from_order' in pg_get_functiondef('app.dispatch_from_orders'::regproc)) > 0,
  'dispatch_from_orders still calls buyer-scoped refresh and buyer-app-activity sync'
);
SELECT ok(
  position('refresh_buyers_snapshot_for_buyer' in pg_get_functiondef('app.dispatch_from_invoices'::regproc)) > 0
  AND position('refresh_buyer_current_snapshot_for_buyer' in pg_get_functiondef('app.dispatch_from_invoices'::regproc)) > 0,
  'dispatch_from_invoices still calls buyer-scoped refresh'
);
SELECT ok(
  position('refresh_buyers_snapshot_for_buyer' in pg_get_functiondef('app.dispatch_from_estimates'::regproc)) > 0
  AND position('sync_buyer_app_activity_from_estimate' in pg_get_functiondef('app.dispatch_from_estimates'::regproc)) > 0,
  'dispatch_from_estimates still calls buyer-scoped refresh and buyer-app-activity sync'
);

-- V1 objects remain physically present (not dropped by this migration).
SELECT has_function('app', 'refresh_orders_snapshot', ARRAY['uuid'], 'refresh_orders_snapshot still exists (not dropped)');

SELECT * FROM finish();
ROLLBACK;
