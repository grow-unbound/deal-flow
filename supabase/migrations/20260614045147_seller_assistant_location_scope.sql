ALTER TABLE app.tenant_users
  ADD COLUMN IF NOT EXISTS location_ids uuid[] DEFAULT NULL;

ALTER TABLE app.tenant_users
  DROP CONSTRAINT IF EXISTS chk_assistant_has_location;

ALTER TABLE app.tenant_users
  ADD CONSTRAINT chk_assistant_has_location
  CHECK (
    role != 'seller_assistant'
    OR (location_ids IS NOT NULL AND cardinality(location_ids) > 0)
  );

ALTER TABLE app.orders
  ADD COLUMN IF NOT EXISTS location_id uuid REFERENCES app.locations(id) ON DELETE RESTRICT;

ALTER TABLE app.estimates
  ADD COLUMN IF NOT EXISTS location_id uuid REFERENCES app.locations(id) ON DELETE RESTRICT;

ALTER TABLE app.invoices
  ADD COLUMN IF NOT EXISTS location_id uuid REFERENCES app.locations(id) ON DELETE RESTRICT;

CREATE INDEX IF NOT EXISTS idx_tenant_users_tenant_user_active
  ON app.tenant_users (tenant_id, user_id, is_active);

CREATE INDEX IF NOT EXISTS idx_orders_tenant_location_placed_at
  ON app.orders (tenant_id, location_id, placed_at DESC)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_estimates_tenant_location_created_at
  ON app.estimates (tenant_id, location_id, created_at DESC)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_invoices_tenant_location_invoice_date
  ON app.invoices (tenant_id, location_id, invoice_date DESC)
  WHERE deleted_at IS NULL;

DROP FUNCTION IF EXISTS public.get_user_workspace(uuid) CASCADE;

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
BEGIN
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
  ORDER BY tu.created_at
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
  JOIN app.buyers b  ON b.id  = bu.buyer_id
  JOIN app.tenants t ON t.id  = b.tenant_id
  WHERE bu.user_id = p_user_id
    AND bu.is_active = true
  ORDER BY bu.created_at
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
  v_tenant_id      uuid;
  v_role           text;
  v_buyer_id       uuid;
  v_location_ids   uuid[];
BEGIN
  claims    := event -> 'claims';
  v_user_id := (event ->> 'user_id')::uuid;
  v_current_tid := (claims -> 'app_metadata' ->> 'current_tenant_id')::uuid;

  IF v_current_tid IS NOT NULL THEN
    SELECT tu.tenant_id, tu.role, tu.location_ids
    INTO   v_tenant_id, v_role, v_location_ids
    FROM   app.tenant_users tu
    WHERE  tu.user_id   = v_user_id
      AND  tu.tenant_id = v_current_tid
      AND  tu.is_active = true
    LIMIT 1;
  END IF;

  IF v_tenant_id IS NULL THEN
    SELECT tu.tenant_id, tu.role, tu.location_ids
    INTO   v_tenant_id, v_role, v_location_ids
    FROM   app.tenant_users tu
    WHERE  tu.user_id   = v_user_id
      AND  tu.is_active = true
    ORDER BY tu.created_at
    LIMIT 1;
  END IF;

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
GRANT USAGE  ON SCHEMA app TO supabase_auth_admin;
GRANT SELECT ON app.tenant_users, app.buyer_users, app.buyers, app.tenants TO supabase_auth_admin;
