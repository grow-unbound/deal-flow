-- See 20260712123528_idx_buyers_search_vector_concurrent.sql for why this is
-- one CREATE INDEX CONCURRENTLY per file.
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_orders_tenant_lower_number ON app.orders (tenant_id, (lower(order_number))) WHERE deleted_at IS NULL;
