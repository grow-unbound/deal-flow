ALTER TABLE app.buyers
  ADD COLUMN IF NOT EXISTS buyer_app_enabled boolean NOT NULL DEFAULT false;

ALTER TABLE app.buyer_users
  ADD COLUMN IF NOT EXISTS phone text;

CREATE INDEX IF NOT EXISTS idx_buyer_users_phone_active
  ON app.buyer_users (phone, is_active)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_buyers_phone_buyer_app
  ON app.buyers (phone, buyer_app_enabled, is_active)
  WHERE deleted_at IS NULL;

UPDATE app.buyer_users bu
SET phone = b.phone
FROM app.buyers b
WHERE b.id = bu.buyer_id
  AND bu.phone IS NULL
  AND bu.role = 'buyer_admin'
  AND b.phone IS NOT NULL;

CREATE OR REPLACE FUNCTION public.get_user_workspace(p_user_id uuid)
RETURNS TABLE (
  workspace_type text,
  role          text,
  tenant_id     uuid,
  tenant_slug   text,
  tenant_name   text,
  buyer_id      uuid,
  location_ids  uuid[]
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, app
AS $$
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
$$;

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
  v_current_bid    uuid;
  v_tenant_id      uuid;
  v_role           text;
  v_buyer_id       uuid;
  v_location_ids   uuid[];
BEGIN
  claims := event -> 'claims';
  v_user_id := (event ->> 'user_id')::uuid;
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

  claims := jsonb_set(claims, '{tenant_id}', to_jsonb(v_tenant_id::text));
  claims := jsonb_set(claims, '{user_role}', to_jsonb(v_role));

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

  RETURN jsonb_set(event, '{claims}', claims);
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_user_workspace(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.custom_access_token_hook(jsonb) TO supabase_auth_admin;
GRANT USAGE ON SCHEMA app TO supabase_auth_admin;
GRANT SELECT ON app.tenant_users, app.buyer_users, app.buyers, app.tenants TO supabase_auth_admin;
