-- Consolidate duplicate permissive RLS policies on app.campaigns,
-- app.campaign_items, and app.campaign_views. Merge buyer/seller (or
-- buyer/seller_admin) pairs for the same command into one OR'd predicate.
-- Semantics unchanged.

begin;

-- ============ app.campaigns ============
-- SELECT only: campaigns_buyer_select + campaigns_seller_select

drop policy if exists campaigns_buyer_select on app.campaigns;
drop policy if exists campaigns_seller_select on app.campaigns;
create policy campaigns_select on app.campaigns
  for select
  using (
    (app.is_buyer() and tenant_id = app.jwt_tenant_id() and status = 'published'
      and (valid_to is null or valid_to > now()))
    or (app.is_seller() and tenant_id = app.jwt_tenant_id())
  );

-- insert/update/delete (campaigns_seller_insert/update/delete) are
-- seller-only with no buyer counterpart -- left untouched.

-- ============ app.campaign_items ============
-- SELECT only: campaign_items_buyer_select + campaign_items_seller_select

drop policy if exists campaign_items_buyer_select on app.campaign_items;
drop policy if exists campaign_items_seller_select on app.campaign_items;
create policy campaign_items_select on app.campaign_items
  for select
  using (
    (app.is_buyer() and exists (
      select 1 from app.campaigns c
      where c.id = campaign_items.campaign_id
        and c.tenant_id = app.jwt_tenant_id()
        and c.status = 'published'
        and (c.valid_to is null or c.valid_to > now())
    ))
    or (app.is_seller() and exists (
      select 1 from app.campaigns c
      where c.id = campaign_items.campaign_id
        and c.tenant_id = app.jwt_tenant_id()
    ))
  );

-- insert/update/delete (campaign_items_seller_insert/update/delete) are
-- seller-only with no buyer counterpart -- left untouched.

-- ============ app.campaign_views ============

-- INSERT: campaign_views_buyer_insert + campaign_views_seller_admin_insert
drop policy if exists campaign_views_buyer_insert on app.campaign_views;
drop policy if exists campaign_views_seller_admin_insert on app.campaign_views;
create policy campaign_views_insert on app.campaign_views
  for insert
  with check (
    (app.is_buyer() and tenant_id = app.jwt_tenant_id() and buyer_id = app.jwt_buyer_id())
    or (app.is_seller_admin() and tenant_id = app.jwt_tenant_id())
  );

-- SELECT: campaign_views_buyer_select + campaign_views_seller_select
drop policy if exists campaign_views_buyer_select on app.campaign_views;
drop policy if exists campaign_views_seller_select on app.campaign_views;
create policy campaign_views_select on app.campaign_views
  for select
  using (
    (app.is_buyer() and tenant_id = app.jwt_tenant_id() and buyer_id = app.jwt_buyer_id())
    or (app.is_seller() and tenant_id = app.jwt_tenant_id())
  );

-- UPDATE/DELETE (campaign_views_seller_admin_update/delete) have no buyer
-- counterpart -- left untouched.

commit;
