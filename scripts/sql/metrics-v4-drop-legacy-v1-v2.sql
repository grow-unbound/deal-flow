-- Metrics V4 legacy cleanup audit script.
--
-- Read-only by default. Run after frontend/API cutover to Metrics V4. The
-- destructive section stays commented and should be promoted into a real
-- migration only after every audit section below returns what it says it should.
--
-- ============================================================================
-- READ THIS BEFORE DROPPING ANYTHING
-- ============================================================================
-- The naming is actively misleading. Objects called `metrics_v2_*` are NOT all
-- v2. V2 and V4 SHARE the capture/dispatch/lease framework -- they differ in
-- the compute and storage layers only. An earlier revision of this script
-- proposed dropping the entire v2-named surface; doing so would have silently
-- killed V4. Specifically:
--
--   1. The 14 trg_metrics_v2_capture_* triggers all call app.metrics_mark_dirty.
--      They are V4's ONLY input. Dropping them empties app.metrics_dirty_work
--      permanently -- no error is raised, metrics simply freeze.
--
--   2. app.metrics_refresh_tick (the V4 tick) reads four *_snapshot tables in
--      its acknowledge stage to compute source_watermark:
--        metrics_tenant_commercial_snapshot, metrics_tenant_inventory_snapshot,
--        metrics_tenant_buyer_app_snapshot,  metrics_tenant_setup_snapshot
--      and app._metrics_v4_refresh_landing_kpis reads metrics_product_snapshot,
--      warehouses_snapshot and buyer_app_snapshot.
--
--   3. The pg_cron job is literally named `metrics-v2-refresh-tick` but runs
--      the V4 tick. Never unschedule it as part of "v2 cleanup".
--
-- Verified against the live database on 2026-08-04. Re-run sections 3-6 before
-- acting; do not trust the lists below if the schema has moved on.
-- ============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. KEEP -- V4 runtime tables. Dropping any of these breaks the tick.
-- ---------------------------------------------------------------------------
WITH keep_tables(table_name, reason) AS (
  VALUES
    -- operational framework (shared by v2 and v4)
    ('metrics_dirty_work',                 'V4 work queue -- fed by the capture triggers'),
    ('metrics_execution_history',          'V4 tick history / failure record'),
    ('metrics_refresh_leases',             'V4 global + tenant_domain leases'),
    ('metrics_refresh_state',              'V4 freshness state'),
    ('metrics_runtime_control',            'V4 budgets + dispatch switch'),
    -- v4 storage
    ('metrics_tenant_period_summary',      'V4'),
    ('metrics_buyer_period_summary',       'V4'),
    ('metrics_product_period_summary',     'V4'),
    ('metrics_brand_period_summary',       'V4'),
    ('metrics_category_period_summary',    'V4'),
    ('metrics_location_period_summary',    'V4'),
    ('metrics_warehouse_period_summary',   'V4'),
    ('metrics_campaign_period_summary',    'V4'),
    ('metrics_cohort_period_summary',      'V4'),
    ('metrics_buyer_now_summary',          'V4'),
    ('metrics_location_now_summary',       'V4'),
    ('metrics_tenant_now_summary',         'V4'),
    ('metrics_landing_kpi_snapshot',       'V4 read path (get_landing_metrics_v4)'),
    ('metrics_tenant_top80_cache',         'V4 top80 daily'),
    ('metrics_v4_period_drift_log',        'V4 drift detector output'),
    -- legacy-NAMED but read by V4 -- these are the traps
    ('metrics_tenant_commercial_snapshot', 'READ BY metrics_refresh_tick (acknowledge/source_watermark)'),
    ('metrics_tenant_inventory_snapshot',  'READ BY metrics_refresh_tick (acknowledge/source_watermark)'),
    ('metrics_tenant_buyer_app_snapshot',  'READ BY metrics_refresh_tick (acknowledge/source_watermark)'),
    ('metrics_tenant_setup_snapshot',      'READ BY metrics_refresh_tick (acknowledge/source_watermark)'),
    ('buyer_app_snapshot',                 'READ BY metrics_refresh_tick'),
    ('metrics_product_snapshot',           'READ BY _metrics_v4_refresh_landing_kpis'),
    ('warehouses_snapshot',                'READ BY _metrics_v4_refresh_landing_kpis')
)
SELECT k.table_name, k.reason, to_regclass('app.' || k.table_name) IS NOT NULL AS exists_now
FROM keep_tables k ORDER BY k.table_name;

