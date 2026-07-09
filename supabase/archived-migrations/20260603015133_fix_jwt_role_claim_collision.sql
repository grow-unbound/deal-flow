-- Fix: JWT "role" claim collision with PostgREST
--
-- The previous version of custom_access_token_hook wrote the application role
-- (e.g. "seller_admin") into the top-level "role" claim.  PostgREST reads that
-- field to run SET LOCAL ROLE, and "seller_admin" is not a PostgreSQL role, so
-- every PostgREST query using the user's JWT was failing.
--
-- Fix: store the application role under "user_role" (a custom claim) and leave
-- "role" untouched so PostgREST keeps using the "authenticated" PostgreSQL role.

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

  -- Seller path: match specific tenant if subdomain hint is present
  IF v_current_tid IS NOT NULL THEN
    SELECT tu.tenant_id, tu.role
    INTO   v_tenant_id, v_role
    FROM   app.tenant_users tu
    WHERE  tu.user_id   = v_user_id
      AND  tu.tenant_id = v_current_tid
      AND  tu.is_active = true
    LIMIT 1;
  END IF;

  -- Seller path: fallback to first active tenant
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

  -- Inject tenant_id and our application role as "user_role".
  -- IMPORTANT: do NOT touch the top-level "role" claim — PostgREST uses it to
  -- switch the PostgreSQL role (must stay "authenticated").
  claims := jsonb_set(claims, '{tenant_id}', to_jsonb(v_tenant_id::text));
  claims := jsonb_set(claims, '{user_role}', to_jsonb(v_role));

  IF v_buyer_id IS NOT NULL THEN
    claims := jsonb_set(claims, '{buyer_id}', to_jsonb(v_buyer_id::text));
  ELSE
    claims := claims - 'buyer_id';
  END IF;

  RETURN jsonb_set(event, '{claims}', claims);
END;
$$;

-- Re-grant execute in case the function was recreated
GRANT EXECUTE ON FUNCTION public.custom_access_token_hook(jsonb) TO supabase_auth_admin;
GRANT USAGE  ON SCHEMA app TO supabase_auth_admin;
GRANT SELECT ON app.tenant_users, app.buyer_users, app.buyers, app.tenants TO supabase_auth_admin;
