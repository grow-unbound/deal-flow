-- Tighten write policies on reference tables: assistants may read for dropdowns,
-- but only seller_admin may mutate (matches API enforcement).

DROP POLICY IF EXISTS tenant_categories_insert ON app.tenant_categories;
DROP POLICY IF EXISTS tenant_categories_update ON app.tenant_categories;
DROP POLICY IF EXISTS tenant_categories_delete ON app.tenant_categories;

CREATE POLICY tenant_categories_insert ON app.tenant_categories
  FOR INSERT WITH CHECK (app.is_seller_admin() AND tenant_id = app.jwt_tenant_id());

CREATE POLICY tenant_categories_update ON app.tenant_categories
  FOR UPDATE USING (app.is_seller_admin() AND tenant_id = app.jwt_tenant_id())
  WITH CHECK (app.is_seller_admin() AND tenant_id = app.jwt_tenant_id());

CREATE POLICY tenant_categories_delete ON app.tenant_categories
  FOR DELETE USING (app.is_seller_admin() AND tenant_id = app.jwt_tenant_id());

DROP POLICY IF EXISTS locations_insert ON app.locations;
DROP POLICY IF EXISTS locations_update ON app.locations;
DROP POLICY IF EXISTS locations_delete ON app.locations;

CREATE POLICY locations_insert ON app.locations
  FOR INSERT WITH CHECK (app.is_seller_admin() AND tenant_id = app.jwt_tenant_id());

CREATE POLICY locations_update ON app.locations
  FOR UPDATE USING (app.is_seller_admin() AND tenant_id = app.jwt_tenant_id())
  WITH CHECK (app.is_seller_admin() AND tenant_id = app.jwt_tenant_id());

CREATE POLICY locations_delete ON app.locations
  FOR DELETE USING (app.is_seller_admin() AND tenant_id = app.jwt_tenant_id());
