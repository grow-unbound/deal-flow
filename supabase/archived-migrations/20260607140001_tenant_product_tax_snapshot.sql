-- Optional tax/HSN snapshot on tenant products (used by order/invoice line joins).
ALTER TABLE app.tenant_products
  ADD COLUMN IF NOT EXISTS hsn_code text,
  ADD COLUMN IF NOT EXISTS gst_rate numeric;

COMMENT ON COLUMN app.tenant_products.hsn_code IS 'Optional override; falls back to catalog.products.hsn_code';
COMMENT ON COLUMN app.tenant_products.gst_rate IS 'Optional override; falls back to catalog.products.gst_rate';
