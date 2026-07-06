-- Seed Zoho buyer-app order flag mapping for all Zoho Books integrations.
-- Mirrors the estimate/invoice mappings so order round-trips preserve buyer-app provenance.

ALTER TABLE app.orders
  ADD COLUMN IF NOT EXISTS order_url text;

-- Expand entity_type check to include 'orders'.
ALTER TABLE app.tenant_field_mappings
  DROP CONSTRAINT IF EXISTS tenant_field_mappings_entity_type_check;
ALTER TABLE app.tenant_field_mappings
  ADD CONSTRAINT tenant_field_mappings_entity_type_check
    CHECK (entity_type IN ('customers', 'estimates', 'invoices', 'orders'));

CREATE OR REPLACE FUNCTION app.seed_system_field_mappings(p_tenant_integration_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app AS $$
DECLARE
  v_tenant_id uuid;
BEGIN
  SELECT tenant_id INTO v_tenant_id
  FROM app.tenant_integrations
  WHERE id = p_tenant_integration_id;

  IF v_tenant_id IS NULL THEN
    RETURN;
  END IF;

  INSERT INTO app.tenant_field_mappings
    (tenant_id, tenant_integration_id, entity_type, zoho_field_name, target_column, transform_type, is_system)
  VALUES
    (v_tenant_id, p_tenant_integration_id, 'customers', 'cf_online_catalogue_status', 'buyer_app_enabled', 'boolean_from_zoho', true),
    (v_tenant_id, p_tenant_integration_id, 'estimates', 'cf_catalog_estimate',       'is_buyer_app_estimate', 'boolean_from_zoho', true),
    (v_tenant_id, p_tenant_integration_id, 'orders',    'cf_catalog_order',          'is_buyer_app_order',    'boolean_from_zoho', true),
    (v_tenant_id, p_tenant_integration_id, 'invoices',  'cf_catalog_invoice',        'is_buyer_app_invoice',  'boolean_from_zoho', true)
  ON CONFLICT (tenant_integration_id, entity_type, zoho_field_name) DO NOTHING;
END;
$$;

DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT id
    FROM app.tenant_integrations
    WHERE integration_type_id = 'zoho_books'
  LOOP
    PERFORM app.seed_system_field_mappings(r.id);
  END LOOP;
END;
$$;
