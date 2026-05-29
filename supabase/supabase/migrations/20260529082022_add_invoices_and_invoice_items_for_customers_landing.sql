CREATE TABLE IF NOT EXISTS app.invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES app.tenants(id) ON DELETE RESTRICT,
  buyer_id uuid NOT NULL REFERENCES app.buyers(id) ON DELETE RESTRICT,
  order_id uuid REFERENCES app.orders(id) ON DELETE RESTRICT,
  invoice_number text NOT NULL,
  invoice_date timestamptz NOT NULL,
  status text NOT NULL CHECK (status IN ('draft', 'issued', 'partially_paid', 'paid', 'void')),
  subtotal numeric DEFAULT 0,
  tax_amount numeric DEFAULT 0,
  total_amount numeric DEFAULT 0,
  outstanding_balance numeric DEFAULT 0,
  external_ref text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  updated_by uuid,
  deleted_at timestamptz,
  UNIQUE (tenant_id, invoice_number),
  UNIQUE (tenant_id, external_ref)
);

CREATE INDEX IF NOT EXISTS idx_invoices_tenant_id ON app.invoices(tenant_id);
CREATE INDEX IF NOT EXISTS idx_invoices_buyer_id ON app.invoices(buyer_id);
CREATE INDEX IF NOT EXISTS idx_invoices_order_id ON app.invoices(order_id);
CREATE INDEX IF NOT EXISTS idx_invoices_status ON app.invoices(status);
CREATE INDEX IF NOT EXISTS idx_invoices_invoice_date ON app.invoices(invoice_date);

CREATE TABLE IF NOT EXISTS app.invoice_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id uuid NOT NULL REFERENCES app.invoices(id) ON DELETE RESTRICT,
  tenant_product_id uuid NOT NULL REFERENCES app.tenant_products(id) ON DELETE RESTRICT,
  qty numeric NOT NULL,
  unit_price numeric NOT NULL,
  tax_rate numeric,
  line_total numeric,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  updated_by uuid,
  deleted_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_invoice_items_invoice_id ON app.invoice_items(invoice_id);
CREATE INDEX IF NOT EXISTS idx_invoice_items_tenant_product_id ON app.invoice_items(tenant_product_id);

CREATE TRIGGER invoices_updated_at BEFORE UPDATE ON app.invoices
  FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();

CREATE TRIGGER invoice_items_updated_at BEFORE UPDATE ON app.invoice_items
  FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();