-- ---------------------------------------------------------------------------
-- 2. CANDIDATE DROP -- legacy tables with no verified V4 reader.
--    Section 4 re-proves this. Do not drop on the strength of this list alone.
-- ---------------------------------------------------------------------------
WITH drop_tables(table_name) AS (
  VALUES
    ('brands_snapshot'), ('categories_snapshot'), ('estimates_snapshot'),
    ('invoices_snapshot'), ('locations_snapshot'), ('orders_snapshot'),
    ('products_snapshot'),
    ('kpi_brand_daily'), ('kpi_buyer_app_daily'), ('kpi_category_daily'),
    ('kpi_estimates_daily'), ('kpi_invoices_daily'), ('kpi_location_daily'),
    ('kpi_orders_daily'), ('kpi_product_daily'), ('kpi_tenant_daily'),
    ('kpi_warehouse_daily'),
    ('metrics_buyer_location_snapshot'), ('metrics_buyer_snapshot'),
    ('metrics_location_daily'), ('metrics_location_snapshot'),
    ('metrics_product_location_snapshot'), ('metrics_tenant_daily')
)
SELECT d.table_name,
       to_regclass('app.' || d.table_name) IS NOT NULL AS exists_now,
       c.reltuples::bigint AS estimated_rows,
       pg_size_pretty(COALESCE(pg_total_relation_size(to_regclass('app.' || d.table_name)), 0)) AS size
FROM drop_tables d
LEFT JOIN pg_catalog.pg_class c ON c.oid = to_regclass('app.' || d.table_name)
ORDER BY d.table_name;

-- ---------------------------------------------------------------------------
-- 3. KEEP -- triggers and functions that feed V4. MUST NOT be dropped.
--    Expect all 14 capture triggers with feeds_v4_dirty_queue = true.
-- ---------------------------------------------------------------------------
SELECT t.tgname AS trigger_name, c.relname AS on_table, p.proname AS calls_function,
       position('metrics_mark_dirty' IN pg_get_functiondef(p.oid)) > 0 AS feeds_v4_dirty_queue
FROM pg_trigger t
JOIN pg_class c ON c.oid = t.tgrelid
JOIN pg_namespace n ON n.oid = c.relnamespace
JOIN pg_proc p ON p.oid = t.tgfoid
WHERE n.nspname = 'app' AND NOT t.tgisinternal
  AND (t.tgname ILIKE '%metrics_v2_capture%' OR p.proname ILIKE 'metrics_capture_%')
ORDER BY c.relname;

