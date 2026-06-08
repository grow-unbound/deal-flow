-- EP-15-001: app.estimates + app.estimate_items for seller landing (status model, seller columns, RLS).

-- ── app.estimates ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS app.estimates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES app.tenants(id) ON DELETE CASCADE,
  buyer_id uuid NOT NULL REFERENCES app.buyers(id) ON DELETE RESTRICT,
  estimate_number text,
  status text NOT NULL DEFAULT 'draft',
  catalog_id uuid REFERENCES app.published_catalogs(id) ON DELETE SET NULL,
  subtotal numeric,
  tax_amount numeric,
  total_amount numeric,
  currency text NOT NULL DEFAULT 'INR',
  notes text,
  cart_hash text,
  source text NOT NULL DEFAULT 'buyer_app',
  sent_at timestamptz,
  accepted_at timestamptz,
  expires_at timestamptz,
  converted_to_order_id uuid REFERENCES app.orders(id) ON DELETE SET NULL,
  converted_to_invoice_id uuid,
  external_ref text,
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  updated_by uuid,
  CONSTRAINT estimates_source_check CHECK (source IN ('buyer_app', 'seller'))
);

-- Legacy / interim status from buyer API
UPDATE app.estimates SET status = 'draft' WHERE status = 'pending';

ALTER TABLE app.estimates DROP CONSTRAINT IF EXISTS estimates_status_check;
ALTER TABLE app.estimates
  ADD CONSTRAINT estimates_status_check CHECK (
    status IN ('draft', 'sent', 'accepted', 'declined', 'expired', 'converted', 'invoiced')
  );

