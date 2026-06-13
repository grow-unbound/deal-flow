-- Integrations foundation: catalog.integration_types, app.integration_* tables,
-- RLS policies, and Vault-backed secret helpers.

-- Vault is required for the secret helper functions below. Some environments
-- do not have it enabled yet, so make the migration provision it explicitly.
CREATE SCHEMA IF NOT EXISTS vault;
CREATE EXTENSION IF NOT EXISTS supabase_vault WITH SCHEMA vault;

-- ── catalog.integration_types ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS catalog.integration_types (
  id text PRIMARY KEY,
  display_name text NOT NULL,
  description text,
  logo_url text,
  auth_schema jsonb NOT NULL DEFAULT '{}'::jsonb,
  capabilities jsonb NOT NULL DEFAULT '{}'::jsonb,
  connectivity_mode text NOT NULL DEFAULT 'cloud',
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id),
  updated_by uuid REFERENCES auth.users(id),
  CONSTRAINT integration_types_connectivity_mode_check CHECK (connectivity_mode IN ('cloud', 'local'))
);

DROP TRIGGER IF EXISTS integration_types_updated_at ON catalog.integration_types;
CREATE TRIGGER integration_types_updated_at
  BEFORE UPDATE ON catalog.integration_types
  FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();

ALTER TABLE catalog.integration_types ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS integration_types_select ON catalog.integration_types;
CREATE POLICY integration_types_select ON catalog.integration_types
  FOR SELECT TO authenticated USING (true);

REVOKE ALL ON catalog.integration_types FROM anon;

INSERT INTO catalog.integration_types (
  id,
  display_name,
  description,
  logo_url,
  auth_schema,
  capabilities,
  connectivity_mode,
  is_active
) VALUES
  (
    'zoho_books',
    'Zoho Books',
    'Sync orders and invoices with Zoho Books.',
    NULL,
    jsonb_build_object(
      'oauth', false,
      'fields', jsonb_build_array(
        jsonb_build_object('key', 'client_id', 'label', 'Client ID', 'type', 'text', 'required', true),
        jsonb_build_object('key', 'client_secret', 'label', 'Client Secret', 'type', 'password', 'required', true),
        jsonb_build_object('key', 'refresh_token', 'label', 'Refresh Token', 'type', 'password', 'required', true),
        jsonb_build_object('key', 'org_id', 'label', 'Organization ID', 'type', 'text', 'required', true)
      )
    ),
    jsonb_build_object(
      'inbound_reference', jsonb_build_array('brands', 'products', 'customers'),
      'inbound_transactional', jsonb_build_array('orders', 'invoices'),
      'outbound_reference', jsonb_build_array('products', 'customers'),
      'outbound_transactional', jsonb_build_array('orders'),
      'webhooks', true
    ),
    'cloud',
    true
  ),
  (
    'zoho_inventory',
    'Zoho Inventory',
    'Sync product catalog and stock movement with Zoho Inventory.',
    NULL,
    jsonb_build_object(
      'oauth', false,
      'fields', jsonb_build_array(
        jsonb_build_object('key', 'client_id', 'label', 'Client ID', 'type', 'text', 'required', true),
        jsonb_build_object('key', 'client_secret', 'label', 'Client Secret', 'type', 'password', 'required', true),
        jsonb_build_object('key', 'refresh_token', 'label', 'Refresh Token', 'type', 'password', 'required', true),
        jsonb_build_object('key', 'org_id', 'label', 'Organization ID', 'type', 'text', 'required', true)
      )
    ),
    jsonb_build_object(
      'inbound_reference', jsonb_build_array('brands', 'products', 'customers'),
      'inbound_transactional', jsonb_build_array('orders'),
      'outbound_reference', jsonb_build_array('products'),
      'outbound_transactional', jsonb_build_array('orders'),
      'webhooks', true
    ),
    'cloud',
    true
  ),
  (
    'tally_prime',
    'Tally Prime',
    'Bridge-based local integration for Tally Prime.',
    NULL,
    jsonb_build_object(
      'oauth', false,
      'fields', jsonb_build_array(
        jsonb_build_object('key', 'company_name', 'label', 'Company Name', 'type', 'text', 'required', true),
        jsonb_build_object('key', 'bridge_token', 'label', 'Bridge Token', 'type', 'password', 'required', true)
      )
    ),
    jsonb_build_object(
      'inbound_reference', jsonb_build_array(),
      'inbound_transactional', jsonb_build_array(),
      'outbound_reference', jsonb_build_array('products', 'customers'),
      'outbound_transactional', jsonb_build_array('orders'),
      'webhooks', false
    ),
    'local',
    false
  ),
  (
    'busy',
    'Busy Accounting',
    'Bridge-based local integration for Busy.',
    NULL,
    jsonb_build_object(
      'oauth', false,
      'fields', jsonb_build_array(
        jsonb_build_object('key', 'company_name', 'label', 'Company Name', 'type', 'text', 'required', true),
        jsonb_build_object('key', 'bridge_token', 'label', 'Bridge Token', 'type', 'password', 'required', true)
      )
    ),
    jsonb_build_object(
      'inbound_reference', jsonb_build_array(),
      'inbound_transactional', jsonb_build_array(),
      'outbound_reference', jsonb_build_array('products', 'customers'),
      'outbound_transactional', jsonb_build_array('orders'),
      'webhooks', false
    ),
    'local',
    false
  )
