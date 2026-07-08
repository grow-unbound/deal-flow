-- Metrics Aggregation Phase 3
-- Buyer-app activity tracking becomes first-party DB state instead of relying
-- on buyer_users.updated_at or raw document tables as proxy "opened app" data.
--
-- This slice introduces:
-- - app.buyer_app_activity as the canonical activity ledger
-- - app.record_buyer_app_activity(...) as the route-facing RPC
-- - estimate/order sync helpers so buyer-app-originated documents also emit
--   activity rows without app callers writing the table directly
-- - buyer-app aggregate writers updated to read the activity ledger for
--   opened/repeat/active-buyer usage semantics

CREATE TABLE IF NOT EXISTS app.buyer_app_activity (
  id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id                 uuid NOT NULL REFERENCES app.tenants(id) ON DELETE RESTRICT,
  buyer_id                  uuid NOT NULL REFERENCES app.buyers(id) ON DELETE RESTRICT,
  location_id               uuid REFERENCES app.locations(id) ON DELETE RESTRICT,
  event_name                text NOT NULL CHECK (btrim(event_name) <> ''),
  event_source              text NOT NULL DEFAULT 'route'
    CHECK (event_source IN ('route', 'estimate', 'order')),
  source_entity_id          uuid,
  occurred_at               timestamptz NOT NULL DEFAULT now(),
  occurred_day              date NOT NULL,
  qualifies_for_engagement  boolean NOT NULL DEFAULT true,
  metadata                  jsonb NOT NULL DEFAULT '{}'::jsonb,
  idempotency_key           text,
  created_at                timestamptz NOT NULL DEFAULT now(),
  updated_at                timestamptz NOT NULL DEFAULT now(),
  created_by                uuid REFERENCES auth.users(id) ON DELETE RESTRICT,
  updated_by                uuid REFERENCES auth.users(id) ON DELETE RESTRICT,
  deleted_at                timestamptz,
  external_ref              text,
  CONSTRAINT buyer_app_activity_route_source_entity_check CHECK (
    (event_source = 'route' AND source_entity_id IS NULL)
    OR (event_source IN ('estimate', 'order') AND source_entity_id IS NOT NULL)
  ),
  CONSTRAINT buyer_app_activity_tenant_idempotency_unique UNIQUE (tenant_id, idempotency_key),
  CONSTRAINT buyer_app_activity_tenant_source_entity_unique UNIQUE (tenant_id, event_source, source_entity_id)
);

CREATE INDEX IF NOT EXISTS idx_buyer_app_activity_day_lookup
  ON app.buyer_app_activity (tenant_id, occurred_day, buyer_id)
  WHERE deleted_at IS NULL AND qualifies_for_engagement = true;

CREATE INDEX IF NOT EXISTS idx_buyer_app_activity_buyer_lookup
  ON app.buyer_app_activity (tenant_id, buyer_id, occurred_at DESC)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_buyer_app_activity_source_lookup
  ON app.buyer_app_activity (tenant_id, event_source, source_entity_id)
  WHERE deleted_at IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_buyer_app_activity_tenant_external_ref
  ON app.buyer_app_activity (tenant_id, external_ref)
  WHERE external_ref IS NOT NULL;

ALTER TABLE app.buyer_app_activity ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "tenant members can read buyer_app_activity" ON app.buyer_app_activity;
CREATE POLICY "tenant members can read buyer_app_activity"
  ON app.buyer_app_activity FOR SELECT
  USING (
    app.jwt_tenant_id() = tenant_id
    AND (app.jwt_buyer_id() IS NULL OR app.jwt_buyer_id() = buyer_id)
  );

DROP TRIGGER IF EXISTS buyer_app_activity_updated_at ON app.buyer_app_activity;
CREATE TRIGGER buyer_app_activity_updated_at
  BEFORE UPDATE ON app.buyer_app_activity
  FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();

