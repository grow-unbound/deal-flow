-- ============================================================
-- Migration 004: Atomic tenant-creation RPC (EP-01-001)
-- ============================================================
-- RLS policies live in 003_rls_policies.sql (EP-11-002).
-- This migration adds only the SECURITY DEFINER function used
-- by the signup API route to atomically create a tenant and
-- link the auth user as seller_admin.
-- ============================================================

-- ------------------------------------------------------------------
-- Atomic tenant + seller_admin creation.
-- Called from app/api/auth/signup/route.ts after Supabase Auth sign-up.
-- SECURITY DEFINER so it can INSERT without the caller needing
-- direct write permissions on app.tenants or app.tenant_users.
-- ------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.create_tenant_and_admin(
  p_user_id       uuid,
  p_slug          text,
  p_business_name text,
  p_primary_state text DEFAULT NULL,
  p_gstin         text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app
AS $$
DECLARE
  v_tenant_id uuid;
  v_subdomain  text;
BEGIN
  v_subdomain := p_slug || '.dealflow.in';

  INSERT INTO app.tenants (
    slug, business_name, gstin, primary_state,
    subdomain, created_by, updated_by
  ) VALUES (
    p_slug, p_business_name, p_gstin, p_primary_state,
    v_subdomain, p_user_id, p_user_id
  )
  RETURNING id INTO v_tenant_id;

  INSERT INTO app.tenant_users (
    tenant_id, user_id, role, joined_at, created_by, updated_by
  ) VALUES (
    v_tenant_id, p_user_id, 'seller_admin', now(), p_user_id, p_user_id
  );

  RETURN jsonb_build_object(
    'tenant_id', v_tenant_id,
    'slug',      p_slug,
    'subdomain', v_subdomain
  );
END;
$$;

GRANT EXECUTE ON FUNCTION app.create_tenant_and_admin(uuid, text, text, text, text)
  TO service_role;
