-- Index drift: three per-buyer metric-day indexes exist on yukti-dev AND yukti-prod (identical
-- definitions, read from pg_indexes on 2026-10-02) but are created by no migration in this repo, so a
-- database built from migrations alone lacks them. They serve the per-buyer, per-period reads
-- (app.existing_buyer_context_snapshot, buyer detail summaries) that filter on
-- (tenant_id, buyer_id, app.metric_day_ist(<document date>, created_at)).
--
-- Tracked here with IF NOT EXISTS so it is a no-op on dev and prod (nothing is built or locked there)
-- and creates the indexes for any database rebuilt from migrations. Definitions are exactly the live ones.
-- (Plain CREATE INDEX: migrations run in a transaction, so CONCURRENTLY is unavailable; on a database
-- that already has them this statement does no work.)

CREATE INDEX IF NOT EXISTS idx_estimates_tenant_buyer_metric_day
  ON app.estimates USING btree (tenant_id, buyer_id, app.metric_day_ist(estimate_date, created_at))
  WHERE (deleted_at IS NULL);

CREATE INDEX IF NOT EXISTS idx_invoices_tenant_buyer_metric_day
  ON app.invoices USING btree (tenant_id, buyer_id, app.metric_day_ist(invoice_date, created_at))
  WHERE (deleted_at IS NULL);

CREATE INDEX IF NOT EXISTS idx_orders_tenant_buyer_metric_day
  ON app.orders USING btree (tenant_id, buyer_id, app.metric_day_ist(order_date, created_at))
  WHERE (deleted_at IS NULL);
