-- Sunset the metrics-dashboard v2 RPC lineage, per owner request: don't
-- carry v2/v3-era dead weight into the eventual ap-south-1 (Mumbai)
-- Postgres project.
--
-- Every function dropped here was verified dead via THREE checks, not
-- just a name-pattern grep (a plain grep would have wrongly flagged
-- evaluate_buyer_for_cohorts_v2 / evaluate_product_for_campaigns_v2 /
-- evaluate_product_for_price_lists_v2 -- unrelated business logic that
-- happens to share the "_v2" suffix, still live with 3 SQL callers each,
-- and metrics_v2_foundation_item, still called by the live
-- get_buyer_app_dashboard_v4 -- both correctly excluded from this list):
--   1. No app/src code calls it via .rpc('<name>', ...) (grepped, tests excluded).
--   2. No other currently-defined app.* function calls it in its body
--      (pg_get_functiondef ILIKE search across pg_proc).
--   3. No pg_cron job command references it, and no enabled trigger uses
--      it as a trigger function (checked live against cron.job / pg_trigger
--      -- this caught two the first two checks missed:
--      metrics_v2_run_daily_reconciliation_sweep is invoked daily by cron
--      job 'metrics-v2-daily-reconciliation', and
--      trg_metrics_v2_post_sync_reconciliation is an ENABLED trigger on
--      app.integration_sync_jobs -- both excluded from this drop).
--
-- Dropped, in dependency order (top-level orphaned RPCs first, then the
-- helper functions that become orphaned once those are gone):
--   get_metrics_v2_buyer_app_dashboard    -- replaced by get_buyer_app_dashboard_v4 (2026-08-29)
--   get_metrics_v2_customer_summary
--   get_seller_brand_detail_v2
--   get_seller_campaign_detail_v2
--   get_seller_category_detail_v2
--   get_seller_cohort_detail_v2
--   get_seller_customer_detail_v2
--   get_seller_location_detail_v2
--   get_seller_pricelist_detail_v2
--   get_seller_product_detail_v2
--   get_seller_warehouse_detail_v2
--   get_seller_warehouses_landing_summary_v2
--   metrics_v2_products_landing
--   search_warehouse_stock_v2
--   ensure_metrics_v2_daily_reconciliation_cron_scheduled  -- one-time cron setup, already run; cron job itself is untouched
--   metrics_v2_assert_detail_period   -- was only called by the get_seller_*_detail_v2 batch above
--   metrics_v2_detail_card            -- was only called by the get_seller_*_detail_v2 batch above
--   metrics_v2_empty_card_body        -- was only called by the get_seller_*_detail_v2 batch above
--   metrics_v2_primary_demand_kind    -- was only called by get_metrics_v2_buyer_app_dashboard + get_seller_customer_detail_v2
--
-- Explicitly NOT dropped here (confirmed live, see check above and the
-- accompanying chat writeup): metrics_v2_run_daily_reconciliation_sweep,
-- trg_metrics_v2_post_sync_reconciliation, metrics_v2_foundation_item,
-- search_buyer_app_access_v2 (live app caller:
-- app/api/tenant/buyer-app/access/route.ts), evaluate_buyer_for_cohorts_v2,
-- evaluate_product_for_campaigns_v2, evaluate_product_for_price_lists_v2.
--
-- Tables (metrics_buyer_snapshot, metrics_tenant_buyer_app_snapshot,
-- metrics_tenant_commercial_snapshot, metrics_tenant_setup_snapshot,
-- metrics_tenant_inventory_snapshot, etc.) are NOT touched by this
-- migration -- data loss is a different risk class than a function drop
-- (trivially recreated from this file if needed) and several of those
-- tables turned out to still be read by live v4 functions
-- (_metrics_v4_refresh_landing_kpis, search_seller_location_landing_ids,
-- etc.) or an unrelated live "aggregate freshness" feature
-- (get_tenant_aggregate_freshness) -- see chat for the full per-table
-- audit. Table cleanup needs its own explicitly-confirmed pass.

