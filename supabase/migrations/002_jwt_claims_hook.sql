-- ==================== get_user_workspace RPC ====================
-- Called by /api/auth/signin and /api/auth/workspace routes.
-- Returns the first active workspace (seller or buyer) for a given user.
CREATE OR REPLACE FUNCTION public.get_user_workspace(p_user_id uuid)
RETURNS TABLE (
  workspace_type text,
  role          text,
  tenant_id     uuid,
  tenant_slug   text,
  tenant_name   text,
  buyer_id      uuid
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, app
AS $$
BEGIN
  -- Seller path: check tenant_users first
  RETURN QUERY
  SELECT
    'seller'::text,
    tu.role,
    t.id,
    t.slug,
    t.business_name,
    NULL::uuid
  FROM app.tenant_users tu
  JOIN app.tenants t ON t.id = tu.tenant_id
  WHERE tu.user_id = p_user_id
    AND tu.is_active = true
  ORDER BY tu.created_at
  LIMIT 1;

  IF FOUND THEN
    RETURN;
  END IF;

  -- Buyer path: derive tenant from the buyer record
  RETURN QUERY
  SELECT
    'buyer'::text,
    bu.role,
    b.tenant_id,
    t.slug,
    t.business_name,
    bu.buyer_id
  FROM app.buyer_users bu
  JOIN app.buyers b  ON b.id  = bu.buyer_id
  JOIN app.tenants t ON t.id  = b.tenant_id
  WHERE bu.user_id = p_user_id
    AND bu.is_active = true
  ORDER BY bu.created_at
  LIMIT 1;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_user_workspace(uuid) TO authenticated, service_role;

-- ==================== custom_access_token_hook ====================
-- Supabase Auth calls this function on every JWT generation/refresh.
-- Adds tenant_id, role, and buyer_id (nullable) as custom JWT claims.
--
-- Multi-tenant resolution order:
--   1. app_metadata.current_tenant_id  (set by signin route from subdomain)
--   2. First active tenant_users row   (fallback for seller)
--   3. First active buyer_users row    (fallback for buyer)
--
-- Registration: Dashboard → Authentication → Hooks → custom_access_token_hook
-- URI: pg-functions://postgres/public/custom_access_token_hook
CREATE OR REPLACE FUNCTION public.custom_access_token_hook(event jsonb)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, app
AS $$
DECLARE
  claims           jsonb;
  v_user_id        uuid;
  v_current_tid    uuid;
  v_tenant_id      uuid;
  v_role           text;
  v_buyer_id       uuid;
BEGIN
  claims    := event -> 'claims';
  v_user_id := (event ->> 'user_id')::uuid;

  -- Prefer current_tenant_id stored in app_metadata (set at login from subdomain)
  v_current_tid := (claims -> 'app_metadata' ->> 'current_tenant_id')::uuid;

  -- Seller path
  IF v_current_tid IS NOT NULL THEN
    SELECT tu.tenant_id, tu.role
    INTO   v_tenant_id, v_role
    FROM   app.tenant_users tu
    WHERE  tu.user_id   = v_user_id
      AND  tu.tenant_id = v_current_tid
      AND  tu.is_active = true
    LIMIT 1;
  END IF;

  IF v_tenant_id IS NULL THEN
    SELECT tu.tenant_id, tu.role
    INTO   v_tenant_id, v_role
    FROM   app.tenant_users tu
    WHERE  tu.user_id   = v_user_id
      AND  tu.is_active = true
    ORDER BY tu.created_at
    LIMIT 1;
  END IF;

  -- Buyer path (no seller membership found)
  IF v_tenant_id IS NULL THEN
    SELECT b.tenant_id, bu.role, bu.buyer_id
    INTO   v_tenant_id, v_role, v_buyer_id
    FROM   app.buyer_users bu
    JOIN   app.buyers b ON b.id = bu.buyer_id
    WHERE  bu.user_id   = v_user_id
      AND  bu.is_active = true
    ORDER BY bu.created_at
    LIMIT 1;
  END IF;

  -- Inject claims (null values become JSON null — clients must handle)
  claims := jsonb_set(claims, '{tenant_id}', to_jsonb(v_tenant_id::text));
  claims := jsonb_set(claims, '{role}',      to_jsonb(v_role));

  IF v_buyer_id IS NOT NULL THEN
    claims := jsonb_set(claims, '{buyer_id}', to_jsonb(v_buyer_id::text));
  ELSE
    claims := claims - 'buyer_id';
  END IF;

  RETURN jsonb_set(event, '{claims}', claims);
END;
$$;

-- supabase_auth_admin needs execute + read access to app schema tables
GRANT EXECUTE ON FUNCTION public.custom_access_token_hook(jsonb) TO supabase_auth_admin;
GRANT USAGE  ON SCHEMA app TO supabase_auth_admin;
GRANT SELECT ON app.tenant_users, app.buyer_users, app.buyers, app.tenants TO supabase_auth_admin;
