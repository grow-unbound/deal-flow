-- Fix integration types: add OAuth endpoint URLs and correct capability field names.

UPDATE catalog.integration_types SET
  auth_schema = jsonb_build_object(
    'oauth', true,
    'authorize_url', 'https://accounts.zoho.in/oauth/v2/auth',
    'token_url', 'https://accounts.zoho.in/oauth/v2/token',
    'scopes', jsonb_build_array('ZohoBooks.fullaccess'),
    'fields', jsonb_build_array(
      jsonb_build_object(
        'key', 'org_id',
        'label', 'Organization ID',
        'type', 'text',
        'required', true,
        'placeholder', 'e.g., 1234567890',
        'help', 'Found in Zoho Books Settings → Organization.'
      )
    )
  ),
  capabilities = jsonb_build_object(
    'inbound_reference', jsonb_build_array('locations', 'products', 'customers', 'pricelists'),
    'inbound_transactional', jsonb_build_array('estimates', 'orders', 'invoices'),
    'outbound_transactional', jsonb_build_array('orders', 'estimates'),
    'webhooks', true
  ),
  updated_at = now()
WHERE id = 'zoho_books';

UPDATE catalog.integration_types SET
  auth_schema = jsonb_build_object(
    'oauth', true,
    'authorize_url', 'https://accounts.zoho.in/oauth/v2/auth',
    'token_url', 'https://accounts.zoho.in/oauth/v2/token',
    'scopes', jsonb_build_array('ZohoInventory.fullaccess'),
    'fields', jsonb_build_array(
      jsonb_build_object(
        'key', 'org_id',
        'label', 'Organization ID',
        'type', 'text',
        'required', true,
        'placeholder', 'e.g., 1234567890',
        'help', 'Found in Zoho Inventory Settings → Organization.'
      )
    )
  ),
  capabilities = jsonb_build_object(
    'inbound_reference', jsonb_build_array('locations', 'products', 'customers'),
    'inbound_transactional', jsonb_build_array('orders'),
    'outbound_transactional', jsonb_build_array('orders'),
    'webhooks', true
  ),
  updated_at = now()
WHERE id = 'zoho_inventory';

UPDATE catalog.integration_types SET
  capabilities = jsonb_build_object(
    'inbound_reference', jsonb_build_array('products'),
    'inbound_transactional', jsonb_build_array('orders'),
    'outbound_transactional', jsonb_build_array('invoices')
  ),
  updated_at = now()
WHERE id = 'tally_prime';