-- ---------------------------------------------------------------------------
-- 4. SAFETY GATE -- any candidate-drop table still referenced by a V4 function.
--    MUST RETURN ZERO ROWS before promoting section 7.
-- ---------------------------------------------------------------------------
WITH drop_tables(table_name) AS (
  VALUES
    ('brands_snapshot'), ('categories_snapshot'), ('estimates_snapshot'),
    ('invoices_snapshot'), ('locations_snapshot'), ('orders_snapshot'),
    ('products_snapshot'),
    ('kpi_brand_daily'), ('kpi_buyer_app_daily'), ('kpi_category_daily'),
    ('kpi_estimates_daily'), ('kpi_invoices_daily'), ('kpi_location_daily'),
    ('kpi_orders_daily'), ('kpi_product_daily'), ('kpi_tenant_daily'),
    ('kpi_warehouse_daily'),
    ('metrics_buyer_location_snapshot'), ('metrics_buyer_snapshot'),
    ('metrics_location_daily'), ('metrics_location_snapshot'),
    ('metrics_product_location_snapshot'), ('metrics_tenant_daily')
), v4_functions(fn) AS (
  VALUES
    ('metrics_refresh_tick'), ('metrics_claim_dirty_work'), ('metrics_mark_dirty'),
    ('metrics_mark_reconciliation'), ('metrics_release_expired_leases'),
    ('metrics_dispatch_enabled'), ('metrics_source_type_valid'), ('metrics_inspect'),
    ('_metrics_assert_refresh_fence'), ('_metrics_refresh_commercial'),
    ('_metrics_refresh_inventory'), ('_metrics_refresh_buyer_app'), ('_metrics_refresh_setup'),
    ('_metrics_v4_refresh_claimed_periods'), ('_metrics_v4_refresh_landing_kpis'),
    ('_metrics_v4_upsert_landing_kpis'), ('_metrics_v4_refresh_setup_now'),
    ('_metrics_v4_backfill_driver'), ('get_landing_metrics_v4'),
    ('metrics_v4_refresh_top80_daily'), ('metrics_v4_check_period_drift'),
    ('metrics_v4_period_bounds'), ('metrics_v4_period_windows'), ('metrics_v4_kpi'),
    ('metrics_v4_primary_demand_kind'), ('metrics_prune_operational_history'),
    ('metrics_prune_landing_kpi_snapshots')
)
SELECT dt.table_name, v.fn AS still_referenced_by
FROM drop_tables dt
JOIN v4_functions v ON true
JOIN pg_proc p ON p.proname = v.fn
JOIN pg_namespace n ON n.oid = p.pronamespace AND n.nspname = 'app'
WHERE pg_get_functiondef(p.oid) ILIKE '%' || dt.table_name || '%'
ORDER BY dt.table_name, v.fn;

-- ---------------------------------------------------------------------------
-- 5. CRON. The v2-NAMED tick job runs V4 -- keep it.
-- ---------------------------------------------------------------------------
SELECT jobname, schedule, active,
       CASE jobname
         WHEN 'metrics-v2-refresh-tick'            THEN 'KEEP -- this IS the V4 tick despite the name'
         WHEN 'metrics-v4-top80-daily'             THEN 'KEEP -- V4'
         WHEN 'metrics-prune-operational-history'  THEN 'KEEP -- V4 housekeeping'
         WHEN 'metrics-prune-landing-snapshots'    THEN 'KEEP -- V4 housekeeping'
         WHEN 'metrics-v4-period-drift-check'      THEN 'KEEP -- V4 correctness guard'
         WHEN 'warehouses-snapshot-freshness'      THEN 'KEEP -- maintains warehouses_snapshot, read by V4 landing KPIs'
         WHEN 'metrics-v2-daily-reconciliation'    THEN 'DROP CANDIDATE -- verify V4 does not rely on the sweep first'
         ELSE 'review'
       END AS verdict
FROM cron.job
WHERE jobname ILIKE '%metric%' OR jobname ILIKE '%snapshot%' OR command ILIKE '%metric%'
ORDER BY verdict, jobname;

