-- Short-lived table to hold CSRF state tokens during Zoho OAuth consent flow.
-- Rows expire after 10 minutes and are cleaned up by pg_cron.
CREATE TABLE IF NOT EXISTS app.integration_oauth_states (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  state_token          text NOT NULL UNIQUE,
  tenant_id            uuid NOT NULL REFERENCES app.tenants(id) ON DELETE CASCADE,
  integration_type_id  text NOT NULL,
  org_id               text NOT NULL,
  created_at           timestamptz NOT NULL DEFAULT now(),
  expires_at           timestamptz NOT NULL DEFAULT (now() + interval '10 minutes')
);

-- Only the service role reads/writes this table (accessed from server-only routes).
ALTER TABLE app.integration_oauth_states ENABLE ROW LEVEL SECURITY;

-- No RLS policies — service role bypasses RLS. No client access allowed.
-- Index for fast state_token lookups during the callback.
CREATE INDEX IF NOT EXISTS integration_oauth_states_token_idx
  ON app.integration_oauth_states (state_token);

-- Schedule cleanup every 15 minutes if pg_cron is available.
-- Fallback: rows expire naturally; run manually if needed:
--   DELETE FROM app.integration_oauth_states WHERE expires_at < now();
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.schedule(
      'cleanup-integration-oauth-states',
      '*/15 * * * *',
      'DELETE FROM app.integration_oauth_states WHERE expires_at < now()'
    );
  END IF;
END;
$$;
