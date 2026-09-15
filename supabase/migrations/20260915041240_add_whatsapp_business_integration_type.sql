-- Registers WhatsApp Business as a connectable integration in the Settings →
-- Integrations catalog. Unlike Zoho/Tally/Busy, this integration has no
-- domain-data sync — connecting it only supplies send credentials (WABA
-- phone number + access token) for tenant-branded WhatsApp notifications,
-- via Meta's Embedded Signup (Facebook login popup), not a manual field form.
INSERT INTO catalog.integration_types (
  id,
  display_name,
  description,
  logo_url,
  auth_schema,
  capabilities,
  connectivity_mode,
  is_active
) VALUES (
  'whatsapp_business',
  'WhatsApp Business',
  'Connect your own WhatsApp Business Account to send notifications, alerts, and marketing messages to buyers from your own registered number.',
  NULL,
  jsonb_build_object(
    'oauth', true,
    'authorize_url', 'https://www.facebook.com/v21.0/dialog/oauth',
    'token_url', 'https://graph.facebook.com/v21.0/oauth/access_token',
    'fields', jsonb_build_array()
  ),
  jsonb_build_object(
    'inbound_reference', jsonb_build_array(),
    'inbound_transactional', jsonb_build_array(),
    'outbound_transactional', jsonb_build_array(),
    'webhooks', false
  ),
  'cloud',
  true
)
ON CONFLICT (id) DO UPDATE SET
  display_name = EXCLUDED.display_name,
  description = EXCLUDED.description,
  auth_schema = EXCLUDED.auth_schema,
  capabilities = EXCLUDED.capabilities,
  connectivity_mode = EXCLUDED.connectivity_mode,
  is_active = EXCLUDED.is_active,
  updated_at = now();
