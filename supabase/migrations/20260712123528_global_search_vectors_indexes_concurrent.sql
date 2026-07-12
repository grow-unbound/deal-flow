-- Index creation only, split into its own migration so it never shares a
-- transaction with the schema/trigger DDL or the data backfill — CREATE
-- INDEX CONCURRENTLY cannot run inside a transaction block at all, and even
-- without CONCURRENTLY, building an index while the same transaction is
-- already dirtying the table (the original migration's failure mode) stacks
-- an AccessExclusiveLock on top of a lock already held for minutes.
--
-- NOTE before applying: `supabase db push` needs to run each statement below
-- outside an implicit transaction for CONCURRENTLY to work. If it errors
-- with "CREATE INDEX CONCURRENTLY cannot run inside a transaction block",
-- apply this file's statements individually via `supabase db query` / the
-- Supabase SQL editor / execute_sql (one at a time, each its own
-- connection) instead of `db push`.
-- app.tenant_products.search_vector is maintained (own-entity + same-tenant
-- cascade triggers) but not queried anywhere — global_search()'s product
-- branch delegates to app.search_products() (pre-existing, its own separate
-- search mechanism), not this column directly. No index added for it here,
-- matching the original migration's scope; add one only if something starts
-- querying it.
--
-- app.buyers.search_vector IS queried directly by global_search()'s
-- "customer" branch (`b.search_vector @@ v_ts_query`) — the original
-- migration omitted this index, which would have forced a full sequential
-- scan with `@@` on every search call across all 10,575 buyer rows. Added
-- here since we're already touching this file.
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_buyers_search_vector ON app.buyers USING gin (search_vector);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_tenant_brands_search_vector ON app.tenant_brands USING gin (search_vector);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_tenant_categories_search_vector ON app.tenant_categories USING gin (search_vector);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_locations_search_vector ON app.locations USING gin (search_vector);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_warehouses_search_vector ON app.warehouses USING gin (search_vector);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_cohorts_search_vector ON app.cohorts USING gin (search_vector);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_campaigns_search_vector ON app.campaigns USING gin (search_vector);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_price_lists_search_vector ON app.price_lists USING gin (search_vector);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_orders_tenant_lower_number ON app.orders (tenant_id, (lower(order_number))) WHERE deleted_at IS NULL;
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_invoices_tenant_lower_number ON app.invoices (tenant_id, (lower(invoice_number))) WHERE deleted_at IS NULL;
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_estimates_tenant_lower_number ON app.estimates (tenant_id, (lower(estimate_number))) WHERE deleted_at IS NULL;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_orders_number_trgm ON app.orders USING gin ((lower(order_number)) public.gin_trgm_ops) WHERE deleted_at IS NULL;
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_invoices_number_trgm ON app.invoices USING gin ((lower(invoice_number)) public.gin_trgm_ops) WHERE deleted_at IS NULL;
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_estimates_number_trgm ON app.estimates USING gin ((lower(estimate_number)) public.gin_trgm_ops) WHERE deleted_at IS NULL;
