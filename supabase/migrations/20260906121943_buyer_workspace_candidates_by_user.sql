-- Catalog workspace finder for an already-authenticated buyer session.
--
-- This intentionally stays in the app schema and does not touch auth.users.
-- It resolves the authenticated user's known buyer phone(s) from app.buyers /
-- app.buyer_users, then expands to every buyer relationship for that phone so
-- the one-auth-user-per-phone model still discovers relationships that have
-- not yet been lazily linked to the shared auth user.
CREATE OR REPLACE FUNCTION app.find_buyer_workspace_candidates_for_user(p_user_id uuid)
RETURNS TABLE (
  kind text,
  id uuid,
  tenant_id uuid,
  business_name text,
  contact_name text,
  buyer_id uuid,
  role text,
  user_id uuid,
  buyer_user_id uuid,
  phone text,
  buyer_app_enabled boolean,
  tenant_business_name text,
  tenant_slug text,
  tenant_whatsapp_number text,
  tenant_whatsapp_display_name text,
  tenant_logo_url text
)
LANGUAGE sql
STABLE
SET search_path TO 'pg_catalog', 'app'
AS $function$
  WITH caller_phones AS (
    SELECT DISTINCT b.phone
    FROM app.buyers b
    WHERE b.user_id = p_user_id
      AND b.phone IS NOT NULL
      AND b.is_active = true
      AND b.deleted_at IS NULL

    UNION

    SELECT DISTINCT bu.phone
    FROM app.buyer_users bu
    JOIN app.buyers b ON b.id = bu.buyer_id
    WHERE bu.user_id = p_user_id
      AND bu.phone IS NOT NULL
      AND bu.is_active = true
      AND bu.deleted_at IS NULL
      AND b.is_active = true
      AND b.deleted_at IS NULL
  ),
  candidate_rows AS (
    SELECT
      'owner'::text AS kind,
      b.id,
      b.tenant_id,
      b.business_name,
      b.contact_name,
      b.id AS buyer_id,
      'buyer_admin'::text AS role,
      b.user_id,
      NULL::uuid AS buyer_user_id,
      b.phone,
      b.buyer_app_enabled,
      t.business_name AS tenant_business_name,
      t.slug AS tenant_slug,
      NULLIF(COALESCE(ts.settings, t.settings) #>> '{buyer_app,whatsapp_number}', '') AS tenant_whatsapp_number,
      NULLIF(COALESCE(ts.settings, t.settings) #>> '{buyer_app,whatsapp_display_name}', '') AS tenant_whatsapp_display_name,
      t.logo_url AS tenant_logo_url,
      b.created_at,
      b.id AS stable_id
    FROM caller_phones cp
    JOIN app.buyers b ON b.phone = cp.phone
    JOIN app.tenants t ON t.id = b.tenant_id
    LEFT JOIN app.tenant_settings ts ON ts.tenant_id = b.tenant_id
    WHERE b.is_active = true
      AND b.deleted_at IS NULL
      AND b.buyer_app_enabled = true

    UNION ALL

    SELECT
      'delegate'::text AS kind,
      bu.id,
      b.tenant_id,
      b.business_name,
      COALESCE(NULLIF(TRIM(CONCAT_WS(' ', bu.first_name, bu.last_name)), ''), b.contact_name) AS contact_name,
      bu.buyer_id,
      bu.role,
      bu.user_id,
      bu.id AS buyer_user_id,
      bu.phone,
      b.buyer_app_enabled,
      t.business_name AS tenant_business_name,
      t.slug AS tenant_slug,
      NULLIF(COALESCE(ts.settings, t.settings) #>> '{buyer_app,whatsapp_number}', '') AS tenant_whatsapp_number,
      NULLIF(COALESCE(ts.settings, t.settings) #>> '{buyer_app,whatsapp_display_name}', '') AS tenant_whatsapp_display_name,
      t.logo_url AS tenant_logo_url,
      bu.created_at,
      bu.id AS stable_id
    FROM caller_phones cp
    JOIN app.buyer_users bu ON bu.phone = cp.phone
    JOIN app.buyers b ON b.id = bu.buyer_id
    JOIN app.tenants t ON t.id = b.tenant_id
    LEFT JOIN app.tenant_settings ts ON ts.tenant_id = b.tenant_id
    WHERE bu.is_active = true
      AND bu.deleted_at IS NULL
      AND b.is_active = true
      AND b.deleted_at IS NULL
      AND b.buyer_app_enabled = true
  )
  SELECT
    cr.kind,
    cr.id,
    cr.tenant_id,
    cr.business_name,
    cr.contact_name,
    cr.buyer_id,
    cr.role,
    cr.user_id,
    cr.buyer_user_id,
    cr.phone,
    cr.buyer_app_enabled,
    cr.tenant_business_name,
    cr.tenant_slug,
    cr.tenant_whatsapp_number,
    cr.tenant_whatsapp_display_name,
    cr.tenant_logo_url
  FROM candidate_rows cr
  ORDER BY cr.tenant_business_name, cr.business_name, cr.created_at, cr.stable_id;
$function$;

REVOKE ALL ON FUNCTION app.find_buyer_workspace_candidates_for_user(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.find_buyer_workspace_candidates_for_user(uuid) TO service_role;
