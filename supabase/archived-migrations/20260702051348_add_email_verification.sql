-- Track when a seller tenant's email is verified
ALTER TABLE app.tenants ADD COLUMN email_verified_at timestamptz;

-- DB-backed OTP store for WhatsApp resend channel.
-- Email OTP is managed by Supabase Auth internally; this table only stores
-- OTPs we generate and send ourselves (WhatsApp fallback path).
CREATE TABLE app.email_verification_otps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL REFERENCES app.tenants(id) ON DELETE CASCADE,
  email text NOT NULL,
  phone text,
  otp text NOT NULL,
  expires_at timestamptz NOT NULL,
  attempts int NOT NULL DEFAULT 0,
  verified_at timestamptz,
  channel text NOT NULL DEFAULT 'whatsapp',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX idx_email_verification_otps_user ON app.email_verification_otps(user_id);
CREATE INDEX idx_email_verification_otps_user_channel ON app.email_verification_otps(user_id, channel)
  WHERE verified_at IS NULL;

ALTER TABLE app.email_verification_otps ENABLE ROW LEVEL SECURITY;
-- No public policies: all access via service-role key only
