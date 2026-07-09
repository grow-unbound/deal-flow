-- Persistent Zoho access token cache (one row per tenant_integration).
-- Prevents repeated token refreshes by sharing the access token across
-- sync-* Edge Function invocations within its 3600s validity window.
-- Refresh token stays in the vault secret; this table holds only the short-lived access token.

CREATE TABLE IF NOT EXISTS app.zoho_token_cache (
  tenant_integration_id uuid        PRIMARY KEY REFERENCES app.tenant_integrations(id) ON DELETE CASCADE,
  access_token          text        NOT NULL,
  expires_at            timestamptz NOT NULL,
  updated_at            timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE app.zoho_token_cache ENABLE ROW LEVEL SECURITY;

-- Edge Functions use the service-role key — no user-facing rows needed.
CREATE POLICY "service_role_only" ON app.zoho_token_cache
  AS RESTRICTIVE
  TO authenticated
  USING (false);
