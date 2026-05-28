-- ============================================================
-- Schema-level grants for app and catalog schemas.
--
-- The init migration created both schemas but did not grant
-- USAGE, so service_role and authenticated roles received
-- "permission denied for schema" (PG error 42501) on every
-- query, even though service_role bypasses RLS.
--
-- Grant matrix:
--   service_role  — full access on app.* (server-side API routes)
--   service_role  — full access on catalog.* (server-side enrichment)
--   authenticated — read on catalog.* (browsing master catalog)
--   authenticated — access on app.* governed by RLS policies
-- ============================================================

-- ──────────────────────────────────────────────────────────
-- app schema
-- ──────────────────────────────────────────────────────────
GRANT USAGE ON SCHEMA app TO service_role, authenticated, anon;

GRANT ALL ON ALL TABLES IN SCHEMA app TO service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA app TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA app TO authenticated;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA app TO authenticated;

ALTER DEFAULT PRIVILEGES IN SCHEMA app
  GRANT ALL ON TABLES TO service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA app
  GRANT ALL ON SEQUENCES TO service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA app
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA app
  GRANT USAGE, SELECT ON SEQUENCES TO authenticated;

-- ──────────────────────────────────────────────────────────
-- catalog schema
-- ──────────────────────────────────────────────────────────
GRANT USAGE ON SCHEMA catalog TO service_role, authenticated, anon;

GRANT ALL ON ALL TABLES IN SCHEMA catalog TO service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA catalog TO service_role;

GRANT SELECT ON ALL TABLES IN SCHEMA catalog TO authenticated, anon;

ALTER DEFAULT PRIVILEGES IN SCHEMA catalog
  GRANT ALL ON TABLES TO service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA catalog
  GRANT SELECT ON TABLES TO authenticated, anon;
