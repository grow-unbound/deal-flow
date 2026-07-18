-- Consolidate duplicate permissive RLS policies on catalog.brands,
-- catalog.brand_images, catalog.categories, catalog.category_images,
-- catalog.product_aliases, catalog.product_images, catalog.products.
--
-- Each table currently has:
--   <table>_platform_all   FOR ALL    USING/CHECK (is_platform_admin())
--   <table>_public_select  FOR SELECT USING (<public visibility condition>)
-- Because "FOR ALL" also covers SELECT, every SELECT on these tables
-- evaluates two permissive policies. To consolidate SELECT into one policy
-- while preserving IDENTICAL semantics for INSERT/UPDATE/DELETE, we split
-- the platform_all policy into three per-command policies (insert/update/
-- delete, still platform-admin-only, unchanged) and merge SELECT into one
-- policy that ORs the platform-admin check with the original public
-- visibility condition.

begin;

-- ============ catalog.brands ============

drop policy if exists catalog_brands_platform_all on catalog.brands;
drop policy if exists catalog_brands_public_select on catalog.brands;

create policy catalog_brands_platform_insert on catalog.brands
  for insert with check (app.is_platform_admin());
create policy catalog_brands_platform_update on catalog.brands
  for update using (app.is_platform_admin()) with check (app.is_platform_admin());
create policy catalog_brands_platform_delete on catalog.brands
  for delete using (app.is_platform_admin());

create policy catalog_brands_select on catalog.brands
  for select
  using (
    app.is_platform_admin()
    or (is_public = true and deleted_at is null)
  );

-- ============ catalog.brand_images ============

drop policy if exists catalog_brand_images_platform_all on catalog.brand_images;
drop policy if exists catalog_brand_images_public_select on catalog.brand_images;

create policy catalog_brand_images_platform_insert on catalog.brand_images
  for insert with check (app.is_platform_admin());
create policy catalog_brand_images_platform_update on catalog.brand_images
  for update using (app.is_platform_admin()) with check (app.is_platform_admin());
create policy catalog_brand_images_platform_delete on catalog.brand_images
  for delete using (app.is_platform_admin());

create policy catalog_brand_images_select on catalog.brand_images
  for select
  using (
    app.is_platform_admin()
    or (
      deleted_at is null
      and status = 'approved'
      and exists (
        select 1 from catalog.brands b
        where b.id = brand_images.brand_id
          and b.is_public = true
          and b.deleted_at is null
      )
    )
  );

-- ============ catalog.categories ============

drop policy if exists catalog_categories_platform_all on catalog.categories;
drop policy if exists catalog_categories_public_select on catalog.categories;

create policy catalog_categories_platform_insert on catalog.categories
  for insert with check (app.is_platform_admin());
create policy catalog_categories_platform_update on catalog.categories
  for update using (app.is_platform_admin()) with check (app.is_platform_admin());
create policy catalog_categories_platform_delete on catalog.categories
  for delete using (app.is_platform_admin());

create policy catalog_categories_select on catalog.categories
  for select
  using (
    app.is_platform_admin()
    or (is_public = true and deleted_at is null)
  );

-- ============ catalog.category_images ============

drop policy if exists catalog_category_images_platform_all on catalog.category_images;
drop policy if exists catalog_category_images_public_select on catalog.category_images;

create policy catalog_category_images_platform_insert on catalog.category_images
  for insert with check (app.is_platform_admin());
create policy catalog_category_images_platform_update on catalog.category_images
  for update using (app.is_platform_admin()) with check (app.is_platform_admin());
create policy catalog_category_images_platform_delete on catalog.category_images
  for delete using (app.is_platform_admin());

create policy catalog_category_images_select on catalog.category_images
  for select
  using (
    app.is_platform_admin()
    or (
      deleted_at is null
      and status = 'approved'
      and exists (
        select 1 from catalog.categories c
        where c.id = category_images.category_id
          and c.is_public = true
          and c.deleted_at is null
      )
    )
  );

-- ============ catalog.products ============

drop policy if exists catalog_products_platform_all on catalog.products;
drop policy if exists catalog_products_public_select on catalog.products;

create policy catalog_products_platform_insert on catalog.products
  for insert with check (app.is_platform_admin());
create policy catalog_products_platform_update on catalog.products
  for update using (app.is_platform_admin()) with check (app.is_platform_admin());
create policy catalog_products_platform_delete on catalog.products
  for delete using (app.is_platform_admin());

create policy catalog_products_select on catalog.products
  for select
  using (
    app.is_platform_admin()
    or (is_public = true and deleted_at is null)
  );

-- ============ catalog.product_images ============

drop policy if exists catalog_product_images_platform_all on catalog.product_images;
drop policy if exists catalog_product_images_public_select on catalog.product_images;

create policy catalog_product_images_platform_insert on catalog.product_images
  for insert with check (app.is_platform_admin());
create policy catalog_product_images_platform_update on catalog.product_images
  for update using (app.is_platform_admin()) with check (app.is_platform_admin());
create policy catalog_product_images_platform_delete on catalog.product_images
  for delete using (app.is_platform_admin());

create policy catalog_product_images_select on catalog.product_images
  for select
  using (
    app.is_platform_admin()
    or (
      deleted_at is null
      and status = 'approved'
      and exists (
        select 1 from catalog.products p
        where p.id = product_images.product_id
          and p.is_public = true
          and p.deleted_at is null
      )
    )
  );

-- ============ catalog.product_aliases ============

drop policy if exists catalog_product_aliases_platform_all on catalog.product_aliases;
drop policy if exists catalog_product_aliases_select on catalog.product_aliases;

create policy catalog_product_aliases_platform_insert on catalog.product_aliases
  for insert with check (app.is_platform_admin());
create policy catalog_product_aliases_platform_update on catalog.product_aliases
  for update using (app.is_platform_admin()) with check (app.is_platform_admin());
create policy catalog_product_aliases_platform_delete on catalog.product_aliases
  for delete using (app.is_platform_admin());

create policy catalog_product_aliases_select on catalog.product_aliases
  for select
  using (
    app.is_platform_admin()
    or (
      deleted_at is null
      and exists (
        select 1 from catalog.products p
        where p.id = product_aliases.product_id
          and p.is_public = true
          and p.deleted_at is null
      )
    )
  );

commit;
