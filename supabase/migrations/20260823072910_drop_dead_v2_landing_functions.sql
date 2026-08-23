-- Perf/cleanup: 4 v2 landing RPCs confirmed dead -- exist in the DB but have
-- zero live app-code references (only stale test-file mentions), confirmed
-- twice: once in the original audit session, once again immediately before
-- this migration. All 4 were replaced by app.get_landing_metrics_v4 reading
-- app.metrics_landing_kpi_snapshot, wired into app/api/tenant/*/metrics
-- routes.

DROP FUNCTION IF EXISTS app.get_catalog_landing_metrics(
  p_tenant_id uuid, p_campaign_ids uuid[], p_current_start date, p_current_end_exclusive date,
  p_previous_start date, p_previous_end_exclusive date, p_include_orders boolean,
  p_include_estimates boolean, p_include_summary boolean
);

DROP FUNCTION IF EXISTS app.get_seller_brand_landing_rows(
  p_tenant_id uuid, p_brand_ids uuid[], p_location_ids uuid[], p_current_start date,
  p_current_end date, p_previous_start date, p_previous_end date
);

DROP FUNCTION IF EXISTS app.get_seller_cohort_landing_aggregates(
  p_tenant_id uuid, p_page_ids uuid[], p_current_start timestamptz, p_current_end_exclusive timestamptz,
  p_views_by_cohort jsonb, p_include_summary boolean
);

DROP FUNCTION IF EXISTS app.get_seller_location_landing_row_metrics(
  p_tenant_id uuid, p_location_ids uuid[], p_current_start date, p_current_end_exclusive date
);
