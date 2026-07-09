UPDATE catalog.integration_types
SET
  description = 'Sync locations, products, customers, estimates, sales orders, and invoices with Zoho Books.',
  capabilities = jsonb_build_object(
    'inbound_reference', jsonb_build_array('locations', 'brands', 'products', 'pricelists', 'customers'),
    'inbound_transactional', jsonb_build_array('estimates', 'orders', 'invoices'),
    'outbound_reference', jsonb_build_array('products', 'customers'),
    'outbound_transactional', jsonb_build_array('orders'),
    'webhooks', true,
    'scheduled_sync', true,
    'manual_sync', true,
    'health_check', true
  )
WHERE id = 'zoho_books';

UPDATE catalog.integration_types
SET
  description = 'Sync warehouses, products, customers, estimates, sales orders, and invoices with Zoho Inventory.',
  capabilities = jsonb_build_object(
    'inbound_reference', jsonb_build_array('locations', 'brands', 'products', 'pricelists', 'customers'),
    'inbound_transactional', jsonb_build_array('estimates', 'orders', 'invoices'),
    'outbound_reference', jsonb_build_array('products'),
    'outbound_transactional', jsonb_build_array('orders'),
    'webhooks', true,
    'scheduled_sync', true,
    'manual_sync', true,
    'health_check', true
  )
WHERE id = 'zoho_inventory';
