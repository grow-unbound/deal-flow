-- Consolidate duplicate permissive RLS policies on app.estimates and
-- app.estimate_items. Same rationale as the app.orders migration: merge
-- buyer/seller policy pairs for the same command into one OR'd predicate.
-- Semantics unchanged (Postgres already ORs permissive policies).

begin;

-- ============ app.estimates ============

-- INSERT: estimates_buyer_insert + estimates_seller_insert
drop policy if exists estimates_buyer_insert on app.estimates;
drop policy if exists estimates_seller_insert on app.estimates;
create policy estimates_insert on app.estimates
  for insert
  with check (
    (app.is_buyer() and tenant_id = app.jwt_tenant_id() and buyer_id = app.jwt_buyer_id())
    or (app.is_seller() and tenant_id = app.jwt_tenant_id())
  );

-- SELECT: estimates_buyer_select + estimates_seller_select
drop policy if exists estimates_buyer_select on app.estimates;
drop policy if exists estimates_seller_select on app.estimates;
create policy estimates_select on app.estimates
  for select
  using (
    (app.is_buyer() and tenant_id = app.jwt_tenant_id() and buyer_id = app.jwt_buyer_id())
    or (app.is_seller() and tenant_id = app.jwt_tenant_id())
  );

-- UPDATE: estimates_buyer_admin_update + estimates_seller_update
drop policy if exists estimates_buyer_admin_update on app.estimates;
drop policy if exists estimates_seller_update on app.estimates;
create policy estimates_update on app.estimates
  for update
  using (
    (app.is_buyer_admin() and tenant_id = app.jwt_tenant_id() and buyer_id = app.jwt_buyer_id())
    or (app.is_seller() and tenant_id = app.jwt_tenant_id())
  )
  with check (
    (app.is_buyer_admin() and tenant_id = app.jwt_tenant_id() and buyer_id = app.jwt_buyer_id())
    or (app.is_seller() and tenant_id = app.jwt_tenant_id())
  );

-- DELETE: estimates_seller_delete has no buyer counterpart -- left untouched.

-- ============ app.estimate_items ============

-- INSERT: estimate_items_buyer_insert + estimate_items_seller_insert
drop policy if exists estimate_items_buyer_insert on app.estimate_items;
drop policy if exists estimate_items_seller_insert on app.estimate_items;
create policy estimate_items_insert on app.estimate_items
  for insert
  with check (
    (app.is_buyer() and exists (
      select 1 from app.estimates e
      where e.id = estimate_items.estimate_id
        and e.tenant_id = app.jwt_tenant_id()
        and e.buyer_id = app.jwt_buyer_id()
    ))
    or (app.is_seller() and exists (
      select 1 from app.estimates e
      where e.id = estimate_items.estimate_id
        and e.tenant_id = app.jwt_tenant_id()
    ))
  );

-- SELECT: estimate_items_buyer_select + estimate_items_seller_select
drop policy if exists estimate_items_buyer_select on app.estimate_items;
drop policy if exists estimate_items_seller_select on app.estimate_items;
create policy estimate_items_select on app.estimate_items
  for select
  using (
    (app.is_buyer() and exists (
      select 1 from app.estimates e
      where e.id = estimate_items.estimate_id
        and e.tenant_id = app.jwt_tenant_id()
        and e.buyer_id = app.jwt_buyer_id()
    ))
    or (app.is_seller() and exists (
      select 1 from app.estimates e
      where e.id = estimate_items.estimate_id
        and e.tenant_id = app.jwt_tenant_id()
    ))
  );

-- UPDATE (estimate_items_seller_update) and DELETE (estimate_items_seller_delete)
-- have no buyer counterpart -- left untouched.

commit;
