-- Drop 5 v2 landing RPCs confirmed dead after the v4 cutover.
--
-- Frontend cutover landed 2026-08-04/05 (commits 8ec50dce "Cutover landing
-- pages in the seller app to v4 metrics", 49b37821 "Ported Buyer App and
-- Customers landing page to v4 metrics workflows"). Confirmed today
-- (2026-08-18) via full-repo grep: zero remaining call sites in app/, src/,
-- or supabase/functions/ for any of these five.
--
-- These five also explain why the 2026-08-18 performance-advisor pass (see
-- specs/supabase-advisors-performance-2026-08-18.md sec 3) still flagged
-- them as slow: pg_stat_statements has not been reset since 2026-07-27, so
-- its cumulative call counts (92-377 calls each) span the ~9 live days
-- between that reset and the 08-04/05 cutover, not current traffic. Zero
-- app-code callers exist today.
--
-- Safety gate (adapted from scripts/sql/metrics-v4-drop-legacy-v1-v2.sql
-- section 4, re-run against the live DB today): no other app.* function
-- body references any of the five by name. None of them are in that
-- script's own "KEEP" list (capture triggers, refresh_tick, snapshot
-- tables the tick reads for source_watermark) -- they are pure read RPCs
-- with no downstream dependents.
--
-- get_seller_warehouse_landing_row_metrics_v2 was kept alive solely by a
-- fallback call in src/lib/server/warehouse-data.ts::loadWarehouseSummary,
-- used only when app.metrics_warehouse_now_summary had no row yet for a
-- warehouse. That fallback is removed in this same change (the v4 now-
-- summary table is populated on every refresh tick, same as every other
-- v4-migrated detail page) -- zero remaining call sites, safe to drop here.
--
-- get_metrics_v2_seller_dashboard / get_metrics_v2_buyer_app_dashboard /
-- get_seller_price_list_landing_aggregates are deliberately NOT included
-- here -- still live call sites (seller dashboard, buyer app dashboard,
-- price lists table rows/counts).

DROP FUNCTION IF EXISTS app.get_seller_category_landing_page_metrics_v2(uuid, uuid[], date, date, date);
DROP FUNCTION IF EXISTS app.get_seller_category_landing_summary_v2(uuid, date, date, date, date);
DROP FUNCTION IF EXISTS app.get_seller_locations_landing_summary(uuid, uuid[], date, date, date, date);
DROP FUNCTION IF EXISTS app.get_seller_brand_landing_summary(uuid, uuid[], date, date, date, date);
DROP FUNCTION IF EXISTS app.metrics_v2_customers_landing(uuid, uuid[], text, text[], text[], integer, text, uuid, timestamptz, text);
DROP FUNCTION IF EXISTS app.get_seller_warehouse_landing_row_metrics_v2(uuid, uuid[]);
