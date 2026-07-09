-- Switch Zoho Books and Zoho Inventory from manual credential entry to platform OAuth.
-- Distributors no longer need to paste client_id/secret/refresh_token manually —
-- they click "Connect to Zoho" and Yukti handles the OAuth flow server-side.
-- Only the org_id field remains (a non-secret 9-digit number from Zoho Books settings).

UPDATE catalog.integration_types
SET auth_schema = jsonb_build_object(
  'oauth', true,
  'authorize_url', 'https://accounts.zoho.in/oauth/v2/auth',
  'token_url', 'https://accounts.zoho.in/oauth/v2/token',
  'scopes', jsonb_build_array(
    'ZohoBooks.contacts.ALL',
    'ZohoBooks.items.ALL',
    'ZohoBooks.salesorders.ALL',
    'ZohoBooks.invoices.ALL',
    'ZohoBooks.estimates.ALL',
    'ZohoBooks.settings.ALL'
  ),
  'fields', jsonb_build_array(
    jsonb_build_object(
      'key', 'org_id',
      'label', 'Organization ID',
      'type', 'text',
      'required', true,
      'help', 'Zoho Books → Settings → Organization Profile. It''s a 9-digit number.',
      'placeholder', '123456789'
    )
  )
)
WHERE id IN ('zoho_books', 'zoho_inventory');
