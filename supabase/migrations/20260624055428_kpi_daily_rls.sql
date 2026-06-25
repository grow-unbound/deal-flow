-- Add RLS to kpi_tenant_daily and kpi_product_daily.
-- These were the only kpi_*_daily tables without row-level security.
-- All other daily KPI tables (kpi_category_daily, kpi_location_daily,
-- kpi_buyer_app_daily, kpi_brand_daily) already have RLS enabled.

ALTER TABLE app.kpi_tenant_daily  ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.kpi_product_daily ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant members can read kpi_tenant_daily"
  ON app.kpi_tenant_daily FOR SELECT
  USING (app.jwt_tenant_id() = tenant_id);

CREATE POLICY "tenant members can read kpi_product_daily"
  ON app.kpi_product_daily FOR SELECT
  USING (app.jwt_tenant_id() = tenant_id);
