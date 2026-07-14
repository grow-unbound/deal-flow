-- Consolidate duplicate permissive RLS policies on app.tenant_products.
-- Only SELECT has a buyer/seller duplicate. Semantics unchanged.

begin;

drop policy if exists tenant_products_buyer_select on app.tenant_products;
drop policy if exists tenant_products_seller_select on app.tenant_products;
create policy tenant_products_select on app.tenant_products
  for select
  using (
    (app.is_buyer() and tenant_id = app.jwt_tenant_id())
    or (app.is_seller() and tenant_id = app.jwt_tenant_id())
  );

-- insert/update/delete (tenant_products_insert/update/delete) are
-- seller-only with no buyer counterpart -- left untouched.

commit;
