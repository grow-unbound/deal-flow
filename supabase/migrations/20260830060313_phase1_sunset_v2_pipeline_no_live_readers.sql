-- Phase 1 of the v1/v2 metrics pipeline sunset (see chat writeup for the
-- full 23-table audit; metrics_landing_kpi_snapshot is v4, untouched).
-- This phase covers only the 19 tables with ZERO live readers -- no
-- rewiring needed, nothing depends on their output. The 4 tables with a
-- live reader (warehouses_snapshot, metrics_buyer_snapshot,
-- metrics_buyer_location_snapshot, metrics_location_snapshot) are phase 2,
-- after those readers are rewired to v4 summary tables.
--
-- Every function/table here was verified via FOUR checks: (1) no app/src
-- .rpc() caller, (2) no other live app.* function calls it, (3) no
-- pg_cron job references it, (4) no enabled trigger anywhere still wires
-- it in -- PLUS a transactional dry-run (BEGIN; DROP ... CASCADE;
-- ROLLBACK;) that came back clean (no blocking FK/view dependents for any
-- of the 23 candidate tables).
--
-- Root cause, confirmed: all four checked *_snapshot tables in the
-- "location scope" family last updated 2026-08-01 -- the exact day of the
-- v4 cutover. This whole pipeline (9 live "dispatch_from_*" triggers on
-- buyers/buyer_users/estimates/invoices/order_items/orders/tenant_brands/
-- tenant_inventory/tenant_products, firing on every write) was left wired
-- to call refresh_* functions that write tables nothing has read since.
--
-- Step 1: dispatch_from_inventory is the only trigger of the 6 touched
-- here that ALSO does live work (refresh_warehouses_snapshot -- kept for
-- phase 2). Surgically remove only its 5 dead calls (kpi_product_daily,
-- products/categories/locations_snapshot, kpi_warehouse_daily); the
-- v_old_location/v_new_location/v_today locals existed only to feed those
-- removed calls, dropped too.
CREATE OR REPLACE FUNCTION app.dispatch_from_inventory()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'app'
AS $function$
DECLARE
  v_old_product_id uuid;
  v_new_product_id uuid;
  v_old_warehouse_id uuid;
  v_new_warehouse_id uuid;
  v_tenant uuid;
BEGIN
  IF app.sync_trigger_bypass_active() THEN RETURN NULL; END IF;

  v_old_product_id := CASE WHEN TG_OP <> 'INSERT' THEN OLD.tenant_product_id ELSE NULL END;
  v_new_product_id := CASE WHEN TG_OP <> 'DELETE' THEN NEW.tenant_product_id ELSE NULL END;
  v_old_warehouse_id := CASE WHEN TG_OP <> 'INSERT' THEN OLD.warehouse_id ELSE NULL END;
  v_new_warehouse_id := CASE WHEN TG_OP <> 'DELETE' THEN NEW.warehouse_id ELSE NULL END;

  SELECT tenant_id
  INTO v_tenant
  FROM app.tenant_products
  WHERE id = COALESCE(v_new_product_id, v_old_product_id);

  IF v_tenant IS NULL THEN RETURN NULL; END IF;

  IF v_old_warehouse_id IS NOT NULL THEN
    PERFORM app.refresh_warehouses_snapshot(v_old_warehouse_id);
  END IF;
  IF v_new_warehouse_id IS NOT NULL
     AND v_new_warehouse_id IS DISTINCT FROM v_old_warehouse_id
  THEN
    PERFORM app.refresh_warehouses_snapshot(v_new_warehouse_id);
  END IF;

  RETURN NULL;
END;
$function$;

-- Step 2: these 5 dispatch_from_* trigger functions had NO other logic
-- besides dead refresh_* calls -- confirmed by reading each full body.
-- Dropping with CASCADE removes the (now permanently no-op) trigger too,
-- rather than leaving a dead trigger installed on a hot table.
DROP FUNCTION IF EXISTS app.dispatch_from_tenant_brands() CASCADE;
DROP FUNCTION IF EXISTS app.dispatch_from_tenant_products() CASCADE;
DROP FUNCTION IF EXISTS app.dispatch_from_buyer_users() CASCADE;
DROP FUNCTION IF EXISTS app.dispatch_from_buyers() CASCADE;
DROP FUNCTION IF EXISTS app.dispatch_from_order_items() CASCADE;

