-- Fix: the nightly Today/Inbox refresh (pg_cron `inbox-entries-daily-refresh`) failed every night with
--   duplicate key value violates unique constraint "entries_tenant_external_ref_uk"
-- A soft-deleted entry keeps external_ref = dedupe_key, but app.upsert_entry conflicts only on the
-- partial active dedupe index (deleted_at IS NULL), so re-creating the entry inserted a second row
-- with the same external_ref. refresh_entries_all_tenants then aborted for every tenant, leaving
-- entry snapshots (e.g. credit_limit_breach amounts) stale.

-- 1. External refs only need to be unique among live entries.
DROP INDEX IF EXISTS app.entries_tenant_external_ref_uk;
CREATE UNIQUE INDEX entries_tenant_external_ref_uk
  ON app.entries (tenant_id, external_ref)
  WHERE external_ref IS NOT NULL AND deleted_at IS NULL;

-- 2. One tenant's failure must not block the refresh for every other tenant.
CREATE OR REPLACE FUNCTION app.refresh_entries_all_tenants()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
DECLARE
  v_tenant record;
  v_result jsonb := '{}'::jsonb;
BEGIN
  FOR v_tenant IN
    SELECT id FROM app.tenants WHERE deleted_at IS NULL ORDER BY created_at ASC
  LOOP
    BEGIN
      v_result := v_result || jsonb_build_object(v_tenant.id::text, app.refresh_entries_for_tenant(v_tenant.id));
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'refresh_entries_for_tenant % failed: % (%)', v_tenant.id, SQLERRM, SQLSTATE;
      v_result := v_result || jsonb_build_object(v_tenant.id::text, jsonb_build_object('error', SQLERRM));
    END;
  END LOOP;
  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION app.refresh_entries_all_tenants() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION app.refresh_entries_all_tenants() TO service_role;