ON CONFLICT (id) DO UPDATE SET
  display_name = EXCLUDED.display_name,
  description = EXCLUDED.description,
  auth_schema = EXCLUDED.auth_schema,
  capabilities = EXCLUDED.capabilities,
  connectivity_mode = EXCLUDED.connectivity_mode,
  is_active = EXCLUDED.is_active,
  updated_at = now();

-- ── app.tenant_integrations ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS app.tenant_integrations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES app.tenants(id) ON DELETE RESTRICT,
  integration_type_id text NOT NULL REFERENCES catalog.integration_types(id) ON DELETE RESTRICT,
  status text NOT NULL DEFAULT 'pending_setup',
  vault_secret_id uuid,
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  last_health_check_at timestamptz,
  health_status text,
  connected_at timestamptz,
  connected_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id),
  updated_by uuid REFERENCES auth.users(id),
  deleted_at timestamptz,
  external_ref text,
  CONSTRAINT tenant_integrations_status_check CHECK (
    status IN ('pending_setup', 'connected', 'syncing', 'sync_failed', 'disconnected')
  ),
  CONSTRAINT tenant_integrations_health_status_check CHECK (
    health_status IS NULL OR health_status IN ('ok', 'expired', 'invalid')
  ),
  CONSTRAINT tenant_integrations_tenant_integration_unique UNIQUE (tenant_id, integration_type_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS tenant_integrations_tenant_external_ref_unique
  ON app.tenant_integrations (tenant_id, external_ref)
  WHERE external_ref IS NOT NULL AND deleted_at IS NULL;

DROP TRIGGER IF EXISTS tenant_integrations_updated_at ON app.tenant_integrations;
CREATE TRIGGER tenant_integrations_updated_at
  BEFORE UPDATE ON app.tenant_integrations
  FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();

-- ── app.integration_sync_jobs ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS app.integration_sync_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES app.tenants(id) ON DELETE RESTRICT,
  tenant_integration_id uuid NOT NULL REFERENCES app.tenant_integrations(id) ON DELETE RESTRICT,
  job_type text NOT NULL,
  status text NOT NULL DEFAULT 'queued',
  progress jsonb NOT NULL DEFAULT '{}'::jsonb,
  error_log jsonb,
  summary jsonb,
  started_at timestamptz,
  completed_at timestamptz,
  triggered_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id),
  updated_by uuid REFERENCES auth.users(id),
  deleted_at timestamptz,
  external_ref text,
  CONSTRAINT integration_sync_jobs_job_type_check CHECK (
    job_type IN ('initial_reference', 'initial_transactional', 'incremental', 'manual')
  ),
  CONSTRAINT integration_sync_jobs_status_check CHECK (
    status IN ('queued', 'running', 'completed', 'failed', 'cancelled')
  )
);

