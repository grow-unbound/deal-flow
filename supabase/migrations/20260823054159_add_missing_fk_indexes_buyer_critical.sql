-- Perf: 5 foreign keys on the buyer-critical write/read path have no
-- covering index (confirmed via Supabase performance advisor + a fresh
-- information_schema check this session). Every join through these FKs
-- (buyer detail pages, order/invoice/payment/credit-note lists filtered or
-- joined by buyer) forces a seq scan on the child table instead of an
-- index scan. Plain (non-CONCURRENTLY) CREATE INDEX is fine here -- current
-- table sizes are small (buyers ~12k, invoices ~21k, orders/payments/
-- credit_notes each in the hundreds), so the brief write lock is
-- negligible; this is exactly the kind of fix that gets harder to apply
-- safely the longer it's deferred as these tables grow.
--
-- Larger, lower-urgency batch (metrics_* tables' tenant_id/buyer_id/
-- location_id/warehouse_id FKs) is deliberately left for a separate
-- follow-up migration so a slower index build there doesn't block these.

CREATE INDEX IF NOT EXISTS idx_buyers_user_id ON app.buyers (user_id);
CREATE INDEX IF NOT EXISTS idx_orders_buyer_id ON app.orders (buyer_id);
CREATE INDEX IF NOT EXISTS idx_payments_buyer_id ON app.payments (buyer_id);
CREATE INDEX IF NOT EXISTS idx_invoices_buyer_id ON app.invoices (buyer_id);
CREATE INDEX IF NOT EXISTS idx_credit_notes_buyer_id ON app.credit_notes (buyer_id);
