-- RLS for app.invoices + app.invoice_items (created in 20260529082022_add_invoices_and_invoice_items_for_customers_landing.sql)
-- and app.kpi_tenant_daily + app.kpi_product_daily (20260530094949_kpi_aggregates_near_realtime.sql).
--
-- KPI maintenance functions run from triggers on orders/order_items/inventory; callers may be buyers.
-- Mark refresh/rebuild helpers SECURITY DEFINER + fixed search_path so upserts succeed under RLS.

-- ── KPI refresh RPCs: run as definer so trigger chains can write aggregates ─────────────────────
ALTER FUNCTION app.refresh_kpi_tenant_daily(uuid, date)
  SECURITY DEFINER
  SET search_path = pg_catalog, app;

ALTER FUNCTION app.refresh_kpi_product_daily(uuid, uuid, date)
  SECURITY DEFINER
  SET search_path = pg_catalog, app;

ALTER FUNCTION app.rebuild_kpi_aggregates_for_recent_days(integer)
  SECURITY DEFINER
  SET search_path = pg_catalog, app;

-- ── app.invoices (same access shape as app.orders; invoices are seller-issued) ─────────────────
ALTER TABLE app.invoices ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS invoices_seller_select ON app.invoices;
CREATE POLICY invoices_seller_select ON app.invoices
  FOR SELECT USING (app.is_seller() AND tenant_id = app.jwt_tenant_id());

DROP POLICY IF EXISTS invoices_buyer_select ON app.invoices;
CREATE POLICY invoices_buyer_select ON app.invoices
  FOR SELECT USING (
    app.is_buyer()
    AND tenant_id = app.jwt_tenant_id()
    AND buyer_id = app.jwt_buyer_id()
  );

DROP POLICY IF EXISTS invoices_seller_insert ON app.invoices;
CREATE POLICY invoices_seller_insert ON app.invoices
  FOR INSERT WITH CHECK (app.is_seller() AND tenant_id = app.jwt_tenant_id());

DROP POLICY IF EXISTS invoices_seller_update ON app.invoices;
CREATE POLICY invoices_seller_update ON app.invoices
  FOR UPDATE USING (app.is_seller() AND tenant_id = app.jwt_tenant_id())
  WITH CHECK (app.is_seller() AND tenant_id = app.jwt_tenant_id());

DROP POLICY IF EXISTS invoices_seller_delete ON app.invoices;
CREATE POLICY invoices_seller_delete ON app.invoices
  FOR DELETE USING (app.is_seller() AND tenant_id = app.jwt_tenant_id());

-- ── app.invoice_items (child of invoice; seller writes, buyer read-only) ─────────────────────
ALTER TABLE app.invoice_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS invoice_items_seller_select ON app.invoice_items;
CREATE POLICY invoice_items_seller_select ON app.invoice_items
  FOR SELECT USING (
    app.is_seller() AND EXISTS (
      SELECT 1 FROM app.invoices inv
      WHERE inv.id = invoice_id AND inv.tenant_id = app.jwt_tenant_id()
    )
  );

DROP POLICY IF EXISTS invoice_items_buyer_select ON app.invoice_items;
CREATE POLICY invoice_items_buyer_select ON app.invoice_items
  FOR SELECT USING (
    app.is_buyer() AND EXISTS (
      SELECT 1 FROM app.invoices inv
      WHERE inv.id = invoice_id
        AND inv.tenant_id = app.jwt_tenant_id()
        AND inv.buyer_id = app.jwt_buyer_id()
    )
  );

DROP POLICY IF EXISTS invoice_items_seller_insert ON app.invoice_items;
CREATE POLICY invoice_items_seller_insert ON app.invoice_items
  FOR INSERT WITH CHECK (
    app.is_seller() AND EXISTS (
      SELECT 1 FROM app.invoices inv
      WHERE inv.id = invoice_id AND inv.tenant_id = app.jwt_tenant_id()
    )
  );

DROP POLICY IF EXISTS invoice_items_seller_update ON app.invoice_items;
CREATE POLICY invoice_items_seller_update ON app.invoice_items
  FOR UPDATE USING (
    app.is_seller() AND EXISTS (
      SELECT 1 FROM app.invoices inv
      WHERE inv.id = invoice_id AND inv.tenant_id = app.jwt_tenant_id()
    )
  );

DROP POLICY IF EXISTS invoice_items_seller_delete ON app.invoice_items;
CREATE POLICY invoice_items_seller_delete ON app.invoice_items
  FOR DELETE USING (
    app.is_seller() AND EXISTS (
      SELECT 1 FROM app.invoices inv
      WHERE inv.id = invoice_id AND inv.tenant_id = app.jwt_tenant_id()
    )
  );

-- ── app.kpi_tenant_daily / app.kpi_product_daily (seller analytics; no direct buyer access) ────
ALTER TABLE app.kpi_tenant_daily ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS kpi_tenant_daily_seller_select ON app.kpi_tenant_daily;
CREATE POLICY kpi_tenant_daily_seller_select ON app.kpi_tenant_daily
  FOR SELECT USING (app.is_seller() AND tenant_id = app.jwt_tenant_id());

ALTER TABLE app.kpi_product_daily ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS kpi_product_daily_seller_select ON app.kpi_product_daily;
CREATE POLICY kpi_product_daily_seller_select ON app.kpi_product_daily
  FOR SELECT USING (app.is_seller() AND tenant_id = app.jwt_tenant_id());
