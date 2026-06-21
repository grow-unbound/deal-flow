-- Zoho Full Sync Schema
-- Adds upsert keys, relaxes NOT NULL on imported records, creates buyer_contacts.

-- ── 1. Extend entity_type allowlist to cover new Zoho phase types ────────────

ALTER TABLE app.integration_entity_map
  DROP CONSTRAINT IF EXISTS integration_entity_map_entity_type_check;
ALTER TABLE app.integration_entity_map
  ADD CONSTRAINT integration_entity_map_entity_type_check CHECK (
    entity_type IN (
      'locations', 'categories', 'brands', 'products',
      'customers', 'contact_persons',
      'estimates', 'orders', 'invoices'
    )
  );

ALTER TABLE app.integration_data_flows
  DROP CONSTRAINT IF EXISTS integration_data_flows_entity_type_check;
ALTER TABLE app.integration_data_flows
  ADD CONSTRAINT integration_data_flows_entity_type_check CHECK (
    entity_type IN (
      'locations', 'categories', 'brands', 'products',
      'customers', 'contact_persons',
      'estimates', 'orders', 'invoices'
    )
  );

-- ── 2. Non-partial UNIQUE indices for Supabase JS upsert ─────────────────────
-- PostgREST's ON CONFLICT clause requires a non-partial unique index.
-- ADD CONSTRAINT IF NOT EXISTS is not valid Postgres syntax, so we use
-- CREATE UNIQUE INDEX IF NOT EXISTS (which serves the same purpose for upsert).
-- Multiple NULLs are fine — Postgres treats NULL != NULL for uniqueness.

CREATE UNIQUE INDEX IF NOT EXISTS locations_tenant_external_ref_upsert
  ON app.locations (tenant_id, external_ref);

CREATE UNIQUE INDEX IF NOT EXISTS tenant_products_tenant_external_ref_upsert
  ON app.tenant_products (tenant_id, external_ref);

CREATE UNIQUE INDEX IF NOT EXISTS tenant_brands_tenant_external_ref_upsert
  ON app.tenant_brands (tenant_id, external_ref);

CREATE UNIQUE INDEX IF NOT EXISTS tenant_categories_tenant_external_ref_upsert
  ON app.tenant_categories (tenant_id, external_ref);

CREATE UNIQUE INDEX IF NOT EXISTS orders_tenant_external_ref_upsert
  ON app.orders (tenant_id, external_ref);

CREATE UNIQUE INDEX IF NOT EXISTS estimates_tenant_external_ref_upsert
  ON app.estimates (tenant_id, external_ref);

-- ── 3. Inventory: unique per product+location for upsert ─────────────────────

CREATE UNIQUE INDEX IF NOT EXISTS tenant_inventory_product_location_upsert
  ON app.tenant_inventory (tenant_product_id, location_id);

-- ── 4. Allow NULL buyer_id / placed_by for Zoho-imported records ─────────────
-- Zoho orders/estimates/invoices may not have a matched local buyer yet.

ALTER TABLE app.orders
  ALTER COLUMN buyer_id DROP NOT NULL,
  ALTER COLUMN placed_by DROP NOT NULL;

ALTER TABLE app.estimates
  ALTER COLUMN buyer_id DROP NOT NULL;

ALTER TABLE app.invoices
  ALTER COLUMN buyer_id DROP NOT NULL;

-- ── 5. Extend source enums to include zoho_import ────────────────────────────

ALTER TABLE app.orders
  DROP CONSTRAINT IF EXISTS orders_source_check;
ALTER TABLE app.orders
  ADD CONSTRAINT orders_source_check
  CHECK (source IN ('buyer_app', 'cockpit_manual', 'csv_import', 'zoho_import'));

ALTER TABLE app.estimates
  DROP CONSTRAINT IF EXISTS estimates_source_check;
ALTER TABLE app.estimates
  ADD CONSTRAINT estimates_source_check
  CHECK (source IN ('buyer_app', 'seller', 'zoho_import'));

-- ── 6. buyer_contacts — Zoho contact persons (no auth.users dependency) ──────

CREATE TABLE IF NOT EXISTS app.buyer_contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES app.tenants(id) ON DELETE RESTRICT,
  buyer_id uuid NOT NULL REFERENCES app.buyers(id) ON DELETE CASCADE,
  first_name text,
  last_name text,
  email text,
  phone text,
  mobile text,
  designation text,
  department text,
  is_primary boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  external_ref text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id),
  updated_by uuid REFERENCES auth.users(id),
  deleted_at timestamptz
);

CREATE UNIQUE INDEX IF NOT EXISTS buyer_contacts_tenant_external_ref_upsert
  ON app.buyer_contacts (tenant_id, external_ref);

CREATE INDEX IF NOT EXISTS idx_buyer_contacts_buyer_id
  ON app.buyer_contacts(buyer_id)
  WHERE deleted_at IS NULL;

DROP TRIGGER IF EXISTS buyer_contacts_updated_at ON app.buyer_contacts;
CREATE TRIGGER buyer_contacts_updated_at
  BEFORE UPDATE ON app.buyer_contacts
  FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();

ALTER TABLE app.buyer_contacts ENABLE ROW LEVEL SECURITY;

CREATE POLICY buyer_contacts_select ON app.buyer_contacts
  FOR SELECT USING (app.is_seller() AND tenant_id = app.jwt_tenant_id());

CREATE POLICY buyer_contacts_insert ON app.buyer_contacts
  FOR INSERT WITH CHECK (app.is_seller() AND tenant_id = app.jwt_tenant_id());

CREATE POLICY buyer_contacts_update ON app.buyer_contacts
  FOR UPDATE USING (app.is_seller() AND tenant_id = app.jwt_tenant_id())
  WITH CHECK (app.is_seller() AND tenant_id = app.jwt_tenant_id());

CREATE POLICY buyer_contacts_delete ON app.buyer_contacts
  FOR DELETE USING (app.is_seller_admin() AND tenant_id = app.jwt_tenant_id());
