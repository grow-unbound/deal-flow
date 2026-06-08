-- EP-16-001: align app.invoices with seller invoices landing (status model, due_date, paid_at, estimate_id).

ALTER TABLE app.invoices
  ADD COLUMN IF NOT EXISTS due_date timestamptz,
  ADD COLUMN IF NOT EXISTS paid_at timestamptz,
  ADD COLUMN IF NOT EXISTS estimate_id uuid REFERENCES app.estimates(id) ON DELETE RESTRICT;

-- Legacy statuses from pre-spec schema
UPDATE app.invoices SET status = 'sent' WHERE status IN ('issued', 'partially_paid');

-- Paid rows: surface paid date in landing when paid_at was never set
UPDATE app.invoices
SET paid_at = invoice_date
WHERE status = 'paid' AND paid_at IS NULL;

ALTER TABLE app.invoices DROP CONSTRAINT IF EXISTS invoices_status_check;
ALTER TABLE app.invoices
  ADD CONSTRAINT invoices_status_check CHECK (status IN ('draft', 'sent', 'paid', 'overdue', 'void'));

CREATE INDEX IF NOT EXISTS idx_invoices_estimate_id ON app.invoices(estimate_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_invoices_due_date ON app.invoices(due_date) WHERE deleted_at IS NULL;