CREATE INDEX IF NOT EXISTS integration_sync_jobs_tenant_created_at_idx
  ON app.integration_sync_jobs (tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS integration_sync_jobs_integration_created_at_idx
  ON app.integration_sync_jobs (tenant_integration_id, created_at DESC);
CREATE INDEX IF NOT EXISTS integration_sync_jobs_status_created_at_idx
  ON app.integration_sync_jobs (status, created_at);
CREATE UNIQUE INDEX IF NOT EXISTS integration_sync_jobs_tenant_external_ref_unique
  ON app.integration_sync_jobs (tenant_id, external_ref)
  WHERE external_ref IS NOT NULL AND deleted_at IS NULL;

DROP TRIGGER IF EXISTS integration_sync_jobs_updated_at ON app.integration_sync_jobs;
CREATE TRIGGER integration_sync_jobs_updated_at
  BEFORE UPDATE ON app.integration_sync_jobs
  FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();

-- ── app.integration_entity_map ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS app.integration_entity_map (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES app.tenants(id) ON DELETE RESTRICT,
  tenant_integration_id uuid NOT NULL REFERENCES app.tenant_integrations(id) ON DELETE RESTRICT,
  entity_type text NOT NULL,
  external_id text NOT NULL,
  internal_id uuid NOT NULL,
  last_synced_at timestamptz,
  sync_status text,
  external_hash text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id),
  updated_by uuid REFERENCES auth.users(id),
  deleted_at timestamptz,
  external_ref text,
  CONSTRAINT integration_entity_map_sync_status_check CHECK (
    sync_status IS NULL OR sync_status IN ('synced', 'pending_push', 'conflict', 'error')
  ),
  CONSTRAINT integration_entity_map_external_unique UNIQUE (tenant_id, tenant_integration_id, entity_type, external_id)
);

CREATE INDEX IF NOT EXISTS integration_entity_map_lookup_idx
  ON app.integration_entity_map (tenant_id, entity_type, internal_id);
CREATE UNIQUE INDEX IF NOT EXISTS integration_entity_map_tenant_external_ref_unique
  ON app.integration_entity_map (tenant_id, external_ref)
  WHERE external_ref IS NOT NULL AND deleted_at IS NULL;

DROP TRIGGER IF EXISTS integration_entity_map_updated_at ON app.integration_entity_map;
CREATE TRIGGER integration_entity_map_updated_at
  BEFORE UPDATE ON app.integration_entity_map
  FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();

-- ── app.integration_webhooks ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS app.integration_webhooks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES app.tenants(id) ON DELETE RESTRICT,
  tenant_integration_id uuid NOT NULL REFERENCES app.tenant_integrations(id) ON DELETE RESTRICT,
  endpoint_token uuid NOT NULL DEFAULT gen_random_uuid(),
  event_types text[] NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id),
  updated_by uuid REFERENCES auth.users(id),
  deleted_at timestamptz,
  external_ref text
);

CREATE UNIQUE INDEX IF NOT EXISTS integration_webhooks_endpoint_token_unique
  ON app.integration_webhooks (endpoint_token);
CREATE UNIQUE INDEX IF NOT EXISTS integration_webhooks_tenant_external_ref_unique
  ON app.integration_webhooks (tenant_id, external_ref)
  WHERE external_ref IS NOT NULL AND deleted_at IS NULL;

DROP TRIGGER IF EXISTS integration_webhooks_updated_at ON app.integration_webhooks;
CREATE TRIGGER integration_webhooks_updated_at
  BEFORE UPDATE ON app.integration_webhooks
  FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();