CREATE INDEX IF NOT EXISTS idx_estimates_tenant_id ON app.estimates(tenant_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_estimates_buyer_id ON app.estimates(buyer_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_estimates_tenant_status ON app.estimates(tenant_id, status) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_estimates_expires_at ON app.estimates(expires_at) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_estimates_cart_hash ON app.estimates(buyer_id, cart_hash) WHERE deleted_at IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_estimates_tenant_external_ref
  ON app.estimates(tenant_id, external_ref)
  WHERE external_ref IS NOT NULL AND deleted_at IS NULL;

DROP TRIGGER IF EXISTS estimates_updated_at ON app.estimates;
CREATE TRIGGER estimates_updated_at
  BEFORE UPDATE ON app.estimates
  FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();

-- ── app.estimate_items ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS app.estimate_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  estimate_id uuid NOT NULL REFERENCES app.estimates(id) ON DELETE CASCADE,
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

CREATE INDEX IF NOT EXISTS idx_estimate_items_estimate_id ON app.estimate_items(estimate_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_estimate_items_tenant_product_id ON app.estimate_items(tenant_product_id) WHERE deleted_at IS NULL;

DROP TRIGGER IF EXISTS estimate_items_updated_at ON app.estimate_items;
CREATE TRIGGER estimate_items_updated_at
  BEFORE UPDATE ON app.estimate_items
  FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();

-- ── RLS: estimates ─────────────────────────────────────────────────────────
ALTER TABLE app.estimates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS estimates_seller_select ON app.estimates;
CREATE POLICY estimates_seller_select ON app.estimates
  FOR SELECT USING (app.is_seller() AND tenant_id = app.jwt_tenant_id());

DROP POLICY IF EXISTS estimates_buyer_select ON app.estimates;
CREATE POLICY estimates_buyer_select ON app.estimates
  FOR SELECT USING (
    app.is_buyer()
    AND tenant_id = app.jwt_tenant_id()
    AND buyer_id = app.jwt_buyer_id()
  );

DROP POLICY IF EXISTS estimates_seller_insert ON app.estimates;
CREATE POLICY estimates_seller_insert ON app.estimates
  FOR INSERT WITH CHECK (app.is_seller() AND tenant_id = app.jwt_tenant_id());

DROP POLICY IF EXISTS estimates_buyer_insert ON app.estimates;
CREATE POLICY estimates_buyer_insert ON app.estimates
  FOR INSERT WITH CHECK (
    app.is_buyer()
    AND tenant_id = app.jwt_tenant_id()
    AND buyer_id = app.jwt_buyer_id()
  );

DROP POLICY IF EXISTS estimates_seller_update ON app.estimates;
CREATE POLICY estimates_seller_update ON app.estimates
  FOR UPDATE USING (app.is_seller() AND tenant_id = app.jwt_tenant_id())
  WITH CHECK (app.is_seller() AND tenant_id = app.jwt_tenant_id());

DROP POLICY IF EXISTS estimates_buyer_admin_update ON app.estimates;
CREATE POLICY estimates_buyer_admin_update ON app.estimates
  FOR UPDATE USING (
    app.is_buyer_admin()
    AND tenant_id = app.jwt_tenant_id()
    AND buyer_id = app.jwt_buyer_id()
  ) WITH CHECK (
    app.is_buyer_admin()
    AND tenant_id = app.jwt_tenant_id()
    AND buyer_id = app.jwt_buyer_id()
  );

DROP POLICY IF EXISTS estimates_seller_delete ON app.estimates;
CREATE POLICY estimates_seller_delete ON app.estimates
  FOR DELETE USING (app.is_seller() AND tenant_id = app.jwt_tenant_id());

-- ── RLS: estimate_items ────────────────────────────────────────────────────
ALTER TABLE app.estimate_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS estimate_items_seller_select ON app.estimate_items;
CREATE POLICY estimate_items_seller_select ON app.estimate_items
  FOR SELECT USING (
    app.is_seller() AND EXISTS (
      SELECT 1 FROM app.estimates e
      WHERE e.id = estimate_id AND e.tenant_id = app.jwt_tenant_id()
    )
  );

DROP POLICY IF EXISTS estimate_items_buyer_select ON app.estimate_items;
CREATE POLICY estimate_items_buyer_select ON app.estimate_items
  FOR SELECT USING (
    app.is_buyer() AND EXISTS (
      SELECT 1 FROM app.estimates e
      WHERE e.id = estimate_id
        AND e.tenant_id = app.jwt_tenant_id()
        AND e.buyer_id = app.jwt_buyer_id()
    )
  );

DROP POLICY IF EXISTS estimate_items_seller_insert ON app.estimate_items;
CREATE POLICY estimate_items_seller_insert ON app.estimate_items
  FOR INSERT WITH CHECK (
    app.is_seller() AND EXISTS (
      SELECT 1 FROM app.estimates e
      WHERE e.id = estimate_id AND e.tenant_id = app.jwt_tenant_id()
    )
  );

DROP POLICY IF EXISTS estimate_items_buyer_insert ON app.estimate_items;
CREATE POLICY estimate_items_buyer_insert ON app.estimate_items
  FOR INSERT WITH CHECK (
    app.is_buyer() AND EXISTS (
      SELECT 1 FROM app.estimates e
      WHERE e.id = estimate_id
        AND e.tenant_id = app.jwt_tenant_id()
        AND e.buyer_id = app.jwt_buyer_id()
    )
  );

DROP POLICY IF EXISTS estimate_items_seller_update ON app.estimate_items;
CREATE POLICY estimate_items_seller_update ON app.estimate_items
  FOR UPDATE USING (
    app.is_seller() AND EXISTS (
      SELECT 1 FROM app.estimates e
      WHERE e.id = estimate_id AND e.tenant_id = app.jwt_tenant_id()
    )
  );

DROP POLICY IF EXISTS estimate_items_seller_delete ON app.estimate_items;
CREATE POLICY estimate_items_seller_delete ON app.estimate_items
  FOR DELETE USING (
    app.is_seller() AND EXISTS (
      SELECT 1 FROM app.estimates e
      WHERE e.id = estimate_id AND e.tenant_id = app.jwt_tenant_id()
    )
  );
