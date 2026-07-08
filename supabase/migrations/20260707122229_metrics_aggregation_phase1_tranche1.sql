-- Metrics Aggregation Phase 1 Tranche 1
-- Adds document-scoped aggregates for orders / estimates / invoices,
-- standardizes canonical IST day bucketing, and patches blocking
-- snapshot/KPI contract drift.

CREATE OR REPLACE FUNCTION app.metric_day_ist(
  p_explicit_date date,
  p_created_at timestamptz
)
RETURNS date
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT COALESCE(
    p_explicit_date,
    (p_created_at AT TIME ZONE 'Asia/Kolkata')::date
  );
$$;

ALTER TABLE app.customers_snapshot
  ADD COLUMN IF NOT EXISTS total_count bigint NOT NULL DEFAULT 0;

ALTER TABLE app.invoices_snapshot
  ADD COLUMN IF NOT EXISTS outstanding_count bigint NOT NULL DEFAULT 0;

CREATE OR REPLACE FUNCTION app.refresh_customers_snapshot(p_tenant_id uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = app
AS $$
  INSERT INTO app.customers_snapshot (
    tenant_id,
    total_count,
    active_count,
    tier_a_count,
    tier_b_count,
    tier_c_count,
    refreshed_at
  )
  SELECT
    p_tenant_id,
    COUNT(*)::bigint,
    COUNT(*) FILTER (WHERE is_active = true)::bigint,
    COUNT(*) FILTER (WHERE is_active = true AND tier = 'A')::bigint,
    COUNT(*) FILTER (WHERE is_active = true AND tier = 'B')::bigint,
    COUNT(*) FILTER (WHERE is_active = true AND tier = 'C')::bigint,
    now()
  FROM app.buyers
  WHERE tenant_id = p_tenant_id
    AND deleted_at IS NULL
  ON CONFLICT (tenant_id) DO UPDATE SET
    total_count = EXCLUDED.total_count,
    active_count = EXCLUDED.active_count,
    tier_a_count = EXCLUDED.tier_a_count,
    tier_b_count = EXCLUDED.tier_b_count,
    tier_c_count = EXCLUDED.tier_c_count,
    refreshed_at = EXCLUDED.refreshed_at;
$$;

CREATE OR REPLACE FUNCTION app.refresh_invoices_snapshot(p_tenant_id uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = app
AS $$
  INSERT INTO app.invoices_snapshot (
    tenant_id,
    total_count,
    outstanding_count,
    outstanding_amt,
    overdue_count,
    overdue_amt,
    paid_count,
    refreshed_at
  )
  SELECT
    p_tenant_id,
    COUNT(*)::bigint,
    COUNT(*) FILTER (
      WHERE deleted_at IS NULL
        AND COALESCE(outstanding_balance, 0) > 0
        AND status IN ('sent', 'overdue', 'unpaid', 'viewed', 'partially_paid')
    )::bigint,
    COALESCE(SUM(outstanding_balance) FILTER (
      WHERE deleted_at IS NULL
        AND COALESCE(outstanding_balance, 0) > 0
        AND status IN ('sent', 'overdue', 'unpaid', 'viewed', 'partially_paid')
    ), 0),
    COUNT(*) FILTER (
      WHERE deleted_at IS NULL
        AND COALESCE(outstanding_balance, 0) > 0
        AND status NOT IN ('draft', 'paid', 'void')
        AND due_date IS NOT NULL
        AND (due_date AT TIME ZONE 'Asia/Kolkata')::date < (now() AT TIME ZONE 'Asia/Kolkata')::date
    )::bigint,
    COALESCE(SUM(outstanding_balance) FILTER (
      WHERE deleted_at IS NULL
        AND COALESCE(outstanding_balance, 0) > 0
        AND status NOT IN ('draft', 'paid', 'void')
        AND due_date IS NOT NULL
        AND (due_date AT TIME ZONE 'Asia/Kolkata')::date < (now() AT TIME ZONE 'Asia/Kolkata')::date
    ), 0),
    COUNT(*) FILTER (WHERE status = 'paid')::bigint,
    now()
  FROM app.invoices
  WHERE tenant_id = p_tenant_id
    AND deleted_at IS NULL
  ON CONFLICT (tenant_id) DO UPDATE SET
    total_count = EXCLUDED.total_count,
    outstanding_count = EXCLUDED.outstanding_count,
    outstanding_amt = EXCLUDED.outstanding_amt,
    overdue_count = EXCLUDED.overdue_count,
    overdue_amt = EXCLUDED.overdue_amt,
    paid_count = EXCLUDED.paid_count,
    refreshed_at = EXCLUDED.refreshed_at;
$$;

CREATE TABLE IF NOT EXISTS app.orders_snapshot (
  tenant_id                      uuid PRIMARY KEY REFERENCES app.tenants(id) ON DELETE CASCADE,
  total_count                    bigint NOT NULL DEFAULT 0,
  buyers_count                   bigint NOT NULL DEFAULT 0,
  total_value                    numeric NOT NULL DEFAULT 0,
  open_count                     bigint NOT NULL DEFAULT 0,
  draft_count                    bigint NOT NULL DEFAULT 0,
  received_count                 bigint NOT NULL DEFAULT 0,
  confirmed_count                bigint NOT NULL DEFAULT 0,
  partially_dispatched_count     bigint NOT NULL DEFAULT 0,
  dispatched_count               bigint NOT NULL DEFAULT 0,
  delivered_count                bigint NOT NULL DEFAULT 0,
  invoiced_count                 bigint NOT NULL DEFAULT 0,
  partially_invoiced_count       bigint NOT NULL DEFAULT 0,
  overdue_count                  bigint NOT NULL DEFAULT 0,
  cancelled_count                bigint NOT NULL DEFAULT 0,
  buyer_app_count                bigint NOT NULL DEFAULT 0,
  converted_estimate_count       bigint NOT NULL DEFAULT 0,
  refreshed_at                   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_orders_snapshot_refreshed_at
  ON app.orders_snapshot (refreshed_at);

ALTER TABLE app.orders_snapshot ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "tenant members can read orders_snapshot" ON app.orders_snapshot;
CREATE POLICY "tenant members can read orders_snapshot"
  ON app.orders_snapshot FOR SELECT
  USING (app.jwt_tenant_id() = tenant_id);

CREATE OR REPLACE FUNCTION app.refresh_orders_snapshot(p_tenant_id uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = app
AS $$
  INSERT INTO app.orders_snapshot (
    tenant_id,
    total_count,
    buyers_count,
    total_value,
    open_count,
    draft_count,
    received_count,
    confirmed_count,
    partially_dispatched_count,
    dispatched_count,
    delivered_count,
    invoiced_count,
    partially_invoiced_count,
    overdue_count,
    cancelled_count,
    buyer_app_count,
    converted_estimate_count,
    refreshed_at
  )
  SELECT
    p_tenant_id,
    COUNT(*)::bigint,
    COUNT(DISTINCT buyer_id)::bigint,
    COALESCE(SUM(total_amount), 0),
    COUNT(*) FILTER (
      WHERE status IN (
        'draft',
        'open',
        'received',
        'confirmed',
        'partially_dispatched',
        'dispatched',
        'partially_invoiced',
        'overdue'
      )
    )::bigint,
    COUNT(*) FILTER (WHERE status = 'draft')::bigint,
    COUNT(*) FILTER (WHERE status IN ('open', 'received'))::bigint,
    COUNT(*) FILTER (WHERE status = 'confirmed')::bigint,
    COUNT(*) FILTER (WHERE status = 'partially_dispatched')::bigint,
    COUNT(*) FILTER (WHERE status = 'dispatched')::bigint,
    COUNT(*) FILTER (WHERE status = 'delivered')::bigint,
    COUNT(*) FILTER (WHERE status = 'invoiced')::bigint,
    COUNT(*) FILTER (WHERE status = 'partially_invoiced')::bigint,
    COUNT(*) FILTER (WHERE status = 'overdue')::bigint,
    COUNT(*) FILTER (WHERE status = 'cancelled')::bigint,
    COUNT(*) FILTER (WHERE is_buyer_app_order = true)::bigint,
    COUNT(*) FILTER (WHERE estimate_id IS NOT NULL)::bigint,
    now()
  FROM app.orders
  WHERE tenant_id = p_tenant_id
    AND deleted_at IS NULL
  ON CONFLICT (tenant_id) DO UPDATE SET
    total_count = EXCLUDED.total_count,
    buyers_count = EXCLUDED.buyers_count,
    total_value = EXCLUDED.total_value,
    open_count = EXCLUDED.open_count,
    draft_count = EXCLUDED.draft_count,
    received_count = EXCLUDED.received_count,
    confirmed_count = EXCLUDED.confirmed_count,
    partially_dispatched_count = EXCLUDED.partially_dispatched_count,
    dispatched_count = EXCLUDED.dispatched_count,
    delivered_count = EXCLUDED.delivered_count,
    invoiced_count = EXCLUDED.invoiced_count,
    partially_invoiced_count = EXCLUDED.partially_invoiced_count,
    overdue_count = EXCLUDED.overdue_count,
    cancelled_count = EXCLUDED.cancelled_count,
    buyer_app_count = EXCLUDED.buyer_app_count,
    converted_estimate_count = EXCLUDED.converted_estimate_count,
    refreshed_at = EXCLUDED.refreshed_at;
$$;

CREATE TABLE IF NOT EXISTS app.kpi_estimates_daily (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        uuid NOT NULL REFERENCES app.tenants(id) ON DELETE CASCADE,
  scope            text NOT NULL CHECK (scope IN ('tenant', 'location')),
  location_id      uuid REFERENCES app.locations(id) ON DELETE RESTRICT,
  day              date NOT NULL,
  estimates_count  bigint NOT NULL DEFAULT 0,
  buyers_count     bigint NOT NULL DEFAULT 0,
  gmv              numeric NOT NULL DEFAULT 0,
  open_count       bigint NOT NULL DEFAULT 0,
  draft_count      bigint NOT NULL DEFAULT 0,
  sent_count       bigint NOT NULL DEFAULT 0,
  accepted_count   bigint NOT NULL DEFAULT 0,
  converted_count  bigint NOT NULL DEFAULT 0,
  declined_count   bigint NOT NULL DEFAULT 0,
  expired_count    bigint NOT NULL DEFAULT 0,
  void_count       bigint NOT NULL DEFAULT 0,
  expiring_soon_count bigint NOT NULL DEFAULT 0,
  buyer_app_count  bigint NOT NULL DEFAULT 0,
  open_buyer_app_count bigint NOT NULL DEFAULT 0,
  seller_count     bigint NOT NULL DEFAULT 0,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  CHECK ((scope = 'tenant' AND location_id IS NULL) OR (scope = 'location' AND location_id IS NOT NULL))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_kpi_estimates_daily_tenant_unique
  ON app.kpi_estimates_daily (tenant_id, day)
  WHERE scope = 'tenant';

CREATE UNIQUE INDEX IF NOT EXISTS idx_kpi_estimates_daily_location_unique
  ON app.kpi_estimates_daily (tenant_id, location_id, day)
  WHERE scope = 'location';

CREATE INDEX IF NOT EXISTS idx_kpi_estimates_daily_lookup
  ON app.kpi_estimates_daily (tenant_id, scope, day, location_id);

ALTER TABLE app.kpi_estimates_daily ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "tenant members can read kpi_estimates_daily" ON app.kpi_estimates_daily;
CREATE POLICY "tenant members can read kpi_estimates_daily"
  ON app.kpi_estimates_daily FOR SELECT
  USING (app.jwt_tenant_id() = tenant_id);

DROP TRIGGER IF EXISTS trg_kpi_estimates_daily_updated_at ON app.kpi_estimates_daily;
CREATE TRIGGER trg_kpi_estimates_daily_updated_at
  BEFORE UPDATE ON app.kpi_estimates_daily
  FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();

CREATE TABLE IF NOT EXISTS app.kpi_orders_daily (
  id                            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id                     uuid NOT NULL REFERENCES app.tenants(id) ON DELETE CASCADE,
  scope                         text NOT NULL CHECK (scope IN ('tenant', 'location')),
  location_id                   uuid REFERENCES app.locations(id) ON DELETE RESTRICT,
  day                           date NOT NULL,
  orders_count                  bigint NOT NULL DEFAULT 0,
  buyers_count                  bigint NOT NULL DEFAULT 0,
  gmv                           numeric NOT NULL DEFAULT 0,
  open_count                    bigint NOT NULL DEFAULT 0,
  draft_count                   bigint NOT NULL DEFAULT 0,
  received_count                bigint NOT NULL DEFAULT 0,
  confirmed_count               bigint NOT NULL DEFAULT 0,
  partially_dispatched_count    bigint NOT NULL DEFAULT 0,
  dispatched_count              bigint NOT NULL DEFAULT 0,
  delivered_count               bigint NOT NULL DEFAULT 0,
  invoiced_count                bigint NOT NULL DEFAULT 0,
  partially_invoiced_count      bigint NOT NULL DEFAULT 0,
  overdue_count                 bigint NOT NULL DEFAULT 0,
  cancelled_count               bigint NOT NULL DEFAULT 0,
  buyer_app_count               bigint NOT NULL DEFAULT 0,
  converted_estimate_count      bigint NOT NULL DEFAULT 0,
  created_at                    timestamptz NOT NULL DEFAULT now(),
  updated_at                    timestamptz NOT NULL DEFAULT now(),
  CHECK ((scope = 'tenant' AND location_id IS NULL) OR (scope = 'location' AND location_id IS NOT NULL))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_kpi_orders_daily_tenant_unique
  ON app.kpi_orders_daily (tenant_id, day)
  WHERE scope = 'tenant';

CREATE UNIQUE INDEX IF NOT EXISTS idx_kpi_orders_daily_location_unique
  ON app.kpi_orders_daily (tenant_id, location_id, day)
  WHERE scope = 'location';

CREATE INDEX IF NOT EXISTS idx_kpi_orders_daily_lookup
  ON app.kpi_orders_daily (tenant_id, scope, day, location_id);

ALTER TABLE app.kpi_orders_daily ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "tenant members can read kpi_orders_daily" ON app.kpi_orders_daily;
CREATE POLICY "tenant members can read kpi_orders_daily"
  ON app.kpi_orders_daily FOR SELECT
  USING (app.jwt_tenant_id() = tenant_id);

DROP TRIGGER IF EXISTS trg_kpi_orders_daily_updated_at ON app.kpi_orders_daily;
CREATE TRIGGER trg_kpi_orders_daily_updated_at
  BEFORE UPDATE ON app.kpi_orders_daily
  FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();

CREATE TABLE IF NOT EXISTS app.kpi_invoices_daily (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        uuid NOT NULL REFERENCES app.tenants(id) ON DELETE CASCADE,
  scope            text NOT NULL CHECK (scope IN ('tenant', 'location')),
  location_id      uuid REFERENCES app.locations(id) ON DELETE RESTRICT,
  day              date NOT NULL,
  invoices_count   bigint NOT NULL DEFAULT 0,
  buyers_count     bigint NOT NULL DEFAULT 0,
  gmv              numeric NOT NULL DEFAULT 0,
  draft_count      bigint NOT NULL DEFAULT 0,
  sent_count       bigint NOT NULL DEFAULT 0,
  paid_count       bigint NOT NULL DEFAULT 0,
  overdue_count    bigint NOT NULL DEFAULT 0,
  overdue_amount   numeric NOT NULL DEFAULT 0,
  void_count       bigint NOT NULL DEFAULT 0,
  outstanding_count bigint NOT NULL DEFAULT 0,
  outstanding_amount numeric NOT NULL DEFAULT 0,
  buyer_app_count  bigint NOT NULL DEFAULT 0,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  CHECK ((scope = 'tenant' AND location_id IS NULL) OR (scope = 'location' AND location_id IS NOT NULL))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_kpi_invoices_daily_tenant_unique
  ON app.kpi_invoices_daily (tenant_id, day)
  WHERE scope = 'tenant';

CREATE UNIQUE INDEX IF NOT EXISTS idx_kpi_invoices_daily_location_unique
  ON app.kpi_invoices_daily (tenant_id, location_id, day)
  WHERE scope = 'location';

CREATE INDEX IF NOT EXISTS idx_kpi_invoices_daily_lookup
  ON app.kpi_invoices_daily (tenant_id, scope, day, location_id);

ALTER TABLE app.kpi_invoices_daily ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "tenant members can read kpi_invoices_daily" ON app.kpi_invoices_daily;
CREATE POLICY "tenant members can read kpi_invoices_daily"
  ON app.kpi_invoices_daily FOR SELECT
  USING (app.jwt_tenant_id() = tenant_id);

DROP TRIGGER IF EXISTS trg_kpi_invoices_daily_updated_at ON app.kpi_invoices_daily;
CREATE TRIGGER trg_kpi_invoices_daily_updated_at
  BEFORE UPDATE ON app.kpi_invoices_daily
  FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();

CREATE OR REPLACE FUNCTION app.refresh_kpi_estimates_daily(
  p_tenant_id uuid,
  p_day date
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app
AS $$
BEGIN
  DELETE FROM app.kpi_estimates_daily
  WHERE tenant_id = p_tenant_id
    AND day = p_day;

  INSERT INTO app.kpi_estimates_daily (
    tenant_id,
    scope,
    location_id,
    day,
    estimates_count,
    buyers_count,
    gmv,
    open_count,
    draft_count,
    sent_count,
    accepted_count,
    converted_count,
    declined_count,
    expired_count,
    void_count,
    expiring_soon_count,
    buyer_app_count,
    open_buyer_app_count,
    seller_count,
    updated_at
  )
  SELECT
    tenant_id,
    scope,
    location_id,
    day,
    COUNT(*)::bigint,
    COUNT(DISTINCT buyer_id)::bigint,
    COALESCE(SUM(total_amount), 0),
    COUNT(*) FILTER (WHERE status IN ('draft', 'sent', 'accepted'))::bigint,
    COUNT(*) FILTER (WHERE status = 'draft')::bigint,
    COUNT(*) FILTER (WHERE status = 'sent')::bigint,
    COUNT(*) FILTER (WHERE status = 'accepted')::bigint,
    COUNT(*) FILTER (WHERE status IN ('converted', 'invoiced'))::bigint,
    COUNT(*) FILTER (WHERE status = 'declined')::bigint,
    COUNT(*) FILTER (WHERE status = 'expired')::bigint,
    COUNT(*) FILTER (WHERE status = 'void')::bigint,
    COUNT(*) FILTER (
      WHERE status IN ('draft', 'sent', 'accepted')
        AND expires_at IS NOT NULL
        AND (expires_at AT TIME ZONE 'Asia/Kolkata')::date BETWEEN (now() AT TIME ZONE 'Asia/Kolkata')::date
        AND ((now() AT TIME ZONE 'Asia/Kolkata')::date + 7)
    )::bigint,
    COUNT(*) FILTER (WHERE is_buyer_app_estimate = true)::bigint,
    COUNT(*) FILTER (
      WHERE is_buyer_app_estimate = true
        AND status IN ('draft', 'sent', 'accepted')
    )::bigint,
    COUNT(*) FILTER (WHERE is_buyer_app_estimate = false)::bigint,
    now()
  FROM (
    SELECT
      e.tenant_id,
      'tenant'::text AS scope,
      NULL::uuid AS location_id,
      app.metric_day_ist(e.estimate_date, e.created_at) AS day,
      e.buyer_id,
      e.total_amount,
      e.status,
      e.is_buyer_app_estimate,
      e.expires_at
    FROM app.estimates e
    WHERE e.tenant_id = p_tenant_id
      AND e.deleted_at IS NULL
      AND app.metric_day_ist(e.estimate_date, e.created_at) = p_day

    UNION ALL

    SELECT
      e.tenant_id,
      'location'::text AS scope,
      e.location_id,
      app.metric_day_ist(e.estimate_date, e.created_at) AS day,
      e.buyer_id,
      e.total_amount,
      e.status,
      e.is_buyer_app_estimate,
      e.expires_at
    FROM app.estimates e
    WHERE e.tenant_id = p_tenant_id
      AND e.deleted_at IS NULL
      AND e.location_id IS NOT NULL
      AND app.metric_day_ist(e.estimate_date, e.created_at) = p_day
  ) rows
  GROUP BY tenant_id, scope, location_id, day;
END;
$$;

CREATE OR REPLACE FUNCTION app.refresh_kpi_orders_daily(
  p_tenant_id uuid,
  p_day date
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app
AS $$
BEGIN
  DELETE FROM app.kpi_orders_daily
  WHERE tenant_id = p_tenant_id
    AND day = p_day;

  INSERT INTO app.kpi_orders_daily (
    tenant_id,
    scope,
    location_id,
    day,
    orders_count,
    buyers_count,
    gmv,
    open_count,
    draft_count,
    received_count,
    confirmed_count,
    partially_dispatched_count,
    dispatched_count,
    delivered_count,
    invoiced_count,
    partially_invoiced_count,
    overdue_count,
    cancelled_count,
    buyer_app_count,
    converted_estimate_count,
    updated_at
  )
  SELECT
    tenant_id,
    scope,
    location_id,
    day,
    COUNT(*)::bigint,
    COUNT(DISTINCT buyer_id)::bigint,
    COALESCE(SUM(total_amount), 0),
    COUNT(*) FILTER (
      WHERE status IN (
        'draft',
        'open',
        'received',
        'confirmed',
        'partially_dispatched',
        'dispatched',
        'partially_invoiced',
        'overdue'
      )
    )::bigint,
    COUNT(*) FILTER (WHERE status = 'draft')::bigint,
    COUNT(*) FILTER (WHERE status IN ('open', 'received'))::bigint,
    COUNT(*) FILTER (WHERE status = 'confirmed')::bigint,
    COUNT(*) FILTER (WHERE status = 'partially_dispatched')::bigint,
    COUNT(*) FILTER (WHERE status = 'dispatched')::bigint,
    COUNT(*) FILTER (WHERE status = 'delivered')::bigint,
    COUNT(*) FILTER (WHERE status = 'invoiced')::bigint,
    COUNT(*) FILTER (WHERE status = 'partially_invoiced')::bigint,
    COUNT(*) FILTER (WHERE status = 'overdue')::bigint,
    COUNT(*) FILTER (WHERE status = 'cancelled')::bigint,
    COUNT(*) FILTER (WHERE is_buyer_app_order = true)::bigint,
    COUNT(*) FILTER (WHERE estimate_id IS NOT NULL)::bigint,
    now()
  FROM (
    SELECT
      o.tenant_id,
      'tenant'::text AS scope,
      NULL::uuid AS location_id,
      app.metric_day_ist(o.order_date, o.created_at) AS day,
      o.buyer_id,
      o.total_amount,
      o.status,
      o.is_buyer_app_order,
      o.estimate_id
    FROM app.orders o
    WHERE o.tenant_id = p_tenant_id
      AND o.deleted_at IS NULL
      AND app.metric_day_ist(o.order_date, o.created_at) = p_day

    UNION ALL

    SELECT
      o.tenant_id,
      'location'::text AS scope,
      o.location_id,
      app.metric_day_ist(o.order_date, o.created_at) AS day,
      o.buyer_id,
      o.total_amount,
      o.status,
      o.is_buyer_app_order,
      o.estimate_id
    FROM app.orders o
    WHERE o.tenant_id = p_tenant_id
      AND o.deleted_at IS NULL
      AND o.location_id IS NOT NULL
      AND app.metric_day_ist(o.order_date, o.created_at) = p_day
  ) rows
  GROUP BY tenant_id, scope, location_id, day;
END;
$$;

CREATE OR REPLACE FUNCTION app.refresh_kpi_invoices_daily(
  p_tenant_id uuid,
  p_day date
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app
AS $$
BEGIN
  DELETE FROM app.kpi_invoices_daily
  WHERE tenant_id = p_tenant_id
    AND day = p_day;

  INSERT INTO app.kpi_invoices_daily (
    tenant_id,
    scope,
    location_id,
    day,
    invoices_count,
    buyers_count,
    gmv,
    draft_count,
    sent_count,
    paid_count,
    overdue_count,
    overdue_amount,
    void_count,
    outstanding_count,
    outstanding_amount,
    buyer_app_count,
    updated_at
  )
  SELECT
    tenant_id,
    scope,
    location_id,
    day,
    COUNT(*)::bigint,
    COUNT(DISTINCT buyer_id)::bigint,
    COALESCE(SUM(CASE WHEN status IN ('draft', 'void') THEN 0 ELSE total_amount END), 0),
    COUNT(*) FILTER (WHERE status = 'draft')::bigint,
    COUNT(*) FILTER (WHERE status IN ('sent', 'unpaid', 'viewed', 'partially_paid'))::bigint,
    COUNT(*) FILTER (WHERE status = 'paid')::bigint,
    COUNT(*) FILTER (
      WHERE COALESCE(outstanding_balance, 0) > 0
        AND status NOT IN ('draft', 'paid', 'void')
        AND due_date IS NOT NULL
        AND (due_date AT TIME ZONE 'Asia/Kolkata')::date < (now() AT TIME ZONE 'Asia/Kolkata')::date
    )::bigint,
    COALESCE(SUM(CASE
      WHEN COALESCE(outstanding_balance, 0) > 0
        AND status NOT IN ('draft', 'paid', 'void')
        AND due_date IS NOT NULL
        AND (due_date AT TIME ZONE 'Asia/Kolkata')::date < (now() AT TIME ZONE 'Asia/Kolkata')::date
      THEN outstanding_balance
      ELSE 0
    END), 0),
    COUNT(*) FILTER (WHERE status = 'void')::bigint,
    COUNT(*) FILTER (
      WHERE COALESCE(outstanding_balance, 0) > 0
        AND status IN ('sent', 'overdue', 'unpaid', 'viewed', 'partially_paid')
    )::bigint,
    COALESCE(SUM(CASE
      WHEN COALESCE(outstanding_balance, 0) > 0
        AND status IN ('sent', 'overdue', 'unpaid', 'viewed', 'partially_paid')
      THEN outstanding_balance
      ELSE 0
    END), 0),
    COUNT(*) FILTER (WHERE is_buyer_app_invoice = true)::bigint,
    now()
  FROM (
    SELECT
      i.tenant_id,
      'tenant'::text AS scope,
      NULL::uuid AS location_id,
      app.metric_day_ist(NULL, COALESCE(i.invoice_date, i.created_at)) AS day,
      i.buyer_id,
      i.total_amount,
      i.status,
      i.is_buyer_app_invoice,
      COALESCE(i.outstanding_balance, 0) AS outstanding_balance,
      i.due_date
    FROM app.invoices i
    WHERE i.tenant_id = p_tenant_id
      AND i.deleted_at IS NULL
      AND app.metric_day_ist(NULL, COALESCE(i.invoice_date, i.created_at)) = p_day

    UNION ALL

    SELECT
      i.tenant_id,
      'location'::text AS scope,
      i.location_id,
      app.metric_day_ist(NULL, COALESCE(i.invoice_date, i.created_at)) AS day,
      i.buyer_id,
      i.total_amount,
      i.status,
      i.is_buyer_app_invoice,
      COALESCE(i.outstanding_balance, 0) AS outstanding_balance,
      i.due_date
    FROM app.invoices i
    WHERE i.tenant_id = p_tenant_id
      AND i.deleted_at IS NULL
      AND i.location_id IS NOT NULL
      AND app.metric_day_ist(NULL, COALESCE(i.invoice_date, i.created_at)) = p_day
  ) rows
  GROUP BY tenant_id, scope, location_id, day;
END;
$$;

CREATE OR REPLACE FUNCTION app.rebuild_kpi_estimates_daily_for_tenant(
  p_tenant_id uuid,
  p_days int DEFAULT 62
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app
AS $$
DECLARE
  v_today date := (now() AT TIME ZONE 'Asia/Kolkata')::date;
BEGIN
  DELETE FROM app.kpi_estimates_daily
  WHERE tenant_id = p_tenant_id
    AND day BETWEEN (v_today - p_days) AND v_today;

  INSERT INTO app.kpi_estimates_daily (
    tenant_id, scope, location_id, day,
    estimates_count, buyers_count, gmv, open_count, draft_count, sent_count,
    accepted_count, converted_count, declined_count, expired_count, void_count,
    expiring_soon_count, buyer_app_count, open_buyer_app_count, seller_count, updated_at
  )
  SELECT
    tenant_id,
    scope,
    location_id,
    day,
    COUNT(*)::bigint,
    COUNT(DISTINCT buyer_id)::bigint,
    COALESCE(SUM(total_amount), 0),
    COUNT(*) FILTER (WHERE status IN ('draft', 'sent', 'accepted'))::bigint,
    COUNT(*) FILTER (WHERE status = 'draft')::bigint,
    COUNT(*) FILTER (WHERE status = 'sent')::bigint,
    COUNT(*) FILTER (WHERE status = 'accepted')::bigint,
    COUNT(*) FILTER (WHERE status IN ('converted', 'invoiced'))::bigint,
    COUNT(*) FILTER (WHERE status = 'declined')::bigint,
    COUNT(*) FILTER (WHERE status = 'expired')::bigint,
    COUNT(*) FILTER (WHERE status = 'void')::bigint,
    COUNT(*) FILTER (
      WHERE status IN ('draft', 'sent', 'accepted')
        AND expires_at IS NOT NULL
        AND (expires_at AT TIME ZONE 'Asia/Kolkata')::date BETWEEN (now() AT TIME ZONE 'Asia/Kolkata')::date
        AND ((now() AT TIME ZONE 'Asia/Kolkata')::date + 7)
    )::bigint,
    COUNT(*) FILTER (WHERE is_buyer_app_estimate = true)::bigint,
    COUNT(*) FILTER (
      WHERE is_buyer_app_estimate = true
        AND status IN ('draft', 'sent', 'accepted')
    )::bigint,
    COUNT(*) FILTER (WHERE is_buyer_app_estimate = false)::bigint,
    now()
  FROM (
    SELECT
      e.tenant_id,
      'tenant'::text AS scope,
      NULL::uuid AS location_id,
      app.metric_day_ist(e.estimate_date, e.created_at) AS day,
      e.buyer_id,
      e.total_amount,
      e.status,
      e.is_buyer_app_estimate,
      e.expires_at
    FROM app.estimates e
    WHERE e.tenant_id = p_tenant_id
      AND e.deleted_at IS NULL
      AND app.metric_day_ist(e.estimate_date, e.created_at) BETWEEN (v_today - p_days) AND v_today

    UNION ALL

    SELECT
      e.tenant_id,
      'location'::text AS scope,
      e.location_id,
      app.metric_day_ist(e.estimate_date, e.created_at) AS day,
      e.buyer_id,
      e.total_amount,
      e.status,
      e.is_buyer_app_estimate,
      e.expires_at
    FROM app.estimates e
    WHERE e.tenant_id = p_tenant_id
      AND e.deleted_at IS NULL
      AND e.location_id IS NOT NULL
      AND app.metric_day_ist(e.estimate_date, e.created_at) BETWEEN (v_today - p_days) AND v_today
  ) rows
  GROUP BY tenant_id, scope, location_id, day;
END;
$$;

CREATE OR REPLACE FUNCTION app.rebuild_kpi_orders_daily_for_tenant(
  p_tenant_id uuid,
  p_days int DEFAULT 62
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app
AS $$
DECLARE
  v_today date := (now() AT TIME ZONE 'Asia/Kolkata')::date;
BEGIN
  DELETE FROM app.kpi_orders_daily
  WHERE tenant_id = p_tenant_id
    AND day BETWEEN (v_today - p_days) AND v_today;

  INSERT INTO app.kpi_orders_daily (
    tenant_id, scope, location_id, day,
    orders_count, buyers_count, gmv, open_count, draft_count, received_count,
    confirmed_count, partially_dispatched_count, dispatched_count, delivered_count,
    invoiced_count, partially_invoiced_count, overdue_count, cancelled_count,
    buyer_app_count, converted_estimate_count, updated_at
  )
  SELECT
    tenant_id,
    scope,
    location_id,
    day,
    COUNT(*)::bigint,
    COUNT(DISTINCT buyer_id)::bigint,
    COALESCE(SUM(total_amount), 0),
    COUNT(*) FILTER (
      WHERE status IN (
        'draft',
        'open',
        'received',
        'confirmed',
        'partially_dispatched',
        'dispatched',
        'partially_invoiced',
        'overdue'
      )
    )::bigint,
    COUNT(*) FILTER (WHERE status = 'draft')::bigint,
    COUNT(*) FILTER (WHERE status IN ('open', 'received'))::bigint,
    COUNT(*) FILTER (WHERE status = 'confirmed')::bigint,
    COUNT(*) FILTER (WHERE status = 'partially_dispatched')::bigint,
    COUNT(*) FILTER (WHERE status = 'dispatched')::bigint,
    COUNT(*) FILTER (WHERE status = 'delivered')::bigint,
    COUNT(*) FILTER (WHERE status = 'invoiced')::bigint,
    COUNT(*) FILTER (WHERE status = 'partially_invoiced')::bigint,
    COUNT(*) FILTER (WHERE status = 'overdue')::bigint,
    COUNT(*) FILTER (WHERE status = 'cancelled')::bigint,
    COUNT(*) FILTER (WHERE is_buyer_app_order = true)::bigint,
    COUNT(*) FILTER (WHERE estimate_id IS NOT NULL)::bigint,
    now()
  FROM (
    SELECT
      o.tenant_id,
      'tenant'::text AS scope,
      NULL::uuid AS location_id,
      app.metric_day_ist(o.order_date, o.created_at) AS day,
      o.buyer_id,
      o.total_amount,
      o.status,
      o.is_buyer_app_order,
      o.estimate_id
    FROM app.orders o
    WHERE o.tenant_id = p_tenant_id
      AND o.deleted_at IS NULL
      AND app.metric_day_ist(o.order_date, o.created_at) BETWEEN (v_today - p_days) AND v_today

    UNION ALL

    SELECT
      o.tenant_id,
      'location'::text AS scope,
      o.location_id,
      app.metric_day_ist(o.order_date, o.created_at) AS day,
      o.buyer_id,
      o.total_amount,
      o.status,
      o.is_buyer_app_order,
      o.estimate_id
    FROM app.orders o
    WHERE o.tenant_id = p_tenant_id
      AND o.deleted_at IS NULL
      AND o.location_id IS NOT NULL
      AND app.metric_day_ist(o.order_date, o.created_at) BETWEEN (v_today - p_days) AND v_today
  ) rows
  GROUP BY tenant_id, scope, location_id, day;
END;
$$;

CREATE OR REPLACE FUNCTION app.rebuild_kpi_invoices_daily_for_tenant(
  p_tenant_id uuid,
  p_days int DEFAULT 62
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app
AS $$
DECLARE
  v_today date := (now() AT TIME ZONE 'Asia/Kolkata')::date;
BEGIN
  DELETE FROM app.kpi_invoices_daily
  WHERE tenant_id = p_tenant_id
    AND day BETWEEN (v_today - p_days) AND v_today;

  INSERT INTO app.kpi_invoices_daily (
    tenant_id, scope, location_id, day,
    invoices_count, buyers_count, gmv, draft_count, sent_count, paid_count,
    overdue_count, overdue_amount, void_count, outstanding_count, outstanding_amount, buyer_app_count, updated_at
  )
  SELECT
    tenant_id,
    scope,
    location_id,
    day,
    COUNT(*)::bigint,
    COUNT(DISTINCT buyer_id)::bigint,
    COALESCE(SUM(CASE WHEN status IN ('draft', 'void') THEN 0 ELSE total_amount END), 0),
    COUNT(*) FILTER (WHERE status = 'draft')::bigint,
    COUNT(*) FILTER (WHERE status IN ('sent', 'unpaid', 'viewed', 'partially_paid'))::bigint,
    COUNT(*) FILTER (WHERE status = 'paid')::bigint,
    COUNT(*) FILTER (
      WHERE COALESCE(outstanding_balance, 0) > 0
        AND status NOT IN ('draft', 'paid', 'void')
        AND due_date IS NOT NULL
        AND (due_date AT TIME ZONE 'Asia/Kolkata')::date < (now() AT TIME ZONE 'Asia/Kolkata')::date
    )::bigint,
    COALESCE(SUM(CASE
      WHEN COALESCE(outstanding_balance, 0) > 0
        AND status NOT IN ('draft', 'paid', 'void')
        AND due_date IS NOT NULL
        AND (due_date AT TIME ZONE 'Asia/Kolkata')::date < (now() AT TIME ZONE 'Asia/Kolkata')::date
      THEN outstanding_balance
      ELSE 0
    END), 0),
    COUNT(*) FILTER (WHERE status = 'void')::bigint,
    COUNT(*) FILTER (
      WHERE COALESCE(outstanding_balance, 0) > 0
        AND status IN ('sent', 'overdue', 'unpaid', 'viewed', 'partially_paid')
    )::bigint,
    COALESCE(SUM(CASE
      WHEN COALESCE(outstanding_balance, 0) > 0
        AND status IN ('sent', 'overdue', 'unpaid', 'viewed', 'partially_paid')
      THEN outstanding_balance
      ELSE 0
    END), 0),
    COUNT(*) FILTER (WHERE is_buyer_app_invoice = true)::bigint,
    now()
  FROM (
    SELECT
      i.tenant_id,
      'tenant'::text AS scope,
      NULL::uuid AS location_id,
      app.metric_day_ist(NULL, COALESCE(i.invoice_date, i.created_at)) AS day,
      i.buyer_id,
      i.total_amount,
      i.status,
      i.is_buyer_app_invoice,
      COALESCE(i.outstanding_balance, 0) AS outstanding_balance,
      i.due_date
    FROM app.invoices i
    WHERE i.tenant_id = p_tenant_id
      AND i.deleted_at IS NULL
      AND app.metric_day_ist(NULL, COALESCE(i.invoice_date, i.created_at)) BETWEEN (v_today - p_days) AND v_today

    UNION ALL

    SELECT
      i.tenant_id,
      'location'::text AS scope,
      i.location_id,
      app.metric_day_ist(NULL, COALESCE(i.invoice_date, i.created_at)) AS day,
      i.buyer_id,
      i.total_amount,
      i.status,
      i.is_buyer_app_invoice,
      COALESCE(i.outstanding_balance, 0) AS outstanding_balance,
      i.due_date
    FROM app.invoices i
    WHERE i.tenant_id = p_tenant_id
      AND i.deleted_at IS NULL
      AND i.location_id IS NOT NULL
      AND app.metric_day_ist(NULL, COALESCE(i.invoice_date, i.created_at)) BETWEEN (v_today - p_days) AND v_today
  ) rows
  GROUP BY tenant_id, scope, location_id, day;
END;
$$;

CREATE OR REPLACE FUNCTION app.dispatch_from_estimates()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app
AS $$
DECLARE
  v_tenant uuid;
  v_bypass boolean;
  v_day date;
  v_is_app boolean;
BEGIN
  v_tenant := COALESCE(NEW.tenant_id, OLD.tenant_id);
  IF v_tenant IS NULL THEN RETURN NULL; END IF;

  v_bypass := app.sync_trigger_bypass_active();
  v_day := app.metric_day_ist(COALESCE(NEW.estimate_date, OLD.estimate_date), COALESCE(NEW.created_at, OLD.created_at));
  v_is_app := COALESCE(NEW.is_buyer_app_estimate, OLD.is_buyer_app_estimate, false);

  IF NOT v_bypass THEN
    PERFORM app.refresh_estimates_snapshot(v_tenant);
    IF v_day IS NOT NULL THEN
      PERFORM app.refresh_kpi_estimates_daily(v_tenant, v_day);
    END IF;
    IF v_is_app AND v_day IS NOT NULL THEN
      PERFORM app.refresh_buyer_app_daily(v_tenant, v_day);
    END IF;
    PERFORM app.refresh_buyer_app_snapshot(v_tenant);
  END IF;

  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION app.dispatch_from_orders()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app
AS $$
DECLARE
  v_tenant uuid;
  v_bypass boolean;
  v_location uuid;
  v_day date;
  v_placed_day date;
  v_is_app boolean;
BEGIN
  v_tenant := COALESCE(NEW.tenant_id, OLD.tenant_id);
  IF v_tenant IS NULL THEN RETURN NULL; END IF;

  v_bypass := app.sync_trigger_bypass_active();
  v_location := COALESCE(NEW.location_id, OLD.location_id);
  v_day := app.metric_day_ist(COALESCE(NEW.order_date, OLD.order_date), COALESCE(NEW.created_at, OLD.created_at));
  v_placed_day := (COALESCE(NEW.placed_at, OLD.placed_at) AT TIME ZONE 'Asia/Kolkata')::date;
  v_is_app := COALESCE(NEW.is_buyer_app_order, OLD.is_buyer_app_order, false);

  IF NOT v_bypass THEN
    PERFORM app.refresh_orders_snapshot(v_tenant);
    IF v_day IS NOT NULL THEN
      PERFORM app.refresh_kpi_orders_daily(v_tenant, v_day);
    END IF;
    IF v_placed_day IS NOT NULL THEN
      PERFORM app.refresh_kpi_tenant_daily(v_tenant, v_placed_day);
      IF v_location IS NOT NULL THEN
        PERFORM app.refresh_kpi_location_daily(v_tenant, v_location, v_placed_day);
      END IF;
    END IF;
    IF v_is_app AND v_day IS NOT NULL THEN
      PERFORM app.refresh_buyer_app_daily(v_tenant, v_day);
    END IF;
    PERFORM app.refresh_buyer_app_snapshot(v_tenant);
  END IF;

  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION app.dispatch_from_invoices()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app
AS $$
DECLARE
  v_tenant uuid;
  v_location uuid;
  v_day date;
BEGIN
  IF app.sync_trigger_bypass_active() THEN RETURN NULL; END IF;

  v_tenant := COALESCE(NEW.tenant_id, OLD.tenant_id);
  v_location := COALESCE(NEW.location_id, OLD.location_id);
  v_day := app.metric_day_ist(NULL, COALESCE(NEW.invoice_date, OLD.invoice_date, NEW.created_at, OLD.created_at));

  PERFORM app.refresh_invoices_snapshot(v_tenant);

  IF v_location IS NOT NULL THEN
    PERFORM app.refresh_locations_snapshot(v_location);
  END IF;

  IF v_day IS NOT NULL THEN
    PERFORM app.refresh_kpi_invoices_daily(v_tenant, v_day);
    PERFORM app.refresh_buyer_app_daily(v_tenant, v_day);
  END IF;
  PERFORM app.refresh_buyer_app_snapshot(v_tenant);

  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION app.post_sync_rebuild(p_tenant_id uuid, p_days int DEFAULT 2)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app
AS $$
DECLARE
  loc RECORD;
  wh RECORD;
BEGIN
  PERFORM app.refresh_estimates_snapshot(p_tenant_id);
  PERFORM app.refresh_invoices_snapshot(p_tenant_id);
  PERFORM app.refresh_orders_snapshot(p_tenant_id);
  PERFORM app.refresh_customers_snapshot(p_tenant_id);
  PERFORM app.refresh_products_snapshot(p_tenant_id);
  PERFORM app.refresh_categories_snapshot(p_tenant_id);
  PERFORM app.refresh_brands_snapshot(p_tenant_id);
  PERFORM app.refresh_buyer_app_snapshot(p_tenant_id);

  FOR loc IN
    SELECT id FROM app.locations
    WHERE tenant_id = p_tenant_id
      AND deleted_at IS NULL
  LOOP
    PERFORM app.refresh_locations_snapshot(loc.id);
  END LOOP;

  FOR wh IN
    SELECT id FROM app.warehouses
    WHERE tenant_id = p_tenant_id
      AND deleted_at IS NULL
  LOOP
    PERFORM app.refresh_warehouses_snapshot(wh.id);
  END LOOP;

  PERFORM app.rebuild_kpi_tenant_daily_for_tenant(p_tenant_id, p_days);
  PERFORM app.rebuild_kpi_estimates_daily_for_tenant(p_tenant_id, p_days);
  PERFORM app.rebuild_kpi_orders_daily_for_tenant(p_tenant_id, p_days);
  PERFORM app.rebuild_kpi_invoices_daily_for_tenant(p_tenant_id, p_days);
  PERFORM app.rebuild_kpi_brand_daily_for_tenant(p_tenant_id, p_days);
  PERFORM app.rebuild_kpi_category_daily_for_tenant(p_tenant_id, p_days);
  PERFORM app.rebuild_kpi_product_daily_for_tenant(p_tenant_id, p_days);
  PERFORM app.rebuild_kpi_location_daily_for_tenant(p_tenant_id, p_days);
  PERFORM app.rebuild_kpi_warehouse_daily_for_tenant(p_tenant_id, p_days);
  PERFORM app.rebuild_buyer_app_daily_for_tenant(p_tenant_id, p_days);
END;
$$;

CREATE OR REPLACE FUNCTION app.prune_kpi_daily_old_rows(p_retention_days int DEFAULT 90)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = app
AS $$
  DELETE FROM app.kpi_tenant_daily     WHERE day           < CURRENT_DATE - p_retention_days;
  DELETE FROM app.kpi_product_daily    WHERE day           < CURRENT_DATE - p_retention_days;
  DELETE FROM app.kpi_category_daily   WHERE day           < CURRENT_DATE - p_retention_days;
  DELETE FROM app.kpi_location_daily   WHERE day           < CURRENT_DATE - p_retention_days;
  DELETE FROM app.kpi_warehouse_daily  WHERE day           < CURRENT_DATE - p_retention_days;
  DELETE FROM app.kpi_brand_daily      WHERE day           < CURRENT_DATE - p_retention_days;
  DELETE FROM app.kpi_buyer_app_daily  WHERE snapshot_date < CURRENT_DATE - p_retention_days;
$$;

DO $$
DECLARE
  tenant_row RECORD;
BEGIN
  FOR tenant_row IN
    SELECT id
    FROM app.tenants
    WHERE deleted_at IS NULL
  LOOP
    PERFORM app.refresh_customers_snapshot(tenant_row.id);
    PERFORM app.refresh_estimates_snapshot(tenant_row.id);
    PERFORM app.refresh_invoices_snapshot(tenant_row.id);
    PERFORM app.refresh_orders_snapshot(tenant_row.id);
    PERFORM app.rebuild_kpi_estimates_daily_for_tenant(tenant_row.id, 3650);
    PERFORM app.rebuild_kpi_orders_daily_for_tenant(tenant_row.id, 3650);
    PERFORM app.rebuild_kpi_invoices_daily_for_tenant(tenant_row.id, 3650);
  END LOOP;
END;
$$;
