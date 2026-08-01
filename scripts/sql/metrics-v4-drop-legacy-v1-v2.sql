-- Metrics V4 legacy cleanup audit script.
--
-- Read-only by default. Run this after frontend/API cutover to Metrics V4 and
-- after all V4 reconciliation scripts pass. The destructive DROP section is
-- intentionally commented and should be promoted into a real migration only
-- after the audit sections return no unexpected dependencies.

BEGIN;

-- 1. Legacy metrics-like tables currently present in production on 2026-07-31.
WITH expected_legacy_tables(table_name) AS (
  VALUES
    ('brands_snapshot'),
    ('buyer_app_snapshot'),
    ('categories_snapshot'),
    ('estimates_snapshot'),
    ('invoices_snapshot'),
    ('locations_snapshot'),
    ('orders_snapshot'),
    ('products_snapshot'),
    ('warehouses_snapshot'),
    ('kpi_brand_daily'),
    ('kpi_buyer_app_daily'),
    ('kpi_category_daily'),
    ('kpi_estimates_daily'),
    ('kpi_invoices_daily'),
    ('kpi_location_daily'),
    ('kpi_orders_daily'),
    ('kpi_product_daily'),
    ('kpi_tenant_daily'),
    ('kpi_warehouse_daily'),
    ('metrics_buyer_location_snapshot'),
    ('metrics_buyer_snapshot'),
    ('metrics_location_daily'),
    ('metrics_location_snapshot'),
    ('metrics_product_location_snapshot'),
    ('metrics_product_snapshot'),
    ('metrics_tenant_buyer_app_snapshot'),
    ('metrics_tenant_commercial_snapshot'),
    ('metrics_tenant_daily'),
    ('metrics_tenant_inventory_snapshot'),
    ('metrics_tenant_setup_snapshot')
)
SELECT e.table_name,
       to_regclass('app.' || e.table_name) IS NOT NULL AS exists_now,
       c.relrowsecurity AS rls_enabled,
       c.reltuples::bigint AS estimated_rows
FROM expected_legacy_tables e
LEFT JOIN pg_catalog.pg_class c ON c.oid = to_regclass('app.' || e.table_name)
ORDER BY e.table_name;

-- 2. Operational metrics tables to keep unless replacing the tick framework.
WITH operational_tables(table_name) AS (
  VALUES
    ('metrics_dirty_work'),
    ('metrics_execution_history'),
    ('metrics_refresh_leases'),
    ('metrics_refresh_state'),
    ('metrics_runtime_control')
)
SELECT table_name, to_regclass('app.' || table_name) IS NOT NULL AS exists_now
FROM operational_tables
ORDER BY table_name;

-- 3. Functions still referencing legacy table names. This must be empty, except
-- for intentionally retained operational functions, before any DROP TABLE.
WITH legacy_tables(table_name) AS (
  VALUES
    ('brands_snapshot'), ('buyer_app_snapshot'), ('categories_snapshot'),
    ('estimates_snapshot'), ('invoices_snapshot'), ('locations_snapshot'),
    ('orders_snapshot'), ('products_snapshot'), ('warehouses_snapshot'),
    ('kpi_brand_daily'), ('kpi_buyer_app_daily'), ('kpi_category_daily'),
    ('kpi_estimates_daily'), ('kpi_invoices_daily'), ('kpi_location_daily'),
    ('kpi_orders_daily'), ('kpi_product_daily'), ('kpi_tenant_daily'),
    ('kpi_warehouse_daily'), ('metrics_buyer_location_snapshot'),
    ('metrics_buyer_snapshot'), ('metrics_location_daily'),
    ('metrics_location_snapshot'), ('metrics_product_location_snapshot'),
    ('metrics_product_snapshot'), ('metrics_tenant_buyer_app_snapshot'),
    ('metrics_tenant_commercial_snapshot'), ('metrics_tenant_daily'),
    ('metrics_tenant_inventory_snapshot'), ('metrics_tenant_setup_snapshot')
), funcs AS (
  SELECT n.nspname || '.' || p.proname || '(' || pg_catalog.pg_get_function_identity_arguments(p.oid) || ')' AS function_name,
         pg_catalog.pg_get_functiondef(p.oid) AS function_def
  FROM pg_catalog.pg_proc p
  JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'app'
)
SELECT lt.table_name, f.function_name
FROM legacy_tables lt
JOIN funcs f ON f.function_def ILIKE '%' || lt.table_name || '%'
ORDER BY lt.table_name, f.function_name;

-- 4. Legacy capture/refresh triggers. Drop these only after V4 capture/refresh
-- has fully replaced them.
SELECT event_object_table AS table_name,
       trigger_name,
       action_statement
FROM information_schema.triggers
WHERE trigger_schema = 'app'
  AND (
    trigger_name ILIKE '%metrics_v1%'
    OR trigger_name ILIKE '%metrics_v2%'
    OR action_statement ILIKE '%refresh_%snapshot%'
    OR action_statement ILIKE '%refresh_kpi%'
    OR action_statement ILIKE '%metrics_capture_%'
  )
ORDER BY table_name, trigger_name;

