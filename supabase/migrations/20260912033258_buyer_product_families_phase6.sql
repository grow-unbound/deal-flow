-- Phase 6 buyer product families: every SKU can point at a buyer-facing
-- display family, while transactional rows remain SKU-level.

CREATE TABLE IF NOT EXISTS app.tenant_product_families (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES app.tenants(id) ON DELETE RESTRICT,
  tenant_brand_id uuid REFERENCES app.tenant_brands(id) ON DELETE RESTRICT,
  tenant_category_id uuid REFERENCES app.tenant_categories(id) ON DELETE RESTRICT,
  name text NOT NULL,
  description text,
  variant_axes jsonb NOT NULL DEFAULT '[]'::jsonb,
  image_urls text[] NOT NULL DEFAULT '{}'::text[],
  r2_original_key text,
  r2_large_key text,
  r2_medium_key text,
  r2_small_key text,
  r2_thumb_key text,
  display_order integer,
  is_active boolean NOT NULL DEFAULT true,
  external_ref text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  updated_by uuid,
  deleted_at timestamptz,
  CONSTRAINT tenant_product_families_name_not_blank CHECK (length(btrim(name)) > 0),
  CONSTRAINT tenant_product_families_variant_axes_array CHECK (jsonb_typeof(variant_axes) = 'array')
);

CREATE UNIQUE INDEX IF NOT EXISTS tenant_product_families_tenant_external_ref_unique
  ON app.tenant_product_families (tenant_id, external_ref)
  WHERE external_ref IS NOT NULL AND deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_tenant_product_families_tenant_active
  ON app.tenant_product_families (tenant_id, is_active, display_order, name)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_tenant_product_families_brand
  ON app.tenant_product_families (tenant_id, tenant_brand_id)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_tenant_product_families_category
  ON app.tenant_product_families (tenant_id, tenant_category_id)
  WHERE deleted_at IS NULL;

DROP TRIGGER IF EXISTS tenant_product_families_updated_at ON app.tenant_product_families;
CREATE TRIGGER tenant_product_families_updated_at
  BEFORE UPDATE ON app.tenant_product_families
  FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();

ALTER TABLE app.tenant_product_families ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_product_families_select ON app.tenant_product_families;
DROP POLICY IF EXISTS tenant_product_families_insert ON app.tenant_product_families;
DROP POLICY IF EXISTS tenant_product_families_update ON app.tenant_product_families;
DROP POLICY IF EXISTS tenant_product_families_delete ON app.tenant_product_families;

CREATE POLICY tenant_product_families_select ON app.tenant_product_families
  FOR SELECT TO authenticated
  USING (
    tenant_id = app.jwt_tenant_id()
    AND (app.is_seller() OR app.is_buyer())
  );

CREATE POLICY tenant_product_families_insert ON app.tenant_product_families
  FOR INSERT TO authenticated
  WITH CHECK (app.is_seller() AND tenant_id = app.jwt_tenant_id());

CREATE POLICY tenant_product_families_update ON app.tenant_product_families
  FOR UPDATE TO authenticated
  USING (app.is_seller() AND tenant_id = app.jwt_tenant_id())
  WITH CHECK (app.is_seller() AND tenant_id = app.jwt_tenant_id());

CREATE POLICY tenant_product_families_delete ON app.tenant_product_families
  FOR DELETE TO authenticated
  USING (app.is_seller() AND tenant_id = app.jwt_tenant_id());

GRANT ALL ON TABLE app.tenant_product_families TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE app.tenant_product_families TO authenticated;
GRANT SELECT ON TABLE app.tenant_product_families TO anon;

ALTER TABLE app.tenant_products
  ADD COLUMN IF NOT EXISTS product_family_id uuid REFERENCES app.tenant_product_families(id) ON DELETE RESTRICT;

CREATE INDEX IF NOT EXISTS idx_tenant_products_product_family_id
  ON app.tenant_products (product_family_id)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_tenant_products_tenant_family_active
  ON app.tenant_products (tenant_id, product_family_id, is_active)
  WHERE deleted_at IS NULL;

INSERT INTO app.tenant_product_families (
  tenant_id,
  tenant_brand_id,
  tenant_category_id,
  name,
  description,
  variant_axes,
  image_urls,
  r2_original_key,
  r2_large_key,
  r2_medium_key,
  r2_small_key,
  r2_thumb_key,
  is_active,
  external_ref,
  created_at,
  updated_at,
  created_by,
  updated_by,
  deleted_at
)
SELECT
  tp.tenant_id,
  tp.tenant_brand_id,
  tp.tenant_category_id,
  COALESCE(NULLIF(btrim(tp.name_override), ''), tp.internal_sku, 'Product') AS name,
  tp.description,
  '[]'::jsonb AS variant_axes,
  COALESCE(tp.image_urls, '{}'::text[]) AS image_urls,
  tp.r2_original_key,
  tp.r2_large_key,
  tp.r2_medium_key,
  tp.r2_small_key,
  tp.r2_thumb_key,
  COALESCE(tp.is_active, true),
  'tenant_product:' || tp.id::text AS external_ref,
  COALESCE(tp.created_at, now()),
  COALESCE(tp.updated_at, now()),
  tp.created_by,
  tp.updated_by,
  tp.deleted_at
FROM app.tenant_products tp
WHERE tp.product_family_id IS NULL
ON CONFLICT DO NOTHING;

UPDATE app.tenant_products tp
SET product_family_id = fam.id
FROM app.tenant_product_families fam
WHERE tp.product_family_id IS NULL
  AND fam.tenant_id = tp.tenant_id
  AND fam.external_ref = 'tenant_product:' || tp.id::text
  AND fam.deleted_at IS NOT DISTINCT FROM tp.deleted_at;

COMMENT ON TABLE app.tenant_product_families IS
  'Buyer-facing display families for grouping SKU variants. Transactions remain on app.tenant_products.';

COMMENT ON COLUMN app.tenant_product_families.variant_axes IS
  'Ordered per-family variant axis metadata. SKU values live in app.tenant_products.attributes_override.';

COMMENT ON COLUMN app.tenant_products.product_family_id IS
  'Buyer-facing display family. Nullable during Phase 6 compatibility while all product writers become family-aware.';
