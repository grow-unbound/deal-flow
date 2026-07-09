ALTER TABLE app.estimates
  ALTER COLUMN buyer_id DROP NOT NULL,
  ADD COLUMN IF NOT EXISTS valid_until date,
  ADD COLUMN IF NOT EXISTS buyer_po_ref text,
  ADD COLUMN IF NOT EXISTS discount_flat numeric(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS freight numeric(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS round_off numeric(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS sent_channel text,
  ADD COLUMN IF NOT EXISTS date_issued date;

UPDATE app.estimates
SET valid_until = COALESCE(valid_until, (expires_at AT TIME ZONE 'Asia/Kolkata')::date),
    date_issued = COALESCE(date_issued, (created_at AT TIME ZONE 'Asia/Kolkata')::date)
WHERE valid_until IS NULL OR date_issued IS NULL;

ALTER TABLE app.estimates
  ALTER COLUMN valid_until SET DEFAULT (CURRENT_DATE + 14),
  ALTER COLUMN date_issued SET DEFAULT CURRENT_DATE;

ALTER TABLE app.estimates
  DROP CONSTRAINT IF EXISTS estimates_sent_channel_check;

ALTER TABLE app.estimates
  ADD CONSTRAINT estimates_sent_channel_check
  CHECK (sent_channel IS NULL OR sent_channel IN ('whatsapp', 'email', 'download'));

ALTER TABLE app.estimate_items
  ADD COLUMN IF NOT EXISTS disc_pct numeric(5,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS tax_pct numeric(5,2),
  ADD COLUMN IF NOT EXISTS scheme_tag text;

UPDATE app.estimate_items
SET disc_pct = COALESCE(discount_pct, 0),
    tax_pct = COALESCE(tax_pct, tax_rate);

CREATE INDEX IF NOT EXISTS idx_estimates_tenant_status_valid_until
  ON app.estimates(tenant_id, status, valid_until)
  WHERE deleted_at IS NULL;
