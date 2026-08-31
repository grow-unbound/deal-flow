-- Table cleanup pass, per owner request: don't carry v2-era dead weight
-- into the eventual ap-south-1 (Mumbai) Postgres project. Explicitly
-- verified "no one is reading these tables" before dropping, per owner
-- instruction -- data loss is acceptable here (aggregations rebuild),
-- but only after confirming zero readers, not on a name-pattern guess.
--
-- Each table checked for ALL of: (1) referenced in any live app.*
-- function body, (2) an enabled trigger targets it, (3) any pg_cron job
-- command mentions it, (4) an FK constraint from another table points at
-- it, (5) a view/materialized view depends on it. All five came back
-- clean (0/0/0/0/0) for all five tables below.
--
--   metrics_product_snapshot          469 rows -- last writer unknown, stale
--                                                  since ~2026-08-01; its three
--                                                  live readers were just fixed
--                                                  to read app.tenant_inventory +
--                                                  app.kpi_product_daily instead
--                                                  (20260830051504, 20260830051712)
--   metrics_tenant_buyer_app_snapshot   3 rows -- only reader was the dropped
--                                                  get_metrics_v2_buyer_app_dashboard
--   metrics_tenant_commercial_snapshot  3 rows -- same
--   metrics_tenant_setup_snapshot       3 rows -- same
--   metrics_tenant_inventory_snapshot   3 rows -- already had zero references
--                                                  before this session started
--
-- Explicitly NOT dropped (still has a live reader,
-- app.search_buyer_app_access_v2 -- called from
-- app/api/tenant/buyer-app/access/route.ts): metrics_buyer_snapshot,
-- metrics_buyer_location_snapshot. Also not touched: the unrelated
-- *_snapshot tables (brands_snapshot, buyer_app_snapshot,
-- categories_snapshot, estimates_snapshot, invoices_snapshot,
-- locations_snapshot, orders_snapshot, products_snapshot,
-- warehouses_snapshot) -- these belong to a separate, still-live
-- "aggregate freshness" feature (get_tenant_aggregate_freshness) with
-- active refresh_*_snapshot() writers, not the v2 metrics lineage.

DROP TABLE IF EXISTS app.metrics_product_snapshot;
DROP TABLE IF EXISTS app.metrics_tenant_buyer_app_snapshot;
DROP TABLE IF EXISTS app.metrics_tenant_commercial_snapshot;
DROP TABLE IF EXISTS app.metrics_tenant_setup_snapshot;
DROP TABLE IF EXISTS app.metrics_tenant_inventory_snapshot;
