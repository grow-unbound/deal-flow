-- Metrics Aggregation Phase 3
-- Foundation completion pass:
-- - unify document status helpers and canonical order-day semantics
-- - clear stale aggregate buckets on date/location/product/warehouse moves
-- - make sparse rebuilds delete stale rows before repopulating
-- - extend retention to document KPI tables
-- - make sync-triggered rebuild depth derive from since_date and persist failure state

-- update invoice_date column to date type
ALTER TABLE app.invoices 
ALTER COLUMN invoice_date TYPE DATE USING invoice_date::DATE;

CREATE OR REPLACE FUNCTION app.estimate_status_is_open(p_status text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT COALESCE(p_status, '') IN ('draft', 'sent');
$$;

CREATE OR REPLACE FUNCTION app.order_status_in_flow(p_status text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT COALESCE(p_status, '') NOT IN ('cancelled', 'archived', 'rejected', 'void', 'closed');
$$;

CREATE OR REPLACE FUNCTION app.order_status_is_open(p_status text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT COALESCE(p_status, '') IN (
    'draft',
    'open',
    'accepted',
    'received',
    'confirmed',
    'partially_dispatched',
    'dispatched',
    'partially_invoiced',
    'overdue'
  );
$$;

CREATE OR REPLACE FUNCTION app.order_status_is_downstream_quality(p_status text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT COALESCE(p_status, '') IN (
    'confirmed',
    'partially_dispatched',
    'dispatched',
    'delivered',
    'invoiced',
    'partially_invoiced',
    'paid',
    'completed'
  );
$$;

CREATE OR REPLACE FUNCTION app.invoice_status_in_flow(p_status text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT COALESCE(p_status, '') NOT IN ('cancelled', 'archived', 'rejected', 'void');
$$;

CREATE OR REPLACE FUNCTION app.invoice_status_gmv_included(p_status text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT COALESCE(p_status, '') IN (
    'draft',
    'sent',
    'issued',
    'viewed',
    'unpaid',
    'partially_paid',
    'paid',
    'overdue'
  );
$$;

CREATE OR REPLACE FUNCTION app.invoice_status_has_receivable(
  p_status text,
  p_outstanding_balance numeric
)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT COALESCE(p_outstanding_balance, 0) > 0
    AND COALESCE(p_status, '') IN ('sent', 'issued', 'viewed', 'unpaid', 'partially_paid', 'overdue');
$$;

CREATE OR REPLACE FUNCTION app.invoice_is_overdue(
  p_status text,
  p_due_date timestamptz,
  p_outstanding_balance numeric
)
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT app.invoice_status_has_receivable(p_status, p_outstanding_balance)
    AND p_due_date IS NOT NULL
    AND (p_due_date AT TIME ZONE 'Asia/Kolkata')::date < (now() AT TIME ZONE 'Asia/Kolkata')::date;
$$;

CREATE OR REPLACE FUNCTION app.sync_job_rebuild_days(
  p_job_type text,
  p_since_date timestamptz,
  p_default_days int DEFAULT 2
)
RETURNS int
LANGUAGE sql
STABLE
AS $$
  SELECT GREATEST(
    CASE p_job_type
      WHEN 'initial_reference' THEN 90
      WHEN 'initial_transactional' THEN 90
      ELSE GREATEST(COALESCE(p_default_days, 2), 2)
    END,
    COALESCE(
      ((now() AT TIME ZONE 'Asia/Kolkata')::date - (p_since_date AT TIME ZONE 'Asia/Kolkata')::date) + 1,
      0
    )
  )::int;
$$;

ALTER TABLE app.estimates_snapshot
  ADD COLUMN IF NOT EXISTS open_count bigint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS converted_count bigint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS expired_count bigint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS void_count bigint NOT NULL DEFAULT 0;

CREATE OR REPLACE FUNCTION app.refresh_estimates_snapshot(p_tenant_id uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = app
AS $$
  INSERT INTO app.estimates_snapshot (
    tenant_id,
    total_count,
    draft_count,
    sent_count,
    accepted_count,
    open_count,
    converted_count,
    expired_count,
    void_count,
    total_value,
    accepted_value,
    expiring_soon,
    refreshed_at
  )
  SELECT
    p_tenant_id,
    COUNT(*)::bigint,
    COUNT(*) FILTER (WHERE status = 'draft')::bigint,
    COUNT(*) FILTER (WHERE status = 'sent')::bigint,
    COUNT(*) FILTER (WHERE status = 'accepted')::bigint,
    COUNT(*) FILTER (WHERE app.estimate_status_is_open(status))::bigint,
    COUNT(*) FILTER (WHERE status IN ('converted', 'invoiced'))::bigint,
    COUNT(*) FILTER (WHERE status = 'expired')::bigint,
    COUNT(*) FILTER (WHERE status = 'void')::bigint,
    COALESCE(SUM(total_amount), 0),
    COALESCE(SUM(total_amount) FILTER (WHERE status = 'accepted'), 0),
    COUNT(*) FILTER (
      WHERE app.estimate_status_is_open(status)
        AND expires_at IS NOT NULL
        AND (expires_at AT TIME ZONE 'Asia/Kolkata')::date BETWEEN (now() AT TIME ZONE 'Asia/Kolkata')::date
        AND ((now() AT TIME ZONE 'Asia/Kolkata')::date + 7)
    )::bigint,
    now()
  FROM app.estimates
  WHERE tenant_id = p_tenant_id
    AND deleted_at IS NULL
  ON CONFLICT (tenant_id) DO UPDATE SET
    total_count = EXCLUDED.total_count,
    draft_count = EXCLUDED.draft_count,
    sent_count = EXCLUDED.sent_count,
    accepted_count = EXCLUDED.accepted_count,
    open_count = EXCLUDED.open_count,
    converted_count = EXCLUDED.converted_count,
    expired_count = EXCLUDED.expired_count,
    void_count = EXCLUDED.void_count,
    total_value = EXCLUDED.total_value,
    accepted_value = EXCLUDED.accepted_value,
    expiring_soon = EXCLUDED.expiring_soon,
    refreshed_at = EXCLUDED.refreshed_at;
$$;

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
    COUNT(*) FILTER (WHERE app.order_status_in_flow(status))::bigint,
    COUNT(DISTINCT buyer_id) FILTER (WHERE app.order_status_in_flow(status))::bigint,
    COALESCE(SUM(total_amount) FILTER (WHERE app.order_status_in_flow(status)), 0),
    COUNT(*) FILTER (WHERE app.order_status_is_open(status))::bigint,
    COUNT(*) FILTER (WHERE status = 'draft')::bigint,
    COUNT(*) FILTER (WHERE status IN ('open', 'accepted', 'received'))::bigint,
    COUNT(*) FILTER (WHERE status = 'confirmed')::bigint,
    COUNT(*) FILTER (WHERE status = 'partially_dispatched')::bigint,
    COUNT(*) FILTER (WHERE status = 'dispatched')::bigint,
    COUNT(*) FILTER (WHERE status = 'delivered')::bigint,
    COUNT(*) FILTER (WHERE status = 'invoiced')::bigint,
    COUNT(*) FILTER (WHERE status = 'partially_invoiced')::bigint,
    COUNT(*) FILTER (WHERE status = 'overdue')::bigint,
    COUNT(*) FILTER (WHERE status = 'cancelled')::bigint,
    COUNT(*) FILTER (WHERE is_buyer_app_order = true AND app.order_status_in_flow(status))::bigint,
    COUNT(*) FILTER (
      WHERE estimate_id IS NOT NULL
        AND app.order_status_is_downstream_quality(status)
    )::bigint,
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
    COUNT(*) FILTER (WHERE app.invoice_status_in_flow(status))::bigint,
    COUNT(*) FILTER (WHERE app.invoice_status_has_receivable(status, outstanding_balance))::bigint,
    COALESCE(SUM(outstanding_balance) FILTER (
      WHERE app.invoice_status_has_receivable(status, outstanding_balance)
    ), 0),
    COUNT(*) FILTER (
      WHERE app.invoice_is_overdue(status, due_date, outstanding_balance)
    )::bigint,
    COALESCE(SUM(outstanding_balance) FILTER (
      WHERE app.invoice_is_overdue(status, due_date, outstanding_balance)
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
    COUNT(*) FILTER (WHERE app.estimate_status_is_open(status))::bigint,
    COUNT(*) FILTER (WHERE status = 'draft')::bigint,
    COUNT(*) FILTER (WHERE status = 'sent')::bigint,
    COUNT(*) FILTER (WHERE status = 'accepted')::bigint,
    COUNT(*) FILTER (WHERE status IN ('converted', 'invoiced'))::bigint,
    COUNT(*) FILTER (WHERE status IN ('declined', 'rejected'))::bigint,
    COUNT(*) FILTER (WHERE status = 'expired')::bigint,
    COUNT(*) FILTER (WHERE status = 'void')::bigint,
    COUNT(*) FILTER (
      WHERE app.estimate_status_is_open(status)
        AND expires_at IS NOT NULL
        AND (expires_at AT TIME ZONE 'Asia/Kolkata')::date BETWEEN (now() AT TIME ZONE 'Asia/Kolkata')::date
        AND ((now() AT TIME ZONE 'Asia/Kolkata')::date + 7)
    )::bigint,
    COUNT(*) FILTER (WHERE is_buyer_app_estimate = true)::bigint,
    COUNT(*) FILTER (
      WHERE is_buyer_app_estimate = true
        AND app.estimate_status_is_open(status)
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
    COUNT(*) FILTER (WHERE app.order_status_in_flow(status))::bigint,
    COUNT(DISTINCT buyer_id) FILTER (WHERE app.order_status_in_flow(status))::bigint,
    COALESCE(SUM(total_amount) FILTER (WHERE app.order_status_in_flow(status)), 0),
    COUNT(*) FILTER (WHERE app.order_status_is_open(status))::bigint,
    COUNT(*) FILTER (WHERE status = 'draft')::bigint,
    COUNT(*) FILTER (WHERE status IN ('open', 'accepted', 'received'))::bigint,
    COUNT(*) FILTER (WHERE status = 'confirmed')::bigint,
    COUNT(*) FILTER (WHERE status = 'partially_dispatched')::bigint,
    COUNT(*) FILTER (WHERE status = 'dispatched')::bigint,
    COUNT(*) FILTER (WHERE status = 'delivered')::bigint,
    COUNT(*) FILTER (WHERE status = 'invoiced')::bigint,
    COUNT(*) FILTER (WHERE status = 'partially_invoiced')::bigint,
    COUNT(*) FILTER (WHERE status = 'overdue')::bigint,
    COUNT(*) FILTER (WHERE status = 'cancelled')::bigint,
    COUNT(*) FILTER (
      WHERE is_buyer_app_order = true
        AND app.order_status_in_flow(status)
    )::bigint,
    COUNT(*) FILTER (
      WHERE estimate_id IS NOT NULL
        AND app.order_status_is_downstream_quality(status)
    )::bigint,
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
    COUNT(*) FILTER (WHERE app.invoice_status_in_flow(status))::bigint,
    COUNT(DISTINCT buyer_id) FILTER (WHERE app.invoice_status_in_flow(status))::bigint,
    COALESCE(SUM(total_amount) FILTER (WHERE app.invoice_status_gmv_included(status)), 0),
    COUNT(*) FILTER (WHERE status = 'draft')::bigint,
    COUNT(*) FILTER (WHERE status IN ('sent', 'issued', 'unpaid', 'viewed', 'partially_paid'))::bigint,
    COUNT(*) FILTER (WHERE status = 'paid')::bigint,
    COUNT(*) FILTER (WHERE app.invoice_is_overdue(status, due_date, outstanding_balance))::bigint,
    COALESCE(SUM(outstanding_balance) FILTER (
      WHERE app.invoice_is_overdue(status, due_date, outstanding_balance)
    ), 0),
    COUNT(*) FILTER (WHERE status = 'void')::bigint,
    COUNT(*) FILTER (
      WHERE app.invoice_status_has_receivable(status, outstanding_balance)
    )::bigint,
    COALESCE(SUM(outstanding_balance) FILTER (
      WHERE app.invoice_status_has_receivable(status, outstanding_balance)
    ), 0),
    COUNT(*) FILTER (
      WHERE is_buyer_app_invoice = true
        AND app.invoice_status_in_flow(status)
    )::bigint,
    now()
  FROM (
    SELECT
      i.tenant_id,
      'tenant'::text AS scope,
      NULL::uuid AS location_id,
      app.metric_day_ist(i.invoice_date, i.created_at) AS day,
      i.buyer_id,
      i.total_amount,
      i.status,
      i.is_buyer_app_invoice,
      COALESCE(i.outstanding_balance, 0) AS outstanding_balance,
      i.due_date
    FROM app.invoices i
    WHERE i.tenant_id = p_tenant_id
      AND i.deleted_at IS NULL
      AND app.metric_day_ist(i.invoice_date, i.created_at) = p_day

    UNION ALL

    SELECT
      i.tenant_id,
      'location'::text AS scope,
      i.location_id,
      app.metric_day_ist(i.invoice_date, i.created_at) AS day,
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
      AND app.metric_day_ist(i.invoice_date, i.created_at) = p_day
  ) rows
  GROUP BY tenant_id, scope, location_id, day;
END;
$$;

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
      AND app.order_status_in_flow(o.status)
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
      AND app.order_status_in_flow(o.status)
      AND app.metric_day_ist(o.order_date, o.created_at) = p_day

    UNION ALL

    SELECT
      p_tenant_id,
      i.buyer_id,
      'tenant',
      NULL::uuid,
      app.metric_day_ist(i.invoice_date, i.created_at),
      0::bigint,
      0::bigint,
      1::bigint,
      0::numeric,
      0::numeric,
      CASE
        WHEN app.invoice_status_gmv_included(i.status)
          THEN COALESCE(i.total_amount, 0)::numeric
        ELSE 0::numeric
      END
    FROM app.invoices i
    WHERE i.tenant_id = p_tenant_id
      AND i.deleted_at IS NULL
      AND i.buyer_id IS NOT NULL
      AND app.invoice_status_in_flow(i.status)
      AND app.metric_day_ist(i.invoice_date, i.created_at) = p_day

    UNION ALL

    SELECT
      p_tenant_id,
      i.buyer_id,
      'location',
      i.location_id,
      app.metric_day_ist(i.invoice_date, i.created_at),
      0::bigint,
      0::bigint,
      1::bigint,
      0::numeric,
      0::numeric,
      CASE
        WHEN app.invoice_status_gmv_included(i.status)
          THEN COALESCE(i.total_amount, 0)::numeric
        ELSE 0::numeric
      END
    FROM app.invoices i
    WHERE i.tenant_id = p_tenant_id
      AND i.deleted_at IS NULL
      AND i.buyer_id IS NOT NULL
      AND i.location_id IS NOT NULL
      AND app.invoice_status_in_flow(i.status)
      AND app.metric_day_ist(i.invoice_date, i.created_at) = p_day
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

CREATE OR REPLACE FUNCTION app.refresh_kpi_tenant_daily(p_tenant_id uuid, p_day date)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app
AS $$
BEGIN
  DELETE FROM app.kpi_tenant_daily
  WHERE tenant_id = p_tenant_id
    AND day = p_day;

  WITH order_facts AS (
    SELECT
      o.id,
      o.buyer_id,
      COALESCE(o.total_amount, 0)::numeric AS total_amount
    FROM app.orders o
    WHERE o.tenant_id = p_tenant_id
      AND o.deleted_at IS NULL
      AND app.order_status_in_flow(o.status)
      AND app.metric_day_ist(o.order_date, o.created_at) = p_day
  ),
  item_facts AS (
    SELECT
      oi.order_id,
      COALESCE(SUM(oi.qty), 0)::int AS items_count
    FROM app.order_items oi
    JOIN order_facts ofa
      ON ofa.id = oi.order_id
    WHERE oi.deleted_at IS NULL
    GROUP BY oi.order_id
  )
  INSERT INTO app.kpi_tenant_daily (
    tenant_id,
    day,
    orders_count,
    buyers_count,
    gmv,
    items_count
  )
  SELECT
    p_tenant_id,
    p_day,
    COUNT(*)::int,
    COUNT(DISTINCT ofa.buyer_id)::int,
    COALESCE(SUM(ofa.total_amount), 0)::numeric(14,2),
    COALESCE(SUM(COALESCE(ifa.items_count, 0)), 0)::int
  FROM order_facts ofa
  LEFT JOIN item_facts ifa
    ON ifa.order_id = ofa.id;
END;
$$;

CREATE OR REPLACE FUNCTION app.refresh_kpi_location_daily(
  p_tenant_id uuid,
  p_location_id uuid,
  p_day date
)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = app
AS $$
  DELETE FROM app.kpi_location_daily
  WHERE tenant_id = p_tenant_id
    AND location_id = p_location_id
    AND day = p_day;

  WITH order_facts AS (
    SELECT
      o.id,
      o.buyer_id,
      COALESCE(o.total_amount, 0)::numeric AS total_amount
    FROM app.orders o
    WHERE o.tenant_id = p_tenant_id
      AND o.location_id = p_location_id
      AND o.deleted_at IS NULL
      AND app.order_status_in_flow(o.status)
      AND app.metric_day_ist(o.order_date, o.created_at) = p_day
  ),
  item_facts AS (
    SELECT
      oi.order_id,
      COALESCE(SUM(oi.qty), 0)::int AS items_count
    FROM app.order_items oi
    JOIN order_facts ofa
      ON ofa.id = oi.order_id
    WHERE oi.deleted_at IS NULL
    GROUP BY oi.order_id
  )
  INSERT INTO app.kpi_location_daily (
    tenant_id,
    location_id,
    day,
    orders_count,
    buyers_count,
    gmv,
    items_count,
    updated_at
  )
  SELECT
    p_tenant_id,
    p_location_id,
    p_day,
    COUNT(*)::int,
    COUNT(DISTINCT ofa.buyer_id)::int,
    COALESCE(SUM(ofa.total_amount), 0)::numeric(14,2),
    COALESCE(SUM(COALESCE(ifa.items_count, 0)), 0)::int,
    now()
  FROM order_facts ofa
  LEFT JOIN item_facts ifa
    ON ifa.order_id = ofa.id;
$$;

CREATE OR REPLACE FUNCTION app.refresh_kpi_product_daily(p_tenant_id uuid, p_tenant_product_id uuid, p_day date)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app
AS $$
DECLARE
  v_units_sold int;
  v_revenue numeric(14,2);
  v_on_hand numeric(14,2);
BEGIN
  DELETE FROM app.kpi_product_daily
  WHERE tenant_id = p_tenant_id
    AND tenant_product_id = p_tenant_product_id
    AND day = p_day;

  SELECT
    COALESCE(SUM(oi.qty), 0)::int,
    COALESCE(SUM(COALESCE(oi.line_total, oi.qty * oi.unit_price)), 0)::numeric(14,2),
    COALESCE((
      SELECT SUM(ti.qty_available)
      FROM app.tenant_inventory ti
      WHERE ti.tenant_product_id = p_tenant_product_id
        AND ti.deleted_at IS NULL
    ), 0)::numeric(14,2)
  INTO v_units_sold, v_revenue, v_on_hand
  FROM app.order_items oi
  JOIN app.orders o
    ON o.id = oi.order_id
  WHERE o.tenant_id = p_tenant_id
    AND o.deleted_at IS NULL
    AND app.order_status_in_flow(o.status)
    AND oi.tenant_product_id = p_tenant_product_id
    AND oi.deleted_at IS NULL
    AND app.metric_day_ist(o.order_date, o.created_at) = p_day;

  IF COALESCE(v_units_sold, 0) = 0
     AND COALESCE(v_revenue, 0) = 0
     AND COALESCE(v_on_hand, 0) = 0
  THEN
    RETURN;
  END IF;

  INSERT INTO app.kpi_product_daily (
    tenant_id,
    tenant_product_id,
    day,
    units_sold,
    revenue,
    on_hand,
    updated_at
  )
  VALUES (
    p_tenant_id,
    p_tenant_product_id,
    p_day,
    COALESCE(v_units_sold, 0),
    COALESCE(v_revenue, 0),
    COALESCE(v_on_hand, 0),
    now()
  );
END;
$$;

CREATE OR REPLACE FUNCTION app.refresh_kpi_brand_daily(
  p_tenant_id uuid,
  p_brand_id uuid,
  p_day date
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app
AS $$
DECLARE
  v_gmv numeric(14,2);
  v_orders_count bigint;
  v_buyers_count bigint;
  v_units_sold bigint;
BEGIN
  DELETE FROM app.kpi_brand_daily
  WHERE tenant_id = p_tenant_id
    AND tenant_brand_id = p_brand_id
    AND day = p_day;

  SELECT
    COALESCE(SUM(COALESCE(oi.line_total, oi.qty * oi.unit_price)), 0)::numeric(14,2),
    COUNT(DISTINCT o.id)::bigint,
    COUNT(DISTINCT o.buyer_id)::bigint,
    COALESCE(SUM(oi.qty), 0)::bigint
  INTO v_gmv, v_orders_count, v_buyers_count, v_units_sold
  FROM app.order_items oi
  JOIN app.orders o
    ON o.id = oi.order_id
  JOIN app.tenant_products tp
    ON tp.id = oi.tenant_product_id
  WHERE o.tenant_id = p_tenant_id
    AND tp.tenant_brand_id = p_brand_id
    AND o.deleted_at IS NULL
    AND oi.deleted_at IS NULL
    AND tp.deleted_at IS NULL
    AND app.order_status_in_flow(o.status)
    AND app.metric_day_ist(o.order_date, o.created_at) = p_day;

  IF COALESCE(v_orders_count, 0) = 0
     AND COALESCE(v_gmv, 0) = 0
  THEN
    RETURN;
  END IF;

  INSERT INTO app.kpi_brand_daily (
    tenant_id,
    tenant_brand_id,
    day,
    gmv,
    orders_count,
    buyers_count,
    units_sold,
    updated_at
  )
  VALUES (
    p_tenant_id,
    p_brand_id,
    p_day,
    v_gmv,
    v_orders_count,
    v_buyers_count,
    v_units_sold,
    now()
  );
END;
$$;

CREATE OR REPLACE FUNCTION app.refresh_kpi_category_daily(
  p_tenant_id uuid,
  p_category_id uuid,
  p_day date
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app
AS $$
DECLARE
  v_gmv numeric(14,2);
  v_units_sold bigint;
  v_orders_count bigint;
  v_buyers_count bigint;
BEGIN
  DELETE FROM app.kpi_category_daily
  WHERE tenant_id = p_tenant_id
    AND tenant_category_id = p_category_id
    AND day = p_day;

  SELECT
    COALESCE(SUM(COALESCE(oi.line_total, oi.qty * oi.unit_price)), 0)::numeric(14,2),
    COALESCE(SUM(oi.qty), 0)::bigint,
    COUNT(DISTINCT o.id)::bigint,
    COUNT(DISTINCT o.buyer_id)::bigint
  INTO v_gmv, v_units_sold, v_orders_count, v_buyers_count
  FROM app.order_items oi
  JOIN app.orders o
    ON o.id = oi.order_id
  JOIN app.tenant_products tp
    ON tp.id = oi.tenant_product_id
  WHERE o.tenant_id = p_tenant_id
    AND tp.tenant_category_id = p_category_id
    AND o.deleted_at IS NULL
    AND oi.deleted_at IS NULL
    AND tp.deleted_at IS NULL
    AND app.order_status_in_flow(o.status)
    AND app.metric_day_ist(o.order_date, o.created_at) = p_day;

  IF COALESCE(v_orders_count, 0) = 0
     AND COALESCE(v_gmv, 0) = 0
  THEN
    RETURN;
  END IF;

  INSERT INTO app.kpi_category_daily (
    tenant_id,
    tenant_category_id,
    day,
    gmv,
    units_sold,
    orders_count,
    buyers_count,
    updated_at
  )
  VALUES (
    p_tenant_id,
    p_category_id,
    p_day,
    v_gmv,
    v_units_sold,
    v_orders_count,
    v_buyers_count,
    now()
  );
END;
$$;

CREATE OR REPLACE FUNCTION app.refresh_buyer_app_daily(p_tenant_id uuid, p_date date)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = app
AS $$
  DELETE FROM app.kpi_buyer_app_daily
  WHERE tenant_id = p_tenant_id
    AND snapshot_date = p_date;

  WITH metrics AS (
    SELECT
      p_tenant_id AS tenant_id,
      p_date AS snapshot_date,
      COALESCE((
        SELECT SUM(o.total_amount)
        FROM app.orders o
        WHERE o.tenant_id = p_tenant_id
          AND o.is_buyer_app_order
          AND app.order_status_in_flow(o.status)
          AND app.metric_day_ist(o.order_date, o.created_at) = p_date
          AND o.deleted_at IS NULL
      ), 0) AS app_gmv,
      COALESCE((
        SELECT COUNT(*)
        FROM app.orders o
        WHERE o.tenant_id = p_tenant_id
          AND o.is_buyer_app_order
          AND app.order_status_in_flow(o.status)
          AND app.metric_day_ist(o.order_date, o.created_at) = p_date
          AND o.deleted_at IS NULL
      ), 0) AS app_orders,
      COALESCE((
        SELECT COUNT(DISTINCT a.buyer_id)
        FROM app.buyer_app_activity a
        JOIN app.buyers b
          ON b.id = a.buyer_id
         AND b.tenant_id = a.tenant_id
        WHERE a.tenant_id = p_tenant_id
          AND a.deleted_at IS NULL
          AND a.qualifies_for_engagement = true
          AND a.occurred_day = p_date
          AND b.deleted_at IS NULL
          AND b.buyer_app_enabled = true
      ), 0) AS active_buyers,
      COALESCE((
        SELECT SUM(e.total_amount)
        FROM app.estimates e
        WHERE e.tenant_id = p_tenant_id
          AND e.is_buyer_app_estimate
          AND app.metric_day_ist(e.estimate_date, e.created_at) = p_date
          AND e.deleted_at IS NULL
      ), 0) AS app_estimates_value,
      COALESCE((
        SELECT COUNT(*)
        FROM app.estimates e
        WHERE e.tenant_id = p_tenant_id
          AND e.is_buyer_app_estimate
          AND app.metric_day_ist(e.estimate_date, e.created_at) = p_date
          AND e.deleted_at IS NULL
      ), 0) AS app_estimates_count,
      COALESCE((
        SELECT SUM(o.total_amount)
        FROM app.orders o
        WHERE o.tenant_id = p_tenant_id
          AND o.is_buyer_app_order
          AND app.order_status_is_downstream_quality(o.status)
          AND app.metric_day_ist(o.order_date, o.created_at) = p_date
          AND o.deleted_at IS NULL
      ), 0) AS converted_to_order_value,
      COALESCE((
        SELECT COUNT(*)
        FROM app.orders o
        WHERE o.tenant_id = p_tenant_id
          AND o.is_buyer_app_order
          AND app.order_status_is_downstream_quality(o.status)
          AND app.metric_day_ist(o.order_date, o.created_at) = p_date
          AND o.deleted_at IS NULL
      ), 0) AS converted_to_order_count,
      COALESCE((
        SELECT SUM(i.total_amount)
        FROM app.invoices i
        WHERE i.tenant_id = p_tenant_id
          AND i.is_buyer_app_invoice
          AND app.invoice_status_gmv_included(i.status)
          AND app.metric_day_ist(i.invoice_date, i.created_at) = p_date
          AND i.deleted_at IS NULL
      ), 0) AS invoiced_value,
      COALESCE((
        SELECT COUNT(*)
        FROM app.invoices i
        WHERE i.tenant_id = p_tenant_id
          AND i.is_buyer_app_invoice
          AND app.invoice_status_in_flow(i.status)
          AND app.metric_day_ist(i.invoice_date, i.created_at) = p_date
          AND i.deleted_at IS NULL
      ), 0) AS invoiced_count
  )
  INSERT INTO app.kpi_buyer_app_daily (
    tenant_id,
    snapshot_date,
    app_gmv,
    app_orders,
    active_buyers,
    app_estimates_value,
    app_estimates_count,
    converted_to_order_value,
    converted_to_order_count,
    invoiced_value,
    invoiced_count
  )
  SELECT
    tenant_id,
    snapshot_date,
    app_gmv,
    app_orders,
    active_buyers,
    app_estimates_value,
    app_estimates_count,
    converted_to_order_value,
    converted_to_order_count,
    invoiced_value,
    invoiced_count
  FROM metrics
  WHERE active_buyers > 0
     OR app_orders > 0
     OR app_estimates_count > 0
     OR converted_to_order_count > 0
     OR invoiced_count > 0
     OR app_gmv <> 0
     OR app_estimates_value <> 0
     OR converted_to_order_value <> 0
     OR invoiced_value <> 0;
$$;

CREATE OR REPLACE FUNCTION app.refresh_buyer_app_snapshot(p_tenant_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app
AS $$
DECLARE
  v_now timestamptz := now();
  v_month_start_ist date := date_trunc('month', now() AT TIME ZONE 'Asia/Kolkata')::date;
  v_next_month_start_ist date := (date_trunc('month', now() AT TIME ZONE 'Asia/Kolkata')::date + interval '1 month')::date;
  v_30d_ago timestamptz := now() - interval '30 days';
BEGIN
  INSERT INTO app.buyer_app_snapshot (
    tenant_id,
    enabled_buyers,
    total_buyers,
    opened_app_mtd,
    ordered_mtd,
    repeat_mtd,
    app_gmv_mtd,
    app_orders_mtd,
    total_gmv_mtd,
    estimates_app_value_mtd,
    estimates_app_count_mtd,
    converted_order_value_mtd,
    converted_order_count_mtd,
    invoiced_app_value_mtd,
    invoiced_app_count_mtd,
    not_ordering_buyers,
    top_app_buyers_callout,
    no_app_buyers,
    top_app_buyers_card,
    top_locations,
    refreshed_at
  )
  WITH month_activity AS (
    SELECT
      a.buyer_id,
      COUNT(*)::bigint AS event_count,
      MAX(a.occurred_at) AS last_activity_at
    FROM app.buyer_app_activity a
    JOIN app.buyers b
      ON b.id = a.buyer_id
     AND b.tenant_id = a.tenant_id
    WHERE a.tenant_id = p_tenant_id
      AND a.deleted_at IS NULL
      AND a.qualifies_for_engagement = true
      AND a.occurred_day >= v_month_start_ist
      AND a.occurred_day < v_next_month_start_ist
      AND b.deleted_at IS NULL
      AND b.buyer_app_enabled = true
    GROUP BY a.buyer_id
  ),
  all_activity AS (
    SELECT
      a.buyer_id,
      MAX(a.occurred_at) AS last_activity_at
    FROM app.buyer_app_activity a
    WHERE a.tenant_id = p_tenant_id
      AND a.deleted_at IS NULL
      AND a.qualifies_for_engagement = true
    GROUP BY a.buyer_id
  )
  SELECT
    p_tenant_id,
    (SELECT COUNT(DISTINCT bu.buyer_id)
     FROM app.buyer_users bu
     JOIN app.buyers b ON b.id = bu.buyer_id
     WHERE b.tenant_id = p_tenant_id
       AND bu.is_active = true
       AND b.deleted_at IS NULL),
    (SELECT COUNT(*)
     FROM app.buyers b
     WHERE b.tenant_id = p_tenant_id
       AND b.deleted_at IS NULL
       AND b.is_active = true),
    (SELECT COUNT(*) FROM month_activity),
    (SELECT COUNT(DISTINCT o.buyer_id)
     FROM app.orders o
     WHERE o.tenant_id = p_tenant_id
       AND o.is_buyer_app_order
       AND app.order_status_in_flow(o.status)
       AND app.metric_day_ist(o.order_date, o.created_at) >= v_month_start_ist
       AND app.metric_day_ist(o.order_date, o.created_at) < v_next_month_start_ist
       AND o.deleted_at IS NULL),
    (SELECT COUNT(*) FROM month_activity ma WHERE ma.event_count >= 2),
    COALESCE((SELECT SUM(o.total_amount)
      FROM app.orders o
      WHERE o.tenant_id = p_tenant_id
        AND o.is_buyer_app_order
        AND app.order_status_in_flow(o.status)
        AND app.metric_day_ist(o.order_date, o.created_at) >= v_month_start_ist
        AND app.metric_day_ist(o.order_date, o.created_at) < v_next_month_start_ist
        AND o.deleted_at IS NULL), 0),
    (SELECT COUNT(*)
     FROM app.orders o
     WHERE o.tenant_id = p_tenant_id
       AND o.is_buyer_app_order
       AND app.order_status_in_flow(o.status)
       AND app.metric_day_ist(o.order_date, o.created_at) >= v_month_start_ist
       AND app.metric_day_ist(o.order_date, o.created_at) < v_next_month_start_ist
       AND o.deleted_at IS NULL),
    COALESCE((SELECT SUM(o.total_amount)
      FROM app.orders o
      WHERE o.tenant_id = p_tenant_id
        AND app.order_status_in_flow(o.status)
        AND app.metric_day_ist(o.order_date, o.created_at) >= v_month_start_ist
        AND app.metric_day_ist(o.order_date, o.created_at) < v_next_month_start_ist
        AND o.deleted_at IS NULL), 0),
    COALESCE((SELECT SUM(e.total_amount)
      FROM app.estimates e
      WHERE e.tenant_id = p_tenant_id
        AND e.is_buyer_app_estimate
        AND app.metric_day_ist(e.estimate_date, e.created_at) >= v_month_start_ist
        AND app.metric_day_ist(e.estimate_date, e.created_at) < v_next_month_start_ist
        AND e.deleted_at IS NULL), 0),
    (SELECT COUNT(*)
     FROM app.estimates e
     WHERE e.tenant_id = p_tenant_id
       AND e.is_buyer_app_estimate
       AND app.metric_day_ist(e.estimate_date, e.created_at) >= v_month_start_ist
       AND app.metric_day_ist(e.estimate_date, e.created_at) < v_next_month_start_ist
       AND e.deleted_at IS NULL),
    COALESCE((SELECT SUM(o.total_amount)
      FROM app.orders o
      WHERE o.tenant_id = p_tenant_id
        AND o.is_buyer_app_order
        AND app.order_status_is_downstream_quality(o.status)
        AND app.metric_day_ist(o.order_date, o.created_at) >= v_month_start_ist
        AND app.metric_day_ist(o.order_date, o.created_at) < v_next_month_start_ist
        AND o.deleted_at IS NULL), 0),
    (SELECT COUNT(*)
     FROM app.orders o
     WHERE o.tenant_id = p_tenant_id
       AND o.is_buyer_app_order
       AND app.order_status_is_downstream_quality(o.status)
       AND app.metric_day_ist(o.order_date, o.created_at) >= v_month_start_ist
       AND app.metric_day_ist(o.order_date, o.created_at) < v_next_month_start_ist
       AND o.deleted_at IS NULL),
    COALESCE((SELECT SUM(i.total_amount)
      FROM app.invoices i
      WHERE i.tenant_id = p_tenant_id
        AND i.is_buyer_app_invoice
        AND app.invoice_status_gmv_included(i.status)
        AND app.metric_day_ist(i.invoice_date, i.created_at) >= v_month_start_ist
        AND app.metric_day_ist(i.invoice_date, i.created_at) < v_next_month_start_ist
        AND i.deleted_at IS NULL), 0),
    (SELECT COUNT(*)
     FROM app.invoices i
     WHERE i.tenant_id = p_tenant_id
       AND i.is_buyer_app_invoice
       AND app.invoice_status_in_flow(i.status)
       AND app.metric_day_ist(i.invoice_date, i.created_at) >= v_month_start_ist
       AND app.metric_day_ist(i.invoice_date, i.created_at) < v_next_month_start_ist
       AND i.deleted_at IS NULL),
    COALESCE((
      SELECT jsonb_agg(row_to_json(s) ORDER BY s.days_inactive DESC)
      FROM (
        SELECT
          b.id AS buyer_id,
          b.business_name AS name,
          upper(left(b.business_name, 2)) AS initials,
          to_char(MIN(bu.created_at), 'DD Mon YYYY') AS enabled_date,
          EXTRACT(DAY FROM v_now - COALESCE(MAX(o.placed_at), aa.last_activity_at, MIN(bu.created_at)))::int AS days_inactive
        FROM app.buyers b
        JOIN app.buyer_users bu
          ON bu.buyer_id = b.id
         AND bu.is_active = true
        LEFT JOIN app.orders o
          ON o.buyer_id = b.id
         AND o.is_buyer_app_order
         AND app.order_status_in_flow(o.status)
         AND o.placed_at >= v_30d_ago
         AND o.deleted_at IS NULL
        LEFT JOIN all_activity aa
          ON aa.buyer_id = b.id
        WHERE b.tenant_id = p_tenant_id
          AND b.deleted_at IS NULL
          AND b.is_active = true
        GROUP BY b.id, b.business_name, aa.last_activity_at
        HAVING COUNT(o.id) = 0
        ORDER BY days_inactive DESC
        LIMIT 3
      ) s
    ), '[]'::jsonb),
    COALESCE((
      SELECT jsonb_agg(row_to_json(s))
      FROM (
        SELECT
          b.id AS buyer_id,
          b.business_name AS name,
          upper(left(b.business_name, 2)) AS initials,
          COALESCE(SUM(o.total_amount), 0) AS gmv,
          COUNT(o.id) AS orders
        FROM app.buyers b
        JOIN app.orders o
          ON o.buyer_id = b.id
        WHERE b.tenant_id = p_tenant_id
          AND b.deleted_at IS NULL
          AND o.is_buyer_app_order
          AND app.order_status_in_flow(o.status)
          AND app.metric_day_ist(o.order_date, o.created_at) >= v_month_start_ist
          AND app.metric_day_ist(o.order_date, o.created_at) < v_next_month_start_ist
          AND o.deleted_at IS NULL
        GROUP BY b.id, b.business_name
        ORDER BY gmv DESC
        LIMIT 2
      ) s
    ), '[]'::jsonb),
    COALESCE((
      SELECT jsonb_agg(row_to_json(s))
      FROM (
        SELECT
          b.id AS buyer_id,
          b.business_name AS name,
          upper(left(b.business_name, 2)) AS initials,
          COALESCE(SUM(o.total_amount), 0) AS offline_gmv
        FROM app.buyers b
        LEFT JOIN app.buyer_users bu
          ON bu.buyer_id = b.id
         AND bu.is_active = true
        LEFT JOIN app.orders o
          ON o.buyer_id = b.id
         AND app.order_status_in_flow(o.status)
         AND app.metric_day_ist(o.order_date, o.created_at) >= v_month_start_ist
         AND app.metric_day_ist(o.order_date, o.created_at) < v_next_month_start_ist
         AND o.deleted_at IS NULL
        WHERE b.tenant_id = p_tenant_id
          AND b.deleted_at IS NULL
          AND b.is_active = true
          AND bu.id IS NULL
        GROUP BY b.id, b.business_name
        ORDER BY offline_gmv DESC
        LIMIT 3
      ) s
    ), '[]'::jsonb),
    COALESCE((
      SELECT jsonb_agg(row_to_json(s))
      FROM (
        SELECT
          b.id AS buyer_id,
          b.business_name AS name,
          upper(left(b.business_name, 2)) AS initials,
          COALESCE(b.geography->>'city', '') AS city,
          COALESCE(SUM(o.total_amount), 0) AS gmv,
          COUNT(o.id) AS orders
        FROM app.buyers b
        JOIN app.orders o
          ON o.buyer_id = b.id
        WHERE b.tenant_id = p_tenant_id
          AND b.deleted_at IS NULL
          AND o.is_buyer_app_order
          AND app.order_status_in_flow(o.status)
          AND app.metric_day_ist(o.order_date, o.created_at) >= v_month_start_ist
          AND app.metric_day_ist(o.order_date, o.created_at) < v_next_month_start_ist
          AND o.deleted_at IS NULL
        GROUP BY b.id, b.business_name, b.geography
        ORDER BY gmv DESC
        LIMIT 5
      ) s
    ), '[]'::jsonb),
    COALESCE((
      SELECT jsonb_agg(row_to_json(s))
      FROM (
        SELECT
          l.id AS location_id,
          l.name,
          COUNT(o.id) AS app_orders,
          COALESCE(SUM(o.total_amount), 0) AS app_gmv,
          ROUND(
            100.0 * COALESCE(SUM(o.total_amount), 0)
            / NULLIF((
              SELECT SUM(o2.total_amount)
              FROM app.orders o2
              WHERE o2.tenant_id = p_tenant_id
                AND o2.is_buyer_app_order
                AND app.order_status_in_flow(o2.status)
                AND app.metric_day_ist(o2.order_date, o2.created_at) >= v_month_start_ist
                AND app.metric_day_ist(o2.order_date, o2.created_at) < v_next_month_start_ist
                AND o2.deleted_at IS NULL
            ), 0),
            1
          ) AS share_pct
        FROM app.locations l
        JOIN app.orders o
          ON o.location_id = l.id
        WHERE l.tenant_id = p_tenant_id
          AND l.deleted_at IS NULL
          AND o.is_buyer_app_order
          AND app.order_status_in_flow(o.status)
          AND app.metric_day_ist(o.order_date, o.created_at) >= v_month_start_ist
          AND app.metric_day_ist(o.order_date, o.created_at) < v_next_month_start_ist
          AND o.deleted_at IS NULL
        GROUP BY l.id, l.name
        ORDER BY app_gmv DESC
        LIMIT 5
      ) s
    ), '[]'::jsonb),
    now()
  ON CONFLICT (tenant_id) DO UPDATE
  SET
    enabled_buyers = EXCLUDED.enabled_buyers,
    total_buyers = EXCLUDED.total_buyers,
    opened_app_mtd = EXCLUDED.opened_app_mtd,
    ordered_mtd = EXCLUDED.ordered_mtd,
    repeat_mtd = EXCLUDED.repeat_mtd,
    app_gmv_mtd = EXCLUDED.app_gmv_mtd,
    app_orders_mtd = EXCLUDED.app_orders_mtd,
    total_gmv_mtd = EXCLUDED.total_gmv_mtd,
    estimates_app_value_mtd = EXCLUDED.estimates_app_value_mtd,
    estimates_app_count_mtd = EXCLUDED.estimates_app_count_mtd,
    converted_order_value_mtd = EXCLUDED.converted_order_value_mtd,
    converted_order_count_mtd = EXCLUDED.converted_order_count_mtd,
    invoiced_app_value_mtd = EXCLUDED.invoiced_app_value_mtd,
    invoiced_app_count_mtd = EXCLUDED.invoiced_app_count_mtd,
    not_ordering_buyers = EXCLUDED.not_ordering_buyers,
    top_app_buyers_callout = EXCLUDED.top_app_buyers_callout,
    no_app_buyers = EXCLUDED.no_app_buyers,
    top_app_buyers_card = EXCLUDED.top_app_buyers_card,
    top_locations = EXCLUDED.top_locations,
    refreshed_at = EXCLUDED.refreshed_at;
END;
$$;

CREATE OR REPLACE FUNCTION app.rebuild_kpi_tenant_daily_for_tenant(
  p_tenant_id uuid,
  p_days int DEFAULT 62
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app
AS $$
DECLARE
  v_start date := GREATEST((now() AT TIME ZONE 'Asia/Kolkata')::date - p_days, DATE '2000-01-01');
  v_end date := (now() AT TIME ZONE 'Asia/Kolkata')::date;
  d date;
BEGIN
  DELETE FROM app.kpi_tenant_daily
  WHERE tenant_id = p_tenant_id
    AND day BETWEEN v_start AND v_end;

  FOR d IN
    SELECT generate_series(v_start, v_end, interval '1 day')::date
  LOOP
    PERFORM app.refresh_kpi_tenant_daily(p_tenant_id, d);
  END LOOP;
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
  v_start date := GREATEST((now() AT TIME ZONE 'Asia/Kolkata')::date - p_days, DATE '2000-01-01');
  v_end date := (now() AT TIME ZONE 'Asia/Kolkata')::date;
BEGIN
  DELETE FROM app.kpi_estimates_daily
  WHERE tenant_id = p_tenant_id
    AND day BETWEEN v_start AND v_end;

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
    COUNT(*) FILTER (WHERE app.estimate_status_is_open(status))::bigint,
    COUNT(*) FILTER (WHERE status = 'draft')::bigint,
    COUNT(*) FILTER (WHERE status = 'sent')::bigint,
    COUNT(*) FILTER (WHERE status = 'accepted')::bigint,
    COUNT(*) FILTER (WHERE status IN ('converted', 'invoiced'))::bigint,
    COUNT(*) FILTER (WHERE status IN ('declined', 'rejected'))::bigint,
    COUNT(*) FILTER (WHERE status = 'expired')::bigint,
    COUNT(*) FILTER (WHERE status = 'void')::bigint,
    COUNT(*) FILTER (
      WHERE app.estimate_status_is_open(status)
        AND expires_at IS NOT NULL
        AND (expires_at AT TIME ZONE 'Asia/Kolkata')::date BETWEEN (now() AT TIME ZONE 'Asia/Kolkata')::date
        AND ((now() AT TIME ZONE 'Asia/Kolkata')::date + 7)
    )::bigint,
    COUNT(*) FILTER (WHERE is_buyer_app_estimate = true)::bigint,
    COUNT(*) FILTER (
      WHERE is_buyer_app_estimate = true
        AND app.estimate_status_is_open(status)
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
      AND app.metric_day_ist(e.estimate_date, e.created_at) BETWEEN v_start AND v_end

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
      AND app.metric_day_ist(e.estimate_date, e.created_at) BETWEEN v_start AND v_end
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
  v_start date := GREATEST((now() AT TIME ZONE 'Asia/Kolkata')::date - p_days, DATE '2000-01-01');
  v_end date := (now() AT TIME ZONE 'Asia/Kolkata')::date;
BEGIN
  DELETE FROM app.kpi_orders_daily
  WHERE tenant_id = p_tenant_id
    AND day BETWEEN v_start AND v_end;

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
    COUNT(*) FILTER (WHERE app.order_status_in_flow(status))::bigint,
    COUNT(DISTINCT buyer_id) FILTER (WHERE app.order_status_in_flow(status))::bigint,
    COALESCE(SUM(total_amount) FILTER (WHERE app.order_status_in_flow(status)), 0),
    COUNT(*) FILTER (WHERE app.order_status_is_open(status))::bigint,
    COUNT(*) FILTER (WHERE status = 'draft')::bigint,
    COUNT(*) FILTER (WHERE status IN ('open', 'accepted', 'received'))::bigint,
    COUNT(*) FILTER (WHERE status = 'confirmed')::bigint,
    COUNT(*) FILTER (WHERE status = 'partially_dispatched')::bigint,
    COUNT(*) FILTER (WHERE status = 'dispatched')::bigint,
    COUNT(*) FILTER (WHERE status = 'delivered')::bigint,
    COUNT(*) FILTER (WHERE status = 'invoiced')::bigint,
    COUNT(*) FILTER (WHERE status = 'partially_invoiced')::bigint,
    COUNT(*) FILTER (WHERE status = 'overdue')::bigint,
    COUNT(*) FILTER (WHERE status = 'cancelled')::bigint,
    COUNT(*) FILTER (
      WHERE is_buyer_app_order = true
        AND app.order_status_in_flow(status)
    )::bigint,
    COUNT(*) FILTER (
      WHERE estimate_id IS NOT NULL
        AND app.order_status_is_downstream_quality(status)
    )::bigint,
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
      AND app.metric_day_ist(o.order_date, o.created_at) BETWEEN v_start AND v_end

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
      AND app.metric_day_ist(o.order_date, o.created_at) BETWEEN v_start AND v_end
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
  v_start date := GREATEST((now() AT TIME ZONE 'Asia/Kolkata')::date - p_days, DATE '2000-01-01');
  v_end date := (now() AT TIME ZONE 'Asia/Kolkata')::date;
BEGIN
  DELETE FROM app.kpi_invoices_daily
  WHERE tenant_id = p_tenant_id
    AND day BETWEEN v_start AND v_end;

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
    COUNT(*) FILTER (WHERE app.invoice_status_in_flow(status))::bigint,
    COUNT(DISTINCT buyer_id) FILTER (WHERE app.invoice_status_in_flow(status))::bigint,
    COALESCE(SUM(total_amount) FILTER (WHERE app.invoice_status_gmv_included(status)), 0),
    COUNT(*) FILTER (WHERE status = 'draft')::bigint,
    COUNT(*) FILTER (WHERE status IN ('sent', 'issued', 'unpaid', 'viewed', 'partially_paid'))::bigint,
    COUNT(*) FILTER (WHERE status = 'paid')::bigint,
    COUNT(*) FILTER (WHERE app.invoice_is_overdue(status, due_date, outstanding_balance))::bigint,
    COALESCE(SUM(outstanding_balance) FILTER (
      WHERE app.invoice_is_overdue(status, due_date, outstanding_balance)
    ), 0),
    COUNT(*) FILTER (WHERE status = 'void')::bigint,
    COUNT(*) FILTER (
      WHERE app.invoice_status_has_receivable(status, outstanding_balance)
    )::bigint,
    COALESCE(SUM(outstanding_balance) FILTER (
      WHERE app.invoice_status_has_receivable(status, outstanding_balance)
    ), 0),
    COUNT(*) FILTER (
      WHERE is_buyer_app_invoice = true
        AND app.invoice_status_in_flow(status)
    )::bigint,
    now()
  FROM (
    SELECT
      i.tenant_id,
      'tenant'::text AS scope,
      NULL::uuid AS location_id,
      app.metric_day_ist(i.invoice_date, i.created_at) AS day,
      i.buyer_id,
      i.total_amount,
      i.status,
      i.is_buyer_app_invoice,
      COALESCE(i.outstanding_balance, 0) AS outstanding_balance,
      i.due_date
    FROM app.invoices i
    WHERE i.tenant_id = p_tenant_id
      AND i.deleted_at IS NULL
      AND app.metric_day_ist(i.invoice_date, i.created_at) BETWEEN v_start AND v_end

    UNION ALL

    SELECT
      i.tenant_id,
      'location'::text AS scope,
      i.location_id,
      app.metric_day_ist(i.invoice_date, i.created_at) AS day,
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
      AND app.metric_day_ist(i.invoice_date, i.created_at) BETWEEN v_start AND v_end
  ) rows
  GROUP BY tenant_id, scope, location_id, day;
END;
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
        AND app.order_status_in_flow(o.status)
        AND app.metric_day_ist(o.order_date, o.created_at) BETWEEN v_start AND v_end
      UNION
      SELECT app.metric_day_ist(i.invoice_date, i.created_at) AS day
      FROM app.invoices i
      WHERE i.tenant_id = p_tenant_id
        AND i.deleted_at IS NULL
        AND i.buyer_id IS NOT NULL
        AND app.invoice_status_in_flow(i.status)
        AND app.metric_day_ist(i.invoice_date, i.created_at) BETWEEN v_start AND v_end
    ) days
  LOOP
    PERFORM app.refresh_kpi_buyers_daily(p_tenant_id, day_row.day);
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION app.rebuild_kpi_brand_daily_for_tenant(
  p_tenant_id uuid,
  p_days int DEFAULT 62
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app
AS $$
DECLARE
  v_start date := GREATEST((now() AT TIME ZONE 'Asia/Kolkata')::date - p_days, DATE '2000-01-01');
  v_end date := (now() AT TIME ZONE 'Asia/Kolkata')::date;
BEGIN
  DELETE FROM app.kpi_brand_daily
  WHERE tenant_id = p_tenant_id
    AND day BETWEEN v_start AND v_end;

  INSERT INTO app.kpi_brand_daily (
    tenant_id, tenant_brand_id, day,
    gmv, orders_count, buyers_count, units_sold, updated_at
  )
  SELECT
    o.tenant_id,
    tp.tenant_brand_id,
    app.metric_day_ist(o.order_date, o.created_at) AS day,
    COALESCE(SUM(COALESCE(oi.line_total, oi.qty * oi.unit_price)), 0)::numeric(14,2),
    COUNT(DISTINCT o.id)::bigint,
    COUNT(DISTINCT o.buyer_id)::bigint,
    COALESCE(SUM(oi.qty), 0)::bigint,
    now()
  FROM app.order_items oi
  JOIN app.orders o
    ON o.id = oi.order_id
  JOIN app.tenant_products tp
    ON tp.id = oi.tenant_product_id
  WHERE o.tenant_id = p_tenant_id
    AND o.deleted_at IS NULL
    AND oi.deleted_at IS NULL
    AND tp.deleted_at IS NULL
    AND tp.tenant_brand_id IS NOT NULL
    AND app.order_status_in_flow(o.status)
    AND app.metric_day_ist(o.order_date, o.created_at) BETWEEN v_start AND v_end
  GROUP BY o.tenant_id, tp.tenant_brand_id, app.metric_day_ist(o.order_date, o.created_at);
END;
$$;

CREATE OR REPLACE FUNCTION app.rebuild_kpi_category_daily_for_tenant(
  p_tenant_id uuid,
  p_days int DEFAULT 62
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app
AS $$
DECLARE
  v_start date := GREATEST((now() AT TIME ZONE 'Asia/Kolkata')::date - p_days, DATE '2000-01-01');
  v_end date := (now() AT TIME ZONE 'Asia/Kolkata')::date;
BEGIN
  DELETE FROM app.kpi_category_daily
  WHERE tenant_id = p_tenant_id
    AND day BETWEEN v_start AND v_end;

  INSERT INTO app.kpi_category_daily (
    tenant_id, tenant_category_id, day,
    gmv, units_sold, orders_count, buyers_count, updated_at
  )
  SELECT
    o.tenant_id,
    tp.tenant_category_id,
    app.metric_day_ist(o.order_date, o.created_at) AS day,
    COALESCE(SUM(COALESCE(oi.line_total, oi.qty * oi.unit_price)), 0)::numeric(14,2),
    COALESCE(SUM(oi.qty), 0)::bigint,
    COUNT(DISTINCT o.id)::bigint,
    COUNT(DISTINCT o.buyer_id)::bigint,
    now()
  FROM app.order_items oi
  JOIN app.orders o
    ON o.id = oi.order_id
  JOIN app.tenant_products tp
    ON tp.id = oi.tenant_product_id
  WHERE o.tenant_id = p_tenant_id
    AND o.deleted_at IS NULL
    AND oi.deleted_at IS NULL
    AND tp.deleted_at IS NULL
    AND tp.tenant_category_id IS NOT NULL
    AND app.order_status_in_flow(o.status)
    AND app.metric_day_ist(o.order_date, o.created_at) BETWEEN v_start AND v_end
  GROUP BY o.tenant_id, tp.tenant_category_id, app.metric_day_ist(o.order_date, o.created_at);
END;
$$;

CREATE OR REPLACE FUNCTION app.rebuild_kpi_product_daily_for_tenant(
  p_tenant_id uuid,
  p_days int DEFAULT 62
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app
AS $$
DECLARE
  d date;
BEGIN
  DELETE FROM app.kpi_product_daily
  WHERE tenant_id = p_tenant_id
    AND day BETWEEN ((now() AT TIME ZONE 'Asia/Kolkata')::date - p_days) AND (now() AT TIME ZONE 'Asia/Kolkata')::date;

  FOR d IN
    SELECT generate_series(
      ((now() AT TIME ZONE 'Asia/Kolkata')::date - p_days),
      (now() AT TIME ZONE 'Asia/Kolkata')::date,
      interval '1 day'
    )::date
  LOOP
    INSERT INTO app.kpi_product_daily (
      tenant_id, tenant_product_id, day,
      units_sold, revenue, on_hand, updated_at
    )
    SELECT
      p_tenant_id,
      oi.tenant_product_id,
      d,
      COALESCE(SUM(oi.qty), 0)::int,
      COALESCE(SUM(COALESCE(oi.line_total, oi.qty * oi.unit_price)), 0)::numeric(14,2),
      COALESCE((
        SELECT SUM(ti.qty_available)
        FROM app.tenant_inventory ti
        WHERE ti.tenant_product_id = oi.tenant_product_id
          AND ti.deleted_at IS NULL
      ), 0)::numeric(14,2),
      now()
    FROM app.order_items oi
    JOIN app.orders o
      ON o.id = oi.order_id
    WHERE o.tenant_id = p_tenant_id
      AND o.deleted_at IS NULL
      AND app.order_status_in_flow(o.status)
      AND oi.deleted_at IS NULL
      AND app.metric_day_ist(o.order_date, o.created_at) = d
    GROUP BY oi.tenant_product_id
    HAVING COALESCE(SUM(oi.qty), 0) > 0
        OR COALESCE(SUM(COALESCE(oi.line_total, oi.qty * oi.unit_price)), 0) > 0;
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION app.rebuild_kpi_location_daily_for_tenant(
  p_tenant_id uuid,
  p_days int DEFAULT 62
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app
AS $$
DECLARE
  v_start date := GREATEST((now() AT TIME ZONE 'Asia/Kolkata')::date - p_days, DATE '2000-01-01');
  v_end date := (now() AT TIME ZONE 'Asia/Kolkata')::date;
  d date;
  loc RECORD;
BEGIN
  DELETE FROM app.kpi_location_daily
  WHERE tenant_id = p_tenant_id
    AND day BETWEEN v_start AND v_end;

  FOR d IN
    SELECT generate_series(v_start, v_end, interval '1 day')::date
  LOOP
    FOR loc IN
      SELECT id
      FROM app.locations
      WHERE tenant_id = p_tenant_id
        AND deleted_at IS NULL
    LOOP
      PERFORM app.refresh_kpi_location_daily(p_tenant_id, loc.id, d);
    END LOOP;
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION app.rebuild_kpi_warehouse_daily_for_tenant(
  p_tenant_id uuid,
  p_days int DEFAULT 62
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app
AS $$
DECLARE
  d date;
  wh RECORD;
  v_today date := (now() AT TIME ZONE 'Asia/Kolkata')::date;
BEGIN
  DELETE FROM app.kpi_warehouse_daily
  WHERE tenant_id = p_tenant_id
    AND day BETWEEN (v_today - p_days) AND v_today;

  FOR d IN
    SELECT generate_series(
      (v_today - p_days),
      v_today,
      interval '1 day'
    )::date
  LOOP
    FOR wh IN
      SELECT id
      FROM app.warehouses
      WHERE tenant_id = p_tenant_id
        AND deleted_at IS NULL
    LOOP
      IF d = v_today OR EXISTS (
        SELECT 1
        FROM app.tenant_inventory ti
        WHERE ti.warehouse_id = wh.id
          AND ti.deleted_at IS NULL
          AND (ti.updated_at AT TIME ZONE 'Asia/Kolkata')::date = d
      ) THEN
        PERFORM app.refresh_kpi_warehouse_daily(p_tenant_id, wh.id, d);
      END IF;
    END LOOP;
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION app.dispatch_from_order_items()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app
AS $$
DECLARE
  v_old_order_id uuid;
  v_new_order_id uuid;
  v_old_product_id uuid;
  v_new_product_id uuid;
  v_old_tenant uuid;
  v_new_tenant uuid;
  v_old_day date;
  v_new_day date;
  v_old_category uuid;
  v_new_category uuid;
  v_old_brand uuid;
  v_new_brand uuid;
BEGIN
  IF app.sync_trigger_bypass_active() THEN RETURN NULL; END IF;

  IF TG_OP <> 'INSERT' THEN
    v_old_order_id := OLD.order_id;
    v_old_product_id := OLD.tenant_product_id;
    SELECT o.tenant_id, app.metric_day_ist(o.order_date, o.created_at)
    INTO v_old_tenant, v_old_day
    FROM app.orders o
    WHERE o.id = v_old_order_id;
    SELECT tp.tenant_category_id, tp.tenant_brand_id
    INTO v_old_category, v_old_brand
    FROM app.tenant_products tp
    WHERE tp.id = v_old_product_id;
  END IF;

  IF TG_OP <> 'DELETE' THEN
    v_new_order_id := NEW.order_id;
    v_new_product_id := NEW.tenant_product_id;
    SELECT o.tenant_id, app.metric_day_ist(o.order_date, o.created_at)
    INTO v_new_tenant, v_new_day
    FROM app.orders o
    WHERE o.id = v_new_order_id;
    SELECT tp.tenant_category_id, tp.tenant_brand_id
    INTO v_new_category, v_new_brand
    FROM app.tenant_products tp
    WHERE tp.id = v_new_product_id;
  END IF;

  IF v_old_tenant IS NOT NULL AND v_old_day IS NOT NULL THEN
    PERFORM app.refresh_kpi_tenant_daily(v_old_tenant, v_old_day);
    IF v_old_product_id IS NOT NULL THEN
      PERFORM app.refresh_kpi_product_daily(v_old_tenant, v_old_product_id, v_old_day);
    END IF;
    IF v_old_category IS NOT NULL THEN
      PERFORM app.refresh_kpi_category_daily(v_old_tenant, v_old_category, v_old_day);
    END IF;
    IF v_old_brand IS NOT NULL THEN
      PERFORM app.refresh_kpi_brand_daily(v_old_tenant, v_old_brand, v_old_day);
    END IF;
  END IF;

  IF v_new_tenant IS NOT NULL AND v_new_day IS NOT NULL THEN
    IF v_new_tenant IS DISTINCT FROM v_old_tenant OR v_new_day IS DISTINCT FROM v_old_day THEN
      PERFORM app.refresh_kpi_tenant_daily(v_new_tenant, v_new_day);
    END IF;
    IF v_new_product_id IS NOT NULL
       AND (v_new_product_id IS DISTINCT FROM v_old_product_id
         OR v_new_day IS DISTINCT FROM v_old_day
         OR v_new_tenant IS DISTINCT FROM v_old_tenant)
    THEN
      PERFORM app.refresh_kpi_product_daily(v_new_tenant, v_new_product_id, v_new_day);
    END IF;
    IF v_new_category IS NOT NULL
       AND (v_new_category IS DISTINCT FROM v_old_category
         OR v_new_day IS DISTINCT FROM v_old_day
         OR v_new_tenant IS DISTINCT FROM v_old_tenant)
    THEN
      PERFORM app.refresh_kpi_category_daily(v_new_tenant, v_new_category, v_new_day);
    END IF;
    IF v_new_brand IS NOT NULL
       AND (v_new_brand IS DISTINCT FROM v_old_brand
         OR v_new_day IS DISTINCT FROM v_old_day
         OR v_new_tenant IS DISTINCT FROM v_old_tenant)
    THEN
      PERFORM app.refresh_kpi_brand_daily(v_new_tenant, v_new_brand, v_new_day);
    END IF;
  END IF;

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
  v_old_day date;
  v_new_day date;
BEGIN
  v_tenant := COALESCE(NEW.tenant_id, OLD.tenant_id);
  IF v_tenant IS NULL THEN RETURN NULL; END IF;

  v_bypass := app.sync_trigger_bypass_active();
  IF TG_OP <> 'INSERT' THEN
    v_old_day := app.metric_day_ist(OLD.estimate_date, OLD.created_at);
  END IF;
  IF TG_OP <> 'DELETE' THEN
    v_new_day := app.metric_day_ist(NEW.estimate_date, NEW.created_at);
  END IF;

  IF NOT v_bypass THEN
    PERFORM app.refresh_estimates_snapshot(v_tenant);
    PERFORM app.refresh_buyers_snapshot(v_tenant);
    IF v_old_day IS NOT NULL THEN
      PERFORM app.refresh_kpi_estimates_daily(v_tenant, v_old_day);
      PERFORM app.refresh_kpi_buyers_daily(v_tenant, v_old_day);
    END IF;
    IF v_new_day IS NOT NULL AND v_new_day IS DISTINCT FROM v_old_day THEN
      PERFORM app.refresh_kpi_estimates_daily(v_tenant, v_new_day);
      PERFORM app.refresh_kpi_buyers_daily(v_tenant, v_new_day);
    END IF;

    PERFORM app.sync_buyer_app_activity_from_estimate(COALESCE(NEW.id, OLD.id));

    IF v_old_day IS NOT NULL THEN
      PERFORM app.refresh_buyer_app_daily(v_tenant, v_old_day);
    END IF;
    IF v_new_day IS NOT NULL AND v_new_day IS DISTINCT FROM v_old_day THEN
      PERFORM app.refresh_buyer_app_daily(v_tenant, v_new_day);
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
  v_old_location uuid;
  v_new_location uuid;
  v_old_day date;
  v_new_day date;
BEGIN
  v_tenant := COALESCE(NEW.tenant_id, OLD.tenant_id);
  IF v_tenant IS NULL THEN RETURN NULL; END IF;

  v_bypass := app.sync_trigger_bypass_active();
  IF TG_OP <> 'INSERT' THEN
    v_old_location := OLD.location_id;
    v_old_day := app.metric_day_ist(OLD.order_date, OLD.created_at);
  END IF;
  IF TG_OP <> 'DELETE' THEN
    v_new_location := NEW.location_id;
    v_new_day := app.metric_day_ist(NEW.order_date, NEW.created_at);
  END IF;

  IF NOT v_bypass THEN
    PERFORM app.refresh_orders_snapshot(v_tenant);
    PERFORM app.refresh_buyers_snapshot(v_tenant);
    PERFORM app.refresh_buyer_current_snapshot(v_tenant);

    IF v_old_day IS NOT NULL THEN
      PERFORM app.refresh_kpi_orders_daily(v_tenant, v_old_day);
      PERFORM app.refresh_kpi_buyers_daily(v_tenant, v_old_day);
      PERFORM app.refresh_kpi_tenant_daily(v_tenant, v_old_day);
      IF v_old_location IS NOT NULL THEN
        PERFORM app.refresh_kpi_location_daily(v_tenant, v_old_location, v_old_day);
      END IF;
    END IF;

    IF v_new_day IS NOT NULL THEN
      IF v_new_day IS DISTINCT FROM v_old_day THEN
        PERFORM app.refresh_kpi_orders_daily(v_tenant, v_new_day);
        PERFORM app.refresh_kpi_buyers_daily(v_tenant, v_new_day);
        PERFORM app.refresh_kpi_tenant_daily(v_tenant, v_new_day);
      END IF;
      IF v_new_location IS NOT NULL
         AND (v_new_location IS DISTINCT FROM v_old_location OR v_new_day IS DISTINCT FROM v_old_day)
      THEN
        PERFORM app.refresh_kpi_location_daily(v_tenant, v_new_location, v_new_day);
      END IF;
    END IF;

    PERFORM app.sync_buyer_app_activity_from_order(COALESCE(NEW.id, OLD.id));

    IF v_old_day IS NOT NULL THEN
      PERFORM app.refresh_buyer_app_daily(v_tenant, v_old_day);
    END IF;
    IF v_new_day IS NOT NULL AND v_new_day IS DISTINCT FROM v_old_day THEN
      PERFORM app.refresh_buyer_app_daily(v_tenant, v_new_day);
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
  v_old_location uuid;
  v_new_location uuid;
  v_old_day date;
  v_new_day date;
BEGIN
  IF app.sync_trigger_bypass_active() THEN RETURN NULL; END IF;

  v_tenant := COALESCE(NEW.tenant_id, OLD.tenant_id);
  IF v_tenant IS NULL THEN RETURN NULL; END IF;

  IF TG_OP <> 'INSERT' THEN
    v_old_location := OLD.location_id;
    v_old_day := app.metric_day_ist(OLD.invoice_date, OLD.created_at);
  END IF;
  IF TG_OP <> 'DELETE' THEN
    v_new_location := NEW.location_id;
    v_new_day := app.metric_day_ist(NEW.invoice_date, NEW.created_at);
  END IF;

  PERFORM app.refresh_invoices_snapshot(v_tenant);
  PERFORM app.refresh_buyers_snapshot(v_tenant);
  PERFORM app.refresh_buyer_current_snapshot(v_tenant);

  IF v_old_location IS NOT NULL THEN
    PERFORM app.refresh_locations_snapshot(v_old_location);
  END IF;
  IF v_new_location IS NOT NULL AND v_new_location IS DISTINCT FROM v_old_location THEN
    PERFORM app.refresh_locations_snapshot(v_new_location);
  END IF;

  IF v_old_day IS NOT NULL THEN
    PERFORM app.refresh_kpi_invoices_daily(v_tenant, v_old_day);
    PERFORM app.refresh_kpi_buyers_daily(v_tenant, v_old_day);
    PERFORM app.refresh_buyer_app_daily(v_tenant, v_old_day);
  END IF;
  IF v_new_day IS NOT NULL AND v_new_day IS DISTINCT FROM v_old_day THEN
    PERFORM app.refresh_kpi_invoices_daily(v_tenant, v_new_day);
    PERFORM app.refresh_kpi_buyers_daily(v_tenant, v_new_day);
    PERFORM app.refresh_buyer_app_daily(v_tenant, v_new_day);
  END IF;
  PERFORM app.refresh_buyer_app_snapshot(v_tenant);

  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION app.dispatch_from_inventory()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app
AS $$
DECLARE
  v_old_product_id uuid;
  v_new_product_id uuid;
  v_old_warehouse_id uuid;
  v_new_warehouse_id uuid;
  v_old_location uuid;
  v_new_location uuid;
  v_tenant uuid;
  v_today date := (now() AT TIME ZONE 'Asia/Kolkata')::date;
BEGIN
  v_old_product_id := CASE WHEN TG_OP <> 'INSERT' THEN OLD.tenant_product_id ELSE NULL END;
  v_new_product_id := CASE WHEN TG_OP <> 'DELETE' THEN NEW.tenant_product_id ELSE NULL END;
  v_old_warehouse_id := CASE WHEN TG_OP <> 'INSERT' THEN OLD.warehouse_id ELSE NULL END;
  v_new_warehouse_id := CASE WHEN TG_OP <> 'DELETE' THEN NEW.warehouse_id ELSE NULL END;

  SELECT tenant_id
  INTO v_tenant
  FROM app.tenant_products
  WHERE id = COALESCE(v_new_product_id, v_old_product_id);

  IF v_tenant IS NULL THEN RETURN NULL; END IF;

  IF v_old_warehouse_id IS NOT NULL THEN
    SELECT location_id INTO v_old_location
    FROM app.warehouses
    WHERE id = v_old_warehouse_id;
  END IF;

  IF v_new_warehouse_id IS NOT NULL THEN
    SELECT location_id INTO v_new_location
    FROM app.warehouses
    WHERE id = v_new_warehouse_id;
  END IF;

  IF v_old_product_id IS NOT NULL THEN
    PERFORM app.refresh_kpi_product_daily(v_tenant, v_old_product_id, v_today);
  END IF;
  IF v_new_product_id IS NOT NULL
     AND (v_new_product_id IS DISTINCT FROM v_old_product_id)
  THEN
    PERFORM app.refresh_kpi_product_daily(v_tenant, v_new_product_id, v_today);
  END IF;

  PERFORM app.refresh_products_snapshot(v_tenant);
  PERFORM app.refresh_categories_snapshot(v_tenant);

  IF v_old_location IS NOT NULL THEN
    PERFORM app.refresh_locations_snapshot(v_old_location);
  END IF;
  IF v_new_location IS NOT NULL AND v_new_location IS DISTINCT FROM v_old_location THEN
    PERFORM app.refresh_locations_snapshot(v_new_location);
  END IF;

  IF v_old_warehouse_id IS NOT NULL THEN
    PERFORM app.refresh_warehouses_snapshot(v_old_warehouse_id);
    PERFORM app.refresh_kpi_warehouse_daily(v_tenant, v_old_warehouse_id, v_today);
  END IF;
  IF v_new_warehouse_id IS NOT NULL
     AND v_new_warehouse_id IS DISTINCT FROM v_old_warehouse_id
  THEN
    PERFORM app.refresh_warehouses_snapshot(v_new_warehouse_id);
    PERFORM app.refresh_kpi_warehouse_daily(v_tenant, v_new_warehouse_id, v_today);
  END IF;

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
  PERFORM app.refresh_buyers_snapshot(p_tenant_id);
  PERFORM app.refresh_products_snapshot(p_tenant_id);
  PERFORM app.refresh_categories_snapshot(p_tenant_id);
  PERFORM app.refresh_brands_snapshot(p_tenant_id);
  PERFORM app.refresh_buyer_current_snapshot(p_tenant_id);
  PERFORM app.rebuild_buyer_app_activity_for_tenant(p_tenant_id, GREATEST(p_days, 365));
  PERFORM app.refresh_buyer_app_snapshot(p_tenant_id);

  FOR loc IN
    SELECT id
    FROM app.locations
    WHERE tenant_id = p_tenant_id
      AND deleted_at IS NULL
  LOOP
    PERFORM app.refresh_locations_snapshot(loc.id);
  END LOOP;

  FOR wh IN
    SELECT id
    FROM app.warehouses
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

CREATE OR REPLACE FUNCTION app.retry_post_sync_rebuild_for_sync_job(p_job_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app
AS $$
DECLARE
  v_job app.integration_sync_jobs%ROWTYPE;
  v_days int;
BEGIN
  SELECT *
  INTO v_job
  FROM app.integration_sync_jobs
  WHERE id = p_job_id
    AND deleted_at IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'sync_job_not_found' USING ERRCODE = 'P0002';
  END IF;

  v_days := app.sync_job_rebuild_days(v_job.job_type, v_job.since_date, 2);

  PERFORM app.post_sync_rebuild(v_job.tenant_id, v_days);

  UPDATE app.integration_sync_jobs
  SET
    error_log = NULL,
    progress = jsonb_set(
      jsonb_set(COALESCE(progress, '{}'::jsonb), '{meta,post_sync_rebuild_failed}', 'false'::jsonb, true),
      '{meta,post_sync_rebuild_last_retried_at}',
      to_jsonb(now()),
      true
    ),
    updated_at = now()
  WHERE id = p_job_id;

  RETURN jsonb_build_object(
    'ok', true,
    'job_id', p_job_id,
    'tenant_id', v_job.tenant_id,
    'days_rebuilt', v_days
  );
EXCEPTION WHEN others THEN
  UPDATE app.integration_sync_jobs
  SET
    error_log = jsonb_build_object(
      'message', SQLERRM,
      'stage', 'retry_post_sync_rebuild',
      'timestamp', now()
    ),
    progress = jsonb_set(
      COALESCE(progress, '{}'::jsonb),
      '{meta,post_sync_rebuild_failed}',
      'true'::jsonb,
      true
    ),
    updated_at = now()
  WHERE id = p_job_id;
  RAISE;
END;
$$;

CREATE OR REPLACE FUNCTION app.trg_post_sync_rebuild()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app
SET statement_timeout = '0'
AS $$
DECLARE
  v_days int;
BEGIN
  IF OLD.status IS DISTINCT FROM 'completed' AND NEW.status = 'completed' THEN
    IF NEW.phase IS DISTINCT FROM 'analysis'
       AND (
         NEW.progress->'meta'->>'sync_run_id' IS NOT NULL
         OR NEW.progress->'meta'->>'master_job_id' IS NOT NULL
       ) THEN
      RETURN NEW;
    END IF;

    IF NEW.job_type = 'initial_transactional'
       AND NEW.phase IN ('estimates', 'orders', 'invoices') THEN
      RETURN NEW;
    END IF;

    v_days := app.sync_job_rebuild_days(NEW.job_type, NEW.since_date, 2);

    BEGIN
      PERFORM app.post_sync_rebuild(NEW.tenant_id, v_days);

      UPDATE app.integration_sync_jobs
      SET
        error_log = NULL,
        progress = jsonb_set(
          jsonb_set(COALESCE(progress, '{}'::jsonb), '{meta,post_sync_rebuild_failed}', 'false'::jsonb, true),
          '{meta,post_sync_rebuild_days}',
          to_jsonb(v_days),
          true
        ),
        updated_at = now()
      WHERE id = NEW.id;
    EXCEPTION WHEN others THEN
      UPDATE app.integration_sync_jobs
      SET
        error_log = jsonb_build_object(
          'message', SQLERRM,
          'stage', 'post_sync_rebuild',
          'timestamp', now(),
          'days', v_days
        ),
        progress = jsonb_set(
          jsonb_set(COALESCE(progress, '{}'::jsonb), '{meta,post_sync_rebuild_failed}', 'true'::jsonb, true),
          '{meta,post_sync_rebuild_days}',
          to_jsonb(v_days),
          true
        ),
        updated_at = now()
      WHERE id = NEW.id;

      RAISE WARNING '[trg_post_sync_rebuild] post_sync_rebuild failed for job % (phase=%, type=%): %',
        NEW.id, NEW.phase, NEW.job_type, SQLERRM;
    END;
  END IF;
  RETURN NEW;
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
  DELETE FROM app.kpi_estimates_daily  WHERE day           < CURRENT_DATE - p_retention_days;
  DELETE FROM app.kpi_orders_daily     WHERE day           < CURRENT_DATE - p_retention_days;
  DELETE FROM app.kpi_invoices_daily   WHERE day           < CURRENT_DATE - p_retention_days;
  DELETE FROM app.kpi_buyer_app_daily  WHERE snapshot_date < CURRENT_DATE - p_retention_days;
$$;
