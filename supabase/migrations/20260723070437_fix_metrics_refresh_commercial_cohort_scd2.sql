-- cohort_members can now have historical (closed) rows for a (cohort_id, buyer_id) pair
-- after the SCD2 migration. app._metrics_refresh_commercial's has_active_price_list /
-- has_active_cohort EXISTS checks must only match the buyer's currently-active cohort
-- membership, or a buyer who left a cohort would keep showing has_active_cohort=true /
-- keep matching cohort-targeted price lists indefinitely. Full function body reproduced
-- verbatim from supabase/migrations/20260716050114_metrics_v2_phase_3_manual_refresh_kernel.sql
-- with only the two cohort_members joins patched (cm.valid_until IS NULL added).

CREATE OR REPLACE FUNCTION app._metrics_refresh_commercial(
  p_owner_token uuid,
  p_fencing_epoch bigint,
  p_tenant_id uuid
)
RETURNS TABLE (rows_written integer, statement_groups integer, source_watermark timestamptz)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, app, pg_temp
AS $$
DECLARE
  v_now timestamptz := clock_timestamp();
  v_today date := (clock_timestamp() AT TIME ZONE 'Asia/Kolkata')::date;
  v_month date := date_trunc('month', clock_timestamp() AT TIME ZONE 'Asia/Kolkata')::date;
  v_rows integer := 0;
  v_count integer;
  v_watermark timestamptz;
