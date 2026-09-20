-- Phase 6 of the yukti-prod DB recovery (see specs/db-perf-recovery-2026-09-20.md).
--
-- Conservative index diet. Prod is at ~449 MB of the 500 MB free-tier database limit and every
-- extra index adds write amplification on hot tables (invoices carries 22 indexes on a 24 MB heap).
-- pg_stat_user_indexes covers 2026-08-25 .. 2026-09-20 (26 days, including the Zoho daily syncs
-- and the incident window).
--
-- Dropped (all plain, non-constraint indexes):
--   * zero scans, no query shape that could use them (btree on lower(number) - the number search
--     is ILIKE '%q%' and uses the trigram indexes, which are KEPT):
--       invoices: idx_invoices_tenant_lower_number (6.8 MB), idx_invoices_due_date (1.0 MB),
--                 idx_invoices_status (0.97 MB, 6 scans; low-cardinality, superseded by the
--                 tenant/status/due composites)
--       estimates: idx_estimates_tenant_lower_number, idx_estimates_tenant_status_valid_until,
--                  idx_estimates_expires_at
--   * strict prefix of another index (FK coverage retained by the composite):
--       integration_entity_map: idx_integration_entity_map_tenant_integration_id
--         (covered by idx_integration_entity_map_tenant_integration_tenant (tenant_integration_id, tenant_id))
--   * exact duplicates of a constraint/unique/PK index (identical columns and predicate):
--       otp_sessions.idx_otp_sessions_ref_id (= pkey; otp_sessions is write-heavy at buyer login),
--       tenants.idx_tenants_slug, tenants.idx_tenants_subdomain,
--       integration_oauth_states.integration_oauth_states_token_idx,
--       campaigns.idx_campaigns_share_token
--
-- Deliberately KEPT: FK and created_by/updated_by audit indexes (FK-delete safety, small), all
-- search/trgm/embedding/search_vector indexes (public-catalog launch), everything used by metrics.
-- Total reclaimed: ~11 MB and fewer index writes on invoices/estimates/otp_sessions.
--
-- Rollback = recreate from the definitions in this file's history / the spec log. Idempotent.

SET LOCAL lock_timeout = '5s';

DROP INDEX IF EXISTS app.idx_invoices_tenant_lower_number;
DROP INDEX IF EXISTS app.idx_invoices_due_date;
DROP INDEX IF EXISTS app.idx_invoices_status;
DROP INDEX IF EXISTS app.idx_estimates_tenant_lower_number;
DROP INDEX IF EXISTS app.idx_estimates_tenant_status_valid_until;
DROP INDEX IF EXISTS app.idx_estimates_expires_at;
DROP INDEX IF EXISTS app.idx_integration_entity_map_tenant_integration_id;
DROP INDEX IF EXISTS app.idx_otp_sessions_ref_id;
DROP INDEX IF EXISTS app.idx_tenants_slug;
DROP INDEX IF EXISTS app.idx_tenants_subdomain;
DROP INDEX IF EXISTS app.integration_oauth_states_token_idx;
DROP INDEX IF EXISTS app.idx_campaigns_share_token;
