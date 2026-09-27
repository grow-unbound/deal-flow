-- Persist seller product-import column mappings by header-row hash.

CREATE TABLE IF NOT EXISTS app.import_column_maps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES app.tenants(id) ON DELETE RESTRICT,
  header_hash text NOT NULL,
  mapping jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  updated_by uuid,
  deleted_at timestamptz
);

CREATE UNIQUE INDEX import_column_maps_tenant_hash_unique
  ON app.import_column_maps (tenant_id, header_hash)
  WHERE deleted_at IS NULL;

CREATE INDEX idx_import_column_maps_tenant
  ON app.import_column_maps (tenant_id)
  WHERE deleted_at IS NULL;

ALTER TABLE app.import_column_maps ENABLE ROW LEVEL SECURITY;

CREATE POLICY import_column_maps_service_role ON app.import_column_maps
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

REVOKE ALL ON TABLE app.import_column_maps FROM anon, authenticated;
GRANT ALL ON TABLE app.import_column_maps TO service_role;
