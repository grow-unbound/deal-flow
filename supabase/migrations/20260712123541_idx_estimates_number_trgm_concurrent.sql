-- See 20260712123528_idx_buyers_search_vector_concurrent.sql for why this is
-- one CREATE INDEX CONCURRENTLY per file.
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_estimates_number_trgm ON app.estimates USING gin ((lower(estimate_number)) public.gin_trgm_ops) WHERE deleted_at IS NULL;
