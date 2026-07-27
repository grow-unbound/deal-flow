-- Combines the two sequential PostgREST round trips findBuyerLoginCandidates() made
-- (app.buyers, then app.buyer_users, each with a nested tenants embed) into one RPC call.
-- Returns the same rows the two separate queries produced, tagged by kind so the caller
-- can build owner vs delegate candidates exactly as before.
CREATE OR REPLACE FUNCTION app.find_buyer_login_candidates(p_phone text)
RETURNS TABLE (
  kind text,
  id uuid,
  tenant_id uuid,
  business_name text,
  contact_name text,
  buyer_id uuid,
  role text,
  user_id uuid,
  buyer_app_enabled boolean,
  buyer_is_active boolean,
  buyer_deleted_at timestamptz,
  tenant_business_name text,
  tenant_slug text
)
LANGUAGE sql
STABLE
SET search_path TO 'pg_catalog', 'app'
AS $function$
  SELECT
    'owner'::text AS kind,
    b.id,
    b.tenant_id,
    b.business_name,
    b.contact_name,
    b.id AS buyer_id,
    'buyer_admin'::text AS role,
    NULL::uuid AS user_id,
    b.buyer_app_enabled,
    b.is_active AS buyer_is_active,
    b.deleted_at AS buyer_deleted_at,
    t.business_name AS tenant_business_name,
    t.slug AS tenant_slug
  FROM app.buyers b
  JOIN app.tenants t ON t.id = b.tenant_id
  WHERE b.phone = p_phone AND b.is_active = true AND b.deleted_at IS NULL

  UNION ALL

  SELECT
    'delegate'::text AS kind,
    bu.id,
    b.tenant_id,
    b.business_name,
    b.contact_name,
    bu.buyer_id,
    bu.role,
    bu.user_id,
    b.buyer_app_enabled,
    b.is_active AS buyer_is_active,
    b.deleted_at AS buyer_deleted_at,
    t.business_name AS tenant_business_name,
    t.slug AS tenant_slug
  FROM app.buyer_users bu
  JOIN app.buyers b ON b.id = bu.buyer_id
  JOIN app.tenants t ON t.id = b.tenant_id
  WHERE bu.phone = p_phone AND bu.is_active = true AND bu.deleted_at IS NULL;
$function$;
