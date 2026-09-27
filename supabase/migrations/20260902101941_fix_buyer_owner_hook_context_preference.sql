-- The buyer-owner branch of custom_access_token_hook had no current_tenant_id/
-- current_buyer_id preference and no ORDER BY, unlike the buyer_users branch
-- right below it (which already has both). With today's one-auth-user-per-buyer-row
-- identity model that was harmless (LIMIT 1 always matched at most one row per
-- user_id). It becomes a real bug the moment multiple app.buyers rows share one
-- user_id (the buyer-identity-consolidation fix that follows this migration) —
-- without this fix, the hook would non-deterministically pick whichever row
-- Postgres returns first, ignoring which business/tenant the buyer actually
-- selected at login. This migration must land before any buyers row is allowed
-- to share a user_id with another.
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

  -- Buyer owner — logs in directly as app.buyers, no buyer_users row. Now
  -- prefers the row matching current_buyer_id / current_tenant_id (set by
  -- the mint-session flow's app_metadata), same preference pattern as the
  -- buyer_users branch below, so multiple buyers rows sharing one user_id
  -- resolve to whichever one the session was actually minted for.
  IF v_tenant_id IS NULL THEN
    SELECT b.tenant_id, 'buyer_admin'::text, b.id
    INTO   v_tenant_id, v_role, v_buyer_id
    FROM   app.buyers b
    WHERE  b.user_id = v_user_id
      AND  b.is_active = true
      AND  b.buyer_app_enabled = true
      AND  b.deleted_at IS NULL
      AND  (v_current_tid IS NULL OR b.tenant_id = v_current_tid)
      AND  (v_current_bid IS NULL OR b.id = v_current_bid)
    ORDER BY
      CASE WHEN b.id = v_current_bid THEN 0 ELSE 1 END,
      CASE WHEN b.tenant_id = v_current_tid THEN 0 ELSE 1 END,
      b.created_at
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
$function$
