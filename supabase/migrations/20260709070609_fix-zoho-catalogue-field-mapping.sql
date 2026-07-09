-- Correct WineYard customer catalogue custom field api_name and re-seed mappings.

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
    (v_tenant_id, p_tenant_integration_id, 'customers', 'cf_online_catalogue_access', 'buyer_app_enabled', 'boolean_from_zoho', true),
    (v_tenant_id, p_tenant_integration_id, 'estimates', 'cf_catalog_estimate',       'is_buyer_app_estimate', 'boolean_from_zoho', true),
    (v_tenant_id, p_tenant_integration_id, 'orders',    'cf_catalog_order',          'is_buyer_app_order',    'boolean_from_zoho', true),
    (v_tenant_id, p_tenant_integration_id, 'invoices',  'cf_catalog_invoice',        'is_buyer_app_invoice',  'boolean_from_zoho', true)
  ON CONFLICT (tenant_integration_id, entity_type, zoho_field_name) DO NOTHING;
END;
$$;

-- Rename legacy system mapping rows to the live Zoho api_name.
UPDATE app.tenant_field_mappings
SET
  zoho_field_name = 'cf_online_catalogue_access',
  updated_at = now()
WHERE entity_type = 'customers'
  AND target_column = 'buyer_app_enabled'
  AND zoho_field_name IN ('cf_online_catalogue_status', 'cf_online_catalog_access')
  AND is_system = true;

-- Ensure every zoho_books integration has the access mapping.
INSERT INTO app.tenant_field_mappings
  (tenant_id, tenant_integration_id, entity_type, zoho_field_name, target_column, transform_type, is_system)
SELECT
  ti.tenant_id,
  ti.id,
  'customers',
  'cf_online_catalogue_access',
  'buyer_app_enabled',
  'boolean_from_zoho',
  true
FROM app.tenant_integrations ti
WHERE ti.integration_type_id = 'zoho_books'
  AND NOT EXISTS (
    SELECT 1
    FROM app.tenant_field_mappings tfm
    WHERE tfm.tenant_integration_id = ti.id
      AND tfm.entity_type = 'customers'
      AND tfm.zoho_field_name = 'cf_online_catalogue_access'
  );
