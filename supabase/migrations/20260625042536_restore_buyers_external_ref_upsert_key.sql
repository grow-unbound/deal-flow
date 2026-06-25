-- Restore the non-partial upsert key required by Supabase/PostgREST
-- for Zoho contact webhooks:
--   onConflict: 'tenant_id,external_ref'
--
-- Postgres permits multiple NULL values in a UNIQUE index, so existing
-- non-integrated buyers without external_ref remain valid.
CREATE UNIQUE INDEX IF NOT EXISTS buyers_tenant_external_ref_upsert
  ON app.buyers (tenant_id, external_ref);
