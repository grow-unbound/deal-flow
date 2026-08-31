-- Tracks a gap found during post-colocation advisor review: the DB
-- migration dump/restore to yukti-prod (cckmurgapnkytbzxqesp) was scoped
-- to `--schema=app --schema=catalog` only -- the `public` schema was
-- never included, so 3 real functions never made it across:
-- custom_access_token_hook (the Auth Hook itself), find_seller_
-- candidates_by_phone, get_user_workspace. Only public.rls_auto_enable
-- existed on yukti-prod, as a Supabase platform default, not something
-- migrated.
--
-- These 3 already exist correctly on yukti (this migration is a no-op
-- CREATE OR REPLACE here, tracked for audit-trail consistency) -- the
-- fix this migration represents was applying the identical definitions
-- + grants directly to yukti-prod, since that project isn't CLI-linked
-- in this repo. Definitions pulled live from yukti, matching its
-- originating migrations (20260709000001_prod_bootstrap.sql,
-- 20260811120355_custom_access_token_hook_buyer_owner_direct.sql,
-- 20260812063622_get_user_workspace_buyer_owner_direct.sql).
--
-- NOTE for future colocation/DR work: any `public` schema objects need
-- explicit scoping in the pg_dump command -- don't assume app+catalog
-- covers everything.
CREATE OR REPLACE FUNCTION public.custom_access_token_hook(event jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'app'
AS $function$
DECLARE
  claims           jsonb;
  v_user_id        uuid;
  v_current_tid    uuid;
  v_current_bid    uuid;
  v_tenant_id      uuid;
  v_role           text;
  v_buyer_id       uuid;
  v_location_ids   uuid[];
  v_platform_admin boolean := false;
BEGIN
  claims := COALESCE(event -> 'claims', '{}'::jsonb);
  IF jsonb_typeof(claims) <> 'object' THEN
    claims := '{}'::jsonb;
  END IF;

  v_user_id := (event ->> 'user_id')::uuid;

  SELECT EXISTS (
    SELECT 1 FROM app.platform_admins pa WHERE pa.user_id = v_user_id
  )
  INTO v_platform_admin;

  v_current_tid := (claims -> 'app_metadata' ->> 'current_tenant_id')::uuid;
  v_current_bid := (claims -> 'app_metadata' ->> 'current_buyer_id')::uuid;

  IF v_current_tid IS NOT NULL THEN
    SELECT tu.tenant_id, tu.role, tu.location_ids
    INTO   v_tenant_id, v_role, v_location_ids
    FROM   app.tenant_users tu
    WHERE  tu.user_id = v_user_id
      AND  tu.tenant_id = v_current_tid
      AND  tu.is_active = true
    LIMIT 1;
  END IF;

  IF v_tenant_id IS NULL THEN
    SELECT tu.tenant_id, tu.role, tu.location_ids
    INTO   v_tenant_id, v_role, v_location_ids
    FROM   app.tenant_users tu
    WHERE  tu.user_id = v_user_id
      AND  tu.is_active = true
    ORDER BY tu.created_at
    LIMIT 1;
  END IF;

  IF v_tenant_id IS NULL THEN
    SELECT b.tenant_id, 'buyer_admin'::text, b.id
    INTO   v_tenant_id, v_role, v_buyer_id
    FROM   app.buyers b
    WHERE  b.user_id = v_user_id
      AND  b.is_active = true
      AND  b.buyer_app_enabled = true
      AND  b.deleted_at IS NULL
    LIMIT 1;
  END IF;

  IF v_tenant_id IS NULL THEN
    SELECT b.tenant_id, bu.role, bu.buyer_id
    INTO   v_tenant_id, v_role, v_buyer_id
    FROM   app.buyer_users bu
    JOIN   app.buyers b ON b.id = bu.buyer_id
    WHERE  bu.user_id = v_user_id
      AND  bu.is_active = true
      AND  b.is_active = true
      AND  b.buyer_app_enabled = true
      AND  b.deleted_at IS NULL
      AND  (v_current_tid IS NULL OR b.tenant_id = v_current_tid)
      AND  (v_current_bid IS NULL OR bu.buyer_id = v_current_bid)
    ORDER BY
      CASE WHEN bu.buyer_id = v_current_bid THEN 0 ELSE 1 END,
      CASE WHEN b.tenant_id = v_current_tid THEN 0 ELSE 1 END,
      bu.created_at
    LIMIT 1;
  END IF;

  IF v_tenant_id IS NULL THEN
    SELECT b.tenant_id, bu.role, bu.buyer_id
    INTO   v_tenant_id, v_role, v_buyer_id
    FROM   app.buyer_users bu
    JOIN   app.buyers b ON b.id = bu.buyer_id
    WHERE  bu.user_id = v_user_id
      AND  bu.is_active = true
      AND  b.is_active = true
      AND  b.buyer_app_enabled = true
      AND  b.deleted_at IS NULL
    ORDER BY bu.created_at
    LIMIT 1;
  END IF;

  claims := claims - 'tenant_id' - 'user_role' - 'is_platform_admin';

  IF v_tenant_id IS NOT NULL THEN
    claims := jsonb_set(claims, '{tenant_id}', to_jsonb(v_tenant_id::text));
  END IF;

  IF v_role IS NOT NULL THEN
    claims := jsonb_set(claims, '{user_role}', to_jsonb(v_role));
  END IF;

  IF v_buyer_id IS NOT NULL THEN
    claims := jsonb_set(claims, '{buyer_id}', to_jsonb(v_buyer_id::text));
  ELSE
    claims := claims - 'buyer_id';
  END IF;

  IF v_location_ids IS NOT NULL THEN
    claims := jsonb_set(claims, '{location_ids}', to_jsonb(v_location_ids));
  ELSE
    claims := claims - 'location_ids';
  END IF;

  IF v_platform_admin THEN
    claims := jsonb_set(claims, '{is_platform_admin}', 'true'::jsonb);
  END IF;

  IF claims IS NULL OR jsonb_typeof(claims) <> 'object' THEN
    claims := '{}'::jsonb;
  END IF;

  RETURN jsonb_set(event, '{claims}', claims);
END;
$function$;

CREATE OR REPLACE FUNCTION public.find_seller_candidates_by_phone(p_phone text)
 RETURNS TABLE(user_id uuid, tenant_id uuid, tenant_name text, tenant_slug text, role text, location_ids uuid[], email text, full_name text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'app'
AS $function$
  SELECT
    tu.user_id,
    tu.tenant_id,
    t.business_name AS tenant_name,
    t.slug           AS tenant_slug,
    tu.role,
    tu.location_ids,
    tu.email,
    tu.full_name
  FROM app.tenant_users tu
  JOIN app.tenants t ON t.id = tu.tenant_id
  WHERE tu.phone = p_phone
    AND tu.is_active = true;
$function$;

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
$function$;

GRANT EXECUTE ON FUNCTION public.custom_access_token_hook(jsonb) TO PUBLIC, anon, authenticated, postgres, service_role;
GRANT EXECUTE ON FUNCTION public.find_seller_candidates_by_phone(text) TO PUBLIC, anon, authenticated, postgres, service_role;
GRANT EXECUTE ON FUNCTION public.get_user_workspace(uuid) TO PUBLIC, anon, authenticated, postgres, service_role;
