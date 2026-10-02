-- The existing-buyer access-request snapshot (20261001141338_existing_buyer_access_request.sql) read
-- metrics_buyer_period_summary / metrics_buyer_now_summary and treated a MISSING row as "no activity".
-- That is only true for the period summary's writer (it skips zero-activity buyers); the summary rows
-- are also simply absent when the metrics tick has not reached a buyer. Prod showed buyer 529e62f0
-- (24 invoices) as "0 invoices", and ~47% of disabled buyers with invoices have no now-summary row.
--
-- Fix: move the snapshot into app.existing_buyer_context_snapshot(buyer) and, per section, fall back to
-- a bounded live query for that ONE buyer when its summary row(s) are missing:
--   * sales/demand: either quarter row missing -> live over [previous quarter start, next quarter start),
--     filtered by tenant_id + buyer_id and served by the (tenant_id, buyer_id, metric_day_ist(...)) indexes
--     on invoices/estimates/orders (tracked in 20261002020812_track_buyer_metric_day_indexes.sql);
--   * dues: now-summary row missing -> live over invoices with outstanding_balance > 0
--     (invoices_now_buyer_receivable_idx), same status helpers as the summary builder.
-- The snapshot records which source each section used (`sources`) so the UI can say "live figures".
-- This is a single-buyer, indexed read for a human-triggered action (documented detail-preview
-- exception in .claude/rules/metrics.md), not a KPI aggregate.