-- Step 3: the 18 refresh_* writer functions for the 19 no-live-reader
-- tables (refresh_warehouses_snapshot excluded -- still called by
-- dispatch_from_inventory above, phase 2 territory).
DROP FUNCTION IF EXISTS app.refresh_brands_snapshot(p_tenant_id uuid) CASCADE;
DROP FUNCTION IF EXISTS app.refresh_products_snapshot(p_tenant_id uuid) CASCADE;
DROP FUNCTION IF EXISTS app.refresh_categories_snapshot(p_tenant_id uuid) CASCADE;
DROP FUNCTION IF EXISTS app.refresh_buyer_app_snapshot(p_tenant_id uuid) CASCADE;
DROP FUNCTION IF EXISTS app.refresh_locations_snapshot(p_location_id uuid) CASCADE;
DROP FUNCTION IF EXISTS app.refresh_estimates_snapshot(p_tenant_id uuid) CASCADE;
DROP FUNCTION IF EXISTS app.refresh_invoices_snapshot(p_tenant_id uuid) CASCADE;
DROP FUNCTION IF EXISTS app.refresh_orders_snapshot(p_tenant_id uuid) CASCADE;
DROP FUNCTION IF EXISTS app.refresh_kpi_tenant_daily(p_tenant_id uuid, p_day date) CASCADE;
DROP FUNCTION IF EXISTS app.refresh_kpi_product_daily(p_tenant_id uuid, p_tenant_product_id uuid, p_day date) CASCADE;
DROP FUNCTION IF EXISTS app.refresh_kpi_category_daily(p_tenant_id uuid, p_category_id uuid, p_day date) CASCADE;
DROP FUNCTION IF EXISTS app.refresh_kpi_brand_daily(p_tenant_id uuid, p_brand_id uuid, p_day date) CASCADE;
DROP FUNCTION IF EXISTS app.refresh_kpi_warehouse_daily(p_tenant_id uuid, p_warehouse_id uuid, p_day date) CASCADE;
DROP FUNCTION IF EXISTS app.refresh_buyer_app_daily(p_tenant_id uuid, p_date date) CASCADE;
DROP FUNCTION IF EXISTS app.refresh_kpi_estimates_daily(p_tenant_id uuid, p_day date) CASCADE;
DROP FUNCTION IF EXISTS app.refresh_kpi_invoices_daily(p_tenant_id uuid, p_day date) CASCADE;
DROP FUNCTION IF EXISTS app.refresh_kpi_location_daily(p_tenant_id uuid, p_location_id uuid, p_day date) CASCADE;
DROP FUNCTION IF EXISTS app.refresh_kpi_orders_daily(p_tenant_id uuid, p_day date) CASCADE;

