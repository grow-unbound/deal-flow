-- Tracks how many times an IP has tripped the guest slug-enumeration rate
-- limit within a rolling window, so repeated hits escalate into a Turnstile
-- challenge instead of a silent 429 forever. Service-role only, same shape
-- as app.public_catalog_rate_limits, kept separate since it's a distinct
-- concern (escalation state, not the rate-limit counter itself).
CREATE TABLE IF NOT EXISTS app.ip_challenge_state (
  ip text PRIMARY KEY,
  violation_count integer NOT NULL DEFAULT 0,
  window_start timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE app.ip_challenge_state ENABLE ROW LEVEL SECURITY;

CREATE POLICY ip_challenge_state_service_role_only ON app.ip_challenge_state
  AS RESTRICTIVE
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

REVOKE ALL ON TABLE app.ip_challenge_state FROM anon, authenticated;
GRANT ALL ON TABLE app.ip_challenge_state TO service_role;