-- ── app.integration_data_flows ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS app.integration_data_flows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES app.tenants(id) ON DELETE RESTRICT,
  tenant_integration_id uuid NOT NULL REFERENCES app.tenant_integrations(id) ON DELETE RESTRICT,
  entity_type text NOT NULL,
  direction text NOT NULL,
  trigger_type text NOT NULL,
  schedule text,
  webhook_id uuid REFERENCES app.integration_webhooks(id) ON DELETE RESTRICT,
  field_mappings jsonb NOT NULL DEFAULT '{}'::jsonb,
  filters jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_active boolean NOT NULL DEFAULT true,
  last_run_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id),
  updated_by uuid REFERENCES auth.users(id),
  deleted_at timestamptz,
  external_ref text,
  CONSTRAINT integration_data_flows_direction_check CHECK (
    direction IN ('inbound', 'outbound', 'bidirectional')
  ),
  CONSTRAINT integration_data_flows_trigger_type_check CHECK (
    trigger_type IN ('webhook', 'scheduled', 'event')
  )
);

CREATE INDEX IF NOT EXISTS integration_data_flows_active_idx
  ON app.integration_data_flows (tenant_id, tenant_integration_id, is_active);
CREATE UNIQUE INDEX IF NOT EXISTS integration_data_flows_tenant_external_ref_unique
  ON app.integration_data_flows (tenant_id, external_ref)
  WHERE external_ref IS NOT NULL AND deleted_at IS NULL;

DROP TRIGGER IF EXISTS integration_data_flows_updated_at ON app.integration_data_flows;
CREATE TRIGGER integration_data_flows_updated_at
  BEFORE UPDATE ON app.integration_data_flows
  FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();

-- ── RLS: app.integration_* tables ───────────────────────────────────────────
ALTER TABLE app.tenant_integrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.integration_sync_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.integration_entity_map ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.integration_webhooks ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.integration_data_flows ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_integrations_select ON app.tenant_integrations;
CREATE POLICY tenant_integrations_select ON app.tenant_integrations
  FOR SELECT USING (app.is_seller() AND tenant_id = app.jwt_tenant_id());

DROP POLICY IF EXISTS tenant_integrations_insert ON app.tenant_integrations;
CREATE POLICY tenant_integrations_insert ON app.tenant_integrations
  FOR INSERT WITH CHECK (app.is_seller_admin() AND tenant_id = app.jwt_tenant_id());

DROP POLICY IF EXISTS tenant_integrations_update ON app.tenant_integrations;
CREATE POLICY tenant_integrations_update ON app.tenant_integrations
  FOR UPDATE USING (app.is_seller_admin() AND tenant_id = app.jwt_tenant_id())
  WITH CHECK (app.is_seller_admin() AND tenant_id = app.jwt_tenant_id());

DROP POLICY IF EXISTS tenant_integrations_delete ON app.tenant_integrations;
CREATE POLICY tenant_integrations_delete ON app.tenant_integrations
  FOR DELETE USING (app.is_seller_admin() AND tenant_id = app.jwt_tenant_id());

DROP POLICY IF EXISTS integration_sync_jobs_select ON app.integration_sync_jobs;
CREATE POLICY integration_sync_jobs_select ON app.integration_sync_jobs
  FOR SELECT USING (app.is_seller() AND tenant_id = app.jwt_tenant_id());

DROP POLICY IF EXISTS integration_sync_jobs_insert ON app.integration_sync_jobs;
CREATE POLICY integration_sync_jobs_insert ON app.integration_sync_jobs
  FOR INSERT WITH CHECK (app.is_seller_admin() AND tenant_id = app.jwt_tenant_id());

DROP POLICY IF EXISTS integration_sync_jobs_update ON app.integration_sync_jobs;
CREATE POLICY integration_sync_jobs_update ON app.integration_sync_jobs
  FOR UPDATE USING (app.is_seller_admin() AND tenant_id = app.jwt_tenant_id())
  WITH CHECK (app.is_seller_admin() AND tenant_id = app.jwt_tenant_id());