-- Step 4: the entire dead admin/rebuild/freshness chain. None of these
-- have a live entry point (app code, cron, or enabled trigger) anywhere --
-- tick_repair_jobs (top of the chain) has zero callers of any kind.
DROP FUNCTION IF EXISTS app.get_tenant_aggregate_freshness(p_tenant_id uuid, p_stale_after interval) CASCADE;
DROP FUNCTION IF EXISTS app._run_metrics_analysis_for_tenant_range(p_tenant_id uuid, p_start_day date, p_end_day date, p_stale_after interval) CASCADE;
DROP FUNCTION IF EXISTS app.rebuild_metrics_for_tenant_range(p_tenant_id uuid, p_start_day date, p_end_day date, p_include_snapshots boolean, p_include_kpis boolean, p_tenant_product_ids uuid[]) CASCADE;
DROP FUNCTION IF EXISTS app.run_metrics_analysis_for_tenant(p_tenant_id uuid, p_days integer) CASCADE;
DROP PROCEDURE IF EXISTS app.tick_repair_jobs() CASCADE;
DROP FUNCTION IF EXISTS app._metrics_refresh_location_scopes(p_owner_token uuid, p_fencing_epoch bigint, p_tenant_id uuid) CASCADE;
DROP FUNCTION IF EXISTS app.prune_kpi_daily_old_rows(p_retention_days integer) CASCADE;
DROP FUNCTION IF EXISTS app.rebuild_kpi_brand_daily_for_tenant(p_tenant_id uuid, p_days integer) CASCADE;
DROP FUNCTION IF EXISTS app.rebuild_kpi_category_daily_for_tenant(p_tenant_id uuid, p_days integer) CASCADE;
DROP FUNCTION IF EXISTS app.rebuild_kpi_estimates_daily_for_tenant(p_tenant_id uuid, p_days integer) CASCADE;
DROP FUNCTION IF EXISTS app.rebuild_kpi_invoices_daily_for_tenant(p_tenant_id uuid, p_days integer) CASCADE;
DROP FUNCTION IF EXISTS app.rebuild_kpi_location_daily_for_tenant(p_tenant_id uuid, p_days integer) CASCADE;
DROP FUNCTION IF EXISTS app.rebuild_kpi_orders_daily_for_tenant(p_tenant_id uuid, p_days integer) CASCADE;
DROP FUNCTION IF EXISTS app.rebuild_kpi_product_daily_for_tenant(p_tenant_id uuid, p_days integer) CASCADE;
DROP FUNCTION IF EXISTS app.rebuild_kpi_tenant_daily_for_tenant(p_tenant_id uuid, p_days integer) CASCADE;
DROP FUNCTION IF EXISTS app.rebuild_kpi_warehouse_daily_for_tenant(p_tenant_id uuid, p_days integer) CASCADE;

-- Step 5: two orphaned trigger-function definitions (not attached to any
-- table as an actual trigger -- confirmed via pg_trigger -- leftover from
-- whatever preceded the dispatch_from_* pattern).
DROP FUNCTION IF EXISTS app.trg_refresh_kpi_from_inventory() CASCADE;
DROP FUNCTION IF EXISTS app.trg_refresh_kpi_from_order_items() CASCADE;

-- Step 6: search_buyer_app_access (non-v2) -- confirmed zero app callers
-- (only search_buyer_app_access_v2 is called live, from
-- app/api/tenant/buyer-app/access/route.ts). Dead sibling, not part of
-- the phase 2 rewiring (that targets the _v2 function only).
DROP FUNCTION IF EXISTS app.search_buyer_app_access(p_tenant_id uuid, p_query text, p_segment text, p_last_ordered text, p_sort text, p_location_ids uuid[], p_limit integer, p_offset integer, p_include_summary boolean) CASCADE;

-- Step 7: the 19 tables themselves. warehouses_snapshot, metrics_buyer_
-- snapshot, metrics_buyer_location_snapshot, metrics_location_snapshot
-- are deliberately NOT here -- phase 2, after their live readers are
-- rewired.
DROP TABLE IF EXISTS app.brands_snapshot;
DROP TABLE IF EXISTS app.buyer_app_snapshot;
DROP TABLE IF EXISTS app.categories_snapshot;
DROP TABLE IF EXISTS app.estimates_snapshot;
DROP TABLE IF EXISTS app.invoices_snapshot;
DROP TABLE IF EXISTS app.locations_snapshot;
DROP TABLE IF EXISTS app.orders_snapshot;
DROP TABLE IF EXISTS app.products_snapshot;
DROP TABLE IF EXISTS app.metrics_product_location_snapshot;
DROP TABLE IF EXISTS app.kpi_brand_daily;
DROP TABLE IF EXISTS app.kpi_buyer_app_daily;
DROP TABLE IF EXISTS app.kpi_category_daily;
DROP TABLE IF EXISTS app.kpi_estimates_daily;
DROP TABLE IF EXISTS app.kpi_invoices_daily;
DROP TABLE IF EXISTS app.kpi_location_daily;
DROP TABLE IF EXISTS app.kpi_orders_daily;
DROP TABLE IF EXISTS app.kpi_product_daily;
DROP TABLE IF EXISTS app.kpi_tenant_daily;
DROP TABLE IF EXISTS app.kpi_warehouse_daily;