-- ---------------------------------------------------------------------------
-- 6. CANDIDATE DROP -- legacy functions. V4-required names are excluded.
--    Note metrics_capture_* is deliberately NOT here: those feed V4.
-- ---------------------------------------------------------------------------
SELECT n.nspname || '.' || p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')' AS function_name
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'app'
  AND (
    p.proname ILIKE 'refresh_kpi_%' OR p.proname ILIKE 'rebuild_kpi_%'
    OR p.proname ILIKE 'refresh_%snapshot%'
    OR p.proname ILIKE 'get_metrics_v2_%'
    OR p.proname ILIKE 'metrics_v2_%landing%'
    OR p.proname IN (
      'metrics_v2_detail_card', 'metrics_v2_empty_card_body', 'metrics_v2_foundation_item',
      'metrics_v2_assert_detail_period', 'metrics_v2_primary_demand_kind',
      'metrics_v2_run_daily_reconciliation_sweep',
      'ensure_metrics_v2_daily_reconciliation_cron_scheduled',
      'get_seller_category_landing_page_metrics_v1', 'get_seller_category_landing_page_metrics_v2',
      'get_seller_warehouse_landing_row_metrics_v2', 'get_seller_location_landing_row_metrics',
      'prune_kpi_daily_old_rows', 'post_sync_rebuild'
    )
  )
  -- never propose dropping anything V4 needs
  AND p.proname NOT IN (
    'refresh_all_warehouses_snapshots',  -- maintains warehouses_snapshot (V4 landing KPIs)
    'refresh_warehouses_snapshot',
    'refresh_products_snapshot'          -- maintains metrics_product_snapshot (V4 landing KPIs)
  )
ORDER BY function_name;