CREATE OR REPLACE FUNCTION app.record_buyer_app_activity(
  p_tenant_id uuid,
  p_buyer_id uuid,
  p_event_name text,
  p_occurred_at timestamptz DEFAULT now(),
  p_location_id uuid DEFAULT NULL,
  p_metadata jsonb DEFAULT '{}'::jsonb,
  p_idempotency_key text DEFAULT NULL,
  p_qualifies_for_engagement boolean DEFAULT true
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, app
AS $$
DECLARE
  v_claim_tenant uuid := app.jwt_tenant_id();
  v_claim_buyer uuid := app.jwt_buyer_id();
  v_occurred_at timestamptz := COALESCE(p_occurred_at, now());
  v_occurred_day date := (COALESCE(p_occurred_at, now()) AT TIME ZONE 'Asia/Kolkata')::date;
  v_activity_id uuid;
BEGIN
  IF btrim(COALESCE(p_event_name, '')) = '' THEN
    RAISE EXCEPTION 'event_name_required' USING ERRCODE = '22023';
  END IF;

  IF v_claim_tenant IS NOT NULL AND v_claim_tenant <> p_tenant_id THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  IF v_claim_buyer IS NOT NULL AND v_claim_buyer <> p_buyer_id THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  PERFORM 1
  FROM app.buyers b
  WHERE b.id = p_buyer_id
    AND b.tenant_id = p_tenant_id
    AND b.deleted_at IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'buyer_not_found' USING ERRCODE = '22023';
  END IF;

  IF p_location_id IS NOT NULL THEN
    PERFORM 1
    FROM app.locations l
    WHERE l.id = p_location_id
      AND l.tenant_id = p_tenant_id
      AND l.deleted_at IS NULL;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'location_not_found' USING ERRCODE = '22023';
    END IF;
  END IF;

  IF p_idempotency_key IS NOT NULL THEN
    INSERT INTO app.buyer_app_activity (
      tenant_id,
      buyer_id,
      location_id,
      event_name,
      event_source,
      source_entity_id,
      occurred_at,
      occurred_day,
      qualifies_for_engagement,
      metadata,
      idempotency_key,
      created_by,
      updated_by,
      deleted_at
    )
    VALUES (
      p_tenant_id,
      p_buyer_id,
      p_location_id,
      btrim(p_event_name),
      'route',
      NULL,
      v_occurred_at,
      v_occurred_day,
      p_qualifies_for_engagement,
      COALESCE(p_metadata, '{}'::jsonb),
      p_idempotency_key,
      auth.uid(),
      auth.uid(),
      NULL
    )
    ON CONFLICT (tenant_id, idempotency_key) DO UPDATE
    SET
      buyer_id = EXCLUDED.buyer_id,
      location_id = EXCLUDED.location_id,
      event_name = EXCLUDED.event_name,
      occurred_at = EXCLUDED.occurred_at,
      occurred_day = EXCLUDED.occurred_day,
      qualifies_for_engagement = EXCLUDED.qualifies_for_engagement,
      metadata = EXCLUDED.metadata,
      updated_by = auth.uid(),
      deleted_at = NULL
    RETURNING id INTO v_activity_id;
  ELSE
    INSERT INTO app.buyer_app_activity (
      tenant_id,
      buyer_id,
      location_id,
      event_name,
      event_source,
      source_entity_id,
      occurred_at,
      occurred_day,
      qualifies_for_engagement,
      metadata,
      idempotency_key,
      created_by,
      updated_by,
      deleted_at
    )
    VALUES (
      p_tenant_id,
      p_buyer_id,
      p_location_id,
      btrim(p_event_name),
      'route',
      NULL,
      v_occurred_at,
      v_occurred_day,
      p_qualifies_for_engagement,
      COALESCE(p_metadata, '{}'::jsonb),
      NULL,
      auth.uid(),
      auth.uid(),
      NULL
    )
    RETURNING id INTO v_activity_id;
  END IF;

  PERFORM app.refresh_buyer_app_daily(p_tenant_id, v_occurred_day);
  PERFORM app.refresh_buyer_app_snapshot(p_tenant_id);

  RETURN v_activity_id;
END;
$$;

REVOKE ALL ON FUNCTION app.record_buyer_app_activity(uuid, uuid, text, timestamptz, uuid, jsonb, text, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.record_buyer_app_activity(uuid, uuid, text, timestamptz, uuid, jsonb, text, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION app.record_buyer_app_activity(uuid, uuid, text, timestamptz, uuid, jsonb, text, boolean) TO service_role;

CREATE OR REPLACE FUNCTION app.sync_buyer_app_activity_from_estimate(p_estimate_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, app
AS $$
DECLARE
  v_estimate app.estimates%ROWTYPE;
  v_metric_day date;
  v_occurred_at timestamptz;
BEGIN
  SELECT *
  INTO v_estimate
  FROM app.estimates
  WHERE id = p_estimate_id;

  IF NOT FOUND
     OR v_estimate.deleted_at IS NOT NULL
     OR NOT COALESCE(v_estimate.is_buyer_app_estimate, false)
     OR v_estimate.buyer_id IS NULL
  THEN
    UPDATE app.buyer_app_activity
    SET
      qualifies_for_engagement = false,
      deleted_at = now(),
      updated_by = auth.uid()
    WHERE event_source = 'estimate'
      AND source_entity_id = p_estimate_id
      AND deleted_at IS NULL;
    RETURN;
  END IF;

  v_metric_day := app.metric_day_ist(v_estimate.estimate_date, v_estimate.created_at);
  v_occurred_at := COALESCE(
    CASE
      WHEN v_estimate.estimate_date IS NOT NULL THEN make_timestamptz(
        EXTRACT(YEAR FROM v_estimate.estimate_date)::int,
        EXTRACT(MONTH FROM v_estimate.estimate_date)::int,
        EXTRACT(DAY FROM v_estimate.estimate_date)::int,
        12, 0, 0,
        'Asia/Kolkata'
      )
      ELSE NULL
    END,
    v_estimate.created_at,
    now()
  );

  INSERT INTO app.buyer_app_activity (
    tenant_id,
    buyer_id,
    location_id,
    event_name,
    event_source,
    source_entity_id,
    occurred_at,
    occurred_day,
    qualifies_for_engagement,
    metadata,
    idempotency_key,
    created_by,
    updated_by,
    deleted_at,
    external_ref
  )
  VALUES (
    v_estimate.tenant_id,
    v_estimate.buyer_id,
    v_estimate.location_id,
    'estimate_created',
    'estimate',
    v_estimate.id,
    v_occurred_at,
    v_metric_day,
    true,
    jsonb_build_object(
      'estimate_id', v_estimate.id,
      'is_buyer_app_estimate', v_estimate.is_buyer_app_estimate
    ),
    'estimate:' || v_estimate.id::text,
    COALESCE(v_estimate.created_by, auth.uid()),
    COALESCE(v_estimate.updated_by, auth.uid()),
    NULL,
    v_estimate.external_ref
  )
  ON CONFLICT (tenant_id, event_source, source_entity_id) DO UPDATE
  SET
    buyer_id = EXCLUDED.buyer_id,
    location_id = EXCLUDED.location_id,
    event_name = EXCLUDED.event_name,
    occurred_at = EXCLUDED.occurred_at,
    occurred_day = EXCLUDED.occurred_day,
    qualifies_for_engagement = true,
    metadata = EXCLUDED.metadata,
    updated_by = COALESCE(v_estimate.updated_by, auth.uid()),
    deleted_at = NULL,
    external_ref = EXCLUDED.external_ref;
END;
$$;

CREATE OR REPLACE FUNCTION app.sync_buyer_app_activity_from_order(p_order_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, app
AS $$
DECLARE
  v_order app.orders%ROWTYPE;
  v_metric_day date;
  v_occurred_at timestamptz;
BEGIN
  SELECT *
  INTO v_order
  FROM app.orders
  WHERE id = p_order_id;

  IF NOT FOUND
     OR v_order.deleted_at IS NOT NULL
     OR NOT COALESCE(v_order.is_buyer_app_order, false)
     OR v_order.buyer_id IS NULL
  THEN
    UPDATE app.buyer_app_activity
    SET
      qualifies_for_engagement = false,
      deleted_at = now(),
      updated_by = auth.uid()
    WHERE event_source = 'order'
      AND source_entity_id = p_order_id
      AND deleted_at IS NULL;
    RETURN;
  END IF;

  v_metric_day := app.metric_day_ist(v_order.order_date, v_order.created_at);
  v_occurred_at := COALESCE(
    CASE
      WHEN v_order.order_date IS NOT NULL THEN make_timestamptz(
        EXTRACT(YEAR FROM v_order.order_date)::int,
        EXTRACT(MONTH FROM v_order.order_date)::int,
        EXTRACT(DAY FROM v_order.order_date)::int,
        12, 0, 0,
        'Asia/Kolkata'
      )
      ELSE NULL
    END,
    v_order.placed_at,
    v_order.created_at,
    now()
  );

  INSERT INTO app.buyer_app_activity (
    tenant_id,
    buyer_id,
    location_id,
    event_name,
    event_source,
    source_entity_id,
    occurred_at,
    occurred_day,
    qualifies_for_engagement,
    metadata,
    idempotency_key,
    created_by,
    updated_by,
    deleted_at,
    external_ref
  )
  VALUES (
    v_order.tenant_id,
    v_order.buyer_id,
    v_order.location_id,
    'order_created',
    'order',
    v_order.id,
    v_occurred_at,
    v_metric_day,
    true,
    jsonb_build_object(
      'order_id', v_order.id,
      'status', v_order.status,
      'is_buyer_app_order', v_order.is_buyer_app_order
    ),
    'order:' || v_order.id::text,
    COALESCE(v_order.created_by, auth.uid()),
    COALESCE(v_order.updated_by, auth.uid()),
    NULL,
    v_order.external_ref
  )
  ON CONFLICT (tenant_id, event_source, source_entity_id) DO UPDATE
  SET
    buyer_id = EXCLUDED.buyer_id,
    location_id = EXCLUDED.location_id,
    event_name = EXCLUDED.event_name,
    occurred_at = EXCLUDED.occurred_at,
    occurred_day = EXCLUDED.occurred_day,
    qualifies_for_engagement = true,
    metadata = EXCLUDED.metadata,
    updated_by = COALESCE(v_order.updated_by, auth.uid()),
    deleted_at = NULL,
    external_ref = EXCLUDED.external_ref;
END;
$$;

REVOKE ALL ON FUNCTION app.sync_buyer_app_activity_from_estimate(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.sync_buyer_app_activity_from_order(uuid) FROM PUBLIC;

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
          AND app.metric_day_ist(o.order_date, o.created_at) = p_date
          AND o.deleted_at IS NULL
      ), 0) AS app_gmv,
      COALESCE((
        SELECT COUNT(*)
        FROM app.orders o
        WHERE o.tenant_id = p_tenant_id
          AND o.is_buyer_app_order
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
          AND app.metric_day_ist(o.order_date, o.created_at) = p_date
          AND o.status IN ('confirmed', 'partially_dispatched', 'dispatched', 'delivered', 'invoiced', 'partially_invoiced')
          AND o.deleted_at IS NULL
      ), 0) AS converted_to_order_value,
      COALESCE((
        SELECT COUNT(*)
        FROM app.orders o
        WHERE o.tenant_id = p_tenant_id
          AND o.is_buyer_app_order
          AND app.metric_day_ist(o.order_date, o.created_at) = p_date
          AND o.status IN ('confirmed', 'partially_dispatched', 'dispatched', 'delivered', 'invoiced', 'partially_invoiced')
          AND o.deleted_at IS NULL
      ), 0) AS converted_to_order_count,
      COALESCE((
        SELECT SUM(i.total_amount)
        FROM app.invoices i
        WHERE i.tenant_id = p_tenant_id
          AND i.is_buyer_app_invoice
          AND app.metric_day_ist((i.invoice_date AT TIME ZONE 'Asia/Kolkata')::date, i.created_at) = p_date
          AND i.deleted_at IS NULL
      ), 0) AS invoiced_value,
      COALESCE((
        SELECT COUNT(*)
        FROM app.invoices i
        WHERE i.tenant_id = p_tenant_id
          AND i.is_buyer_app_invoice
          AND app.metric_day_ist((i.invoice_date AT TIME ZONE 'Asia/Kolkata')::date, i.created_at) = p_date
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
    enabled_buyers, total_buyers, opened_app_mtd, ordered_mtd, repeat_mtd,
    app_gmv_mtd, app_orders_mtd, total_gmv_mtd,
    estimates_app_value_mtd, estimates_app_count_mtd,
    converted_order_value_mtd, converted_order_count_mtd,
    invoiced_app_value_mtd, invoiced_app_count_mtd,
    not_ordering_buyers, top_app_buyers_callout, no_app_buyers,
    top_app_buyers_card, top_locations,
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
       AND app.metric_day_ist(o.order_date, o.created_at) >= v_month_start_ist
       AND app.metric_day_ist(o.order_date, o.created_at) < v_next_month_start_ist
       AND o.deleted_at IS NULL),
    (SELECT COUNT(*)
     FROM month_activity ma
     WHERE ma.event_count >= 2),
    COALESCE((SELECT SUM(o.total_amount)
      FROM app.orders o
      WHERE o.tenant_id = p_tenant_id
        AND o.is_buyer_app_order
        AND app.metric_day_ist(o.order_date, o.created_at) >= v_month_start_ist
        AND app.metric_day_ist(o.order_date, o.created_at) < v_next_month_start_ist
        AND o.deleted_at IS NULL), 0),
    (SELECT COUNT(*)
     FROM app.orders o
     WHERE o.tenant_id = p_tenant_id
       AND o.is_buyer_app_order
       AND app.metric_day_ist(o.order_date, o.created_at) >= v_month_start_ist
       AND app.metric_day_ist(o.order_date, o.created_at) < v_next_month_start_ist
       AND o.deleted_at IS NULL),
    COALESCE((SELECT SUM(o.total_amount)
      FROM app.orders o
      WHERE o.tenant_id = p_tenant_id
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
        AND app.metric_day_ist(o.order_date, o.created_at) >= v_month_start_ist
        AND app.metric_day_ist(o.order_date, o.created_at) < v_next_month_start_ist
        AND o.status IN ('confirmed', 'partially_dispatched', 'dispatched', 'delivered', 'invoiced', 'partially_invoiced')
        AND o.deleted_at IS NULL), 0),
    (SELECT COUNT(*)
     FROM app.orders o
     WHERE o.tenant_id = p_tenant_id
       AND o.is_buyer_app_order
       AND app.metric_day_ist(o.order_date, o.created_at) >= v_month_start_ist
       AND app.metric_day_ist(o.order_date, o.created_at) < v_next_month_start_ist
       AND o.status IN ('confirmed', 'partially_dispatched', 'dispatched', 'delivered', 'invoiced', 'partially_invoiced')
       AND o.deleted_at IS NULL),
    COALESCE((SELECT SUM(i.total_amount)
      FROM app.invoices i
      WHERE i.tenant_id = p_tenant_id
        AND i.is_buyer_app_invoice
        AND app.metric_day_ist((i.invoice_date AT TIME ZONE 'Asia/Kolkata')::date, i.created_at) >= v_month_start_ist
        AND app.metric_day_ist((i.invoice_date AT TIME ZONE 'Asia/Kolkata')::date, i.created_at) < v_next_month_start_ist
        AND i.deleted_at IS NULL), 0),
    (SELECT COUNT(*)
     FROM app.invoices i
     WHERE i.tenant_id = p_tenant_id
       AND i.is_buyer_app_invoice
       AND app.metric_day_ist((i.invoice_date AT TIME ZONE 'Asia/Kolkata')::date, i.created_at) >= v_month_start_ist
       AND app.metric_day_ist((i.invoice_date AT TIME ZONE 'Asia/Kolkata')::date, i.created_at) < v_next_month_start_ist
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

CREATE OR REPLACE FUNCTION app.rebuild_buyer_app_activity_for_tenant(
  p_tenant_id uuid,
  p_days int DEFAULT 365
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app
AS $$
DECLARE
  v_start date := GREATEST((now() AT TIME ZONE 'Asia/Kolkata')::date - p_days, DATE '2000-01-01');
  estimate_row RECORD;
  order_row RECORD;
BEGIN
  FOR estimate_row IN
    SELECT e.id
    FROM app.estimates e
    WHERE e.tenant_id = p_tenant_id
      AND (
        app.metric_day_ist(e.estimate_date, e.created_at) >= v_start
        OR e.deleted_at IS NOT NULL
      )
  LOOP
    PERFORM app.sync_buyer_app_activity_from_estimate(estimate_row.id);
  END LOOP;

  FOR order_row IN
    SELECT o.id
    FROM app.orders o
    WHERE o.tenant_id = p_tenant_id
      AND (
        app.metric_day_ist(o.order_date, o.created_at) >= v_start
        OR o.deleted_at IS NOT NULL
      )
  LOOP
    PERFORM app.sync_buyer_app_activity_from_order(order_row.id);
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION app.rebuild_buyer_app_daily_for_tenant(
  p_tenant_id uuid,
  p_days int DEFAULT 2
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app
AS $$
DECLARE
  d date;
BEGIN
  FOR d IN
    SELECT generate_series(
      ((now() AT TIME ZONE 'Asia/Kolkata')::date - p_days),
      (now() AT TIME ZONE 'Asia/Kolkata')::date,
      interval '1 day'
    )::date
  LOOP
    PERFORM app.refresh_buyer_app_daily(p_tenant_id, d);
  END LOOP;
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
  v_location uuid;
  v_old_day date;
  v_new_day date;
  v_old_placed_day date;
  v_new_placed_day date;
BEGIN
  v_tenant := COALESCE(NEW.tenant_id, OLD.tenant_id);
  IF v_tenant IS NULL THEN RETURN NULL; END IF;

  v_bypass := app.sync_trigger_bypass_active();
  v_location := COALESCE(NEW.location_id, OLD.location_id);
  IF TG_OP <> 'INSERT' THEN
    v_old_day := app.metric_day_ist(OLD.order_date, OLD.created_at);
    v_old_placed_day := (OLD.placed_at AT TIME ZONE 'Asia/Kolkata')::date;
  END IF;
  IF TG_OP <> 'DELETE' THEN
    v_new_day := app.metric_day_ist(NEW.order_date, NEW.created_at);
    v_new_placed_day := (NEW.placed_at AT TIME ZONE 'Asia/Kolkata')::date;
  END IF;

  IF NOT v_bypass THEN
    PERFORM app.refresh_orders_snapshot(v_tenant);
    PERFORM app.refresh_buyers_snapshot(v_tenant);
    PERFORM app.refresh_buyer_current_snapshot(v_tenant);
    IF v_old_day IS NOT NULL THEN
      PERFORM app.refresh_kpi_orders_daily(v_tenant, v_old_day);
      PERFORM app.refresh_kpi_buyers_daily(v_tenant, v_old_day);
    END IF;
    IF v_new_day IS NOT NULL AND v_new_day IS DISTINCT FROM v_old_day THEN
      PERFORM app.refresh_kpi_orders_daily(v_tenant, v_new_day);
      PERFORM app.refresh_kpi_buyers_daily(v_tenant, v_new_day);
    END IF;
    IF v_old_placed_day IS NOT NULL THEN
      PERFORM app.refresh_kpi_tenant_daily(v_tenant, v_old_placed_day);
      IF v_location IS NOT NULL THEN
        PERFORM app.refresh_kpi_location_daily(v_tenant, v_location, v_old_placed_day);
      END IF;
    END IF;
    IF v_new_placed_day IS NOT NULL AND v_new_placed_day IS DISTINCT FROM v_old_placed_day THEN
      PERFORM app.refresh_kpi_tenant_daily(v_tenant, v_new_placed_day);
      IF v_location IS NOT NULL THEN
        PERFORM app.refresh_kpi_location_daily(v_tenant, v_location, v_new_placed_day);
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
  v_location uuid;
  v_old_day date;
  v_new_day date;
BEGIN
  IF app.sync_trigger_bypass_active() THEN RETURN NULL; END IF;

  v_tenant := COALESCE(NEW.tenant_id, OLD.tenant_id);
  IF v_tenant IS NULL THEN RETURN NULL; END IF;

  v_location := COALESCE(NEW.location_id, OLD.location_id);
  IF TG_OP <> 'INSERT' THEN
    v_old_day := app.metric_day_ist((OLD.invoice_date AT TIME ZONE 'Asia/Kolkata')::date, OLD.created_at);
  END IF;
  IF TG_OP <> 'DELETE' THEN
    v_new_day := app.metric_day_ist((NEW.invoice_date AT TIME ZONE 'Asia/Kolkata')::date, NEW.created_at);
  END IF;

  PERFORM app.refresh_invoices_snapshot(v_tenant);
  PERFORM app.refresh_buyers_snapshot(v_tenant);
  PERFORM app.refresh_buyer_current_snapshot(v_tenant);

  IF v_location IS NOT NULL THEN
    PERFORM app.refresh_locations_snapshot(v_location);
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
