-- Separate warehouse concept from locations, mirroring Zoho Books data model:
-- app.locations  = transaction-level location (estimates / orders / invoices)
-- app.warehouses = physical stock location (tenant_inventory)
-- Warehouses carry an optional FK to locations for cross-referencing.

-- 1. Create app.warehouses ────────────────────────────────────────────────────

CREATE TABLE app.warehouses (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        uuid NOT NULL REFERENCES app.tenants(id) ON DELETE CASCADE,
  location_id      uuid REFERENCES app.locations(id) ON DELETE SET NULL,
  name             text NOT NULL,
  external_ref     text,
  address          jsonb,
  phone_number     text,
  status           text NOT NULL DEFAULT 'active',
  is_default       boolean DEFAULT false,
  associated_users jsonb NOT NULL DEFAULT '[]',
  created_at       timestamptz DEFAULT now(),
  updated_at       timestamptz DEFAULT now(),
  created_by       uuid,
  updated_by       uuid,
  deleted_at       timestamptz,
  CONSTRAINT warehouses_status_check CHECK (status IN ('active', 'inactive'))
);

CREATE INDEX idx_warehouses_tenant_id ON app.warehouses(tenant_id);

-- Unique index used by bulk_persist_jsonb_records ON CONFLICT
CREATE UNIQUE INDEX warehouses_tenant_external_ref_upsert
  ON app.warehouses(tenant_id, external_ref);

-- 2. RLS (same policy pattern as app.locations) ───────────────────────────────

ALTER TABLE app.warehouses ENABLE ROW LEVEL SECURITY;

CREATE POLICY warehouses_select ON app.warehouses
  FOR SELECT USING (app.is_seller() AND tenant_id = app.jwt_tenant_id());

CREATE POLICY warehouses_insert ON app.warehouses
  FOR INSERT WITH CHECK (app.is_seller() AND tenant_id = app.jwt_tenant_id());

CREATE POLICY warehouses_update ON app.warehouses
  FOR UPDATE USING (app.is_seller() AND tenant_id = app.jwt_tenant_id())
  WITH CHECK (app.is_seller() AND tenant_id = app.jwt_tenant_id());

CREATE POLICY warehouses_delete ON app.warehouses
  FOR DELETE USING (app.is_seller() AND tenant_id = app.jwt_tenant_id());

-- 3. Update tenant_inventory ──────────────────────────────────────────────────

-- Drop old NOT NULL so existing rows (with location_id but no warehouse_id) stay valid
ALTER TABLE app.tenant_inventory
  ALTER COLUMN location_id DROP NOT NULL;

-- Add warehouse FK
ALTER TABLE app.tenant_inventory
  ADD COLUMN warehouse_id uuid REFERENCES app.warehouses(id) ON DELETE SET NULL;

-- Unique index for ON CONFLICT upsert by warehouse (replaces location-based upsert)
CREATE UNIQUE INDEX tenant_inventory_product_warehouse_upsert
  ON app.tenant_inventory(tenant_product_id, warehouse_id);

-- Drop old location-based upsert index (code now uses warehouse_id for inventory)
DROP INDEX IF EXISTS app.tenant_inventory_product_location_upsert;

-- Truncate existing inventory so the next full sync rebuilds it with warehouse_id.
-- This is safe: tenant_inventory is a pure derivative of Zoho stock data.
TRUNCATE app.tenant_inventory;
