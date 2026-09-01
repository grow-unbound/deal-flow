-- app.upsert_tenant_integration_secret only deletes the previous vault.secrets
-- row via tenant_integrations.vault_secret_id, which drifts out of sync with
-- reality whenever a secret row exists under the deterministic name
-- (`<integration_type_id>_<tenant_id>`) without vault_secret_id pointing at it --
-- confirmed live: a manually-copied secret row from a different Supabase project
-- landed in vault.secrets with a NULL key_id (undecryptable, cross-project vault
-- keys don't transfer) after tenant_integrations.vault_secret_id had already been
-- cleared by disconnect. vault.secrets has its own unique index on `name`
-- (secrets_name_idx), so the next vault.create_secret call during reconnect/OAuth
-- collides with 23505 and the whole reconnect fails with "Failed to securely
-- store credentials." Deleting by the deterministic name (not just by
-- vault_secret_id) makes this idempotent regardless of how the two got out of
-- sync -- belt-and-suspenders on top of the vault_secret_id delete, not a
-- replacement for it (a caller-supplied p_secret_name could still differ).
CREATE OR REPLACE FUNCTION app.upsert_tenant_integration_secret(p_tenant_integration_id uuid, p_actor_user_id uuid, p_secret jsonb, p_secret_name text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'app', 'vault'
AS $function$
DECLARE
  v_tenant_integration app.tenant_integrations%ROWTYPE;
  v_secret_id uuid;
  v_secret_name text;
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

  v_secret_name := COALESCE(p_secret_name, v_tenant_integration.integration_type_id || '_' || v_tenant_integration.tenant_id::text);

  IF v_tenant_integration.vault_secret_id IS NOT NULL THEN
    DELETE FROM vault.secrets
    WHERE id = v_tenant_integration.vault_secret_id;
  END IF;

  -- Belt-and-suspenders: also clear any orphaned row sitting under the name
  -- this insert is about to use, regardless of whether vault_secret_id above
  -- pointed at it.
  DELETE FROM vault.secrets WHERE name = v_secret_name;

  SELECT vault.create_secret(
    p_secret::text,
    v_secret_name
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
$function$;
