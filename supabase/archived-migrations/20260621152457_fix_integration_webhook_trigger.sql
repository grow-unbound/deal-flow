-- Fix: Remove webhook_id check from shared trigger function
-- The issue: _assert_integration_child_tenant_consistency() was applied to all
-- integration child tables (integration_sync_jobs, integration_entity_map, etc.),
-- but only integration_data_flows has the webhook_id column. When PostgreSQL
-- evaluates the trigger on integration_sync_jobs, it fails because that table
-- doesn't have webhook_id.
--
-- Solution: Move webhook validation to a dedicated trigger for integration_data_flows.

-- Update the shared trigger function to remove the webhook_id check
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

  RETURN NEW;
END;
$$;

-- Create a dedicated function for webhook validation on integration_data_flows
CREATE OR REPLACE FUNCTION app._validate_integration_data_flow_webhook()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, app
AS $$
BEGIN
  IF NEW.webhook_id IS NOT NULL THEN
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

REVOKE ALL ON FUNCTION app._validate_integration_data_flow_webhook() FROM PUBLIC;

-- Create the webhook validation trigger on integration_data_flows
DROP TRIGGER IF EXISTS integration_data_flows_validate_webhook ON app.integration_data_flows;
CREATE TRIGGER integration_data_flows_validate_webhook
  BEFORE INSERT OR UPDATE ON app.integration_data_flows
  FOR EACH ROW EXECUTE FUNCTION app._validate_integration_data_flow_webhook();
