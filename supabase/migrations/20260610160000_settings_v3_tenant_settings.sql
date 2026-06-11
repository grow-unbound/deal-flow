-- Settings v3: tenant_settings table, locations extensions, deep-merge RPC,
-- JWT role helpers (user_role), signup seed row.

-- ── Deep merge JSONB (recursive for nested objects) ─────────────────────────
CREATE OR REPLACE FUNCTION app.jsonb_deep_merge(target jsonb, patch jsonb)
RETURNS jsonb
LANGUAGE plpgsql
IMMUTABLE
SET search_path = app, pg_catalog
AS $$
DECLARE
  result jsonb := COALESCE(target, '{}'::jsonb);
  k text;
  v jsonb;
  existing jsonb;
BEGIN
  IF patch IS NULL OR patch = '{}'::jsonb THEN
    RETURN result;
  END IF;
  FOR k IN SELECT jsonb_object_keys(patch)
  LOOP
    v := patch -> k;
    existing := result -> k;
    IF jsonb_typeof(COALESCE(existing, 'null'::jsonb)) = 'object'
       AND jsonb_typeof(v) = 'object' THEN
      result := jsonb_set(result, ARRAY[k], app.jsonb_deep_merge(existing, v), true);
    ELSE
      result := jsonb_set(result, ARRAY[k], v, true);
    END IF;
  END LOOP;
  RETURN result;
END;
$$;

-- ── tenant_settings ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS app.tenant_settings (
  tenant_id   uuid PRIMARY KEY REFERENCES app.tenants(id) ON DELETE RESTRICT,
  settings    jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  updated_by  uuid REFERENCES auth.users(id)
);

CREATE INDEX IF NOT EXISTS idx_tenant_settings_updated_at ON app.tenant_settings(updated_at);

CREATE TRIGGER tenant_settings_updated_at
  BEFORE UPDATE ON app.tenant_settings
  FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();

ALTER TABLE app.tenant_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_settings_select ON app.tenant_settings
  FOR SELECT USING (app.is_seller() AND tenant_id = app.jwt_tenant_id());

CREATE POLICY tenant_settings_insert ON app.tenant_settings
  FOR INSERT WITH CHECK (app.is_seller_admin() AND tenant_id = app.jwt_tenant_id());

CREATE POLICY tenant_settings_update ON app.tenant_settings
  FOR UPDATE USING (app.is_seller_admin() AND tenant_id = app.jwt_tenant_id())
  WITH CHECK (app.is_seller_admin() AND tenant_id = app.jwt_tenant_id());

-- ── locations (spec v3) ─────────────────────────────────────────────────────
ALTER TABLE app.locations
  ADD COLUMN IF NOT EXISTS type text NOT NULL DEFAULT 'warehouse';

ALTER TABLE app.locations
  DROP CONSTRAINT IF EXISTS locations_type_check;

ALTER TABLE app.locations
  ADD CONSTRAINT locations_type_check
  CHECK (type IN ('warehouse', 'dispatch_point', 'branch'));

ALTER TABLE app.locations
  ADD COLUMN IF NOT EXISTS inventory_tracking boolean NOT NULL DEFAULT true;

ALTER TABLE app.locations
  ADD COLUMN IF NOT EXISTS external_ref text;

CREATE UNIQUE INDEX IF NOT EXISTS locations_tenant_external_ref_unique
  ON app.locations (tenant_id, external_ref)
  WHERE external_ref IS NOT NULL AND deleted_at IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS locations_one_default_per_tenant
  ON app.locations (tenant_id)
  WHERE is_default = true AND deleted_at IS NULL;

-- ── JWT helpers: read app role from user_role (PostgREST collision fix) ──────
CREATE OR REPLACE FUNCTION app.jwt_role()
RETURNS text LANGUAGE sql STABLE AS $$
  SELECT COALESCE(auth.jwt() ->> 'user_role', auth.jwt() ->> 'role')
$$;

