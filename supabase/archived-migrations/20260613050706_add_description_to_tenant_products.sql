ALTER TABLE app.tenant_products
  ADD COLUMN IF NOT EXISTS description text;

COMMENT ON COLUMN app.tenant_products.description IS 'Optional tenant-specific product description override';
