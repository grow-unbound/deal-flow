-- See 20260712123528_idx_buyers_search_vector_concurrent.sql for why this is
-- one CREATE INDEX CONCURRENTLY per file.
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_estimates_tenant_lower_number ON app.estimates (tenant_id, (lower(estimate_number))) WHERE deleted_at IS NULL;
