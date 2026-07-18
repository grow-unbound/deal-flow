CREATE INDEX IF NOT EXISTS idx_tenant_products_name_override_trgm
ON app.tenant_products
USING gin ((lower(name_override)) public.gin_trgm_ops)
WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_tenant_products_internal_sku_trgm
ON app.tenant_products
USING gin ((lower(internal_sku)) public.gin_trgm_ops)
WHERE deleted_at IS NULL;
