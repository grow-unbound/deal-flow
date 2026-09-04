-- Migration: Zoho Customer Payments sync — schema changes
-- Extends app.payments with Zoho fields; adds payment_applications join table.
-- Drops single invoice_id FK (replaced by payment_applications many-to-many).

-- 1. Extend app.payments with Zoho fields
ALTER TABLE app.payments
  ADD COLUMN IF NOT EXISTS payment_number      text,
  ADD COLUMN IF NOT EXISTS reference_number    text,
  ADD COLUMN IF NOT EXISTS bank_charges        numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS tax_amount_withheld numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS currency_code       text NOT NULL DEFAULT 'INR',
  ADD COLUMN IF NOT EXISTS description         text,
  ADD COLUMN IF NOT EXISTS excess_amount       numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS zoho_customer_id    text;

-- Drop old single-invoice FK column (replaced by payment_applications)
ALTER TABLE app.payments
  DROP COLUMN IF EXISTS invoice_id;

-- Drop old index that referenced invoice_id
DROP INDEX IF EXISTS app.idx_payments_invoice_id;

-- Unique constraint on (tenant_id, external_ref) for upsert key
ALTER TABLE app.payments
  DROP CONSTRAINT IF EXISTS payments_tenant_external_ref_unique;
ALTER TABLE app.payments
  ADD CONSTRAINT payments_tenant_external_ref_unique UNIQUE (tenant_id, external_ref);

-- 2. New payment_applications join table
CREATE TABLE IF NOT EXISTS app.payment_applications (
  id             uuid        NOT NULL DEFAULT gen_random_uuid(),
  tenant_id      uuid        NOT NULL,
  payment_id     uuid        NOT NULL,
  invoice_id     uuid        NOT NULL,
  amount_applied numeric     NOT NULL,
  balance_after  numeric     NOT NULL,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT payment_applications_pkey PRIMARY KEY (id),
  CONSTRAINT payment_applications_tenant_fk   FOREIGN KEY (tenant_id)  REFERENCES app.tenants(id)   ON DELETE RESTRICT,
  CONSTRAINT payment_applications_payment_fk  FOREIGN KEY (payment_id) REFERENCES app.payments(id)  ON DELETE RESTRICT,
  CONSTRAINT payment_applications_invoice_fk  FOREIGN KEY (invoice_id) REFERENCES app.invoices(id)  ON DELETE RESTRICT
);

ALTER TABLE app.payment_applications OWNER TO postgres;

CREATE UNIQUE INDEX IF NOT EXISTS idx_payment_applications_payment_invoice
  ON app.payment_applications (payment_id, invoice_id);

CREATE INDEX IF NOT EXISTS idx_payment_applications_tenant_invoice
  ON app.payment_applications (tenant_id, invoice_id);

CREATE INDEX IF NOT EXISTS idx_payment_applications_tenant_payment
  ON app.payment_applications (tenant_id, payment_id);

-- updated_at trigger
CREATE OR REPLACE TRIGGER payment_applications_updated_at
  BEFORE UPDATE ON app.payment_applications
  FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();

-- 3. RLS
ALTER TABLE app.payment_applications ENABLE ROW LEVEL SECURITY;

CREATE POLICY payment_applications_seller_select
  ON app.payment_applications FOR SELECT
  USING (app.is_seller() AND tenant_id = app.jwt_tenant_id());

CREATE POLICY payment_applications_seller_admin_insert
  ON app.payment_applications FOR INSERT
  WITH CHECK (app.is_seller_admin() AND tenant_id = app.jwt_tenant_id());

CREATE POLICY payment_applications_seller_admin_update
  ON app.payment_applications FOR UPDATE
  USING (app.is_seller_admin() AND tenant_id = app.jwt_tenant_id())
  WITH CHECK (app.is_seller_admin() AND tenant_id = app.jwt_tenant_id());

CREATE POLICY payment_applications_seller_admin_delete
  ON app.payment_applications FOR DELETE
  USING (app.is_seller_admin() AND tenant_id = app.jwt_tenant_id());

-- 4. Grants
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE app.payment_applications TO authenticated;
GRANT ALL ON TABLE app.payment_applications TO service_role;
