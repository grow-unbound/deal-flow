-- The customers sync phase failed with "canceling statement due to statement
-- timeout" — traced to the `authenticator` Postgres role (which PostgREST
-- logs in as for every supabase-js request, including service_role calls —
-- SET ROLE mid-session does not reset session-level GUCs applied at login)
-- carrying `statement_timeout = 8s`. Bulk sync operations (a 200-row upsert
-- via app.bulk_persist_jsonb_records, or a 500-id search-vector rebuild with
-- joins/tsvector generation) can legitimately exceed 8s as data volume grows,
-- and this will keep recurring regardless of retries — it's a structural
-- ceiling, not a transient failure.
--
-- Fix: give these specific hot-path RPCs their own longer statement_timeout
-- via a function-level SET, which overrides the ambient session/role default
-- only for the duration of the call — the global 8s safety net for regular
-- API traffic is untouched.
ALTER FUNCTION app.bulk_persist_jsonb_records(text, jsonb, text[]) SET statement_timeout = '60s';
ALTER FUNCTION app.rebuild_buyers_search_vectors(uuid, uuid[]) SET statement_timeout = '60s';
ALTER FUNCTION app.rebuild_buyer_users_search_vectors(uuid[], uuid[]) SET statement_timeout = '60s';
