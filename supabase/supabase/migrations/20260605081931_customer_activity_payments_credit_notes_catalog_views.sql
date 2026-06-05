-- Customer detail activity sources: payments ledger, credit notes, catalog open events.
-- RLS: sellers read within tenant; seller_admin mutates (sensitive financial rows).
-- catalog_views: buyers may INSERT own rows for future buyer-app instrumentation.

CREATE TABLE IF NOT EXISTS app.payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES app.tenants(id) ON DELETE RESTRICT,
  buyer_id uuid NOT NULL REFERENCES app.buyers(id) ON DELETE RESTRICT,
  invoice_id uuid REFERENCES app.invoices(id) ON DELETE RESTRICT,
  amount numeric NOT NULL CHECK (amount >= 0),
  status text NOT NULL DEFAULT 'recorded'
    CHECK (status IN ('recorded', 'pending', 'cleared', 'failed', 'void')),
  mode text,
  paid_at timestamptz NOT NULL DEFAULT now(),
  external_ref text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  updated_by uuid,
  deleted_at timestamptz,
  UNIQUE (tenant_id, external_ref)
);

CREATE INDEX IF NOT EXISTS idx_payments_tenant_buyer ON app.payments(tenant_id, buyer_id);
CREATE INDEX IF NOT EXISTS idx_payments_invoice_id ON app.payments(invoice_id);
CREATE INDEX IF NOT EXISTS idx_payments_paid_at ON app.payments(paid_at);

CREATE TRIGGER payments_updated_at BEFORE UPDATE ON app.payments
  FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();

CREATE TABLE IF NOT EXISTS app.credit_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES app.tenants(id) ON DELETE RESTRICT,
  buyer_id uuid NOT NULL REFERENCES app.buyers(id) ON DELETE RESTRICT,
  invoice_id uuid REFERENCES app.invoices(id) ON DELETE RESTRICT,
  amount numeric NOT NULL CHECK (amount > 0),
  reason text,
  status text NOT NULL DEFAULT 'issued'
    CHECK (status IN ('draft', 'issued', 'applied', 'void')),
  issued_at timestamptz NOT NULL DEFAULT now(),
  external_ref text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  updated_by uuid,
  deleted_at timestamptz,
  UNIQUE (tenant_id, external_ref)
);

CREATE INDEX IF NOT EXISTS idx_credit_notes_tenant_buyer ON app.credit_notes(tenant_id, buyer_id);
CREATE INDEX IF NOT EXISTS idx_credit_notes_issued_at ON app.credit_notes(issued_at);

CREATE TRIGGER credit_notes_updated_at BEFORE UPDATE ON app.credit_notes
  FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();

CREATE TABLE IF NOT EXISTS app.catalog_views (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES app.tenants(id) ON DELETE RESTRICT,
  buyer_id uuid NOT NULL REFERENCES app.buyers(id) ON DELETE RESTRICT,
  catalog_id uuid NOT NULL REFERENCES app.published_catalogs(id) ON DELETE RESTRICT,
  viewed_at timestamptz NOT NULL DEFAULT now(),
  source text CHECK (source IN ('buyer_app', 'guest_link', 'cockpit')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  updated_by uuid,
  deleted_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_catalog_views_tenant_buyer_viewed ON app.catalog_views(tenant_id, buyer_id, viewed_at);
CREATE INDEX IF NOT EXISTS idx_catalog_views_catalog_id ON app.catalog_views(catalog_id);

CREATE TRIGGER catalog_views_updated_at BEFORE UPDATE ON app.catalog_views
  FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();

-- ──────────────────────────────────────────────────────────
-- RLS: app.payments
-- ──────────────────────────────────────────────────────────
ALTER TABLE app.payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY payments_seller_select ON app.payments
  FOR SELECT USING (app.is_seller() AND tenant_id = app.jwt_tenant_id());

CREATE POLICY payments_seller_admin_insert ON app.payments
  FOR INSERT WITH CHECK (app.is_seller_admin() AND tenant_id = app.jwt_tenant_id());

CREATE POLICY payments_seller_admin_update ON app.payments
  FOR UPDATE USING (app.is_seller_admin() AND tenant_id = app.jwt_tenant_id())
  WITH CHECK (app.is_seller_admin() AND tenant_id = app.jwt_tenant_id());

CREATE POLICY payments_seller_admin_delete ON app.payments
  FOR DELETE USING (app.is_seller_admin() AND tenant_id = app.jwt_tenant_id());

-- ──────────────────────────────────────────────────────────
-- RLS: app.credit_notes
-- ──────────────────────────────────────────────────────────
ALTER TABLE app.credit_notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY credit_notes_seller_select ON app.credit_notes
  FOR SELECT USING (app.is_seller() AND tenant_id = app.jwt_tenant_id());

CREATE POLICY credit_notes_seller_admin_insert ON app.credit_notes
  FOR INSERT WITH CHECK (app.is_seller_admin() AND tenant_id = app.jwt_tenant_id());

CREATE POLICY credit_notes_seller_admin_update ON app.credit_notes
  FOR UPDATE USING (app.is_seller_admin() AND tenant_id = app.jwt_tenant_id())
  WITH CHECK (app.is_seller_admin() AND tenant_id = app.jwt_tenant_id());

CREATE POLICY credit_notes_seller_admin_delete ON app.credit_notes
  FOR DELETE USING (app.is_seller_admin() AND tenant_id = app.jwt_tenant_id());

-- ──────────────────────────────────────────────────────────
-- RLS: app.catalog_views
-- ──────────────────────────────────────────────────────────
ALTER TABLE app.catalog_views ENABLE ROW LEVEL SECURITY;

CREATE POLICY catalog_views_seller_select ON app.catalog_views
  FOR SELECT USING (app.is_seller() AND tenant_id = app.jwt_tenant_id());

CREATE POLICY catalog_views_buyer_select ON app.catalog_views
  FOR SELECT USING (
    app.is_buyer()
    AND tenant_id = app.jwt_tenant_id()
    AND buyer_id = app.jwt_buyer_id()
  );

CREATE POLICY catalog_views_seller_admin_insert ON app.catalog_views
  FOR INSERT WITH CHECK (app.is_seller_admin() AND tenant_id = app.jwt_tenant_id());

CREATE POLICY catalog_views_seller_admin_update ON app.catalog_views
  FOR UPDATE USING (app.is_seller_admin() AND tenant_id = app.jwt_tenant_id())
  WITH CHECK (app.is_seller_admin() AND tenant_id = app.jwt_tenant_id());

CREATE POLICY catalog_views_seller_admin_delete ON app.catalog_views
  FOR DELETE USING (app.is_seller_admin() AND tenant_id = app.jwt_tenant_id());

CREATE POLICY catalog_views_buyer_insert ON app.catalog_views
  FOR INSERT WITH CHECK (
    app.is_buyer()
    AND tenant_id = app.jwt_tenant_id()
    AND buyer_id = app.jwt_buyer_id()
  );
