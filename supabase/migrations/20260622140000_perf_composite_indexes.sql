-- Performance: composite indexes for common seller landing page query patterns
-- These complement existing single-column indexes without replacing them.

-- Orders: status-first filter (existing idx_orders_tenant_date_status has placed_at before status)
CREATE INDEX IF NOT EXISTS idx_orders_tenant_status_placed
  ON app.orders (tenant_id, status, placed_at DESC)
  WHERE deleted_at IS NULL;

-- Invoices: tenant + date without location_id (existing composite includes location_id,
-- making it unusable for location-agnostic queries)
CREATE INDEX IF NOT EXISTS idx_invoices_tenant_date
  ON app.invoices (tenant_id, invoice_date DESC)
  WHERE deleted_at IS NULL;

-- Invoices: outstanding / overdue queries (tenant + status + due_date)
CREATE INDEX IF NOT EXISTS idx_invoices_tenant_status_due
  ON app.invoices (tenant_id, status, due_date)
  WHERE deleted_at IS NULL;

-- Buyers: cohort composer sorted list (existing idx_buyers_tenant_active only has is_active,
-- not business_name, so ORDER BY business_name can't use it)
CREATE INDEX IF NOT EXISTS idx_buyers_tenant_name
  ON app.buyers (tenant_id, business_name)
  WHERE is_active = true AND deleted_at IS NULL;

-- Tenant products: landing page default sort by created_at
CREATE INDEX IF NOT EXISTS idx_tenant_products_tenant_created
  ON app.tenant_products (tenant_id, created_at DESC)
  WHERE deleted_at IS NULL;

-- Estimates: period landing (existing idx_estimates_tenant_location_created_at includes
-- location_id; add a simpler version for location-agnostic period queries)
CREATE INDEX IF NOT EXISTS idx_estimates_tenant_created
  ON app.estimates (tenant_id, created_at DESC)
  WHERE deleted_at IS NULL;