-- 5. Legacy metrics functions by name/body. This is intentionally broad.
SELECT n.nspname || '.' || p.proname || '(' || pg_catalog.pg_get_function_identity_arguments(p.oid) || ')' AS function_name
FROM pg_catalog.pg_proc p
JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'app'
  AND (
    p.proname ILIKE '%metrics_v1%'
    OR p.proname ILIKE '%metrics_v2%'
    OR p.proname ILIKE 'refresh_%snapshot%'
    OR p.proname ILIKE 'refresh_kpi_%'
    OR p.proname ILIKE 'rebuild_kpi_%'
    OR p.proname ILIKE 'dispatch_from_%'
    OR p.proname ILIKE 'trg_refresh_%snapshot%'
    OR p.proname ILIKE 'trg_refresh_kpi_%'
    OR p.proname ILIKE 'metrics_capture_%'
    OR p.proname IN (
      '_run_metrics_analysis_for_tenant_range',
      'post_sync_rebuild',
      'prune_kpi_daily_old_rows',
      'rebuild_metrics_for_tenant_range'
    )
  )
ORDER BY function_name;

-- 6. Candidate destructive cleanup, intentionally commented.
-- Promote to a migration only after sections 3-5 are clean/expected.
--
-- DROP TRIGGER IF EXISTS trg_metrics_v2_capture_buyer_app_activity ON app.buyer_app_activity;
-- DROP TRIGGER IF EXISTS trg_metrics_v2_capture_buyer_users ON app.buyer_users;
-- DROP TRIGGER IF EXISTS trg_metrics_v2_capture_buyers ON app.buyers;
-- DROP TRIGGER IF EXISTS trg_metrics_v2_capture_estimate_items ON app.estimate_items;
-- DROP TRIGGER IF EXISTS trg_metrics_v2_capture_estimates ON app.estimates;
-- DROP TRIGGER IF EXISTS trg_metrics_v2_capture_invoice_items ON app.invoice_items;
-- DROP TRIGGER IF EXISTS trg_metrics_v2_capture_invoices ON app.invoices;
-- DROP TRIGGER IF EXISTS trg_metrics_v2_capture_locations ON app.locations;
-- DROP TRIGGER IF EXISTS trg_metrics_v2_capture_order_items ON app.order_items;
-- DROP TRIGGER IF EXISTS trg_metrics_v2_capture_orders ON app.orders;
-- DROP TRIGGER IF EXISTS trg_metrics_v2_capture_tenant_brands ON app.tenant_brands;
-- DROP TRIGGER IF EXISTS trg_metrics_v2_capture_inventory ON app.tenant_inventory;
-- DROP TRIGGER IF EXISTS trg_metrics_v2_capture_tenant_products ON app.tenant_products;
-- DROP TRIGGER IF EXISTS trg_metrics_v2_capture_warehouses ON app.warehouses;
-- DROP TRIGGER IF EXISTS trg_metrics_location_daily_purge_soft_deleted ON app.metrics_location_daily;
-- DROP TRIGGER IF EXISTS trg_metrics_v2_post_sync_reconciliation ON app.integration_sync_jobs;
--
-- DROP FUNCTION IF EXISTS app.metrics_v2_primary_demand_kind(uuid);
-- DROP FUNCTION IF EXISTS app._metrics_legacy_refresh_commercial(uuid, bigint, uuid);
-- DROP FUNCTION IF EXISTS app._metrics_legacy_refresh_inventory(uuid, bigint, uuid);
-- DROP FUNCTION IF EXISTS app._metrics_legacy_refresh_buyer_app(uuid, bigint, uuid);
-- DROP FUNCTION IF EXISTS app._metrics_legacy_refresh_setup(uuid, bigint, uuid);
--
-- DROP TABLE IF EXISTS app.brands_snapshot;
-- DROP TABLE IF EXISTS app.buyer_app_snapshot;
-- DROP TABLE IF EXISTS app.categories_snapshot;
-- DROP TABLE IF EXISTS app.estimates_snapshot;
-- DROP TABLE IF EXISTS app.invoices_snapshot;
-- DROP TABLE IF EXISTS app.locations_snapshot;
-- DROP TABLE IF EXISTS app.orders_snapshot;
-- DROP TABLE IF EXISTS app.products_snapshot;
-- DROP TABLE IF EXISTS app.warehouses_snapshot;
-- DROP TABLE IF EXISTS app.kpi_brand_daily;
-- DROP TABLE IF EXISTS app.kpi_buyer_app_daily;
-- DROP TABLE IF EXISTS app.kpi_category_daily;
-- DROP TABLE IF EXISTS app.kpi_estimates_daily;
-- DROP TABLE IF EXISTS app.kpi_invoices_daily;
-- DROP TABLE IF EXISTS app.kpi_location_daily;
-- DROP TABLE IF EXISTS app.kpi_orders_daily;
-- DROP TABLE IF EXISTS app.kpi_product_daily;
-- DROP TABLE IF EXISTS app.kpi_tenant_daily;
-- DROP TABLE IF EXISTS app.kpi_warehouse_daily;
-- DROP TABLE IF EXISTS app.metrics_buyer_location_snapshot;
-- DROP TABLE IF EXISTS app.metrics_buyer_snapshot;
-- DROP TABLE IF EXISTS app.metrics_location_daily;
-- DROP TABLE IF EXISTS app.metrics_location_snapshot;
-- DROP TABLE IF EXISTS app.metrics_product_location_snapshot;
-- DROP TABLE IF EXISTS app.metrics_product_snapshot;
-- DROP TABLE IF EXISTS app.metrics_tenant_buyer_app_snapshot;
-- DROP TABLE IF EXISTS app.metrics_tenant_commercial_snapshot;
-- DROP TABLE IF EXISTS app.metrics_tenant_daily;
-- DROP TABLE IF EXISTS app.metrics_tenant_inventory_snapshot;
-- DROP TABLE IF EXISTS app.metrics_tenant_setup_snapshot;

ROLLBACK;
