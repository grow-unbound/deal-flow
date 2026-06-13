-- Integrations hardening/runtime: lock down direct client writes, enforce
-- tenant consistency across child tables, and narrow the Vault secret read
-- contract for admin/runtime callers.

-- ── Tenant consistency across integration child tables ─────────────────────
ALTER TABLE app.tenant_integrations
  DROP CONSTRAINT IF EXISTS tenant_integrations_id_tenant_unique;
ALTER TABLE app.tenant_integrations
  ADD CONSTRAINT tenant_integrations_id_tenant_unique UNIQUE (id, tenant_id);

ALTER TABLE app.integration_sync_jobs
  DROP CONSTRAINT IF EXISTS integration_sync_jobs_tenant_integration_tenant_fkey;
ALTER TABLE app.integration_sync_jobs
  ADD CONSTRAINT integration_sync_jobs_tenant_integration_tenant_fkey
  FOREIGN KEY (tenant_integration_id, tenant_id)
  REFERENCES app.tenant_integrations (id, tenant_id)
  ON DELETE RESTRICT
  NOT VALID;
ALTER TABLE app.integration_sync_jobs
  VALIDATE CONSTRAINT integration_sync_jobs_tenant_integration_tenant_fkey;

ALTER TABLE app.integration_entity_map
  DROP CONSTRAINT IF EXISTS integration_entity_map_tenant_integration_tenant_fkey;
ALTER TABLE app.integration_entity_map
  ADD CONSTRAINT integration_entity_map_tenant_integration_tenant_fkey
  FOREIGN KEY (tenant_integration_id, tenant_id)
  REFERENCES app.tenant_integrations (id, tenant_id)
  ON DELETE RESTRICT
  NOT VALID;
ALTER TABLE app.integration_entity_map
  VALIDATE CONSTRAINT integration_entity_map_tenant_integration_tenant_fkey;

ALTER TABLE app.integration_webhooks
  DROP CONSTRAINT IF EXISTS integration_webhooks_tenant_integration_tenant_fkey;
ALTER TABLE app.integration_webhooks
  ADD CONSTRAINT integration_webhooks_tenant_integration_tenant_fkey
  FOREIGN KEY (tenant_integration_id, tenant_id)
  REFERENCES app.tenant_integrations (id, tenant_id)
  ON DELETE RESTRICT
  NOT VALID;
ALTER TABLE app.integration_webhooks
  VALIDATE CONSTRAINT integration_webhooks_tenant_integration_tenant_fkey;

ALTER TABLE app.integration_data_flows
  DROP CONSTRAINT IF EXISTS integration_data_flows_tenant_integration_tenant_fkey;
ALTER TABLE app.integration_data_flows
  ADD CONSTRAINT integration_data_flows_tenant_integration_tenant_fkey
  FOREIGN KEY (tenant_integration_id, tenant_id)
  REFERENCES app.tenant_integrations (id, tenant_id)
  ON DELETE RESTRICT
  NOT VALID;
ALTER TABLE app.integration_data_flows
  VALIDATE CONSTRAINT integration_data_flows_tenant_integration_tenant_fkey;

-- ── Additional guardrails on entity/trigger contracts ──────────────────────
ALTER TABLE app.integration_entity_map
  DROP CONSTRAINT IF EXISTS integration_entity_map_entity_type_check;
ALTER TABLE app.integration_entity_map
  ADD CONSTRAINT integration_entity_map_entity_type_check CHECK (
    entity_type IN ('brands', 'products', 'customers', 'estimates', 'orders', 'invoices')
  );

ALTER TABLE app.integration_data_flows
  DROP CONSTRAINT IF EXISTS integration_data_flows_entity_type_check;
ALTER TABLE app.integration_data_flows
  ADD CONSTRAINT integration_data_flows_entity_type_check CHECK (
    entity_type IN ('brands', 'products', 'customers', 'estimates', 'orders', 'invoices')
  );

ALTER TABLE app.integration_data_flows
  DROP CONSTRAINT IF EXISTS integration_data_flows_schedule_required_check;
ALTER TABLE app.integration_data_flows
  ADD CONSTRAINT integration_data_flows_schedule_required_check CHECK (
    trigger_type <> 'scheduled' OR schedule IS NOT NULL
  );

ALTER TABLE app.integration_data_flows
  DROP CONSTRAINT IF EXISTS integration_data_flows_webhook_required_check;
ALTER TABLE app.integration_data_flows
  ADD CONSTRAINT integration_data_flows_webhook_required_check CHECK (
    trigger_type <> 'webhook' OR webhook_id IS NOT NULL
  );

-- ── Harden RLS: UI may read, backend/service owns mutation lifecycle ───────
DROP POLICY IF EXISTS tenant_integrations_insert ON app.tenant_integrations;
DROP POLICY IF EXISTS tenant_integrations_update ON app.tenant_integrations;
DROP POLICY IF EXISTS tenant_integrations_delete ON app.tenant_integrations;

DROP POLICY IF EXISTS integration_sync_jobs_insert ON app.integration_sync_jobs;
DROP POLICY IF EXISTS integration_sync_jobs_update ON app.integration_sync_jobs;
DROP POLICY IF EXISTS integration_sync_jobs_delete ON app.integration_sync_jobs;

DROP POLICY IF EXISTS integration_entity_map_insert ON app.integration_entity_map;
DROP POLICY IF EXISTS integration_entity_map_update ON app.integration_entity_map;
DROP POLICY IF EXISTS integration_entity_map_delete ON app.integration_entity_map;

DROP POLICY IF EXISTS integration_webhooks_insert ON app.integration_webhooks;
DROP POLICY IF EXISTS integration_webhooks_update ON app.integration_webhooks;
DROP POLICY IF EXISTS integration_webhooks_delete ON app.integration_webhooks;