DROP POLICY IF EXISTS integration_sync_jobs_delete ON app.integration_sync_jobs;
CREATE POLICY integration_sync_jobs_delete ON app.integration_sync_jobs
  FOR DELETE USING (app.is_seller_admin() AND tenant_id = app.jwt_tenant_id());

DROP POLICY IF EXISTS integration_entity_map_select ON app.integration_entity_map;
CREATE POLICY integration_entity_map_select ON app.integration_entity_map
  FOR SELECT USING (app.is_seller() AND tenant_id = app.jwt_tenant_id());

DROP POLICY IF EXISTS integration_entity_map_insert ON app.integration_entity_map;
CREATE POLICY integration_entity_map_insert ON app.integration_entity_map
  FOR INSERT WITH CHECK (app.is_seller_admin() AND tenant_id = app.jwt_tenant_id());

DROP POLICY IF EXISTS integration_entity_map_update ON app.integration_entity_map;
CREATE POLICY integration_entity_map_update ON app.integration_entity_map
  FOR UPDATE USING (app.is_seller_admin() AND tenant_id = app.jwt_tenant_id())
  WITH CHECK (app.is_seller_admin() AND tenant_id = app.jwt_tenant_id());

DROP POLICY IF EXISTS integration_entity_map_delete ON app.integration_entity_map;
CREATE POLICY integration_entity_map_delete ON app.integration_entity_map
  FOR DELETE USING (app.is_seller_admin() AND tenant_id = app.jwt_tenant_id());

DROP POLICY IF EXISTS integration_webhooks_select ON app.integration_webhooks;
CREATE POLICY integration_webhooks_select ON app.integration_webhooks
  FOR SELECT USING (app.is_seller() AND tenant_id = app.jwt_tenant_id());

DROP POLICY IF EXISTS integration_webhooks_insert ON app.integration_webhooks;
CREATE POLICY integration_webhooks_insert ON app.integration_webhooks
  FOR INSERT WITH CHECK (app.is_seller_admin() AND tenant_id = app.jwt_tenant_id());

DROP POLICY IF EXISTS integration_webhooks_update ON app.integration_webhooks;
CREATE POLICY integration_webhooks_update ON app.integration_webhooks
  FOR UPDATE USING (app.is_seller_admin() AND tenant_id = app.jwt_tenant_id())
  WITH CHECK (app.is_seller_admin() AND tenant_id = app.jwt_tenant_id());

DROP POLICY IF EXISTS integration_webhooks_delete ON app.integration_webhooks;
CREATE POLICY integration_webhooks_delete ON app.integration_webhooks
  FOR DELETE USING (app.is_seller_admin() AND tenant_id = app.jwt_tenant_id());

DROP POLICY IF EXISTS integration_data_flows_select ON app.integration_data_flows;
CREATE POLICY integration_data_flows_select ON app.integration_data_flows
  FOR SELECT USING (app.is_seller() AND tenant_id = app.jwt_tenant_id());

DROP POLICY IF EXISTS integration_data_flows_insert ON app.integration_data_flows;
CREATE POLICY integration_data_flows_insert ON app.integration_data_flows
  FOR INSERT WITH CHECK (app.is_seller_admin() AND tenant_id = app.jwt_tenant_id());

DROP POLICY IF EXISTS integration_data_flows_update ON app.integration_data_flows;
CREATE POLICY integration_data_flows_update ON app.integration_data_flows
  FOR UPDATE USING (app.is_seller_admin() AND tenant_id = app.jwt_tenant_id())
  WITH CHECK (app.is_seller_admin() AND tenant_id = app.jwt_tenant_id());

DROP POLICY IF EXISTS integration_data_flows_delete ON app.integration_data_flows;
CREATE POLICY integration_data_flows_delete ON app.integration_data_flows
  FOR DELETE USING (app.is_seller_admin() AND tenant_id = app.jwt_tenant_id());