CREATE OR REPLACE FUNCTION app.existing_buyer_context_snapshot(p_buyer_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'app', 'public'
AS $function$
DECLARE
  v_buyer app.buyers%ROWTYPE;
  v_primary text;
  v_cur_start date := date_trunc('quarter', (now() AT TIME ZONE 'Asia/Kolkata'))::date;
  v_prev_start date;
  v_next_start date;
  v_cur app.metrics_buyer_period_summary%ROWTYPE;
  v_prev app.metrics_buyer_period_summary%ROWTYPE;
  v_now app.metrics_buyer_now_summary%ROWTYPE;
  v_period_live boolean;
  v_dues_live boolean;
  v_inv_cur_value numeric := 0; v_inv_cur_count bigint := 0;
  v_inv_prev_value numeric := 0; v_inv_prev_count bigint := 0;
  v_dem_cur_value numeric := 0; v_dem_cur_count bigint := 0;
  v_dem_prev_value numeric := 0; v_dem_prev_count bigint := 0;
  v_receivable numeric := 0; v_receivable_count bigint := 0;
  v_overdue numeric := 0; v_overdue_count bigint := 0;
  v_last_invoice_date date;
  v_credit_limit numeric;
  v_credit_available numeric;
  v_app_activity timestamptz;
  v_summary_at timestamptz[] := ARRAY[]::timestamptz[];
BEGIN
  v_prev_start := (v_cur_start - interval '3 months')::date;
  v_next_start := (v_cur_start + interval '3 months')::date;

  SELECT * INTO v_buyer FROM app.buyers WHERE id = p_buyer_id AND deleted_at IS NULL;
  IF v_buyer.id IS NULL THEN
    RETURN NULL;
  END IF;

  v_primary := app.metrics_v4_primary_demand_kind(v_buyer.tenant_id);

  SELECT * INTO v_cur
  FROM app.metrics_buyer_period_summary s
  WHERE s.tenant_id = v_buyer.tenant_id AND s.buyer_id = v_buyer.id
    AND s.grain = 'quarter' AND s.period_start = v_cur_start AND s.deleted_at IS NULL;

  SELECT * INTO v_prev
  FROM app.metrics_buyer_period_summary s
  WHERE s.tenant_id = v_buyer.tenant_id AND s.buyer_id = v_buyer.id
    AND s.grain = 'quarter' AND s.period_start = v_prev_start AND s.deleted_at IS NULL;

  SELECT * INTO v_now
  FROM app.metrics_buyer_now_summary s
  WHERE s.tenant_id = v_buyer.tenant_id AND s.buyer_id = v_buyer.id AND s.deleted_at IS NULL;

  v_period_live := v_cur.id IS NULL OR v_prev.id IS NULL;
  v_dues_live := v_now.id IS NULL;

  IF v_period_live THEN
    SELECT
      COALESCE(SUM(x.total_amount) FILTER (WHERE x.d >= v_cur_start), 0),
      COUNT(*) FILTER (WHERE x.d >= v_cur_start),
      COALESCE(SUM(x.total_amount) FILTER (WHERE x.d < v_cur_start), 0),
      COUNT(*) FILTER (WHERE x.d < v_cur_start)
    INTO v_inv_cur_value, v_inv_cur_count, v_inv_prev_value, v_inv_prev_count
    FROM (
      SELECT i.total_amount, app.metric_day_ist(i.invoice_date, i.created_at) AS d
      FROM app.invoices i
      WHERE i.tenant_id = v_buyer.tenant_id AND i.buyer_id = v_buyer.id AND i.deleted_at IS NULL
        AND app.metric_day_ist(i.invoice_date, i.created_at) >= v_prev_start
        AND app.metric_day_ist(i.invoice_date, i.created_at) < v_next_start
        AND app.invoice_status_gmv_included(i.status)
    ) x;

    IF v_primary = 'orders' THEN
      SELECT
        COALESCE(SUM(x.total_amount) FILTER (WHERE x.d >= v_cur_start), 0),
        COUNT(*) FILTER (WHERE x.d >= v_cur_start),
        COALESCE(SUM(x.total_amount) FILTER (WHERE x.d < v_cur_start), 0),
        COUNT(*) FILTER (WHERE x.d < v_cur_start)
      INTO v_dem_cur_value, v_dem_cur_count, v_dem_prev_value, v_dem_prev_count
      FROM (
        SELECT o.total_amount, app.metric_day_ist(o.order_date, o.created_at) AS d
        FROM app.orders o
        WHERE o.tenant_id = v_buyer.tenant_id AND o.buyer_id = v_buyer.id AND o.deleted_at IS NULL
          AND app.metric_day_ist(o.order_date, o.created_at) >= v_prev_start
          AND app.metric_day_ist(o.order_date, o.created_at) < v_next_start
          AND app.order_status_in_flow(o.status)
      ) x;
    ELSIF v_primary = 'estimates' THEN
      SELECT
        COALESCE(SUM(x.total_amount) FILTER (WHERE x.d >= v_cur_start), 0),
        COUNT(*) FILTER (WHERE x.d >= v_cur_start),
        COALESCE(SUM(x.total_amount) FILTER (WHERE x.d < v_cur_start), 0),
        COUNT(*) FILTER (WHERE x.d < v_cur_start)
      INTO v_dem_cur_value, v_dem_cur_count, v_dem_prev_value, v_dem_prev_count
      FROM (
        SELECT e.total_amount, app.metric_day_ist(e.estimate_date, e.created_at) AS d
        FROM app.estimates e
        WHERE e.tenant_id = v_buyer.tenant_id AND e.buyer_id = v_buyer.id AND e.deleted_at IS NULL
          AND app.metric_day_ist(e.estimate_date, e.created_at) >= v_prev_start
          AND app.metric_day_ist(e.estimate_date, e.created_at) < v_next_start
          AND app.estimate_status_counts_as_demand(e.status)
      ) x;
    END IF;
  ELSE
    v_inv_cur_value := COALESCE(v_cur.invoice_value, 0);
    v_inv_cur_count := COALESCE(v_cur.invoice_count, 0);
    v_inv_prev_value := COALESCE(v_prev.invoice_value, 0);
    v_inv_prev_count := COALESCE(v_prev.invoice_count, 0);
    v_dem_cur_value := COALESCE(v_cur.primary_demand_value, 0);
    v_dem_cur_count := COALESCE(v_cur.primary_demand_count, 0);
    v_dem_prev_value := COALESCE(v_prev.primary_demand_value, 0);
    v_dem_prev_count := COALESCE(v_prev.primary_demand_count, 0);
    v_summary_at := v_summary_at || v_cur.computed_at || v_prev.computed_at;
  END IF;

  IF v_dues_live THEN
    -- Mirrors the metrics_buyer_now_summary builder (details_v4_now_summaries): only invoices with
    -- an outstanding balance, receivable/overdue via the shared status helpers.
    SELECT
      COALESCE(SUM(i.outstanding_balance) FILTER (WHERE app.invoice_status_has_receivable(i.status, i.outstanding_balance)), 0),
      COUNT(*) FILTER (WHERE app.invoice_status_has_receivable(i.status, i.outstanding_balance)),
      COALESCE(SUM(i.outstanding_balance) FILTER (WHERE app.invoice_is_overdue(i.status, i.due_date, i.outstanding_balance)), 0),
      COUNT(*) FILTER (WHERE app.invoice_is_overdue(i.status, i.due_date, i.outstanding_balance))
    INTO v_receivable, v_receivable_count, v_overdue, v_overdue_count
    FROM app.invoices i
    WHERE i.tenant_id = v_buyer.tenant_id AND i.buyer_id = v_buyer.id AND i.deleted_at IS NULL
      AND i.outstanding_balance > 0;

    SELECT MAX(app.metric_day_ist(i.invoice_date, i.created_at)) INTO v_last_invoice_date
    FROM app.invoices i
    WHERE i.tenant_id = v_buyer.tenant_id AND i.buyer_id = v_buyer.id AND i.deleted_at IS NULL;

    v_credit_limit := COALESCE(v_buyer.credit_limit, 0);
    v_credit_available := v_credit_limit - v_receivable;
    v_app_activity := NULL;
  ELSE
    v_receivable := COALESCE(v_now.receivable_amount, 0);
    v_receivable_count := COALESCE(v_now.receivable_invoice_count, 0);
    v_overdue := COALESCE(v_now.overdue_amount, 0);
    v_overdue_count := COALESCE(v_now.overdue_invoice_count, 0);
    v_last_invoice_date := v_now.last_invoice_date;
    v_credit_limit := COALESCE(v_now.credit_limit, v_buyer.credit_limit, 0);
    v_credit_available := v_now.credit_available;
    v_app_activity := v_now.last_buyer_app_activity_at;
    v_summary_at := v_summary_at || v_now.computed_at;
  END IF;

  RETURN jsonb_build_object(
    'current_quarter_start', v_cur_start,
    'previous_quarter_start', v_prev_start,
    'sales', jsonb_build_object(
      'current', jsonb_build_object('invoice_value', v_inv_cur_value, 'invoice_count', v_inv_cur_count),
      'previous', jsonb_build_object('invoice_value', v_inv_prev_value, 'invoice_count', v_inv_prev_count)
    ),
    'demand', jsonb_build_object(
      'kind', v_primary,
      'current', jsonb_build_object('value', v_dem_cur_value, 'count', v_dem_cur_count),
      'previous', jsonb_build_object('value', v_dem_prev_value, 'count', v_dem_prev_count)
    ),
    'dues', jsonb_build_object(
      'receivable_amount', v_receivable,
      'receivable_invoice_count', v_receivable_count,
      'overdue_amount', v_overdue,
      'overdue_invoice_count', v_overdue_count,
      'credit_limit', v_credit_limit,
      'credit_available', v_credit_available,
      'last_invoice_date', v_last_invoice_date,
      'last_buyer_app_activity_at', v_app_activity
    ),
    'sources', jsonb_build_object(
      'period', CASE WHEN v_period_live THEN 'live' ELSE 'summary' END,
      'dues', CASE WHEN v_dues_live THEN 'live' ELSE 'summary' END
    ),
    -- Stalest summary timestamp actually used; null when every section was computed live.
    'computed_at', (SELECT MIN(t) FROM unnest(v_summary_at) AS t),
    'generated_at', now()
  );
END;
$function$;

REVOKE ALL ON FUNCTION app.existing_buyer_context_snapshot(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION app.existing_buyer_context_snapshot(uuid) TO service_role;

-- request_buyer_app_access: same behaviour, snapshot now comes from the helper above.
CREATE OR REPLACE FUNCTION app.request_buyer_app_access(p_buyer_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'app', 'public'
AS $function$
DECLARE
  v_buyer app.buyers%ROWTYPE;
  v_dedupe_key text;
  v_existing app.entries%ROWTYPE;
  v_metadata jsonb;
  v_entry_id uuid;
BEGIN
  SELECT * INTO v_buyer
  FROM app.buyers
  WHERE id = p_buyer_id
    AND deleted_at IS NULL
  FOR UPDATE;

  IF v_buyer.id IS NULL THEN
    RAISE EXCEPTION 'buyer_not_found' USING ERRCODE = '02000';
  END IF;

  IF COALESCE(v_buyer.buyer_app_enabled, true) THEN
    RAISE EXCEPTION 'buyer_app_already_enabled' USING ERRCODE = '22023';
  END IF;

  IF v_buyer.custom_fields->>'storefront_self_registered' = 'true' THEN
    RAISE EXCEPTION 'not_an_existing_buyer' USING ERRCODE = '22023';
  END IF;

  IF v_buyer.onboarding_status = 'declined' THEN
    RAISE EXCEPTION 'access_request_declined' USING ERRCODE = '22023';
  END IF;

  v_dedupe_key := concat_ws(':', v_buyer.tenant_id::text, 'business_approval', 'buyer', v_buyer.id::text);

  SELECT * INTO v_existing
  FROM app.entries e
  WHERE e.tenant_id = v_buyer.tenant_id
    AND e.dedupe_key = v_dedupe_key
    AND e.deleted_at IS NULL;

  -- Already asked and the seller has not acted yet (new/opened/in_progress/waiting): nothing to redo.
  IF v_existing.id IS NOT NULL
     AND v_existing.status <> 'resolved'
     AND v_existing.metadata->>'request_kind' = 'existing_buyer_access' THEN
    RETURN jsonb_build_object('entry_id', v_existing.id, 'already_requested', true);
  END IF;

  v_metadata := jsonb_build_object(
    'request_kind', 'existing_buyer_access',
    'existing_buyer', true,
    'app_access_disabled', true,
    'business_name', v_buyer.business_name,
    'contact_name', v_buyer.contact_name,
    'phone', v_buyer.phone,
    'gstin', v_buyer.gstin,
    'has_business_details', true,
    'buyer_context', app.existing_buyer_context_snapshot(v_buyer.id),
    'requested_at', now()
  );

  INSERT INTO app.entries (
    tenant_id, buyer_id, location_id, entry_type, source_channel,
    source_entity_type, source_entity_id, dedupe_key, status, priority_at,
    external_sync_status, metadata, external_ref, created_by, updated_by
  )
  VALUES (
    v_buyer.tenant_id, v_buyer.id, NULL, 'business_approval', 'storefront',
    'buyer', v_buyer.id, v_dedupe_key, 'new', now(),
    'pending', v_metadata, v_dedupe_key, v_buyer.user_id, v_buyer.user_id
  )
  ON CONFLICT (tenant_id, dedupe_key) WHERE deleted_at IS NULL
  DO UPDATE SET
    status = 'new',
    remind_at = NULL,
    resolution_reason = NULL,
    resolved_at = NULL,
    resolved_by = NULL,
    priority_at = now(),
    metadata = app.entries.metadata || EXCLUDED.metadata,
    updated_by = EXCLUDED.updated_by
  RETURNING id INTO v_entry_id;

  INSERT INTO app.entry_events (
    tenant_id, entry_id, actor_user_id, action, from_status, to_status, metadata, created_by, updated_by
  )
  VALUES (
    v_buyer.tenant_id, v_entry_id, NULL,
    CASE WHEN v_existing.id IS NULL THEN 'generated' ELSE 'reopen' END,
    v_existing.status,
    'new',
    jsonb_build_object('entry_type', 'business_approval', 'source_channel', 'storefront', 'request_kind', 'existing_buyer_access'),
    NULL, NULL
  );

  UPDATE app.buyers
  SET custom_fields = COALESCE(custom_fields, '{}'::jsonb) || jsonb_build_object('access_requested_at', now()),
      updated_at = now(),
      updated_by = v_buyer.user_id
  WHERE id = v_buyer.id;

  RETURN jsonb_build_object('entry_id', v_entry_id, 'already_requested', false);
END;
$function$;

REVOKE ALL ON FUNCTION app.request_buyer_app_access(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION app.request_buyer_app_access(uuid) TO service_role;

-- Refresh the snapshot of access requests that are still open, so entries raised before this fix
-- (with zeros from missing summary rows) show real numbers. Open requests only; resolved ones keep
-- the numbers the seller decided on.
UPDATE app.entries e
SET metadata = e.metadata || jsonb_build_object('buyer_context', snap.ctx),
    updated_at = now()
FROM (
  SELECT x.id, app.existing_buyer_context_snapshot(x.source_entity_id) AS ctx
  FROM app.entries x
  WHERE x.entry_type = 'business_approval'
    AND x.source_entity_type = 'buyer'
    AND x.metadata->>'request_kind' = 'existing_buyer_access'
    AND x.status <> 'resolved'
    AND x.deleted_at IS NULL
) snap
WHERE e.id = snap.id
  AND snap.ctx IS NOT NULL;
