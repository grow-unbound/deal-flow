-- Performance: per-tenant snapshot tables for O(1) KPI card reads.
-- Pattern mirrors kpi_tenant_daily: write triggers keep rows current.
-- API routes read from these tables for summary cards; paginated list is separate.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Estimates snapshot
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS app.estimates_snapshot (
  tenant_id      uuid PRIMARY KEY REFERENCES app.tenants(id) ON DELETE CASCADE,
  total_count    bigint  NOT NULL DEFAULT 0,
  draft_count    bigint  NOT NULL DEFAULT 0,
  sent_count     bigint  NOT NULL DEFAULT 0,
  accepted_count bigint  NOT NULL DEFAULT 0,
  total_value    numeric NOT NULL DEFAULT 0,
  accepted_value numeric NOT NULL DEFAULT 0,
  expiring_soon  bigint  NOT NULL DEFAULT 0, -- sent + expires within 7 days
  refreshed_at   timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE app.estimates_snapshot ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant members can read estimates_snapshot"
  ON app.estimates_snapshot FOR SELECT
  USING (app.jwt_tenant_id() = tenant_id);

CREATE OR REPLACE FUNCTION app.refresh_estimates_snapshot(p_tenant_id uuid)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = app AS $$
  INSERT INTO app.estimates_snapshot (
    tenant_id, total_count, draft_count, sent_count, accepted_count,
    total_value, accepted_value, expiring_soon, refreshed_at
  )
  SELECT
    p_tenant_id,
    COUNT(*),
    COUNT(*) FILTER (WHERE status = 'draft'),
    COUNT(*) FILTER (WHERE status = 'sent'),
    COUNT(*) FILTER (WHERE status = 'accepted'),
    COALESCE(SUM(total_amount), 0),
    COALESCE(SUM(total_amount) FILTER (WHERE status = 'accepted'), 0),
    COUNT(*) FILTER (
      WHERE status = 'sent'
        AND expires_at BETWEEN now() AND now() + interval '7 days'
    ),
    now()
  FROM app.estimates
  WHERE tenant_id = p_tenant_id
    AND deleted_at IS NULL
  ON CONFLICT (tenant_id) DO UPDATE SET
    total_count    = EXCLUDED.total_count,
    draft_count    = EXCLUDED.draft_count,
    sent_count     = EXCLUDED.sent_count,
    accepted_count = EXCLUDED.accepted_count,
    total_value    = EXCLUDED.total_value,
    accepted_value = EXCLUDED.accepted_value,
    expiring_soon  = EXCLUDED.expiring_soon,
    refreshed_at   = EXCLUDED.refreshed_at;
$$;

CREATE OR REPLACE FUNCTION app.trg_refresh_estimates_snapshot()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = app AS $$
DECLARE
  target_tenant uuid;
BEGIN
  target_tenant := COALESCE(NEW.tenant_id, OLD.tenant_id);
  PERFORM app.refresh_estimates_snapshot(target_tenant);
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_estimates_refresh_snapshot ON app.estimates;
CREATE TRIGGER trg_estimates_refresh_snapshot
  AFTER INSERT OR UPDATE OR DELETE ON app.estimates
  FOR EACH ROW EXECUTE FUNCTION app.trg_refresh_estimates_snapshot();

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Invoices snapshot
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS app.invoices_snapshot (
  tenant_id       uuid PRIMARY KEY REFERENCES app.tenants(id) ON DELETE CASCADE,
  total_count     bigint  NOT NULL DEFAULT 0,
  outstanding_amt numeric NOT NULL DEFAULT 0,
  overdue_count   bigint  NOT NULL DEFAULT 0,
  overdue_amt     numeric NOT NULL DEFAULT 0,
  paid_count      bigint  NOT NULL DEFAULT 0,
  refreshed_at    timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE app.invoices_snapshot ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant members can read invoices_snapshot"
  ON app.invoices_snapshot FOR SELECT
  USING (app.jwt_tenant_id() = tenant_id);

CREATE OR REPLACE FUNCTION app.refresh_invoices_snapshot(p_tenant_id uuid)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = app AS $$
  INSERT INTO app.invoices_snapshot (
    tenant_id, total_count, outstanding_amt, overdue_count, overdue_amt, paid_count, refreshed_at
  )
  SELECT
    p_tenant_id,
    COUNT(*),
    COALESCE(SUM(amount_due) FILTER (WHERE status IN ('sent', 'partial')), 0),
    COUNT(*) FILTER (WHERE status IN ('sent', 'partial') AND due_date < now()),
    COALESCE(SUM(amount_due) FILTER (WHERE status IN ('sent', 'partial') AND due_date < now()), 0),
    COUNT(*) FILTER (WHERE status = 'paid'),
    now()
  FROM app.invoices
  WHERE tenant_id = p_tenant_id
    AND deleted_at IS NULL
  ON CONFLICT (tenant_id) DO UPDATE SET
    total_count     = EXCLUDED.total_count,
    outstanding_amt = EXCLUDED.outstanding_amt,
    overdue_count   = EXCLUDED.overdue_count,
    overdue_amt     = EXCLUDED.overdue_amt,
    paid_count      = EXCLUDED.paid_count,
    refreshed_at    = EXCLUDED.refreshed_at;
$$;

CREATE OR REPLACE FUNCTION app.trg_refresh_invoices_snapshot()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = app AS $$
DECLARE
  target_tenant uuid;
BEGIN
  target_tenant := COALESCE(NEW.tenant_id, OLD.tenant_id);
  PERFORM app.refresh_invoices_snapshot(target_tenant);
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_invoices_refresh_snapshot ON app.invoices;
CREATE TRIGGER trg_invoices_refresh_snapshot
  AFTER INSERT OR UPDATE OR DELETE ON app.invoices
  FOR EACH ROW EXECUTE FUNCTION app.trg_refresh_invoices_snapshot();

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Customers (buyers) snapshot
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS app.customers_snapshot (
  tenant_id    uuid PRIMARY KEY REFERENCES app.tenants(id) ON DELETE CASCADE,
  active_count bigint NOT NULL DEFAULT 0,
  tier_a_count bigint NOT NULL DEFAULT 0,
  tier_b_count bigint NOT NULL DEFAULT 0,
  tier_c_count bigint NOT NULL DEFAULT 0,
  refreshed_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE app.customers_snapshot ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant members can read customers_snapshot"
  ON app.customers_snapshot FOR SELECT
  USING (app.jwt_tenant_id() = tenant_id);

CREATE OR REPLACE FUNCTION app.refresh_customers_snapshot(p_tenant_id uuid)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = app AS $$
  INSERT INTO app.customers_snapshot (
    tenant_id, active_count, tier_a_count, tier_b_count, tier_c_count, refreshed_at
  )
  SELECT
    p_tenant_id,
    COUNT(*) FILTER (WHERE is_active = true),
    COUNT(*) FILTER (WHERE is_active = true AND tier = 'A'),
    COUNT(*) FILTER (WHERE is_active = true AND tier = 'B'),
    COUNT(*) FILTER (WHERE is_active = true AND tier = 'C'),
    now()
  FROM app.buyers
  WHERE tenant_id = p_tenant_id
    AND deleted_at IS NULL
  ON CONFLICT (tenant_id) DO UPDATE SET
    active_count = EXCLUDED.active_count,
    tier_a_count = EXCLUDED.tier_a_count,
    tier_b_count = EXCLUDED.tier_b_count,
    tier_c_count = EXCLUDED.tier_c_count,
    refreshed_at = EXCLUDED.refreshed_at;
$$;

CREATE OR REPLACE FUNCTION app.trg_refresh_customers_snapshot()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = app AS $$
DECLARE
  target_tenant uuid;
BEGIN
  target_tenant := COALESCE(NEW.tenant_id, OLD.tenant_id);
  PERFORM app.refresh_customers_snapshot(target_tenant);
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_buyers_refresh_snapshot ON app.buyers;
CREATE TRIGGER trg_buyers_refresh_snapshot
  AFTER INSERT OR UPDATE OR DELETE ON app.buyers
  FOR EACH ROW EXECUTE FUNCTION app.trg_refresh_customers_snapshot();

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Products snapshot
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS app.products_snapshot (
  tenant_id       uuid PRIMARY KEY REFERENCES app.tenants(id) ON DELETE CASCADE,
  total_count     bigint NOT NULL DEFAULT 0,
  active_count    bigint NOT NULL DEFAULT 0,
  low_stock_count bigint NOT NULL DEFAULT 0,
  refreshed_at    timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE app.products_snapshot ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant members can read products_snapshot"
  ON app.products_snapshot FOR SELECT
  USING (app.jwt_tenant_id() = tenant_id);

CREATE OR REPLACE FUNCTION app.refresh_products_snapshot(p_tenant_id uuid)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = app AS $$
  INSERT INTO app.products_snapshot (
    tenant_id, total_count, active_count, low_stock_count, refreshed_at
  )
  SELECT
    p_tenant_id,
    COUNT(*),
    COUNT(*) FILTER (WHERE is_active = true),
    COUNT(*) FILTER (
      WHERE is_active = true
        AND EXISTS (
          SELECT 1 FROM app.tenant_inventory ti
          WHERE ti.tenant_product_id = tp.id
            AND ti.qty_available <= ti.reorder_point
        )
    ),
    now()
  FROM app.tenant_products tp
  WHERE tenant_id = p_tenant_id
    AND deleted_at IS NULL
  ON CONFLICT (tenant_id) DO UPDATE SET
    total_count     = EXCLUDED.total_count,
    active_count    = EXCLUDED.active_count,
    low_stock_count = EXCLUDED.low_stock_count,
    refreshed_at    = EXCLUDED.refreshed_at;
$$;

CREATE OR REPLACE FUNCTION app.trg_refresh_products_snapshot()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = app AS $$
DECLARE
  target_tenant uuid;
BEGIN
  target_tenant := COALESCE(NEW.tenant_id, OLD.tenant_id);
  PERFORM app.refresh_products_snapshot(target_tenant);
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_tenant_products_refresh_snapshot ON app.tenant_products;
CREATE TRIGGER trg_tenant_products_refresh_snapshot
  AFTER INSERT OR UPDATE OR DELETE ON app.tenant_products
  FOR EACH ROW EXECUTE FUNCTION app.trg_refresh_products_snapshot();

-- Also refresh products_snapshot when inventory changes (low_stock_count depends on it)
DROP TRIGGER IF EXISTS trg_inventory_refresh_products_snapshot ON app.tenant_inventory;
CREATE TRIGGER trg_inventory_refresh_products_snapshot
  AFTER INSERT OR UPDATE OR DELETE ON app.tenant_inventory
  FOR EACH ROW EXECUTE FUNCTION app.trg_refresh_products_snapshot();
