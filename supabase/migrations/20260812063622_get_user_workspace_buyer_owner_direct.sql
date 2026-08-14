-- Same gap as custom_access_token_hook: get_user_workspace only resolved buyer
-- identity via app.buyer_users (bu.user_id = p_user_id), never app.buyers.user_id.
-- This RPC backs getVerifiedClaims()'s fallback path (used by routes under the
-- public /api/auth prefix, e.g. switch-context, where middleware doesn't inject
-- x-verified-* headers) — for a buyer owner it returned zero rows, leaving role/
-- tenant_id/phone unresolved ("No phone number on file for this account.").
CREATE OR REPLACE FUNCTION public.get_user_workspace(p_user_id uuid)
 RETURNS TABLE(workspace_type text, role text, tenant_id uuid, tenant_slug text, tenant_name text, buyer_id uuid, location_ids uuid[])
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'app'
AS $function$
DECLARE
  v_current_tid uuid;
  v_current_bid uuid;
BEGIN
  SELECT
    (u.raw_app_meta_data ->> 'current_tenant_id')::uuid,
    (u.raw_app_meta_data ->> 'current_buyer_id')::uuid
  INTO
    v_current_tid,
    v_current_bid
  FROM auth.users u
  WHERE u.id = p_user_id;

  RETURN QUERY
  SELECT
    'seller'::text,
    tu.role,
    t.id,
    t.slug,
    t.business_name,
    NULL::uuid,
    tu.location_ids
  FROM app.tenant_users tu
  JOIN app.tenants t ON t.id = tu.tenant_id
  WHERE tu.user_id = p_user_id
    AND tu.is_active = true
    AND (v_current_tid IS NULL OR tu.tenant_id = v_current_tid)
  ORDER BY CASE WHEN tu.tenant_id = v_current_tid THEN 0 ELSE 1 END, tu.created_at
  LIMIT 1;

  IF FOUND THEN
    RETURN;
  END IF;

  -- Buyer owner — logs in directly as app.buyers, no buyer_users row.
  RETURN QUERY
  SELECT
    'buyer'::text,
    'buyer_admin'::text,
    b.tenant_id,
    t.slug,
    t.business_name,
    b.id,
    NULL::uuid[]
  FROM app.buyers b
  JOIN app.tenants t ON t.id = b.tenant_id
  WHERE b.user_id = p_user_id
    AND b.is_active = true
    AND b.buyer_app_enabled = true
    AND b.deleted_at IS NULL
    AND (v_current_tid IS NULL OR b.tenant_id = v_current_tid)
    AND (v_current_bid IS NULL OR b.id = v_current_bid)
  LIMIT 1;

  IF FOUND THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    'buyer'::text,
    bu.role,
    b.tenant_id,
    t.slug,
    t.business_name,
    bu.buyer_id,
    NULL::uuid[]
  FROM app.buyer_users bu
  JOIN app.buyers b ON b.id = bu.buyer_id
  JOIN app.tenants t ON t.id = b.tenant_id
  WHERE bu.user_id = p_user_id
    AND bu.is_active = true
    AND b.is_active = true
    AND b.buyer_app_enabled = true
    AND b.deleted_at IS NULL
    AND (v_current_tid IS NULL OR b.tenant_id = v_current_tid)
    AND (v_current_bid IS NULL OR bu.buyer_id = v_current_bid)
  ORDER BY
    CASE WHEN bu.buyer_id = v_current_bid THEN 0 ELSE 1 END,
    CASE WHEN b.tenant_id = v_current_tid THEN 0 ELSE 1 END,
    bu.created_at
  LIMIT 1;
END;
$function$