-- ---------------------------------------------------------------------------
-- 7. Candidate destructive cleanup, intentionally commented.
--    Promote ONLY after: section 4 returns zero rows, the frontend no longer
--    calls any get_metrics_v2_* / metrics_v2_*_landing RPC, and section 3 is
--    left untouched.
--
--    Ordered read-path first so a mistake surfaces as a failing API call rather
--    than a silently frozen pipeline.
-- ---------------------------------------------------------------------------
--
-- -- 7a. v2 read RPCs (safe once the frontend is on get_landing_metrics_v4)
-- DROP FUNCTION IF EXISTS app.get_metrics_v2_seller_dashboard(uuid, text, uuid[], timestamptz);
-- DROP FUNCTION IF EXISTS app.get_metrics_v2_buyer_app_dashboard(uuid, text, uuid[], timestamptz);
-- DROP FUNCTION IF EXISTS app.get_metrics_v2_customer_summary(uuid, uuid[], timestamptz);
-- DROP FUNCTION IF EXISTS app.metrics_v2_customers_landing(uuid, uuid[], text, text[], text[], integer, text, uuid, timestamptz, text);
-- DROP FUNCTION IF EXISTS app.metrics_v2_products_landing(uuid, uuid[], text, text[], text[], text[], text[], integer, timestamptz, uuid, timestamptz);
-- DROP FUNCTION IF EXISTS app.metrics_v2_transaction_landing(uuid, text, uuid[], timestamptz);
-- DROP FUNCTION IF EXISTS app.metrics_v2_detail_card(text, text, text, text, text, text, jsonb);
-- DROP FUNCTION IF EXISTS app.metrics_v2_empty_card_body(text, text, text);
-- DROP FUNCTION IF EXISTS app.metrics_v2_foundation_item(text, text, text, text, numeric, bigint, text, boolean, text, jsonb);
-- DROP FUNCTION IF EXISTS app.metrics_v2_assert_detail_period(text, text[]);
-- DROP FUNCTION IF EXISTS app.metrics_v2_primary_demand_kind(uuid);
--
-- -- 7b. the v2 reconciliation sweep + its cron
-- SELECT cron.unschedule('metrics-v2-daily-reconciliation');
-- DROP FUNCTION IF EXISTS app.metrics_v2_run_daily_reconciliation_sweep();
-- DROP FUNCTION IF EXISTS app.ensure_metrics_v2_daily_reconciliation_cron_scheduled();
--
-- -- 7c. kpi_daily refresh/rebuild layer
-- DROP FUNCTION IF EXISTS app.refresh_kpi_tenant_daily(uuid, date);
-- DROP FUNCTION IF EXISTS app.refresh_kpi_invoices_daily(uuid, date);
-- DROP FUNCTION IF EXISTS app.refresh_kpi_estimates_daily(uuid, date);
-- DROP FUNCTION IF EXISTS app.refresh_kpi_orders_daily(uuid, date);
-- DROP FUNCTION IF EXISTS app.refresh_kpi_brand_daily(uuid, uuid, date);
-- DROP FUNCTION IF EXISTS app.refresh_kpi_category_daily(uuid, uuid, date);
-- DROP FUNCTION IF EXISTS app.refresh_kpi_location_daily(uuid, uuid, date);
-- DROP FUNCTION IF EXISTS app.refresh_kpi_product_daily(uuid, uuid, date);
-- DROP FUNCTION IF EXISTS app.refresh_kpi_warehouse_daily(uuid, uuid, date);
-- DROP FUNCTION IF EXISTS app.rebuild_kpi_tenant_daily_for_tenant(uuid, integer);
-- DROP FUNCTION IF EXISTS app.rebuild_kpi_invoices_daily_for_tenant(uuid, integer);
-- DROP FUNCTION IF EXISTS app.rebuild_kpi_estimates_daily_for_tenant(uuid, integer);
-- DROP FUNCTION IF EXISTS app.rebuild_kpi_orders_daily_for_tenant(uuid, integer);
-- DROP FUNCTION IF EXISTS app.rebuild_kpi_brand_daily_for_tenant(uuid, integer);
-- DROP FUNCTION IF EXISTS app.rebuild_kpi_category_daily_for_tenant(uuid, integer);
-- DROP FUNCTION IF EXISTS app.rebuild_kpi_location_daily_for_tenant(uuid, integer);
-- DROP FUNCTION IF EXISTS app.rebuild_kpi_product_daily_for_tenant(uuid, integer);
-- DROP FUNCTION IF EXISTS app.rebuild_kpi_warehouse_daily_for_tenant(uuid, integer);
--
-- -- 7d. legacy snapshot refreshers WITHOUT a V4 reader
-- --     (refresh_all_warehouses_snapshots / refresh_warehouses_snapshot /
-- --      refresh_products_snapshot are deliberately NOT dropped -- V4 landing
-- --      KPIs read warehouses_snapshot and metrics_product_snapshot.)
-- DROP FUNCTION IF EXISTS app.refresh_brands_snapshot(uuid);
-- DROP FUNCTION IF EXISTS app.refresh_categories_snapshot(uuid);
-- DROP FUNCTION IF EXISTS app.refresh_estimates_snapshot(uuid);
-- DROP FUNCTION IF EXISTS app.refresh_invoices_snapshot(uuid);
-- DROP FUNCTION IF EXISTS app.refresh_orders_snapshot(uuid);
-- DROP FUNCTION IF EXISTS app.refresh_locations_snapshot(uuid);
-- DROP FUNCTION IF EXISTS app.refresh_buyer_app_snapshot(uuid);
--
-- -- 7e. legacy tables (only those section 4 proved unreferenced)
-- DROP TABLE IF EXISTS app.brands_snapshot;
-- DROP TABLE IF EXISTS app.categories_snapshot;
-- DROP TABLE IF EXISTS app.estimates_snapshot;
-- DROP TABLE IF EXISTS app.invoices_snapshot;
-- DROP TABLE IF EXISTS app.locations_snapshot;
-- DROP TABLE IF EXISTS app.orders_snapshot;
-- DROP TABLE IF EXISTS app.products_snapshot;
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
-- DROP TABLE IF EXISTS app.metrics_tenant_daily;
--
-- -- DO NOT DROP, for the avoidance of doubt:
-- --   * any trg_metrics_v2_capture_* trigger        -> V4's only input
-- --   * any app.metrics_capture_* function          -> ditto
-- --   * cron job 'metrics-v2-refresh-tick'          -> IS the V4 tick
-- --   * metrics_tenant_{commercial,inventory,buyer_app,setup}_snapshot
-- --   * buyer_app_snapshot, metrics_product_snapshot, warehouses_snapshot
-- --   * app.metrics_dirty_work / _execution_history / _refresh_leases /
-- --     _refresh_state / _runtime_control

ROLLBACK;
