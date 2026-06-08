-- EP-17-006: invoice detail view — reminder / viewed / payment method + locked tax place.

ALTER TABLE app.invoices
  ADD COLUMN IF NOT EXISTS viewed_at timestamptz,
  ADD COLUMN IF NOT EXISTS viewed_by_name text,
  ADD COLUMN IF NOT EXISTS last_reminder_at timestamptz,
  ADD COLUMN IF NOT EXISTS payment_method text,
  ADD COLUMN IF NOT EXISTS intra_state_tax boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN app.invoices.viewed_at IS 'When buyer first opened invoice link (optional).';
COMMENT ON COLUMN app.invoices.viewed_by_name IS 'Display name for viewed-by line in DocStatusBand.';
COMMENT ON COLUMN app.invoices.last_reminder_at IS 'Last reminder sent (WhatsApp/email).';
COMMENT ON COLUMN app.invoices.payment_method IS 'UPI / Bank transfer / Cheque / Cash when paid.';
COMMENT ON COLUMN app.invoices.intra_state_tax IS 'Snapshot: CGST+SGST vs IGST; set when gstin_locked at send.';

UPDATE app.invoices AS i
SET intra_state_tax = COALESCE(
  (
    SELECT
      CASE
        WHEN i.buyer_id IS NULL THEN true
        WHEN length(trim(COALESCE(b.gstin, ''))) < 2 THEN true
        WHEN length(trim(COALESCE(t.gstin, ''))) < 2 THEN true
        ELSE upper(left(trim(b.gstin), 2)) = upper(left(trim(t.gstin), 2))
      END
    FROM app.buyers AS b
    INNER JOIN app.tenants AS t ON t.id = i.tenant_id
    WHERE b.id = i.buyer_id
  ),
  true
);