-- ── Internal helper + Vault secret helpers ──────────────────────────────────
CREATE OR REPLACE FUNCTION app._tenant_integrations_assert_seller_admin(
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

CREATE OR REPLACE FUNCTION app.upsert_tenant_integration_secret(
  p_tenant_integration_id uuid,
  p_actor_user_id uuid,
  p_secret jsonb,
  p_secret_name text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, app, vault
AS $$
DECLARE
  v_tenant_integration app.tenant_integrations%ROWTYPE;
  v_secret_id uuid;
BEGIN
  IF p_secret IS NULL OR p_secret = '{}'::jsonb THEN
    RAISE EXCEPTION 'secret payload required' USING ERRCODE = '22023';
  END IF;

  SELECT *
  INTO v_tenant_integration
  FROM app.tenant_integrations ti
  WHERE ti.id = p_tenant_integration_id
    AND ti.deleted_at IS NULL
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'tenant integration not found' USING ERRCODE = 'P0002';
  END IF;

  PERFORM app._tenant_integrations_assert_seller_admin(v_tenant_integration.tenant_id, p_actor_user_id);

  IF v_tenant_integration.vault_secret_id IS NOT NULL THEN
    PERFORM vault.delete_secret(v_tenant_integration.vault_secret_id);
  END IF;

  SELECT vault.create_secret(
    p_secret::text,
    COALESCE(p_secret_name, v_tenant_integration.integration_type_id || '_' || v_tenant_integration.tenant_id::text)
  )
  INTO v_secret_id;

  UPDATE app.tenant_integrations
  SET
    vault_secret_id = v_secret_id,
    updated_at = now(),
    updated_by = p_actor_user_id
  WHERE id = p_tenant_integration_id;

  RETURN v_secret_id;
END;
$$;

CREATE OR REPLACE FUNCTION app.get_tenant_integration_secret(
  p_tenant_integration_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, app, vault
AS $$
DECLARE
  v_secret_id uuid;
  v_secret jsonb;
BEGIN
  SELECT ti.vault_secret_id
  INTO v_secret_id
  FROM app.tenant_integrations ti
  WHERE ti.id = p_tenant_integration_id
    AND ti.deleted_at IS NULL;

  IF v_secret_id IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT ds.decrypted_secret::jsonb
  INTO v_secret
  FROM vault.decrypted_secrets ds
  WHERE ds.id = v_secret_id;

  RETURN v_secret;
END;
$$;

CREATE OR REPLACE FUNCTION app.delete_tenant_integration_secret(
  p_tenant_integration_id uuid,
  p_actor_user_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, app, vault
AS $$
DECLARE
  v_tenant_integration app.tenant_integrations%ROWTYPE;
BEGIN
  SELECT *
  INTO v_tenant_integration
  FROM app.tenant_integrations ti
  WHERE ti.id = p_tenant_integration_id
    AND ti.deleted_at IS NULL
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'tenant integration not found' USING ERRCODE = 'P0002';
  END IF;

  PERFORM app._tenant_integrations_assert_seller_admin(v_tenant_integration.tenant_id, p_actor_user_id);

  IF v_tenant_integration.vault_secret_id IS NOT NULL THEN
    PERFORM vault.delete_secret(v_tenant_integration.vault_secret_id);
  END IF;

  UPDATE app.tenant_integrations
  SET
    vault_secret_id = NULL,
    updated_at = now(),
    updated_by = p_actor_user_id
  WHERE id = p_tenant_integration_id;
END;
$$;

REVOKE ALL ON FUNCTION app._tenant_integrations_assert_seller_admin(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.upsert_tenant_integration_secret(uuid, uuid, jsonb, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.get_tenant_integration_secret(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.delete_tenant_integration_secret(uuid, uuid) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION app.upsert_tenant_integration_secret(uuid, uuid, jsonb, text) TO service_role;
GRANT EXECUTE ON FUNCTION app.get_tenant_integration_secret(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION app.delete_tenant_integration_secret(uuid, uuid) TO service_role;
