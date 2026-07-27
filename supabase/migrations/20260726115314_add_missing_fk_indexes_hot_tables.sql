-- Advisor: unindexed_foreign_keys on hot transactional tables.
CREATE INDEX IF NOT EXISTS idx_orders_campaign_id_fk ON app.orders (campaign_id);
CREATE INDEX IF NOT EXISTS idx_orders_placed_by  ON app.orders (placed_by);

CREATE INDEX IF NOT EXISTS idx_estimates_campaign_id_fk        ON app.estimates (campaign_id);
CREATE INDEX IF NOT EXISTS idx_estimates_converted_to_order_id ON app.estimates (converted_to_order_id);

CREATE INDEX IF NOT EXISTS idx_metrics_product_snapshot_created_by ON app.metrics_product_snapshot (created_by);
CREATE INDEX IF NOT EXISTS idx_metrics_product_snapshot_updated_by ON app.metrics_product_snapshot (updated_by);

CREATE INDEX IF NOT EXISTS idx_kpi_estimates_daily_location_id ON app.kpi_estimates_daily (location_id);
CREATE INDEX IF NOT EXISTS idx_kpi_invoices_daily_location_id  ON app.kpi_invoices_daily  (location_id);
CREATE INDEX IF NOT EXISTS idx_kpi_orders_daily_location_id    ON app.kpi_orders_daily    (location_id);

CREATE INDEX IF NOT EXISTS idx_credit_notes_invoice_id ON app.credit_notes (invoice_id);
CREATE INDEX IF NOT EXISTS idx_whatsapp_broadcasts_target_cohort_id ON app.whatsapp_broadcasts (target_cohort_id);
