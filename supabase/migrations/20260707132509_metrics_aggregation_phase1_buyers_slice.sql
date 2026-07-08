-- Metrics Aggregation Phase 1 Buyers Slice
-- Adds buyer-grain current snapshots and daily KPI facts while preserving
-- customers_snapshot compatibility for existing readers.

CREATE TABLE IF NOT EXISTS app.buyers_snapshot (
  tenant_id          uuid NOT NULL REFERENCES app.tenants(id) ON DELETE CASCADE,
  buyer_id           uuid NOT NULL REFERENCES app.buyers(id) ON DELETE RESTRICT,
  scope              text NOT NULL CHECK (scope IN ('tenant', 'location')),
  location_id        uuid REFERENCES app.locations(id) ON DELETE RESTRICT,
  is_active          boolean NOT NULL DEFAULT false,
  is_dormant         boolean NOT NULL DEFAULT false,
  outstanding_dues   numeric NOT NULL DEFAULT 0,
  overdue_amount     numeric NOT NULL DEFAULT 0,
  credit_limit       numeric NOT NULL DEFAULT 0,
  open_orders_count  bigint NOT NULL DEFAULT 0,
  last_order_at      timestamptz,
  last_activity_at   timestamptz,
  refreshed_at       timestamptz NOT NULL DEFAULT now(),
  CHECK ((scope = 'tenant' AND location_id IS NULL) OR (scope = 'location' AND location_id IS NOT NULL))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_buyers_snapshot_tenant_unique
  ON app.buyers_snapshot (tenant_id, buyer_id)
  WHERE scope = 'tenant';

CREATE UNIQUE INDEX IF NOT EXISTS idx_buyers_snapshot_location_unique
  ON app.buyers_snapshot (tenant_id, buyer_id, location_id)
  WHERE scope = 'location';

CREATE INDEX IF NOT EXISTS idx_buyers_snapshot_scope_lookup
  ON app.buyers_snapshot (tenant_id, scope, location_id, buyer_id);

ALTER TABLE app.buyers_snapshot ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "tenant members can read buyers_snapshot" ON app.buyers_snapshot;
CREATE POLICY "tenant members can read buyers_snapshot"
  ON app.buyers_snapshot FOR SELECT
  USING (app.jwt_tenant_id() = tenant_id);

CREATE OR REPLACE FUNCTION app.refresh_buyers_snapshot(p_tenant_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app
AS $$
BEGIN
  DELETE FROM app.buyers_snapshot
  WHERE tenant_id = p_tenant_id;

  WITH base_buyers AS (
    SELECT
      b.id AS buyer_id,
      b.is_active,
      COALESCE(b.credit_limit, 0) AS credit_limit
    FROM app.buyers b
    WHERE b.tenant_id = p_tenant_id
      AND b.deleted_at IS NULL
  ),
  tenant_orders AS (
    SELECT
      o.buyer_id,
      COUNT(*) FILTER (
        WHERE o.status IN (
          'draft',
          'open',
          'received',
          'confirmed',
          'partially_dispatched',
          'dispatched',
          'partially_invoiced',
          'overdue'
        )
      )::bigint AS open_orders_count,
      MAX(COALESCE(o.placed_at, o.created_at, (o.order_date::timestamp AT TIME ZONE 'Asia/Kolkata'))) AS last_order_at
    FROM app.orders o
    WHERE o.tenant_id = p_tenant_id
      AND o.deleted_at IS NULL
      AND o.buyer_id IS NOT NULL
    GROUP BY o.buyer_id
  ),
  tenant_estimates AS (
    SELECT
      e.buyer_id,
      MAX(COALESCE((e.estimate_date::timestamp AT TIME ZONE 'Asia/Kolkata'), e.created_at)) AS last_estimate_at
    FROM app.estimates e
    WHERE e.tenant_id = p_tenant_id
      AND e.deleted_at IS NULL
      AND e.buyer_id IS NOT NULL
    GROUP BY e.buyer_id
  ),
  tenant_invoices AS (
    SELECT
      i.buyer_id,
      COALESCE(SUM(i.outstanding_balance) FILTER (
        WHERE COALESCE(i.outstanding_balance, 0) > 0
          AND i.status IN ('sent', 'issued', 'partially_paid', 'paid', 'overdue', 'unpaid', 'viewed')
      ), 0) AS outstanding_dues,
      COALESCE(SUM(i.outstanding_balance) FILTER (
        WHERE COALESCE(i.outstanding_balance, 0) > 0
          AND i.status IN ('sent', 'issued', 'partially_paid', 'paid', 'overdue', 'unpaid', 'viewed')
          AND i.due_date IS NOT NULL
          AND i.due_date::date < (now() AT TIME ZONE 'Asia/Kolkata')::date
      ), 0) AS overdue_amount,
      MAX(COALESCE((i.invoice_date::timestamp AT TIME ZONE 'Asia/Kolkata'), i.created_at)) AS last_invoice_at
    FROM app.invoices i
    WHERE i.tenant_id = p_tenant_id
      AND i.deleted_at IS NULL
      AND i.buyer_id IS NOT NULL
    GROUP BY i.buyer_id
  ),
  location_orders AS (
    SELECT
      o.buyer_id,
      o.location_id,
      COUNT(*) FILTER (
        WHERE o.status IN (
          'draft',
          'open',
          'received',
          'confirmed',
          'partially_dispatched',
          'dispatched',
          'partially_invoiced',
          'overdue'
        )
      )::bigint AS open_orders_count,
      MAX(COALESCE(o.placed_at, o.created_at, (o.order_date::timestamp AT TIME ZONE 'Asia/Kolkata'))) AS last_order_at
    FROM app.orders o
    WHERE o.tenant_id = p_tenant_id
      AND o.deleted_at IS NULL
      AND o.buyer_id IS NOT NULL
      AND o.location_id IS NOT NULL
    GROUP BY o.buyer_id, o.location_id
  ),
  location_estimates AS (
    SELECT
      e.buyer_id,
      e.location_id,
      MAX(COALESCE((e.estimate_date::timestamp AT TIME ZONE 'Asia/Kolkata'), e.created_at)) AS last_estimate_at
    FROM app.estimates e
    WHERE e.tenant_id = p_tenant_id
      AND e.deleted_at IS NULL
      AND e.buyer_id IS NOT NULL
      AND e.location_id IS NOT NULL
    GROUP BY e.buyer_id, e.location_id
  ),
  location_invoices AS (
    SELECT
      i.buyer_id,
      i.location_id,
      COALESCE(SUM(i.outstanding_balance) FILTER (
        WHERE COALESCE(i.outstanding_balance, 0) > 0
          AND i.status IN ('sent', 'issued', 'partially_paid', 'paid', 'overdue', 'unpaid', 'viewed')
      ), 0) AS outstanding_dues,
      COALESCE(SUM(i.outstanding_balance) FILTER (
        WHERE COALESCE(i.outstanding_balance, 0) > 0
          AND i.status IN ('sent', 'issued', 'partially_paid', 'paid', 'overdue', 'unpaid', 'viewed')
          AND i.due_date IS NOT NULL
          AND i.due_date::date < (now() AT TIME ZONE 'Asia/Kolkata')::date
      ), 0) AS overdue_amount,
      MAX(COALESCE((i.invoice_date::timestamp AT TIME ZONE 'Asia/Kolkata'), i.created_at)) AS last_invoice_at
    FROM app.invoices i
    WHERE i.tenant_id = p_tenant_id
      AND i.deleted_at IS NULL
      AND i.buyer_id IS NOT NULL
      AND i.location_id IS NOT NULL
    GROUP BY i.buyer_id, i.location_id
  ),
  location_keys AS (
    SELECT buyer_id, location_id FROM location_orders
    UNION
    SELECT buyer_id, location_id FROM location_estimates
    UNION
    SELECT buyer_id, location_id FROM location_invoices
  )
  INSERT INTO app.buyers_snapshot (
    tenant_id,
    buyer_id,
    scope,
    location_id,
    is_active,
    is_dormant,
    outstanding_dues,
    overdue_amount,
    credit_limit,
    open_orders_count,
    last_order_at,
    last_activity_at,
    refreshed_at
  )
  SELECT
    p_tenant_id,
    b.buyer_id,
    'tenant',
    NULL,
    COALESCE(b.is_active, false),
    (
      NULLIF(
        GREATEST(
          COALESCE(o.last_order_at, '-infinity'::timestamptz),
          COALESCE(e.last_estimate_at, '-infinity'::timestamptz),
          COALESCE(i.last_invoice_at, '-infinity'::timestamptz)
        ),
        '-infinity'::timestamptz
      ) IS NULL
      OR NULLIF(
        GREATEST(
          COALESCE(o.last_order_at, '-infinity'::timestamptz),
          COALESCE(e.last_estimate_at, '-infinity'::timestamptz),
          COALESCE(i.last_invoice_at, '-infinity'::timestamptz)
        ),
        '-infinity'::timestamptz
      ) < now() - interval '30 days'
    ),
    COALESCE(i.outstanding_dues, 0),
    COALESCE(i.overdue_amount, 0),
    COALESCE(b.credit_limit, 0),
    COALESCE(o.open_orders_count, 0),
    o.last_order_at,
    NULLIF(
      GREATEST(
        COALESCE(o.last_order_at, '-infinity'::timestamptz),
        COALESCE(e.last_estimate_at, '-infinity'::timestamptz),
        COALESCE(i.last_invoice_at, '-infinity'::timestamptz)
      ),
      '-infinity'::timestamptz
    ),
    now()
  FROM base_buyers b
  LEFT JOIN tenant_orders o ON o.buyer_id = b.buyer_id
  LEFT JOIN tenant_estimates e ON e.buyer_id = b.buyer_id
  LEFT JOIN tenant_invoices i ON i.buyer_id = b.buyer_id

  UNION ALL

  SELECT
    p_tenant_id,
    b.buyer_id,
    'location',
    lk.location_id,
    COALESCE(b.is_active, false),
    (
      NULLIF(
        GREATEST(
          COALESCE(lo.last_order_at, '-infinity'::timestamptz),
          COALESCE(le.last_estimate_at, '-infinity'::timestamptz),
          COALESCE(li.last_invoice_at, '-infinity'::timestamptz)
        ),
        '-infinity'::timestamptz
      ) IS NULL
      OR NULLIF(
        GREATEST(
          COALESCE(lo.last_order_at, '-infinity'::timestamptz),
          COALESCE(le.last_estimate_at, '-infinity'::timestamptz),
          COALESCE(li.last_invoice_at, '-infinity'::timestamptz)
        ),
        '-infinity'::timestamptz
      ) < now() - interval '30 days'
    ),
    COALESCE(li.outstanding_dues, 0),
    COALESCE(li.overdue_amount, 0),
    COALESCE(b.credit_limit, 0),
    COALESCE(lo.open_orders_count, 0),
    lo.last_order_at,
    NULLIF(
      GREATEST(
        COALESCE(lo.last_order_at, '-infinity'::timestamptz),
        COALESCE(le.last_estimate_at, '-infinity'::timestamptz),
        COALESCE(li.last_invoice_at, '-infinity'::timestamptz)
      ),
      '-infinity'::timestamptz
    ),
    now()
  FROM base_buyers b
  JOIN location_keys lk
    ON lk.buyer_id = b.buyer_id
  LEFT JOIN location_orders lo
    ON lo.buyer_id = lk.buyer_id
   AND lo.location_id = lk.location_id
  LEFT JOIN location_estimates le
    ON le.buyer_id = lk.buyer_id
   AND le.location_id = lk.location_id
  LEFT JOIN location_invoices li
    ON li.buyer_id = lk.buyer_id
   AND li.location_id = lk.location_id;
END;
$$;

CREATE TABLE IF NOT EXISTS app.kpi_buyers_daily (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        uuid NOT NULL REFERENCES app.tenants(id) ON DELETE CASCADE,
  buyer_id         uuid NOT NULL REFERENCES app.buyers(id) ON DELETE RESTRICT,
  scope            text NOT NULL CHECK (scope IN ('tenant', 'location')),
  location_id      uuid REFERENCES app.locations(id) ON DELETE RESTRICT,
  day              date NOT NULL,
  estimates_count  bigint NOT NULL DEFAULT 0,
  orders_count     bigint NOT NULL DEFAULT 0,
  invoices_count   bigint NOT NULL DEFAULT 0,
  estimates_gmv    numeric NOT NULL DEFAULT 0,
  orders_gmv       numeric NOT NULL DEFAULT 0,
  invoices_gmv     numeric NOT NULL DEFAULT 0,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  CHECK ((scope = 'tenant' AND location_id IS NULL) OR (scope = 'location' AND location_id IS NOT NULL))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_kpi_buyers_daily_tenant_unique
  ON app.kpi_buyers_daily (tenant_id, buyer_id, day)
  WHERE scope = 'tenant';

CREATE UNIQUE INDEX IF NOT EXISTS idx_kpi_buyers_daily_location_unique
  ON app.kpi_buyers_daily (tenant_id, buyer_id, location_id, day)
  WHERE scope = 'location';

CREATE INDEX IF NOT EXISTS idx_kpi_buyers_daily_rollup
  ON app.kpi_buyers_daily (tenant_id, scope, day, buyer_id, location_id);

ALTER TABLE app.kpi_buyers_daily ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "tenant members can read kpi_buyers_daily" ON app.kpi_buyers_daily;
CREATE POLICY "tenant members can read kpi_buyers_daily"
  ON app.kpi_buyers_daily FOR SELECT
  USING (app.jwt_tenant_id() = tenant_id);

CREATE OR REPLACE FUNCTION app.refresh_kpi_buyers_daily(p_tenant_id uuid, p_day date)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = app
AS $$
  DELETE FROM app.kpi_buyers_daily
  WHERE tenant_id = p_tenant_id
    AND day = p_day;

  WITH facts AS (
    SELECT
      p_tenant_id AS tenant_id,
      e.buyer_id,
      'tenant'::text AS scope,
      NULL::uuid AS location_id,
      app.metric_day_ist(e.estimate_date, e.created_at) AS day,
      1::bigint AS estimates_count,
      0::bigint AS orders_count,
      0::bigint AS invoices_count,
      COALESCE(e.total_amount, 0)::numeric AS estimates_gmv,
      0::numeric AS orders_gmv,
      0::numeric AS invoices_gmv
    FROM app.estimates e
    WHERE e.tenant_id = p_tenant_id
      AND e.deleted_at IS NULL
      AND e.buyer_id IS NOT NULL
      AND app.metric_day_ist(e.estimate_date, e.created_at) = p_day

    UNION ALL

    SELECT
      p_tenant_id,
      e.buyer_id,
      'location',
      e.location_id,
      app.metric_day_ist(e.estimate_date, e.created_at),
      1::bigint,
      0::bigint,
      0::bigint,
      COALESCE(e.total_amount, 0)::numeric,
      0::numeric,
      0::numeric
    FROM app.estimates e
    WHERE e.tenant_id = p_tenant_id
      AND e.deleted_at IS NULL
      AND e.buyer_id IS NOT NULL
      AND e.location_id IS NOT NULL
      AND app.metric_day_ist(e.estimate_date, e.created_at) = p_day

    UNION ALL

    SELECT
      p_tenant_id,
      o.buyer_id,
      'tenant',
      NULL::uuid,
      app.metric_day_ist(o.order_date, o.created_at),
      0::bigint,
      1::bigint,
      0::bigint,
      0::numeric,
      COALESCE(o.total_amount, 0)::numeric,
      0::numeric
    FROM app.orders o
    WHERE o.tenant_id = p_tenant_id
      AND o.deleted_at IS NULL
      AND o.buyer_id IS NOT NULL
      AND app.metric_day_ist(o.order_date, o.created_at) = p_day

    UNION ALL

    SELECT
      p_tenant_id,
      o.buyer_id,
      'location',
      o.location_id,
      app.metric_day_ist(o.order_date, o.created_at),
      0::bigint,
      1::bigint,
      0::bigint,
      0::numeric,
      COALESCE(o.total_amount, 0)::numeric,
      0::numeric
    FROM app.orders o
    WHERE o.tenant_id = p_tenant_id
      AND o.deleted_at IS NULL
      AND o.buyer_id IS NOT NULL
      AND o.location_id IS NOT NULL
      AND app.metric_day_ist(o.order_date, o.created_at) = p_day

    UNION ALL

    SELECT
      p_tenant_id,
      i.buyer_id,
      'tenant',
      NULL::uuid,
      app.metric_day_ist((i.invoice_date AT TIME ZONE 'Asia/Kolkata')::date, i.created_at),
      0::bigint,
      0::bigint,
      1::bigint,
      0::numeric,
      0::numeric,
      CASE
        WHEN i.status IN ('sent', 'issued', 'partially_paid', 'paid', 'overdue', 'unpaid', 'viewed')
          THEN COALESCE(i.total_amount, 0)::numeric
        ELSE 0::numeric
      END
    FROM app.invoices i
    WHERE i.tenant_id = p_tenant_id
      AND i.deleted_at IS NULL
      AND i.buyer_id IS NOT NULL
      AND i.status NOT IN ('cancelled', 'archived', 'rejected', 'void')
      AND app.metric_day_ist((i.invoice_date AT TIME ZONE 'Asia/Kolkata')::date, i.created_at) = p_day

    UNION ALL

    SELECT
      p_tenant_id,
      i.buyer_id,
      'location',
      i.location_id,
      app.metric_day_ist((i.invoice_date AT TIME ZONE 'Asia/Kolkata')::date, i.created_at),
      0::bigint,
      0::bigint,
      1::bigint,
      0::numeric,
      0::numeric,
      CASE
        WHEN i.status IN ('sent', 'issued', 'partially_paid', 'paid', 'overdue', 'unpaid', 'viewed')
          THEN COALESCE(i.total_amount, 0)::numeric
        ELSE 0::numeric
      END
    FROM app.invoices i
    WHERE i.tenant_id = p_tenant_id
      AND i.deleted_at IS NULL
      AND i.buyer_id IS NOT NULL
      AND i.location_id IS NOT NULL
      AND i.status NOT IN ('cancelled', 'archived', 'rejected', 'void')
      AND app.metric_day_ist((i.invoice_date AT TIME ZONE 'Asia/Kolkata')::date, i.created_at) = p_day
  )
  INSERT INTO app.kpi_buyers_daily (
    tenant_id,
    buyer_id,
    scope,
    location_id,
    day,
    estimates_count,
    orders_count,
    invoices_count,
    estimates_gmv,
    orders_gmv,
    invoices_gmv,
    created_at,
    updated_at
  )
  SELECT
    tenant_id,
    buyer_id,
    scope,
    location_id,
    day,
    SUM(estimates_count)::bigint,
    SUM(orders_count)::bigint,
    SUM(invoices_count)::bigint,
    SUM(estimates_gmv)::numeric,
    SUM(orders_gmv)::numeric,
    SUM(invoices_gmv)::numeric,
    now(),
    now()
  FROM facts
  GROUP BY tenant_id, buyer_id, scope, location_id, day;
$$;

CREATE OR REPLACE FUNCTION app.rebuild_kpi_buyers_daily_for_tenant(p_tenant_id uuid, p_days int DEFAULT 365)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app
AS $$
DECLARE
  v_start date := GREATEST((now() AT TIME ZONE 'Asia/Kolkata')::date - p_days, DATE '2000-01-01');
  v_end date := (now() AT TIME ZONE 'Asia/Kolkata')::date;
  day_row RECORD;
BEGIN
  DELETE FROM app.kpi_buyers_daily
  WHERE tenant_id = p_tenant_id
    AND day BETWEEN v_start AND v_end;

  FOR day_row IN
    SELECT DISTINCT day
    FROM (
      SELECT app.metric_day_ist(e.estimate_date, e.created_at) AS day
      FROM app.estimates e
      WHERE e.tenant_id = p_tenant_id
        AND e.deleted_at IS NULL
        AND e.buyer_id IS NOT NULL
        AND app.metric_day_ist(e.estimate_date, e.created_at) BETWEEN v_start AND v_end
      UNION
      SELECT app.metric_day_ist(o.order_date, o.created_at) AS day
      FROM app.orders o
      WHERE o.tenant_id = p_tenant_id
        AND o.deleted_at IS NULL
        AND o.buyer_id IS NOT NULL
        AND app.metric_day_ist(o.order_date, o.created_at) BETWEEN v_start AND v_end
      UNION
      SELECT app.metric_day_ist((i.invoice_date AT TIME ZONE 'Asia/Kolkata')::date, i.created_at) AS day
      FROM app.invoices i
      WHERE i.tenant_id = p_tenant_id
        AND i.deleted_at IS NULL
        AND i.buyer_id IS NOT NULL
        AND i.status NOT IN ('cancelled', 'archived', 'rejected', 'void')
        AND app.metric_day_ist((i.invoice_date AT TIME ZONE 'Asia/Kolkata')::date, i.created_at) BETWEEN v_start AND v_end
    ) days
  LOOP
    PERFORM app.refresh_kpi_buyers_daily(p_tenant_id, day_row.day);
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION app.dispatch_from_buyers()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app
AS $$
DECLARE
  v_tenant uuid;
BEGIN
  v_tenant := COALESCE(NEW.tenant_id, OLD.tenant_id);
  IF v_tenant IS NULL THEN RETURN NULL; END IF;
  IF app.sync_trigger_bypass_active() THEN RETURN NULL; END IF;

  PERFORM app.refresh_customers_snapshot(v_tenant);
  PERFORM app.refresh_buyers_snapshot(v_tenant);
  PERFORM app.refresh_buyer_app_snapshot(v_tenant);

  RETURN NULL;
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
    PERFORM app.refresh_buyers_snapshot(v_tenant);
    IF v_day IS NOT NULL THEN
      PERFORM app.refresh_kpi_estimates_daily(v_tenant, v_day);
      PERFORM app.refresh_kpi_buyers_daily(v_tenant, v_day);
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
    PERFORM app.refresh_buyers_snapshot(v_tenant);
    IF v_day IS NOT NULL THEN
      PERFORM app.refresh_kpi_orders_daily(v_tenant, v_day);
      PERFORM app.refresh_kpi_buyers_daily(v_tenant, v_day);
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
  PERFORM app.refresh_buyers_snapshot(v_tenant);

  IF v_location IS NOT NULL THEN
    PERFORM app.refresh_locations_snapshot(v_location);
  END IF;

  IF v_day IS NOT NULL THEN
    PERFORM app.refresh_kpi_invoices_daily(v_tenant, v_day);
    PERFORM app.refresh_kpi_buyers_daily(v_tenant, v_day);
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
  PERFORM app.refresh_buyers_snapshot(p_tenant_id);
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
  PERFORM app.rebuild_kpi_buyers_daily_for_tenant(p_tenant_id, p_days);
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
  DELETE FROM app.kpi_buyers_daily     WHERE day           < CURRENT_DATE - p_retention_days;
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
    PERFORM app.refresh_buyers_snapshot(tenant_row.id);
    PERFORM app.refresh_estimates_snapshot(tenant_row.id);
    PERFORM app.refresh_invoices_snapshot(tenant_row.id);
    PERFORM app.refresh_orders_snapshot(tenant_row.id);
    PERFORM app.rebuild_kpi_buyers_daily_for_tenant(tenant_row.id, 3650);
  END LOOP;
END;
$$;
