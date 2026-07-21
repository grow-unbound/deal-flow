-- Add covering indexes for foreign keys flagged by Supabase performance advisors
-- (unindexed_foreign_keys). These back the location-scoped filters that
-- applySellerLocationScope applies on every estimates/orders/invoices landing
-- query, and the tenant_product_id join used by catalog/product metrics reads.

CREATE INDEX IF NOT EXISTS idx_estimates_location_id
  ON app.estimates (location_id);

CREATE INDEX IF NOT EXISTS idx_orders_location_id
  ON app.orders (location_id);

CREATE INDEX IF NOT EXISTS idx_invoices_location_id
  ON app.invoices (location_id);

CREATE INDEX IF NOT EXISTS idx_metrics_product_snapshot_tenant_product_id
  ON app.metrics_product_snapshot (tenant_product_id);
