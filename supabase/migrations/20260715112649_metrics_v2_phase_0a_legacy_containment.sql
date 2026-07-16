-- Metrics V2 Phase 0A: contain legacy V1 tenant-wide refreshes that were
-- attached to interactive writes. This is not a V2 schema/capture migration.

CREATE OR REPLACE FUNCTION app.refresh_buyers_snapshot_for_buyer(
  p_tenant_id uuid,
  p_buyer_id uuid
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app
AS $$
BEGIN
  IF p_tenant_id IS NULL OR p_buyer_id IS NULL THEN
    RETURN;
  END IF;

  DELETE FROM app.buyers_snapshot
  WHERE tenant_id = p_tenant_id
    AND buyer_id = p_buyer_id;

  WITH base_buyers AS (
    SELECT
      b.id AS buyer_id,
      b.is_active,
      COALESCE(b.credit_limit, 0) AS credit_limit
    FROM app.buyers b
    WHERE b.tenant_id = p_tenant_id
      AND b.id = p_buyer_id
      AND b.deleted_at IS NULL
  ),
  tenant_orders AS (
    SELECT
      o.buyer_id,
      COUNT(*) FILTER (WHERE app.order_status_is_open(o.status))::bigint AS open_orders_count,
      MAX(COALESCE((o.order_date::timestamp AT TIME ZONE 'Asia/Kolkata'), o.placed_at, o.created_at)) AS last_order_at
    FROM app.orders o
    WHERE o.tenant_id = p_tenant_id
      AND o.buyer_id = p_buyer_id
      AND o.deleted_at IS NULL
    GROUP BY o.buyer_id
  ),
  tenant_estimates AS (
    SELECT
      e.buyer_id,
      MAX(COALESCE((e.estimate_date::timestamp AT TIME ZONE 'Asia/Kolkata'), e.created_at)) AS last_estimate_at
    FROM app.estimates e
    WHERE e.tenant_id = p_tenant_id
      AND e.buyer_id = p_buyer_id
      AND e.deleted_at IS NULL
    GROUP BY e.buyer_id
  ),
  tenant_invoices AS (
    SELECT
      i.buyer_id,
      COALESCE(SUM(i.outstanding_balance) FILTER (
        WHERE app.invoice_status_has_receivable(i.status, i.outstanding_balance)
      ), 0) AS outstanding_dues,
      COALESCE(SUM(i.outstanding_balance) FILTER (
        WHERE app.invoice_is_overdue(i.status, i.due_date, i.outstanding_balance)
      ), 0) AS overdue_amount,
      MAX(COALESCE((i.invoice_date::timestamp AT TIME ZONE 'Asia/Kolkata'), i.created_at)) AS last_invoice_at
    FROM app.invoices i
    WHERE i.tenant_id = p_tenant_id
      AND i.buyer_id = p_buyer_id
      AND i.deleted_at IS NULL
    GROUP BY i.buyer_id
  ),
  location_orders AS (
    SELECT
      o.buyer_id,
      o.location_id,
      COUNT(*) FILTER (WHERE app.order_status_is_open(o.status))::bigint AS open_orders_count,
      MAX(COALESCE((o.order_date::timestamp AT TIME ZONE 'Asia/Kolkata'), o.placed_at, o.created_at)) AS last_order_at
    FROM app.orders o
    WHERE o.tenant_id = p_tenant_id
      AND o.buyer_id = p_buyer_id
      AND o.deleted_at IS NULL
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
      AND e.buyer_id = p_buyer_id
      AND e.deleted_at IS NULL
      AND e.location_id IS NOT NULL
    GROUP BY e.buyer_id, e.location_id
  ),
  location_invoices AS (
    SELECT
      i.buyer_id,
      i.location_id,
      COALESCE(SUM(i.outstanding_balance) FILTER (
        WHERE app.invoice_status_has_receivable(i.status, i.outstanding_balance)
      ), 0) AS outstanding_dues,
      COALESCE(SUM(i.outstanding_balance) FILTER (
        WHERE app.invoice_is_overdue(i.status, i.due_date, i.outstanding_balance)
      ), 0) AS overdue_amount,
      MAX(COALESCE((i.invoice_date::timestamp AT TIME ZONE 'Asia/Kolkata'), i.created_at)) AS last_invoice_at
    FROM app.invoices i
    WHERE i.tenant_id = p_tenant_id
      AND i.buyer_id = p_buyer_id
      AND i.deleted_at IS NULL
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

CREATE OR REPLACE FUNCTION app.refresh_buyer_current_snapshot_for_buyer(
  p_tenant_id uuid,
  p_buyer_id uuid
) RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = app
AS $$
  DELETE FROM app.buyer_current_snapshot snapshot
  WHERE snapshot.tenant_id = p_tenant_id
    AND snapshot.buyer_id = p_buyer_id
    AND NOT EXISTS (
      SELECT 1
      FROM app.buyers b
      WHERE b.tenant_id = p_tenant_id
        AND b.id = p_buyer_id
        AND b.deleted_at IS NULL
    );

  INSERT INTO app.buyer_current_snapshot (
    tenant_id,
    buyer_id,
    credit_limit,
    outstanding_dues,
    credit_used,
    available_credit,
    open_invoice_count,
    earliest_due_date,
    overdue_invoice_count,
    overdue_amount,
    open_orders_count,
    refreshed_at,
    updated_at
  )
  WITH invoice_rollup AS (
    SELECT
      i.buyer_id,
      COALESCE(SUM(i.outstanding_balance) FILTER (
        WHERE app.invoice_status_has_receivable(i.status, i.outstanding_balance)
      ), 0) AS outstanding_dues,
      COUNT(*) FILTER (
        WHERE app.invoice_status_has_receivable(i.status, i.outstanding_balance)
      )::bigint AS open_invoice_count,
      MIN(i.due_date) FILTER (
        WHERE app.invoice_status_has_receivable(i.status, i.outstanding_balance)
          AND i.due_date IS NOT NULL
      ) AS earliest_due_date,
      COUNT(*) FILTER (
        WHERE app.invoice_is_overdue(i.status, i.due_date, i.outstanding_balance)
      )::bigint AS overdue_invoice_count,
      COALESCE(SUM(i.outstanding_balance) FILTER (
        WHERE app.invoice_is_overdue(i.status, i.due_date, i.outstanding_balance)
      ), 0) AS overdue_amount
    FROM app.invoices i
    WHERE i.tenant_id = p_tenant_id
      AND i.buyer_id = p_buyer_id
      AND i.deleted_at IS NULL
    GROUP BY i.buyer_id
  ),
  order_rollup AS (
    SELECT
      o.buyer_id,
      COUNT(*) FILTER (
        WHERE app.order_status_is_open(o.status)
      )::bigint AS open_orders_count
    FROM app.orders o
    WHERE o.tenant_id = p_tenant_id
      AND o.buyer_id = p_buyer_id
      AND o.deleted_at IS NULL
    GROUP BY o.buyer_id
  )
  SELECT
    b.tenant_id,
    b.id,
    COALESCE(b.credit_limit, 0) AS credit_limit,
    COALESCE(ir.outstanding_dues, 0) AS outstanding_dues,
    COALESCE(ir.outstanding_dues, 0) AS credit_used,
    GREATEST(COALESCE(b.credit_limit, 0) - COALESCE(ir.outstanding_dues, 0), 0) AS available_credit,
    COALESCE(ir.open_invoice_count, 0) AS open_invoice_count,
    ir.earliest_due_date,
    COALESCE(ir.overdue_invoice_count, 0) AS overdue_invoice_count,
    COALESCE(ir.overdue_amount, 0) AS overdue_amount,
    COALESCE(orx.open_orders_count, 0) AS open_orders_count,
    now(),
    now()
  FROM app.buyers b
  LEFT JOIN invoice_rollup ir
    ON ir.buyer_id = b.id
  LEFT JOIN order_rollup orx
    ON orx.buyer_id = b.id
  WHERE b.tenant_id = p_tenant_id
    AND b.id = p_buyer_id
    AND b.deleted_at IS NULL
  ON CONFLICT (tenant_id, buyer_id) DO UPDATE SET
    credit_limit = EXCLUDED.credit_limit,
    outstanding_dues = EXCLUDED.outstanding_dues,
    credit_used = EXCLUDED.credit_used,
    available_credit = EXCLUDED.available_credit,
    open_invoice_count = EXCLUDED.open_invoice_count,
    earliest_due_date = EXCLUDED.earliest_due_date,
    overdue_invoice_count = EXCLUDED.overdue_invoice_count,
    overdue_amount = EXCLUDED.overdue_amount,
    open_orders_count = EXCLUDED.open_orders_count,
    refreshed_at = EXCLUDED.refreshed_at,
    updated_at = EXCLUDED.updated_at;
$$;

CREATE OR REPLACE FUNCTION app.dispatch_from_buyers()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app
AS $$
DECLARE
  v_tenant uuid;
  v_old_buyer uuid;
  v_new_buyer uuid;
BEGIN
  v_tenant := COALESCE(NEW.tenant_id, OLD.tenant_id);
  IF v_tenant IS NULL THEN RETURN NULL; END IF;
  IF app.sync_trigger_bypass_active() THEN RETURN NULL; END IF;

  IF TG_OP <> 'INSERT' THEN
    v_old_buyer := OLD.id;
  END IF;
  IF TG_OP <> 'DELETE' THEN
    v_new_buyer := NEW.id;
  END IF;

  IF v_old_buyer IS NOT NULL THEN
    PERFORM app.refresh_buyers_snapshot_for_buyer(v_tenant, v_old_buyer);
    PERFORM app.refresh_buyer_current_snapshot_for_buyer(v_tenant, v_old_buyer);
  END IF;
  IF v_new_buyer IS NOT NULL AND v_new_buyer IS DISTINCT FROM v_old_buyer THEN
    PERFORM app.refresh_buyers_snapshot_for_buyer(v_tenant, v_new_buyer);
    PERFORM app.refresh_buyer_current_snapshot_for_buyer(v_tenant, v_new_buyer);
  END IF;

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
  v_old_day date;
  v_new_day date;
  v_old_buyer uuid;
  v_new_buyer uuid;
BEGIN
  v_tenant := COALESCE(NEW.tenant_id, OLD.tenant_id);
  IF v_tenant IS NULL THEN RETURN NULL; END IF;

  v_bypass := app.sync_trigger_bypass_active();
  IF TG_OP <> 'INSERT' THEN
    v_old_day := app.metric_day_ist(OLD.estimate_date, OLD.created_at);
    v_old_buyer := OLD.buyer_id;
  END IF;
  IF TG_OP <> 'DELETE' THEN
    v_new_day := app.metric_day_ist(NEW.estimate_date, NEW.created_at);
    v_new_buyer := NEW.buyer_id;
  END IF;

  IF NOT v_bypass THEN
    PERFORM app.refresh_estimates_snapshot(v_tenant);

    IF v_old_buyer IS NOT NULL THEN
      PERFORM app.refresh_buyers_snapshot_for_buyer(v_tenant, v_old_buyer);
    END IF;
    IF v_new_buyer IS NOT NULL AND v_new_buyer IS DISTINCT FROM v_old_buyer THEN
      PERFORM app.refresh_buyers_snapshot_for_buyer(v_tenant, v_new_buyer);
    END IF;

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
  v_old_buyer uuid;
  v_new_buyer uuid;
BEGIN
  IF app.sync_trigger_bypass_active() THEN RETURN NULL; END IF;

  v_tenant := COALESCE(NEW.tenant_id, OLD.tenant_id);
  IF v_tenant IS NULL THEN RETURN NULL; END IF;

  IF TG_OP <> 'INSERT' THEN
    v_old_location := OLD.location_id;
    v_old_day := app.metric_day_ist(OLD.invoice_date, OLD.created_at);
    v_old_buyer := OLD.buyer_id;
  END IF;
  IF TG_OP <> 'DELETE' THEN
    v_new_location := NEW.location_id;
    v_new_day := app.metric_day_ist(NEW.invoice_date, NEW.created_at);
    v_new_buyer := NEW.buyer_id;
  END IF;

  PERFORM app.refresh_invoices_snapshot(v_tenant);

  IF v_old_buyer IS NOT NULL THEN
    PERFORM app.refresh_buyers_snapshot_for_buyer(v_tenant, v_old_buyer);
    PERFORM app.refresh_buyer_current_snapshot_for_buyer(v_tenant, v_old_buyer);
  END IF;
  IF v_new_buyer IS NOT NULL AND v_new_buyer IS DISTINCT FROM v_old_buyer THEN
    PERFORM app.refresh_buyers_snapshot_for_buyer(v_tenant, v_new_buyer);
    PERFORM app.refresh_buyer_current_snapshot_for_buyer(v_tenant, v_new_buyer);
  END IF;

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
  v_old_buyer uuid;
  v_new_buyer uuid;
BEGIN
  v_tenant := COALESCE(NEW.tenant_id, OLD.tenant_id);
  IF v_tenant IS NULL THEN RETURN NULL; END IF;

  v_bypass := app.sync_trigger_bypass_active();
  IF TG_OP <> 'INSERT' THEN
    v_old_location := OLD.location_id;
    v_old_day := app.metric_day_ist(OLD.order_date, OLD.created_at);
    v_old_buyer := OLD.buyer_id;
  END IF;
  IF TG_OP <> 'DELETE' THEN
    v_new_location := NEW.location_id;
    v_new_day := app.metric_day_ist(NEW.order_date, NEW.created_at);
    v_new_buyer := NEW.buyer_id;
  END IF;

  IF NOT v_bypass THEN
    PERFORM app.refresh_orders_snapshot(v_tenant);

    IF v_old_buyer IS NOT NULL THEN
      PERFORM app.refresh_buyers_snapshot_for_buyer(v_tenant, v_old_buyer);
      PERFORM app.refresh_buyer_current_snapshot_for_buyer(v_tenant, v_old_buyer);
    END IF;
    IF v_new_buyer IS NOT NULL AND v_new_buyer IS DISTINCT FROM v_old_buyer THEN
      PERFORM app.refresh_buyers_snapshot_for_buyer(v_tenant, v_new_buyer);
      PERFORM app.refresh_buyer_current_snapshot_for_buyer(v_tenant, v_new_buyer);
    END IF;

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
  END IF;

  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION app.record_buyer_app_activity(
  p_tenant_id uuid,
  p_buyer_id uuid,
  p_event_name text,
  p_occurred_at timestamp with time zone DEFAULT now(),
  p_location_id uuid DEFAULT NULL::uuid,
  p_metadata jsonb DEFAULT '{}'::jsonb,
  p_idempotency_key text DEFAULT NULL::text,
  p_qualifies_for_engagement boolean DEFAULT true
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'app'
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

  RETURN v_activity_id;
END;
$$;

CREATE OR REPLACE FUNCTION app.trg_post_sync_rebuild()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'app'
SET statement_timeout TO '0'
AS $function$
DECLARE
  v_days int;
BEGIN
  IF OLD.status IS DISTINCT FROM 'completed' AND NEW.status = 'completed' THEN
    IF NEW.master_job_id IS NOT NULL THEN
      RETURN NEW;
    END IF;

    IF NEW.job_type = 'initial_transactional'
       AND NEW.phase IN ('estimates', 'orders', 'invoices') THEN
      UPDATE app.integration_sync_jobs
      SET
        progress = COALESCE(progress, '{}'::jsonb) || jsonb_build_object(
          'meta',
          COALESCE(progress->'meta', '{}'::jsonb) || jsonb_build_object(
            'post_sync_rebuild_deferred', false,
            'post_sync_rebuild_skipped_reason', 'initial_transactional_waiting_for_line_items'
          )
        ),
        updated_at = now()
      WHERE id = NEW.id;
      RETURN NEW;
    END IF;

    v_days := app.sync_job_rebuild_days(NEW.job_type, NEW.since_date, 2);

    UPDATE app.integration_sync_jobs
    SET
      error_log = NULL,
      progress = COALESCE(progress, '{}'::jsonb) || jsonb_build_object(
        'meta',
        COALESCE(progress->'meta', '{}'::jsonb) || jsonb_build_object(
          'post_sync_rebuild_deferred', true,
          'post_sync_rebuild_days', v_days,
          'post_sync_rebuild_deferred_at', now()
        )
      ),
      updated_at = now()
    WHERE id = NEW.id;
  END IF;
  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION app.refresh_buyers_snapshot_for_buyer(uuid, uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION app.refresh_buyers_snapshot_for_buyer(uuid, uuid) TO authenticated;
GRANT ALL ON FUNCTION app.refresh_buyers_snapshot_for_buyer(uuid, uuid) TO service_role;

REVOKE ALL ON FUNCTION app.refresh_buyer_current_snapshot_for_buyer(uuid, uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION app.refresh_buyer_current_snapshot_for_buyer(uuid, uuid) TO authenticated;
GRANT ALL ON FUNCTION app.refresh_buyer_current_snapshot_for_buyer(uuid, uuid) TO service_role;
