-- Seed integration type catalog.
--
-- Includes:
-- - zoho_books (active) — Zoho Books accounting
-- - zoho_inventory (active) — Zoho Inventory warehouse management
-- - tally_prime (coming-soon) — Tally Prime ERP
-- - busy (coming-soon) — Busy accounting

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
    'Sync products, customers, orders, estimates, and invoices with Zoho Books.',
    NULL,
    jsonb_build_object(
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
    jsonb_build_object(
      'inbound_reference', jsonb_build_array('locations', 'products', 'customers', 'pricelists'),
      'inbound_transactional', jsonb_build_array('estimates', 'orders', 'invoices'),
      'outbound_transactional', jsonb_build_array('orders', 'estimates'),
      'webhooks', true
    ),
    'cloud',
    true
  ),
  (
    'zoho_inventory',
    'Zoho Inventory',
    'Sync warehouses, products, orders, and shipments with Zoho Inventory.',
    NULL,
    jsonb_build_object(
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
    jsonb_build_object(
      'inbound_reference', jsonb_build_array('locations', 'products', 'customers'),
      'inbound_transactional', jsonb_build_array('orders'),
      'outbound_transactional', jsonb_build_array('orders'),
      'webhooks', true
    ),
    'cloud',
    true
  ),
  (
    'tally_prime',
    'Tally Prime',
    'Sync products and orders with Tally Prime via the Tally Data Service.',
    NULL,
    jsonb_build_object(
      'oauth', false,
      'fields', jsonb_build_array(
        jsonb_build_object(
          'key', 'api_key',
          'label', 'API Key',
          'type', 'password',
          'required', true,
          'help', 'Obtain from Tally Data Service portal.'
        )
      )
    ),
    jsonb_build_object(
      'inbound_reference', jsonb_build_array('products'),
      'inbound_transactional', jsonb_build_array('orders'),
      'outbound_transactional', jsonb_build_array('invoices')
    ),
    'local',
    false
  ),
  (
    'busy',
    'Busy',
    'Sync products and orders with Busy ERP.',
    NULL,
    jsonb_build_object(
      'oauth', false,
      'fields', jsonb_build_array(
        jsonb_build_object(
          'key', 'api_key',
          'label', 'API Key',
          'type', 'password',
          'required', true,
          'help', 'Obtain from Busy Settings → API Keys.'
        )
      )
    ),
    jsonb_build_object(
      'inbound_reference', jsonb_build_array('products'),
      'inbound_transactional', jsonb_build_array('orders')
    ),
    'cloud',
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
