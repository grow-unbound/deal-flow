CREATE INDEX IF NOT EXISTS idx_catalog_brands_name_trgm
ON catalog.brands
USING gin ((lower(name)) public.gin_trgm_ops)
WHERE deleted_at IS NULL AND is_public = true;

CREATE INDEX IF NOT EXISTS idx_catalog_brands_slug_trgm
ON catalog.brands
USING gin ((lower(slug)) public.gin_trgm_ops)
WHERE deleted_at IS NULL AND is_public = true;

CREATE INDEX IF NOT EXISTS idx_tenant_products_tenant_master_active
ON app.tenant_products (tenant_id, master_product_id)
WHERE deleted_at IS NULL AND master_product_id IS NOT NULL;