CREATE OR REPLACE FUNCTION app.is_seller()
RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT COALESCE(auth.jwt() ->> 'user_role', auth.jwt() ->> 'role')
    IN ('seller_admin', 'seller_assistant')
$$;

CREATE OR REPLACE FUNCTION app.is_seller_admin()
RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT COALESCE(auth.jwt() ->> 'user_role', auth.jwt() ->> 'role') = 'seller_admin'
$$;

CREATE OR REPLACE FUNCTION app.is_buyer()
RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT COALESCE(auth.jwt() ->> 'user_role', auth.jwt() ->> 'role')
    IN ('buyer_admin', 'buyer_assistant')
$$;

CREATE OR REPLACE FUNCTION app.is_buyer_admin()
RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT COALESCE(auth.jwt() ->> 'user_role', auth.jwt() ->> 'role') = 'buyer_admin'
$$;

-- ── Assert seller_admin membership (service-role API pattern) ───────────────
CREATE OR REPLACE FUNCTION app._tenant_settings_assert_seller_admin(
  p_tenant_id uuid,
  p_actor_user_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, app
AS $$
BEGIN
  IF p_actor_user_id IS NULL THEN
    RAISE EXCEPTION 'actor required' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM app.tenant_users tu
    WHERE tu.tenant_id = p_tenant_id
      AND tu.user_id = p_actor_user_id
      AND tu.role = 'seller_admin'
      AND COALESCE(tu.is_active, true)
      AND tu.deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION app.update_tenant_settings(
  p_tenant_id uuid,
  p_actor_user_id uuid,
  p_patch jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, app
AS $$
DECLARE
  v_prev jsonb;
  v_next jsonb;
BEGIN
  PERFORM app._tenant_settings_assert_seller_admin(p_tenant_id, p_actor_user_id);

  IF p_patch IS NULL OR p_patch = '{}'::jsonb THEN
    RETURN;
  END IF;

  SELECT ts.settings INTO v_prev
  FROM app.tenant_settings ts
  WHERE ts.tenant_id = p_tenant_id
  FOR UPDATE;

  v_next := app.jsonb_deep_merge(COALESCE(v_prev, '{}'::jsonb), p_patch);

  INSERT INTO app.tenant_settings (tenant_id, settings, updated_by)
  VALUES (p_tenant_id, v_next, p_actor_user_id)
  ON CONFLICT (tenant_id) DO UPDATE SET
    settings   = EXCLUDED.settings,
    updated_at = now(),
    updated_by = p_actor_user_id;

  INSERT INTO app.audit_log (
    tenant_id, actor_user_id, entity_type, entity_id, action, diff, ts
  ) VALUES (
    p_tenant_id,
    p_actor_user_id,
    'tenant_settings',
    p_tenant_id,
    'update',
    p_patch,
    now()
  );
END;
$$;

REVOKE ALL ON FUNCTION app.update_tenant_settings(uuid, uuid, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.update_tenant_settings(uuid, uuid, jsonb) TO service_role;

REVOKE ALL ON FUNCTION app._tenant_settings_assert_seller_admin(uuid, uuid) FROM PUBLIC;

-- ── Backfill from legacy tenants.settings JSONB ─────────────────────────────
INSERT INTO app.tenant_settings (tenant_id, settings)
SELECT t.id, COALESCE(t.settings, '{}'::jsonb)
FROM app.tenants t
WHERE t.deleted_at IS NULL
ON CONFLICT (tenant_id) DO NOTHING;

-- ── Signup: seed tenant_settings row ───────────────────────────────────────
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

  INSERT INTO app.tenant_settings (tenant_id, settings, updated_by)
  VALUES (v_tenant_id, '{}'::jsonb, p_user_id)
  ON CONFLICT (tenant_id) DO NOTHING;

  RETURN jsonb_build_object(
    'tenant_id', v_tenant_id,
    'slug',      p_slug,
    'subdomain', v_subdomain
  );
END;
$$;

GRANT EXECUTE ON FUNCTION app.create_tenant_and_admin(uuid, text, text, text, text)
  TO service_role;
