-- Zoho transactional sync alignment.
-- Renames estimate date, adds line ordering to imported transactional items,
-- and removes the Tally-only invoice export column.

ALTER TABLE app.estimates
  RENAME COLUMN date_issued TO estimate_date;

ALTER TABLE app.estimates
  ALTER COLUMN estimate_date SET DEFAULT CURRENT_DATE;

UPDATE app.estimates
SET estimate_date = COALESCE(estimate_date, (created_at AT TIME ZONE 'Asia/Kolkata')::date)
WHERE estimate_date IS NULL;

ALTER TABLE app.estimates
  ALTER COLUMN estimate_date SET NOT NULL;

ALTER TABLE app.estimate_items
  ADD COLUMN IF NOT EXISTS item_order integer;

ALTER TABLE app.order_items
  ADD COLUMN IF NOT EXISTS item_order integer;

ALTER TABLE app.invoice_items
  ADD COLUMN IF NOT EXISTS item_order integer;

ALTER TABLE app.invoices
  DROP COLUMN IF EXISTS tally_export_id;

ALTER TABLE app.estimates DROP CONSTRAINT IF EXISTS estimates_status_check;
ALTER TABLE app.estimates
  ADD CONSTRAINT estimates_status_check CHECK (
    status IN ('draft', 'sent', 'accepted', 'declined', 'expired', 'invoiced', 'converted', 'void')
  );

ALTER TABLE app.orders DROP CONSTRAINT IF EXISTS orders_status_check;
ALTER TABLE app.orders
  ADD CONSTRAINT orders_status_check CHECK (
    status IN (
      'draft',
      'received',
      'confirmed',
      'partially_dispatched',
      'dispatched',
      'delivered',
      'cancelled',
      'open',
      'invoiced',
      'partially_invoiced',
      'overdue'
    )
  );

ALTER TABLE app.invoices DROP CONSTRAINT IF EXISTS invoices_status_check;
ALTER TABLE app.invoices
  ADD CONSTRAINT invoices_status_check CHECK (
    status IN ('draft', 'sent', 'paid', 'overdue', 'void', 'unpaid', 'partially_paid', 'viewed')
  );