DROP FUNCTION IF EXISTS app.get_metrics_v2_buyer_app_dashboard(p_tenant_id uuid, p_role text, p_location_ids uuid[], p_as_of timestamp with time zone);
DROP FUNCTION IF EXISTS app.get_metrics_v2_customer_summary(p_tenant_id uuid, p_location_ids uuid[], p_as_of timestamp with time zone);
DROP FUNCTION IF EXISTS app.get_seller_brand_detail_v2(p_tenant_id uuid, p_tenant_brand_id uuid, p_period text, p_history_period text, p_limit_top integer, p_as_of timestamp with time zone);
DROP FUNCTION IF EXISTS app.get_seller_campaign_detail_v2(p_tenant_id uuid, p_campaign_id uuid, p_period text, p_history_period text, p_limit_top integer, p_as_of timestamp with time zone);
DROP FUNCTION IF EXISTS app.get_seller_category_detail_v2(p_tenant_id uuid, p_tenant_category_id uuid, p_period text, p_history_period text, p_limit_top integer, p_as_of timestamp with time zone);
DROP FUNCTION IF EXISTS app.get_seller_cohort_detail_v2(p_tenant_id uuid, p_cohort_id uuid, p_period text, p_history_period text, p_limit_top integer, p_as_of timestamp with time zone);
DROP FUNCTION IF EXISTS app.get_seller_customer_detail_v2(p_tenant_id uuid, p_buyer_id uuid, p_period text, p_history_period text, p_limit_top integer, p_as_of timestamp with time zone);
DROP FUNCTION IF EXISTS app.get_seller_location_detail_v2(p_tenant_id uuid, p_location_id uuid, p_period text, p_history_period text, p_limit_top integer, p_as_of timestamp with time zone);
DROP FUNCTION IF EXISTS app.get_seller_pricelist_detail_v2(p_tenant_id uuid, p_price_list_id uuid, p_period text, p_history_period text, p_limit_top integer, p_as_of timestamp with time zone);
DROP FUNCTION IF EXISTS app.get_seller_product_detail_v2(p_tenant_id uuid, p_tenant_product_id uuid, p_period text, p_history_period text, p_limit_top integer, p_as_of timestamp with time zone);
DROP FUNCTION IF EXISTS app.get_seller_warehouse_detail_v2(p_tenant_id uuid, p_warehouse_id uuid, p_period text, p_history_period text, p_limit_top integer, p_as_of timestamp with time zone);
DROP FUNCTION IF EXISTS app.get_seller_warehouses_landing_summary_v2(p_tenant_id uuid, p_location_ids uuid[]);
DROP FUNCTION IF EXISTS app.metrics_v2_products_landing(p_tenant_id uuid, p_location_ids uuid[], p_query text, p_brand_names text[], p_category_names text[], p_statuses text[], p_stock text[], p_limit integer, p_cursor_created_at timestamp with time zone, p_cursor_id uuid, p_as_of timestamp with time zone);
DROP FUNCTION IF EXISTS app.search_warehouse_stock_v2(p_tenant_id uuid, p_warehouse_id uuid, p_query text, p_statuses text[], p_sort text, p_limit integer, p_offset integer);
DROP FUNCTION IF EXISTS app.ensure_metrics_v2_daily_reconciliation_cron_scheduled();

DROP FUNCTION IF EXISTS app.metrics_v2_assert_detail_period(p_period text, p_allowed text[]);
DROP FUNCTION IF EXISTS app.metrics_v2_detail_card(p_id text, p_representation text, p_title text, p_subtitle text, p_time_basis text, p_availability text, p_body jsonb);
DROP FUNCTION IF EXISTS app.metrics_v2_empty_card_body(p_title text, p_description text, p_tone text);
DROP FUNCTION IF EXISTS app.metrics_v2_primary_demand_kind(p_tenant_id uuid);
