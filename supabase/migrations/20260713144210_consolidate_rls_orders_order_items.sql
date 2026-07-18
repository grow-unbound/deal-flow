-- Consolidate duplicate permissive RLS policies on app.orders and app.order_items.
--
-- Postgres evaluates every permissive policy for a given (table, command) and
-- ORs the results together. Having separate buyer/seller policies for the same
-- command therefore already behaves like a single OR'd predicate, but costs an
-- extra policy evaluation per row. This migration merges each buyer/seller pair
-- into one policy with an OR'd USING/WITH CHECK expression. Semantics are
-- IDENTICAL to before -- this is purely a performance consolidation.
--
-- app.orders showed 233,059 seq_scan against 69 live rows, correlating with
-- 18 multiple_permissive_policies advisor entries on this table (3 commands x
-- 6 db roles). order_items follows the same buyer/seller shape.

begin;

-- ============ app.orders ============

-- INSERT: orders_buyer_insert + orders_seller_insert
drop policy if exists orders_buyer_insert on app.orders;
drop policy if exists orders_seller_insert on app.orders;
create policy orders_insert on app.orders
  for insert
  with check (
    (app.is_buyer() and tenant_id = app.jwt_tenant_id() and buyer_id = app.jwt_buyer_id())
    or (app.is_seller() and tenant_id = app.jwt_tenant_id())
  );

-- SELECT: orders_buyer_select + orders_seller_select
drop policy if exists orders_buyer_select on app.orders;
drop policy if exists orders_seller_select on app.orders;
create policy orders_select on app.orders
  for select
  using (
    (app.is_buyer() and tenant_id = app.jwt_tenant_id() and buyer_id = app.jwt_buyer_id())
    or (app.is_seller() and tenant_id = app.jwt_tenant_id())
  );

-- UPDATE: orders_buyer_admin_update + orders_seller_update
drop policy if exists orders_buyer_admin_update on app.orders;
drop policy if exists orders_seller_update on app.orders;
create policy orders_update on app.orders
  for update
  using (
    (app.is_buyer_admin() and tenant_id = app.jwt_tenant_id() and buyer_id = app.jwt_buyer_id())
    or (app.is_seller() and tenant_id = app.jwt_tenant_id())
  )
  with check (
    (app.is_buyer_admin() and tenant_id = app.jwt_tenant_id() and buyer_id = app.jwt_buyer_id())
    or (app.is_seller() and tenant_id = app.jwt_tenant_id())
  );

-- DELETE: orders_seller_delete has no buyer counterpart -- left untouched.

-- ============ app.order_items ============

-- INSERT: order_items_buyer_insert + order_items_seller_insert
drop policy if exists order_items_buyer_insert on app.order_items;
drop policy if exists order_items_seller_insert on app.order_items;
create policy order_items_insert on app.order_items
  for insert
  with check (
    (app.is_buyer() and exists (
      select 1 from app.orders o
      where o.id = order_items.order_id
        and o.tenant_id = app.jwt_tenant_id()
        and o.buyer_id = app.jwt_buyer_id()
    ))
    or (app.is_seller() and exists (
      select 1 from app.orders o
      where o.id = order_items.order_id
        and o.tenant_id = app.jwt_tenant_id()
    ))
  );

-- SELECT: order_items_buyer_select + order_items_seller_select
drop policy if exists order_items_buyer_select on app.order_items;
drop policy if exists order_items_seller_select on app.order_items;
create policy order_items_select on app.order_items
  for select
  using (
    (app.is_buyer() and exists (
      select 1 from app.orders o
      where o.id = order_items.order_id
        and o.tenant_id = app.jwt_tenant_id()
        and o.buyer_id = app.jwt_buyer_id()
    ))
    or (app.is_seller() and exists (
      select 1 from app.orders o
      where o.id = order_items.order_id
        and o.tenant_id = app.jwt_tenant_id()
    ))
  );

-- UPDATE (order_items_seller_update) and DELETE (order_items_seller_delete)
-- have no buyer counterpart -- left untouched.

commit;
