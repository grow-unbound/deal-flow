-- Companion to 20260704170049_raise_statement_timeout_for_bulk_sync_rpcs.sql —
-- that migration only overrode statement_timeout, but the `authenticator` role
-- (which every supabase-js/PostgREST call logs in as, service_role included)
-- also carries `lock_timeout = 8s`. The real trigger for lock_timeout errors
-- was a concurrency race in integrations-sync (fixed separately: the
-- concurrent-start guard is now an atomic conditional UPDATE instead of a
-- racy read-then-write), but 8s is still too tight a ceiling for these
-- bulk-write RPCs to wait on any legitimate lock (e.g. a concurrent read
-- transaction, trigger-held lock) without being defensive here too.
ALTER FUNCTION app.bulk_persist_jsonb_records(text, jsonb, text[]) SET lock_timeout = '30s';
ALTER FUNCTION app.rebuild_buyers_search_vectors(uuid, uuid[]) SET lock_timeout = '30s';
ALTER FUNCTION app.rebuild_buyer_users_search_vectors(uuid[], uuid[]) SET lock_timeout = '30s';
