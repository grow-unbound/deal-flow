-- Fix: remove `deleted_at IS NULL` from _assert_integration_child_tenant_consistency.
--
-- After integrations-disconnect soft-deletes a tenant_integration, this trigger was
-- blocking all UPDATE/INSERT on integration_webhook_events and integration_webhook_errors
-- for rows linked to that integration. This prevented the webhook handler from marking
-- stuck events as 'failed' and from writing error audit rows.
--
-- The application-layer guard (webhook.is_active && webhook.status === 'active' check in
-- integrations-webhook edge function) already prevents new webhook processing for
-- disconnected integrations. The trigger's job is referential integrity only:
--   1. FK must point to an existing tenant_integration (even if soft-deleted)
--   2. tenant_id must match the integration's tenant_id
--
-- Cross-tenant isolation is preserved. Soft-delete status is no longer enforced here.

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
  WHERE ti.id = NEW.tenant_integration_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'tenant integration not found' USING ERRCODE = 'P0002';
  END IF;

  IF NEW.tenant_id IS DISTINCT FROM v_tenant_integration.tenant_id THEN
    RAISE EXCEPTION 'tenant mismatch for integration child row' USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;
