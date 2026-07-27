-- Backend-orchestration tables have no legitimate client-side subscribers; their WAL
-- traffic (esp. integration_sync_jobs.heartbeat_at, updated every few seconds per active
-- sync job) was ~25% of total DB time in pg_stat_statements (Realtime WAL decode).
ALTER PUBLICATION supabase_realtime DROP TABLE app.integration_sync_jobs;
ALTER PUBLICATION supabase_realtime DROP TABLE app.tenant_integrations;