DROP POLICY IF EXISTS integration_data_flows_insert ON app.integration_data_flows;
DROP POLICY IF EXISTS integration_data_flows_update ON app.integration_data_flows;
DROP POLICY IF EXISTS integration_data_flows_delete ON app.integration_data_flows;

-- Keep child rows tied to a live parent integration and prevent flows from
-- pointing at webhooks owned by a different integration record.
CREATE OR REPLACE FUNCTION app._assert_integration_child_tenant_consistency()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, app
AS $$
DECLARE
  v_tenant_integration app.tenant_integrations%ROWTYPE;
BEGIN
  SELECT *
  INTO v_tenant_integration
  FROM app.tenant_integrations ti
  WHERE ti.id = NEW.tenant_integration_id
    AND ti.deleted_at IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'tenant integration not found' USING ERRCODE = 'P0002';
  END IF;

  IF NEW.tenant_id IS DISTINCT FROM v_tenant_integration.tenant_id THEN
    RAISE EXCEPTION 'tenant mismatch for integration child row' USING ERRCODE = '23514';
  END IF;

  IF TG_TABLE_NAME = 'integration_data_flows' AND NEW.webhook_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1
      FROM app.integration_webhooks iw
      WHERE iw.id = NEW.webhook_id
        AND iw.tenant_id = NEW.tenant_id
        AND iw.tenant_integration_id = NEW.tenant_integration_id
        AND iw.deleted_at IS NULL
    ) THEN
      RAISE EXCEPTION 'integration webhook must belong to the same tenant integration' USING ERRCODE = '23514';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION app._assert_integration_child_tenant_consistency() FROM PUBLIC;

DROP TRIGGER IF EXISTS integration_sync_jobs_tenant_consistency ON app.integration_sync_jobs;
CREATE TRIGGER integration_sync_jobs_tenant_consistency
  BEFORE INSERT OR UPDATE ON app.integration_sync_jobs
  FOR EACH ROW EXECUTE FUNCTION app._assert_integration_child_tenant_consistency();

DROP TRIGGER IF EXISTS integration_entity_map_tenant_consistency ON app.integration_entity_map;
CREATE TRIGGER integration_entity_map_tenant_consistency
  BEFORE INSERT OR UPDATE ON app.integration_entity_map
  FOR EACH ROW EXECUTE FUNCTION app._assert_integration_child_tenant_consistency();

DROP TRIGGER IF EXISTS integration_webhooks_tenant_consistency ON app.integration_webhooks;
CREATE TRIGGER integration_webhooks_tenant_consistency
  BEFORE INSERT OR UPDATE ON app.integration_webhooks
  FOR EACH ROW EXECUTE FUNCTION app._assert_integration_child_tenant_consistency();

DROP TRIGGER IF EXISTS integration_data_flows_tenant_consistency ON app.integration_data_flows;
CREATE TRIGGER integration_data_flows_tenant_consistency
  BEFORE INSERT OR UPDATE ON app.integration_data_flows
  FOR EACH ROW EXECUTE FUNCTION app._assert_integration_child_tenant_consistency();

-- ── Replace the broad secret getter with scoped admin/runtime helpers ──────
DROP FUNCTION IF EXISTS app.get_tenant_integration_secret(uuid);

CREATE OR REPLACE FUNCTION app.get_tenant_integration_secret(
  p_tenant_integration_id uuid,
  p_actor_user_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, app, vault
AS $$
DECLARE
  v_tenant_integration app.tenant_integrations%ROWTYPE;
  v_secret jsonb;
BEGIN
  SELECT *
  INTO v_tenant_integration
  FROM app.tenant_integrations ti
  WHERE ti.id = p_tenant_integration_id
    AND ti.deleted_at IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'tenant integration not found' USING ERRCODE = 'P0002';
  END IF;

  PERFORM app._tenant_integrations_assert_seller_admin(v_tenant_integration.tenant_id, p_actor_user_id);

  IF v_tenant_integration.vault_secret_id IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT ds.decrypted_secret::jsonb
  INTO v_secret
  FROM vault.decrypted_secrets ds
  WHERE ds.id = v_tenant_integration.vault_secret_id;

  RETURN v_secret;
END;
$$;

CREATE OR REPLACE FUNCTION app.get_tenant_integration_runtime_secret(
  p_tenant_integration_id uuid,
  p_expected_integration_type_id text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, app, vault
AS $$
DECLARE
  v_tenant_integration app.tenant_integrations%ROWTYPE;
  v_secret jsonb;
BEGIN
  IF p_expected_integration_type_id IS NULL OR btrim(p_expected_integration_type_id) = '' THEN
    RAISE EXCEPTION 'expected integration type required' USING ERRCODE = '22023';
  END IF;

  SELECT *
  INTO v_tenant_integration
  FROM app.tenant_integrations ti
  WHERE ti.id = p_tenant_integration_id
    AND ti.deleted_at IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'tenant integration not found' USING ERRCODE = 'P0002';
  END IF;

  IF v_tenant_integration.integration_type_id IS DISTINCT FROM p_expected_integration_type_id THEN
    RAISE EXCEPTION 'integration type mismatch' USING ERRCODE = '42501';
  END IF;

  IF v_tenant_integration.vault_secret_id IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT ds.decrypted_secret::jsonb
  INTO v_secret
  FROM vault.decrypted_secrets ds
  WHERE ds.id = v_tenant_integration.vault_secret_id;

  RETURN v_secret;
END;
$$;

REVOKE ALL ON FUNCTION app.get_tenant_integration_secret(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.get_tenant_integration_runtime_secret(uuid, text) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION app.get_tenant_integration_secret(uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION app.get_tenant_integration_runtime_secret(uuid, text) TO service_role;
