-- The whatsapp_business row's auth_schema set oauth:true but declared no
-- authorize_url/token_url, tripping IntegrationAuthSchemaSchema's superRefine
-- ("OAuth auth schemas must declare an authorization or token endpoint") and
-- breaking the whole Settings > Integrations payload for every tenant.
-- Backfill both endpoints actually used by the WhatsApp Embedded Signup flow.
UPDATE catalog.integration_types
SET auth_schema = jsonb_build_object(
  'oauth', true,
  'authorize_url', 'https://www.facebook.com/v21.0/dialog/oauth',
  'token_url', 'https://graph.facebook.com/v21.0/oauth/access_token',
  'fields', jsonb_build_array()
),
updated_at = now()
WHERE id = 'whatsapp_business';
