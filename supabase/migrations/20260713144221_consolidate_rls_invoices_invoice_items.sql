-- Consolidate duplicate permissive RLS policies on app.invoices and
-- app.invoice_items. Only SELECT has a buyer/seller duplicate on these
-- tables (invoices are seller-authored; insert/update/delete are seller-only
-- and untouched). Merge into one OR'd predicate; semantics unchanged.

begin;

-- ============ app.invoices ============

drop policy if exists invoices_buyer_select on app.invoices;
drop policy if exists invoices_seller_select on app.invoices;
create policy invoices_select on app.invoices
  for select
  using (
    (app.is_buyer() and tenant_id = app.jwt_tenant_id() and buyer_id = app.jwt_buyer_id())
    or (app.is_seller() and tenant_id = app.jwt_tenant_id())
  );

-- insert/update/delete (invoices_seller_insert/update/delete) are seller-only
-- with no buyer counterpart -- left untouched.

-- ============ app.invoice_items ============

drop policy if exists invoice_items_buyer_select on app.invoice_items;
drop policy if exists invoice_items_seller_select on app.invoice_items;
create policy invoice_items_select on app.invoice_items
  for select
  using (
    (app.is_buyer() and exists (
      select 1 from app.invoices inv
      where inv.id = invoice_items.invoice_id
        and inv.tenant_id = app.jwt_tenant_id()
        and inv.buyer_id = app.jwt_buyer_id()
    ))
    or (app.is_seller() and exists (
      select 1 from app.invoices inv
      where inv.id = invoice_items.invoice_id
        and inv.tenant_id = app.jwt_tenant_id()
    ))
  );

-- insert/update/delete (invoice_items_seller_insert/update/delete) are
-- seller-only with no buyer counterpart -- left untouched.

commit;
