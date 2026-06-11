-- Settings: Billing — WhatsApp credits on tenant (see DealFlow Settings Spec v3 §10)
ALTER TABLE app.tenants
  ADD COLUMN IF NOT EXISTS whatsapp_credits_balance integer NOT NULL DEFAULT 1000,
  ADD COLUMN IF NOT EXISTS whatsapp_credits_purchased integer NOT NULL DEFAULT 1000;

COMMENT ON COLUMN app.tenants.whatsapp_credits_balance IS 'Remaining WhatsApp OTP/notification credits';
COMMENT ON COLUMN app.tenants.whatsapp_credits_purchased IS 'Total purchased credits (denominator for balance UI)';
