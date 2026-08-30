-- 2 of the remaining advisor findings were PROCEDURES, not functions --
-- the prior search_path-pinning pass (20260830145120) filtered on
-- prokind='f' and missed them. Same fix, same allowlist, applied to both
-- yukti and yukti-prod (confirmed present on both, both SECURITY INVOKER
-- by default for procedures with no DEFINER clause).
ALTER PROCEDURE app._metrics_v4_backfill_driver(p_tenant_ids uuid[], p_backfill_start date, p_chunk_days integer, p_max_drain_iterations integer, p_commit_every integer) SET search_path TO 'pg_catalog', 'app', 'catalog', 'public', 'extensions';
ALTER PROCEDURE app._metrics_v4_solo_backfill(p_tenant_id uuid, p_from date, p_to date) SET search_path TO 'pg_catalog', 'app', 'catalog', 'public', 'extensions';