BEGIN
  PERFORM app._metrics_assert_refresh_fence(p_owner_token, p_fencing_epoch, p_tenant_id, 'commercial');
  -- Range cursor_kind progresses 'buyer' -> 'location' -> 'day' -> 'done'; the
  -- location/day stages are executed by _metrics_refresh_location_scopes.

  SELECT MAX(x.updated_at) INTO v_watermark
  FROM (
    SELECT MAX(e.updated_at) AS updated_at FROM app.estimates e WHERE e.tenant_id = p_tenant_id
    UNION ALL SELECT MAX(o.updated_at) FROM app.orders o WHERE o.tenant_id = p_tenant_id
    UNION ALL SELECT MAX(i.updated_at) FROM app.invoices i WHERE i.tenant_id = p_tenant_id
  ) x;

  INSERT INTO app.metrics_tenant_commercial_snapshot (
    tenant_id, external_ref, calendar_month,
    current_month_estimate_count, current_month_estimate_value,
    current_month_order_count, current_month_order_value,
    current_month_invoice_count, current_month_invoice_value,
    open_estimate_count, open_estimate_value, open_order_count, open_order_value,
    receivable_invoice_count, receivable_amount, overdue_invoice_count, overdue_amount,
    purchasing_buyers_90d, source_watermark, computed_at, calculation_version,
    generation_id, updated_at, deleted_at, fencing_epoch
  )
  WITH estimate_rollup AS (
    SELECT
      COUNT(*) FILTER (WHERE app.metric_day_ist(e.estimate_date, e.created_at) BETWEEN v_month AND v_today) AS month_count,
      COALESCE(SUM(e.total_amount) FILTER (WHERE app.metric_day_ist(e.estimate_date, e.created_at) BETWEEN v_month AND v_today), 0) AS month_value,
      COUNT(*) FILTER (WHERE app.estimate_status_is_open(e.status)) AS open_count,
      COALESCE(SUM(e.total_amount) FILTER (WHERE app.estimate_status_is_open(e.status)), 0) AS open_value
    FROM app.estimates e
    WHERE e.tenant_id = p_tenant_id AND e.deleted_at IS NULL
  ), order_rollup AS (
    SELECT
      COUNT(*) FILTER (WHERE app.metric_day_ist(o.order_date, o.created_at) BETWEEN v_month AND v_today AND app.order_status_in_flow(o.status)) AS month_count,
      COALESCE(SUM(o.total_amount) FILTER (WHERE app.metric_day_ist(o.order_date, o.created_at) BETWEEN v_month AND v_today AND app.order_status_in_flow(o.status)), 0) AS month_value,
      COUNT(*) FILTER (WHERE app.order_status_is_open(o.status)) AS open_count,
      COALESCE(SUM(o.total_amount) FILTER (WHERE app.order_status_is_open(o.status)), 0) AS open_value
    FROM app.orders o
    WHERE o.tenant_id = p_tenant_id AND o.deleted_at IS NULL
  ), invoice_rollup AS (
    SELECT
      COUNT(*) FILTER (WHERE app.metric_day_ist(i.invoice_date, i.created_at) BETWEEN v_month AND v_today AND app.invoice_status_gmv_included(i.status)) AS month_count,
      COALESCE(SUM(i.total_amount) FILTER (WHERE app.metric_day_ist(i.invoice_date, i.created_at) BETWEEN v_month AND v_today AND app.invoice_status_gmv_included(i.status)), 0) AS month_value,
      COUNT(*) FILTER (WHERE app.invoice_status_has_receivable(i.status, i.outstanding_balance)) AS receivable_count,
      COALESCE(SUM(i.outstanding_balance) FILTER (WHERE app.invoice_status_has_receivable(i.status, i.outstanding_balance)), 0) AS receivable_value,
      COUNT(*) FILTER (WHERE app.invoice_is_overdue(i.status, i.due_date, i.outstanding_balance)) AS overdue_count,
      COALESCE(SUM(i.outstanding_balance) FILTER (WHERE app.invoice_is_overdue(i.status, i.due_date, i.outstanding_balance)), 0) AS overdue_value,
      COUNT(DISTINCT i.buyer_id) FILTER (
        WHERE app.metric_day_ist(i.invoice_date, i.created_at) >= v_today - 89
          AND app.invoice_status_gmv_included(i.status)
      ) AS buyers_90d
    FROM app.invoices i
    WHERE i.tenant_id = p_tenant_id AND i.deleted_at IS NULL
  )
  SELECT p_tenant_id, 'metrics:tenant:commercial:' || p_tenant_id::text, v_month,
    er.month_count, er.month_value, orx.month_count, orx.month_value,
    ir.month_count, ir.month_value, er.open_count, er.open_value,
    orx.open_count, orx.open_value, ir.receivable_count, ir.receivable_value,
    ir.overdue_count, ir.overdue_value, ir.buyers_90d, v_watermark, v_now, 1,
    gen_random_uuid(), v_now, NULL, p_fencing_epoch
  FROM estimate_rollup er CROSS JOIN order_rollup orx CROSS JOIN invoice_rollup ir
  ON CONFLICT (tenant_id) WHERE deleted_at IS NULL DO UPDATE SET
    calendar_month = EXCLUDED.calendar_month,
    current_month_estimate_count = EXCLUDED.current_month_estimate_count,
    current_month_estimate_value = EXCLUDED.current_month_estimate_value,
    current_month_order_count = EXCLUDED.current_month_order_count,
    current_month_order_value = EXCLUDED.current_month_order_value,
    current_month_invoice_count = EXCLUDED.current_month_invoice_count,
    current_month_invoice_value = EXCLUDED.current_month_invoice_value,
    open_estimate_count = EXCLUDED.open_estimate_count,
    open_estimate_value = EXCLUDED.open_estimate_value,
    open_order_count = EXCLUDED.open_order_count,
    open_order_value = EXCLUDED.open_order_value,
    receivable_invoice_count = EXCLUDED.receivable_invoice_count,
    receivable_amount = EXCLUDED.receivable_amount,
    overdue_invoice_count = EXCLUDED.overdue_invoice_count,
    overdue_amount = EXCLUDED.overdue_amount,
    purchasing_buyers_90d = EXCLUDED.purchasing_buyers_90d,
    source_watermark = EXCLUDED.source_watermark,
    computed_at = EXCLUDED.computed_at,
    generation_id = EXCLUDED.generation_id,
    updated_at = EXCLUDED.updated_at,
    fencing_epoch = EXCLUDED.fencing_epoch
  WHERE ROW(
    app.metrics_tenant_commercial_snapshot.calendar_month,
    app.metrics_tenant_commercial_snapshot.current_month_estimate_count,
    app.metrics_tenant_commercial_snapshot.current_month_estimate_value,
    app.metrics_tenant_commercial_snapshot.current_month_order_count,
    app.metrics_tenant_commercial_snapshot.current_month_order_value,
    app.metrics_tenant_commercial_snapshot.current_month_invoice_count,
    app.metrics_tenant_commercial_snapshot.current_month_invoice_value,
    app.metrics_tenant_commercial_snapshot.open_estimate_count,
    app.metrics_tenant_commercial_snapshot.open_estimate_value,
    app.metrics_tenant_commercial_snapshot.open_order_count,
    app.metrics_tenant_commercial_snapshot.open_order_value,
    app.metrics_tenant_commercial_snapshot.receivable_invoice_count,
    app.metrics_tenant_commercial_snapshot.receivable_amount,
    app.metrics_tenant_commercial_snapshot.overdue_invoice_count,
    app.metrics_tenant_commercial_snapshot.overdue_amount,
    app.metrics_tenant_commercial_snapshot.purchasing_buyers_90d,
    app.metrics_tenant_commercial_snapshot.source_watermark
  ) IS DISTINCT FROM ROW(
    EXCLUDED.calendar_month, EXCLUDED.current_month_estimate_count, EXCLUDED.current_month_estimate_value,
    EXCLUDED.current_month_order_count, EXCLUDED.current_month_order_value,
    EXCLUDED.current_month_invoice_count, EXCLUDED.current_month_invoice_value,
    EXCLUDED.open_estimate_count, EXCLUDED.open_estimate_value,
    EXCLUDED.open_order_count, EXCLUDED.open_order_value,
    EXCLUDED.receivable_invoice_count, EXCLUDED.receivable_amount,
    EXCLUDED.overdue_invoice_count, EXCLUDED.overdue_amount,
    EXCLUDED.purchasing_buyers_90d, EXCLUDED.source_watermark
  );
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_rows := v_rows + v_count;

  -- Exact buyer refresh keys come from scalar invalidations; range/sync work
  -- additionally discovers current buyers in its bounded date window.
  CREATE TEMP TABLE IF NOT EXISTS pg_temp.metrics_buyer_keys (id uuid PRIMARY KEY) ON COMMIT DROP;
  TRUNCATE pg_temp.metrics_buyer_keys;
  INSERT INTO pg_temp.metrics_buyer_keys(id)
  SELECT id FROM (
    SELECT mdw.old_buyer_id AS id FROM app.metrics_dirty_work mdw
      WHERE mdw.lease_owner = p_owner_token AND mdw.claimed_version IS NOT NULL
    UNION SELECT mdw.new_buyer_id FROM app.metrics_dirty_work mdw
      WHERE mdw.lease_owner = p_owner_token AND mdw.claimed_version IS NOT NULL
    UNION SELECT e.buyer_id FROM app.estimates e JOIN app.metrics_dirty_work w
      ON w.lease_owner = p_owner_token AND w.dirty_from IS NOT NULL
        AND current_setting('app.metrics_cursor_stage', true) = 'buyer'
      WHERE e.tenant_id = p_tenant_id AND e.deleted_at IS NULL
        AND app.metric_day_ist(e.estimate_date, e.created_at) BETWEEN w.dirty_from AND COALESCE(w.dirty_to, w.dirty_from)
        AND (w.cursor_id IS NULL OR e.buyer_id > w.cursor_id)
    UNION SELECT o.buyer_id FROM app.orders o JOIN app.metrics_dirty_work w
      ON w.lease_owner = p_owner_token AND w.dirty_from IS NOT NULL
        AND current_setting('app.metrics_cursor_stage', true) = 'buyer'
      WHERE o.tenant_id = p_tenant_id AND o.deleted_at IS NULL
        AND app.metric_day_ist(o.order_date, o.created_at) BETWEEN w.dirty_from AND COALESCE(w.dirty_to, w.dirty_from)
        AND (w.cursor_id IS NULL OR o.buyer_id > w.cursor_id)
    UNION SELECT i.buyer_id FROM app.invoices i JOIN app.metrics_dirty_work w
      ON w.lease_owner = p_owner_token AND w.dirty_from IS NOT NULL
        AND current_setting('app.metrics_cursor_stage', true) = 'buyer'
      WHERE i.tenant_id = p_tenant_id AND i.deleted_at IS NULL
        AND app.metric_day_ist(i.invoice_date, i.created_at) BETWEEN w.dirty_from AND COALESCE(w.dirty_to, w.dirty_from)
        AND (w.cursor_id IS NULL OR i.buyer_id > w.cursor_id)
    UNION SELECT b.id FROM app.buyers b JOIN app.metrics_dirty_work w
      ON w.lease_owner = p_owner_token AND w.dirty_from IS NOT NULL
        AND current_setting('app.metrics_cursor_stage', true) = 'buyer'
      WHERE b.tenant_id = p_tenant_id
        AND b.updated_at::date BETWEEN w.dirty_from AND COALESCE(w.dirty_to, w.dirty_from)
        AND (w.cursor_id IS NULL OR b.id > w.cursor_id)
    UNION SELECT s.buyer_id FROM app.metrics_buyer_snapshot s JOIN app.metrics_dirty_work w
      ON w.lease_owner = p_owner_token AND w.dirty_from IS NOT NULL
        AND current_setting('app.metrics_cursor_stage', true) = 'buyer'
      WHERE s.tenant_id = p_tenant_id AND s.deleted_at IS NULL
        AND (w.cursor_id IS NULL OR s.buyer_id > w.cursor_id)
  ) keys WHERE id IS NOT NULL ORDER BY id LIMIT 100
  ON CONFLICT DO NOTHING;

  UPDATE app.metrics_dirty_work w
  SET cursor_id = CASE WHEN (SELECT COUNT(*) FROM pg_temp.metrics_buyer_keys) >= 100
      THEN (SELECT id FROM pg_temp.metrics_buyer_keys ORDER BY id DESC LIMIT 1) ELSE NULL END,
    cursor_kind = CASE WHEN (SELECT COUNT(*) FROM pg_temp.metrics_buyer_keys) >= 100
      THEN 'buyer' ELSE 'location' END,
    updated_at = clock_timestamp()
  WHERE w.lease_owner = p_owner_token AND w.state = 'claimed'
    AND w.claimed_version = w.dirty_version AND w.dirty_from IS NOT NULL
    AND current_setting('app.metrics_cursor_stage', true) = 'buyer';

  UPDATE app.metrics_buyer_snapshot s
  SET deleted_at = v_now, updated_at = v_now, computed_at = v_now,
      generation_id = gen_random_uuid(), fencing_epoch = p_fencing_epoch
  FROM app.buyers b
  JOIN pg_temp.metrics_buyer_keys k ON k.id = b.id
  WHERE s.tenant_id = p_tenant_id AND s.buyer_id = b.id
    AND s.deleted_at IS NULL AND b.tenant_id = p_tenant_id AND b.deleted_at IS NOT NULL;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_rows := v_rows + v_count;

  INSERT INTO app.metrics_buyer_snapshot (
    tenant_id, buyer_id, external_ref,
    invoice_count_90d, invoice_value_90d, prior_year_invoice_value_90d,
    estimate_count_90d, estimate_value_90d, order_count_90d, order_value_90d,
    last_invoice_at, last_estimate_at, last_order_at, last_buyer_app_activity_at,
    receivable_amount, overdue_amount, oldest_due_at, credit_limit, credit_available,
    buyer_app_enabled, has_active_price_list, has_active_cohort, health_reason,
    app_invoice_value_90d, assisted_invoice_value_90d,
    source_watermark, computed_at, calculation_version, generation_id,
    updated_at, deleted_at, fencing_epoch
  )
  SELECT b.tenant_id, b.id, 'metrics:buyer:' || b.id::text,
    COALESCE(ir.cnt90, 0), COALESCE(ir.value90, 0), COALESCE(ir.prior_value90, 0),
    COALESCE(er.cnt90, 0), COALESCE(er.value90, 0), COALESCE(orx.cnt90, 0), COALESCE(orx.value90, 0),
    ir.last_at, er.last_at, orx.last_at, ba.last_at,
    COALESCE(ir.receivable, 0), COALESCE(ir.overdue, 0), ir.oldest_due,
    COALESCE(b.credit_limit, 0),
    GREATEST(COALESCE(b.credit_limit, 0) - COALESCE(ir.receivable, 0), 0),
    b.buyer_app_enabled,
    EXISTS (
      SELECT 1 FROM app.price_list_assignments pla
      JOIN app.price_lists pl ON pl.id = pla.price_list_id
      WHERE pl.tenant_id = b.tenant_id AND pl.deleted_at IS NULL AND pl.is_active
        AND pla.deleted_at IS NULL
        AND ((pla.target_type = 'buyer' AND pla.target_id = b.id)
          OR (pla.target_type = 'all_buyers')
          OR (pla.target_type = 'cohort' AND EXISTS (
            SELECT 1 FROM app.cohort_members cm WHERE cm.cohort_id = pla.target_id AND cm.buyer_id = b.id AND cm.valid_until IS NULL
          )))
    ),
    EXISTS (
      SELECT 1 FROM app.cohort_members cm JOIN app.cohorts c ON c.id = cm.cohort_id AND cm.valid_until IS NULL
      WHERE cm.buyer_id = b.id AND c.tenant_id = b.tenant_id AND c.deleted_at IS NULL
    ),
    CASE
      WHEN b.deleted_at IS NOT NULL OR NOT COALESCE(b.is_active, true) THEN 'inactive'
      WHEN COALESCE(ir.overdue, 0) > 0 THEN 'overdue'
      WHEN COALESCE(ir.receivable, 0) > COALESCE(b.credit_limit, 0) AND COALESCE(b.credit_limit, 0) > 0 THEN 'credit_exceeded'
      WHEN NOT b.buyer_app_enabled THEN 'no_app_access'
      WHEN ir.last_at IS NULL AND er.last_at IS NULL AND orx.last_at IS NULL THEN 'insufficient_history'
      ELSE 'healthy'
    END,
    COALESCE(ir.app_value90, 0), COALESCE(ir.assisted_value90, 0),
    GREATEST(b.updated_at, ir.watermark, er.watermark, orx.watermark, ba.watermark),
    v_now, 1, gen_random_uuid(), v_now, b.deleted_at, p_fencing_epoch
  FROM app.buyers b
  JOIN pg_temp.metrics_buyer_keys k ON k.id = b.id
  LEFT JOIN LATERAL (
    SELECT COUNT(*) FILTER (WHERE app.metric_day_ist(i.invoice_date, i.created_at) >= v_today - 89 AND app.invoice_status_gmv_included(i.status)) AS cnt90,
      COALESCE(SUM(i.total_amount) FILTER (WHERE app.metric_day_ist(i.invoice_date, i.created_at) >= v_today - 89 AND app.invoice_status_gmv_included(i.status)), 0) AS value90,
      COALESCE(SUM(i.total_amount) FILTER (WHERE app.metric_day_ist(i.invoice_date, i.created_at) BETWEEN v_today - 454 AND v_today - 365 AND app.invoice_status_gmv_included(i.status)), 0) AS prior_value90,
      MAX(app.metric_day_ist(i.invoice_date, i.created_at)::timestamp AT TIME ZONE 'Asia/Kolkata')
        FILTER (WHERE app.invoice_status_gmv_included(i.status)) AS last_at,
      COALESCE(SUM(i.outstanding_balance) FILTER (WHERE app.invoice_status_has_receivable(i.status, i.outstanding_balance)), 0) AS receivable,
      COALESCE(SUM(i.outstanding_balance) FILTER (WHERE app.invoice_is_overdue(i.status, i.due_date, i.outstanding_balance)), 0) AS overdue,
      MIN(i.due_date) FILTER (WHERE app.invoice_status_has_receivable(i.status, i.outstanding_balance)) AS oldest_due,
      COALESCE(SUM(i.total_amount) FILTER (WHERE app.metric_day_ist(i.invoice_date, i.created_at) >= v_today - 89 AND i.is_buyer_app_invoice AND app.invoice_status_gmv_included(i.status)), 0) AS app_value90,
      COALESCE(SUM(i.total_amount) FILTER (WHERE app.metric_day_ist(i.invoice_date, i.created_at) >= v_today - 89 AND NOT i.is_buyer_app_invoice AND app.invoice_status_gmv_included(i.status) AND EXISTS (
        SELECT 1 FROM app.orders linked_o WHERE linked_o.id = i.order_id AND linked_o.is_buyer_app_order
      )), 0) AS assisted_value90,
      MAX(i.updated_at) AS watermark
    FROM app.invoices i WHERE i.tenant_id = p_tenant_id AND i.buyer_id = b.id AND i.deleted_at IS NULL
  ) ir ON true
  LEFT JOIN LATERAL (
    SELECT COUNT(*) FILTER (WHERE app.metric_day_ist(e.estimate_date, e.created_at) >= v_today - 89) AS cnt90,
      COALESCE(SUM(e.total_amount) FILTER (WHERE app.metric_day_ist(e.estimate_date, e.created_at) >= v_today - 89), 0) AS value90,
      MAX(app.metric_day_ist(e.estimate_date, e.created_at)::timestamp AT TIME ZONE 'Asia/Kolkata') AS last_at,
      MAX(e.updated_at) AS watermark
    FROM app.estimates e WHERE e.tenant_id = p_tenant_id AND e.buyer_id = b.id AND e.deleted_at IS NULL
  ) er ON true
  LEFT JOIN LATERAL (
    SELECT COUNT(*) FILTER (WHERE app.metric_day_ist(o.order_date, o.created_at) >= v_today - 89 AND app.order_status_in_flow(o.status)) AS cnt90,
      COALESCE(SUM(o.total_amount) FILTER (WHERE app.metric_day_ist(o.order_date, o.created_at) >= v_today - 89 AND app.order_status_in_flow(o.status)), 0) AS value90,
      MAX(app.metric_day_ist(o.order_date, o.created_at)::timestamp AT TIME ZONE 'Asia/Kolkata') AS last_at,
      MAX(o.updated_at) AS watermark
    FROM app.orders o WHERE o.tenant_id = p_tenant_id AND o.buyer_id = b.id AND o.deleted_at IS NULL
  ) orx ON true
  LEFT JOIN LATERAL (
    SELECT MAX(a.occurred_at) AS last_at, MAX(a.updated_at) AS watermark
    FROM app.buyer_app_activity a WHERE a.tenant_id = p_tenant_id AND a.buyer_id = b.id AND a.deleted_at IS NULL
  ) ba ON true
  WHERE b.tenant_id = p_tenant_id AND b.deleted_at IS NULL
  ON CONFLICT (tenant_id, buyer_id) WHERE deleted_at IS NULL DO UPDATE SET
    invoice_count_90d = EXCLUDED.invoice_count_90d, invoice_value_90d = EXCLUDED.invoice_value_90d,
    prior_year_invoice_value_90d = EXCLUDED.prior_year_invoice_value_90d,
    estimate_count_90d = EXCLUDED.estimate_count_90d, estimate_value_90d = EXCLUDED.estimate_value_90d,
    order_count_90d = EXCLUDED.order_count_90d, order_value_90d = EXCLUDED.order_value_90d,
    last_invoice_at = EXCLUDED.last_invoice_at, last_estimate_at = EXCLUDED.last_estimate_at,
    last_order_at = EXCLUDED.last_order_at, last_buyer_app_activity_at = EXCLUDED.last_buyer_app_activity_at,
    receivable_amount = EXCLUDED.receivable_amount, overdue_amount = EXCLUDED.overdue_amount,
    oldest_due_at = EXCLUDED.oldest_due_at, credit_limit = EXCLUDED.credit_limit,
    credit_available = EXCLUDED.credit_available, buyer_app_enabled = EXCLUDED.buyer_app_enabled,
    has_active_price_list = EXCLUDED.has_active_price_list, has_active_cohort = EXCLUDED.has_active_cohort,
    health_reason = EXCLUDED.health_reason, app_invoice_value_90d = EXCLUDED.app_invoice_value_90d,
    assisted_invoice_value_90d = EXCLUDED.assisted_invoice_value_90d,
    source_watermark = EXCLUDED.source_watermark, computed_at = EXCLUDED.computed_at,
    generation_id = EXCLUDED.generation_id, updated_at = EXCLUDED.updated_at,
    fencing_epoch = EXCLUDED.fencing_epoch
  WHERE ROW(
    app.metrics_buyer_snapshot.invoice_count_90d, app.metrics_buyer_snapshot.invoice_value_90d,
    app.metrics_buyer_snapshot.prior_year_invoice_value_90d,
    app.metrics_buyer_snapshot.estimate_count_90d, app.metrics_buyer_snapshot.estimate_value_90d,
    app.metrics_buyer_snapshot.order_count_90d, app.metrics_buyer_snapshot.order_value_90d,
    app.metrics_buyer_snapshot.last_invoice_at, app.metrics_buyer_snapshot.last_estimate_at,
    app.metrics_buyer_snapshot.last_order_at, app.metrics_buyer_snapshot.last_buyer_app_activity_at,
    app.metrics_buyer_snapshot.receivable_amount, app.metrics_buyer_snapshot.overdue_amount,
    app.metrics_buyer_snapshot.oldest_due_at, app.metrics_buyer_snapshot.credit_limit,
    app.metrics_buyer_snapshot.credit_available, app.metrics_buyer_snapshot.buyer_app_enabled,
    app.metrics_buyer_snapshot.has_active_price_list, app.metrics_buyer_snapshot.has_active_cohort,
    app.metrics_buyer_snapshot.health_reason, app.metrics_buyer_snapshot.app_invoice_value_90d,
    app.metrics_buyer_snapshot.assisted_invoice_value_90d, app.metrics_buyer_snapshot.source_watermark
  ) IS DISTINCT FROM ROW(
    EXCLUDED.invoice_count_90d, EXCLUDED.invoice_value_90d, EXCLUDED.prior_year_invoice_value_90d,
    EXCLUDED.estimate_count_90d, EXCLUDED.estimate_value_90d,
    EXCLUDED.order_count_90d, EXCLUDED.order_value_90d,
    EXCLUDED.last_invoice_at, EXCLUDED.last_estimate_at, EXCLUDED.last_order_at,
    EXCLUDED.last_buyer_app_activity_at, EXCLUDED.receivable_amount, EXCLUDED.overdue_amount,
    EXCLUDED.oldest_due_at, EXCLUDED.credit_limit, EXCLUDED.credit_available,
    EXCLUDED.buyer_app_enabled, EXCLUDED.has_active_price_list, EXCLUDED.has_active_cohort,
    EXCLUDED.health_reason, EXCLUDED.app_invoice_value_90d, EXCLUDED.assisted_invoice_value_90d,
    EXCLUDED.source_watermark
  );
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_rows := v_rows + v_count;

  CREATE TEMP TABLE IF NOT EXISTS pg_temp.metrics_day_keys (day date PRIMARY KEY) ON COMMIT DROP;
  TRUNCATE pg_temp.metrics_day_keys;
  INSERT INTO pg_temp.metrics_day_keys(day)
  SELECT day FROM (
    SELECT old_day AS day FROM app.metrics_dirty_work
      WHERE lease_owner = p_owner_token AND claimed_version IS NOT NULL
    UNION SELECT new_day FROM app.metrics_dirty_work
      WHERE lease_owner = p_owner_token AND claimed_version IS NOT NULL
    UNION SELECT gs::date
      FROM app.metrics_dirty_work w
      CROSS JOIN LATERAL generate_series(
        COALESCE(w.cursor_day + 1, w.dirty_from),
        LEAST(COALESCE(w.dirty_to, w.dirty_from), COALESCE(w.cursor_day + 1, w.dirty_from) + 99),
        interval '1 day'
      ) gs
      WHERE w.lease_owner = p_owner_token AND w.dirty_from IS NOT NULL
        AND current_setting('app.metrics_cursor_stage', true) = 'day'
  ) days WHERE day IS NOT NULL ORDER BY day LIMIT 100
  ON CONFLICT DO NOTHING;

  INSERT INTO app.metrics_tenant_daily (
    tenant_id, external_ref, day,
    invoice_count, invoice_value, invoice_units,
    estimate_count, estimate_value, estimate_units,
    order_count, order_value, order_units,
    app_invoice_count, app_invoice_value, app_estimate_count, app_estimate_value,
    app_order_count, app_order_value, source_watermark, computed_at,
    calculation_version, updated_at, deleted_at, fencing_epoch
  )
  SELECT p_tenant_id, 'metrics:tenant:day:' || d.day::text, d.day,
    COALESCE(ir.cnt, 0), COALESCE(ir.value, 0), COALESCE(ir.units, 0),
    COALESCE(er.cnt, 0), COALESCE(er.value, 0), COALESCE(er.units, 0),
    COALESCE(orx.cnt, 0), COALESCE(orx.value, 0), COALESCE(orx.units, 0),
    COALESCE(ir.app_cnt, 0), COALESCE(ir.app_value, 0),
    COALESCE(er.app_cnt, 0), COALESCE(er.app_value, 0),
    COALESCE(orx.app_cnt, 0), COALESCE(orx.app_value, 0),
    GREATEST(ir.watermark, er.watermark, orx.watermark), v_now, 1, v_now, NULL, p_fencing_epoch
  FROM pg_temp.metrics_day_keys d
  LEFT JOIN LATERAL (
    SELECT COUNT(DISTINCT i.id) FILTER (WHERE app.invoice_status_gmv_included(i.status)) AS cnt,
      COALESCE(SUM(i.total_amount) FILTER (WHERE app.invoice_status_gmv_included(i.status)), 0) AS value,
      COALESCE(SUM(lines.units) FILTER (WHERE app.invoice_status_gmv_included(i.status)), 0) AS units,
      COUNT(DISTINCT i.id) FILTER (WHERE i.is_buyer_app_invoice AND app.invoice_status_gmv_included(i.status)) AS app_cnt,
      COALESCE(SUM(i.total_amount) FILTER (WHERE i.is_buyer_app_invoice AND app.invoice_status_gmv_included(i.status)), 0) AS app_value,
      MAX(GREATEST(i.updated_at, lines.watermark)) AS watermark
    FROM app.invoices i
    LEFT JOIN LATERAL (
      SELECT SUM(ii.qty) AS units, MAX(ii.updated_at) AS watermark
      FROM app.invoice_items ii WHERE ii.invoice_id = i.id AND ii.deleted_at IS NULL
    ) lines ON true
    WHERE i.tenant_id = p_tenant_id AND i.deleted_at IS NULL
      AND app.metric_day_ist(i.invoice_date, i.created_at) = d.day
  ) ir ON true
  LEFT JOIN LATERAL (
    SELECT COUNT(DISTINCT e.id) AS cnt, COALESCE(SUM(e.total_amount), 0) AS value,
      COALESCE(SUM(lines.units), 0) AS units,
      COUNT(DISTINCT e.id) FILTER (WHERE e.is_buyer_app_estimate) AS app_cnt,
      COALESCE(SUM(e.total_amount) FILTER (WHERE e.is_buyer_app_estimate), 0) AS app_value,
      MAX(GREATEST(e.updated_at, lines.watermark)) AS watermark
    FROM app.estimates e
    LEFT JOIN LATERAL (
      SELECT SUM(ei.qty) AS units, MAX(ei.updated_at) AS watermark
      FROM app.estimate_items ei WHERE ei.estimate_id = e.id AND ei.deleted_at IS NULL
    ) lines ON true
    WHERE e.tenant_id = p_tenant_id AND e.deleted_at IS NULL
      AND app.metric_day_ist(e.estimate_date, e.created_at) = d.day
  ) er ON true
  LEFT JOIN LATERAL (
    SELECT COUNT(DISTINCT o.id) FILTER (WHERE app.order_status_in_flow(o.status)) AS cnt,
      COALESCE(SUM(o.total_amount) FILTER (WHERE app.order_status_in_flow(o.status)), 0) AS value,
      COALESCE(SUM(lines.units) FILTER (WHERE app.order_status_in_flow(o.status)), 0) AS units,
      COUNT(DISTINCT o.id) FILTER (WHERE o.is_buyer_app_order AND app.order_status_in_flow(o.status)) AS app_cnt,
      COALESCE(SUM(o.total_amount) FILTER (WHERE o.is_buyer_app_order AND app.order_status_in_flow(o.status)), 0) AS app_value,
      MAX(GREATEST(o.updated_at, lines.watermark)) AS watermark
    FROM app.orders o
    LEFT JOIN LATERAL (
      SELECT SUM(oi.qty) AS units, MAX(oi.updated_at) AS watermark
      FROM app.order_items oi WHERE oi.order_id = o.id AND oi.deleted_at IS NULL
    ) lines ON true
    WHERE o.tenant_id = p_tenant_id AND o.deleted_at IS NULL
      AND app.metric_day_ist(o.order_date, o.created_at) = d.day
  ) orx ON true
  WHERE COALESCE(ir.cnt, 0) + COALESCE(er.cnt, 0) + COALESCE(orx.cnt, 0) > 0
  ON CONFLICT (tenant_id, day) WHERE deleted_at IS NULL DO UPDATE SET
    invoice_count = EXCLUDED.invoice_count, invoice_value = EXCLUDED.invoice_value, invoice_units = EXCLUDED.invoice_units,
    estimate_count = EXCLUDED.estimate_count, estimate_value = EXCLUDED.estimate_value, estimate_units = EXCLUDED.estimate_units,
    order_count = EXCLUDED.order_count, order_value = EXCLUDED.order_value, order_units = EXCLUDED.order_units,
    app_invoice_count = EXCLUDED.app_invoice_count, app_invoice_value = EXCLUDED.app_invoice_value,
    app_estimate_count = EXCLUDED.app_estimate_count, app_estimate_value = EXCLUDED.app_estimate_value,
    app_order_count = EXCLUDED.app_order_count, app_order_value = EXCLUDED.app_order_value,
    source_watermark = EXCLUDED.source_watermark, computed_at = EXCLUDED.computed_at,
    updated_at = EXCLUDED.updated_at, deleted_at = NULL, fencing_epoch = EXCLUDED.fencing_epoch
  WHERE ROW(
    app.metrics_tenant_daily.invoice_count, app.metrics_tenant_daily.invoice_value, app.metrics_tenant_daily.invoice_units,
    app.metrics_tenant_daily.estimate_count, app.metrics_tenant_daily.estimate_value, app.metrics_tenant_daily.estimate_units,
    app.metrics_tenant_daily.order_count, app.metrics_tenant_daily.order_value, app.metrics_tenant_daily.order_units,
    app.metrics_tenant_daily.app_invoice_count, app.metrics_tenant_daily.app_invoice_value,
    app.metrics_tenant_daily.app_estimate_count, app.metrics_tenant_daily.app_estimate_value,
    app.metrics_tenant_daily.app_order_count, app.metrics_tenant_daily.app_order_value,
    app.metrics_tenant_daily.source_watermark
  ) IS DISTINCT FROM ROW(
    EXCLUDED.invoice_count, EXCLUDED.invoice_value, EXCLUDED.invoice_units,
    EXCLUDED.estimate_count, EXCLUDED.estimate_value, EXCLUDED.estimate_units,
    EXCLUDED.order_count, EXCLUDED.order_value, EXCLUDED.order_units,
    EXCLUDED.app_invoice_count, EXCLUDED.app_invoice_value,
    EXCLUDED.app_estimate_count, EXCLUDED.app_estimate_value,
    EXCLUDED.app_order_count, EXCLUDED.app_order_value, EXCLUDED.source_watermark
  );
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_rows := v_rows + v_count;

  UPDATE app.metrics_tenant_daily td
  SET deleted_at = v_now, updated_at = v_now, computed_at = v_now, fencing_epoch = p_fencing_epoch
  WHERE td.tenant_id = p_tenant_id AND td.deleted_at IS NULL
    AND td.day IN (SELECT day FROM pg_temp.metrics_day_keys)
    AND NOT EXISTS (
      SELECT 1 FROM app.estimates e WHERE e.tenant_id = p_tenant_id AND e.deleted_at IS NULL
        AND app.metric_day_ist(e.estimate_date, e.created_at) = td.day
      UNION ALL SELECT 1 FROM app.orders o WHERE o.tenant_id = p_tenant_id AND o.deleted_at IS NULL
        AND app.order_status_in_flow(o.status) AND app.metric_day_ist(o.order_date, o.created_at) = td.day
      UNION ALL SELECT 1 FROM app.invoices i WHERE i.tenant_id = p_tenant_id AND i.deleted_at IS NULL
        AND app.invoice_status_gmv_included(i.status) AND app.metric_day_ist(i.invoice_date, i.created_at) = td.day
    );
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_rows := v_rows + v_count;

  UPDATE app.metrics_dirty_work w
  SET cursor_day = CASE WHEN (SELECT COUNT(*) FROM pg_temp.metrics_day_keys) >= 100
      THEN (SELECT MAX(day) FROM pg_temp.metrics_day_keys) ELSE NULL END,
    cursor_id = CASE WHEN (SELECT COUNT(*) FROM pg_temp.metrics_day_keys) >= 100
      THEN w.cursor_id ELSE NULL END,
    cursor_kind = CASE WHEN (SELECT COUNT(*) FROM pg_temp.metrics_day_keys) >= 100
      THEN 'day' ELSE 'location_day' END,
    updated_at = clock_timestamp()
  WHERE w.lease_owner = p_owner_token AND w.state = 'claimed'
    AND w.claimed_version = w.dirty_version AND w.dirty_from IS NOT NULL
    AND current_setting('app.metrics_cursor_stage', true) = 'day';

  SELECT v_rows + r.rows_written, 4 + r.statement_groups, v_watermark
  INTO v_rows, v_count, v_watermark
  FROM app._metrics_refresh_location_scopes(p_owner_token, p_fencing_epoch, p_tenant_id) r;

  RETURN QUERY SELECT v_rows, v_count, v_watermark;
END;
$$;
