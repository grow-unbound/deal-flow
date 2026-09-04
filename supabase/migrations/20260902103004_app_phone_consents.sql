-- WhatsApp/TRAI consent moved to phone-level: a phone consents once, ever,
-- across every tenant relationship it will ever have, instead of re-triggering
-- the consent screen per buyers row (per-tenant) as app.buyers.whatsapp_consent_at
-- does today. Service-role only (no tenant scoping, cross-tenant PII) — same
-- access-control shape as app.public_catalog_rate_limits.
CREATE TABLE IF NOT EXISTS app.phone_consents (
  phone text PRIMARY KEY,
  consented_at timestamptz NOT NULL,
  method text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE app.phone_consents ENABLE ROW LEVEL SECURITY;

CREATE POLICY phone_consents_service_role_only ON app.phone_consents
  AS RESTRICTIVE
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

REVOKE ALL ON TABLE app.phone_consents FROM anon, authenticated;
GRANT ALL ON TABLE app.phone_consents TO service_role;

-- One-time backfill: earliest existing consent per phone across all buyers
-- rows seeds phone_consents, so a phone that already consented once (on any
-- tenant) isn't asked again.
INSERT INTO app.phone_consents (phone, consented_at, method, created_at, updated_at)
SELECT DISTINCT ON (phone)
  phone,
  whatsapp_consent_at,
  COALESCE(whatsapp_consent_method, 'explicit_checkbox_first_login'),
  now(),
  now()
FROM app.buyers
WHERE whatsapp_consent_at IS NOT NULL
  AND phone IS NOT NULL
ORDER BY phone, whatsapp_consent_at ASC
ON CONFLICT (phone) DO NOTHING;
