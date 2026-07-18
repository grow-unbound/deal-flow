-- Request-path landing summaries filter by canonical IST document day. Keep
-- these indexes partial and narrow so they do not add work for soft-deleted or
-- unattributed documents.
CREATE INDEX IF NOT EXISTS idx_orders_campaign_metric_day
  ON app.orders (tenant_id, campaign_id, app.metric_day_ist(order_date, created_at))
  INCLUDE (total_amount, status)
  WHERE deleted_at IS NULL AND campaign_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_estimates_campaign_metric_day
  ON app.estimates (tenant_id, campaign_id, app.metric_day_ist(estimate_date, created_at))
  INCLUDE (total_amount, status, converted_to_order_id)
  WHERE deleted_at IS NULL AND campaign_id IS NOT NULL;
