-- Supabase Vault in this project exposes create/update helpers, but not a
-- delete_secret function. Delete the row directly and keep the tenant row in
-- sync so reconnect flows can safely rotate secrets.

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
    DELETE FROM vault.secrets
    WHERE id = v_tenant_integration.vault_secret_id;
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
    DELETE FROM vault.secrets
    WHERE id = v_tenant_integration.vault_secret_id;
  END IF;

  UPDATE app.tenant_integrations
  SET
    vault_secret_id = NULL,
    updated_at = now(),
    updated_by = p_actor_user_id
  WHERE id = p_tenant_integration_id;
END;
$$;
