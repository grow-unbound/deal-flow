-- Validation-only platform shim for fresh hosted Supabase projects.
--
-- The production bootstrap dump contains database-webhook triggers that call
-- supabase_functions.http_request(...). Existing linked projects have that
-- platform helper, but a brand-new hosted project can be missing it until
-- Database Webhooks are initialized. Phase 1A does not test outbound Zoho
-- webhooks, so this no-op trigger function preserves migration applicability
-- without adding HTTP side effects to the controlled metrics workload.

CREATE SCHEMA IF NOT EXISTS supabase_functions;

CREATE OR REPLACE FUNCTION supabase_functions.http_request()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN COALESCE(NEW, OLD);
END;
$$;
