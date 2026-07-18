-- Consolidate duplicate permissive RLS policies on app.kpi_product_daily and
-- app.kpi_tenant_daily. Each table has a "seller_select" policy
-- (is_seller() AND tenant match) plus a legacy "tenant members can read ..."
-- policy (tenant match only, no role check). The legacy policy is strictly
-- broader, so merging is a straightforward OR -- semantics unchanged.

begin;

-- ============ app.kpi_product_daily ============

drop policy if exists kpi_product_daily_seller_select on app.kpi_product_daily;
drop policy if exists "tenant members can read kpi_product_daily" on app.kpi_product_daily;
create policy kpi_product_daily_select on app.kpi_product_daily
  for select
  using (
    (app.is_seller() and tenant_id = app.jwt_tenant_id())
    or (app.jwt_tenant_id() = tenant_id)
  );

-- ============ app.kpi_tenant_daily ============

drop policy if exists kpi_tenant_daily_seller_select on app.kpi_tenant_daily;
drop policy if exists "tenant members can read kpi_tenant_daily" on app.kpi_tenant_daily;
create policy kpi_tenant_daily_select on app.kpi_tenant_daily
  for select
  using (
    (app.is_seller() and tenant_id = app.jwt_tenant_id())
    or (app.jwt_tenant_id() = tenant_id)
  );

commit;
