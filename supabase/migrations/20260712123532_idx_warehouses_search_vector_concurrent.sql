-- See 20260712123528_idx_buyers_search_vector_concurrent.sql for why this is
-- one CREATE INDEX CONCURRENTLY per file.
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_warehouses_search_vector ON app.warehouses USING gin (search_vector);
