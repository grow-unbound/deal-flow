-- Consolidate duplicate permissive RLS policies on app.buyers and
-- app.buyer_users. Only SELECT has a buyer/seller duplicate on these tables.
-- Semantics unchanged.

begin;

-- ============ app.buyers ============

drop policy if exists buyers_buyer_select on app.buyers;
drop policy if exists buyers_seller_select on app.buyers;
create policy buyers_select on app.buyers
  for select
  using (
    (app.is_buyer() and id = app.jwt_buyer_id())
    or (app.is_seller() and tenant_id = app.jwt_tenant_id())
  );

-- insert/update/delete (buyers_insert/update/delete) are seller-only with no
-- buyer counterpart -- left untouched.

-- ============ app.buyer_users ============

drop policy if exists buyer_users_buyer_select on app.buyer_users;
drop policy if exists buyer_users_seller_select on app.buyer_users;
create policy buyer_users_select on app.buyer_users
  for select
  using (
    (app.is_buyer() and buyer_id = app.jwt_buyer_id())
    or (app.is_seller() and exists (
      select 1 from app.buyers b
      where b.id = buyer_users.buyer_id
        and b.tenant_id = app.jwt_tenant_id()
    ))
  );

-- insert/update/delete (buyer_users_buyer_admin_insert/update/delete) have
-- no seller counterpart -- left untouched.

commit;
