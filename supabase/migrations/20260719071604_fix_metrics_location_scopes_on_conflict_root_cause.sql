-- =============================================================================
-- FIX ROOT CAUSE: _metrics_refresh_location_scopes ON CONFLICT soft-delete
--
-- The INSERT into metrics_location_daily used a partial ON CONFLICT clause
-- (WHERE deleted_at IS NULL). A prior soft-deleted row with the same
-- (location_id, day) bypasses that partial index and hits the non-partial
-- UNIQUE (tenant_id, external_ref) constraint, crashing the metrics worker.
--
-- Fix: DELETE soft-deleted rows for the key set before the INSERT so the
-- partial ON CONFLICT fires correctly on all subsequent runs.
--
-- The BEFORE INSERT trigger added in the previous migration remains as
-- defense-in-depth for any other insert path.
-- =============================================================================

CREATE OR REPLACE FUNCTION app._metrics_refresh_location_scopes(
  p_owner_token uuid,
  p_fencing_epoch bigint,
  p_tenant_id uuid
)
RETURNS TABLE (rows_written integer, statement_groups integer)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, app, pg_temp
AS $$
DECLARE
  v_now timestamptz := clock_timestamp();
  v_today date := (clock_timestamp() AT TIME ZONE 'Asia/Kolkata')::date;
  v_rows integer := 0;
  v_count integer;
BEGIN
  CREATE TEMP TABLE IF NOT EXISTS pg_temp.metrics_location_keys (id uuid PRIMARY KEY) ON COMMIT DROP;
  CREATE TEMP TABLE IF NOT EXISTS pg_temp.metrics_scope_days (day date PRIMARY KEY) ON COMMIT DROP;
  CREATE TEMP TABLE IF NOT EXISTS pg_temp.metrics_product_keys (id uuid PRIMARY KEY) ON COMMIT DROP;
  CREATE TEMP TABLE IF NOT EXISTS pg_temp.metrics_location_day_keys (
    location_id uuid NOT NULL, day date NOT NULL, PRIMARY KEY (location_id, day)
  ) ON COMMIT DROP;
  TRUNCATE pg_temp.metrics_location_keys;
  TRUNCATE pg_temp.metrics_scope_days;
  TRUNCATE pg_temp.metrics_location_day_keys;

  INSERT INTO pg_temp.metrics_location_keys(id)
  SELECT id FROM (
    SELECT old_location_id AS id FROM app.metrics_dirty_work
      WHERE lease_owner = p_owner_token AND claimed_version IS NOT NULL
    UNION SELECT new_location_id FROM app.metrics_dirty_work
      WHERE lease_owner = p_owner_token AND claimed_version IS NOT NULL
    UNION SELECT e.location_id FROM app.estimates e JOIN app.metrics_dirty_work w
      ON w.lease_owner = p_owner_token AND w.dirty_from IS NOT NULL
        AND current_setting('app.metrics_cursor_stage', true) IN ('location', 'location_day')
      WHERE e.tenant_id = p_tenant_id AND e.deleted_at IS NULL
        AND app.metric_day_ist(e.estimate_date, e.created_at) BETWEEN
          CASE WHEN current_setting('app.metrics_cursor_stage', true) = 'location_day'
            THEN COALESCE(w.cursor_day + 1, w.dirty_from) ELSE w.dirty_from END
          AND CASE WHEN current_setting('app.metrics_cursor_stage', true) = 'location_day'
            THEN LEAST(COALESCE(w.dirty_to, w.dirty_from), COALESCE(w.cursor_day + 1, w.dirty_from) + 99)
            ELSE COALESCE(w.dirty_to, w.dirty_from) END
        AND ((current_setting('app.metrics_cursor_stage', true) = 'location' AND (w.cursor_id IS NULL OR e.location_id > w.cursor_id))
          OR (current_setting('app.metrics_cursor_stage', true) = 'location_day'
            AND ((w.cursor_day IS NOT NULL AND e.location_id = w.cursor_id)
              OR (w.cursor_day IS NULL AND (w.cursor_id IS NULL OR e.location_id > w.cursor_id)))))
    UNION SELECT o.location_id FROM app.orders o JOIN app.metrics_dirty_work w
      ON w.lease_owner = p_owner_token AND w.dirty_from IS NOT NULL
        AND current_setting('app.metrics_cursor_stage', true) IN ('location', 'location_day')
      WHERE o.tenant_id = p_tenant_id AND o.deleted_at IS NULL
        AND app.metric_day_ist(o.order_date, o.created_at) BETWEEN
          CASE WHEN current_setting('app.metrics_cursor_stage', true) = 'location_day'
            THEN COALESCE(w.cursor_day + 1, w.dirty_from) ELSE w.dirty_from END
          AND CASE WHEN current_setting('app.metrics_cursor_stage', true) = 'location_day'
            THEN LEAST(COALESCE(w.dirty_to, w.dirty_from), COALESCE(w.cursor_day + 1, w.dirty_from) + 99)
            ELSE COALESCE(w.dirty_to, w.dirty_from) END
        AND ((current_setting('app.metrics_cursor_stage', true) = 'location' AND (w.cursor_id IS NULL OR o.location_id > w.cursor_id))
          OR (current_setting('app.metrics_cursor_stage', true) = 'location_day'
            AND ((w.cursor_day IS NOT NULL AND o.location_id = w.cursor_id)
              OR (w.cursor_day IS NULL AND (w.cursor_id IS NULL OR o.location_id > w.cursor_id)))))
    UNION SELECT i.location_id FROM app.invoices i JOIN app.metrics_dirty_work w
      ON w.lease_owner = p_owner_token AND w.dirty_from IS NOT NULL
        AND current_setting('app.metrics_cursor_stage', true) IN ('location', 'location_day')
      WHERE i.tenant_id = p_tenant_id AND i.deleted_at IS NULL
        AND app.metric_day_ist(i.invoice_date, i.created_at) BETWEEN
          CASE WHEN current_setting('app.metrics_cursor_stage', true) = 'location_day'
            THEN COALESCE(w.cursor_day + 1, w.dirty_from) ELSE w.dirty_from END
          AND CASE WHEN current_setting('app.metrics_cursor_stage', true) = 'location_day'
            THEN LEAST(COALESCE(w.dirty_to, w.dirty_from), COALESCE(w.cursor_day + 1, w.dirty_from) + 99)
            ELSE COALESCE(w.dirty_to, w.dirty_from) END
        AND ((current_setting('app.metrics_cursor_stage', true) = 'location' AND (w.cursor_id IS NULL OR i.location_id > w.cursor_id))
          OR (current_setting('app.metrics_cursor_stage', true) = 'location_day'
            AND ((w.cursor_day IS NOT NULL AND i.location_id = w.cursor_id)
              OR (w.cursor_day IS NULL AND (w.cursor_id IS NULL OR i.location_id > w.cursor_id)))))
    UNION SELECT s.location_id FROM app.metrics_location_snapshot s
      JOIN app.metrics_dirty_work w ON w.lease_owner = p_owner_token AND w.dirty_from IS NOT NULL
        AND current_setting('app.metrics_cursor_stage', true) = 'location'
      WHERE s.tenant_id = p_tenant_id AND s.deleted_at IS NULL
        AND (w.cursor_id IS NULL OR s.location_id > w.cursor_id)
    UNION SELECT s.location_id FROM app.metrics_buyer_location_snapshot s
      JOIN app.metrics_dirty_work w ON w.lease_owner = p_owner_token AND w.dirty_from IS NOT NULL
        AND current_setting('app.metrics_cursor_stage', true) = 'location'
      WHERE s.tenant_id = p_tenant_id AND s.deleted_at IS NULL
        AND (w.cursor_id IS NULL OR s.location_id > w.cursor_id)
    UNION SELECT wh.location_id FROM app.tenant_inventory ti
      JOIN app.warehouses wh ON wh.id = ti.warehouse_id
      JOIN app.metrics_dirty_work w ON w.lease_owner = p_owner_token AND w.dirty_from IS NOT NULL
        AND current_setting('app.metrics_cursor_stage', true) = 'location'
      WHERE wh.tenant_id = p_tenant_id AND wh.location_id IS NOT NULL
        AND (ti.updated_at::date BETWEEN w.dirty_from AND COALESCE(w.dirty_to, w.dirty_from)
          OR wh.updated_at::date BETWEEN w.dirty_from AND COALESCE(w.dirty_to, w.dirty_from))
        AND (w.cursor_id IS NULL OR wh.location_id > w.cursor_id)
    UNION SELECT s.location_id FROM app.metrics_product_location_snapshot s
      JOIN app.metrics_dirty_work w ON w.lease_owner = p_owner_token AND w.dirty_from IS NOT NULL
        AND current_setting('app.metrics_cursor_stage', true) = 'location'
      WHERE s.tenant_id = p_tenant_id AND s.deleted_at IS NULL
        AND (w.cursor_id IS NULL OR s.location_id > w.cursor_id)
    UNION SELECT s.location_id FROM app.metrics_location_daily s
      JOIN app.metrics_dirty_work w ON w.lease_owner = p_owner_token AND w.dirty_from IS NOT NULL
        AND current_setting('app.metrics_cursor_stage', true) = 'location_day'
      WHERE s.tenant_id = p_tenant_id AND s.deleted_at IS NULL
        AND ((w.cursor_day IS NOT NULL AND s.location_id = w.cursor_id)
          OR (w.cursor_day IS NULL AND (w.cursor_id IS NULL OR s.location_id > w.cursor_id)))
  ) keys WHERE id IS NOT NULL ORDER BY id
  LIMIT CASE WHEN current_setting('app.metrics_cursor_stage', true) = 'location_day' THEN 1 ELSE 100 END
  ON CONFLICT DO NOTHING;

  INSERT INTO pg_temp.metrics_scope_days(day)
  SELECT day FROM (
    SELECT old_day AS day FROM app.metrics_dirty_work WHERE lease_owner = p_owner_token AND claimed_version IS NOT NULL
    UNION SELECT new_day FROM app.metrics_dirty_work WHERE lease_owner = p_owner_token AND claimed_version IS NOT NULL
    UNION SELECT gs::date FROM app.metrics_dirty_work w
      CROSS JOIN LATERAL generate_series(
        COALESCE(w.cursor_day + 1, w.dirty_from),
        LEAST(COALESCE(w.dirty_to, w.dirty_from), COALESCE(w.cursor_day + 1, w.dirty_from) + 99),
        interval '1 day'
      ) gs WHERE w.lease_owner = p_owner_token AND w.dirty_from IS NOT NULL
        AND current_setting('app.metrics_cursor_stage', true) = 'location_day'
  ) days WHERE day IS NOT NULL ORDER BY day LIMIT 100
  ON CONFLICT DO NOTHING;

  INSERT INTO app.metrics_location_snapshot (
    tenant_id, location_id, external_ref, invoice_count_90d, invoice_value_90d,
    purchasing_buyers_90d, open_estimate_count, open_estimate_value,
    open_order_count, open_order_value, receivable_amount, overdue_amount,
    linked_warehouse_count, stocked_product_count, low_stock_product_count,
    out_of_stock_product_count, source_watermark, computed_at, calculation_version,
    generation_id, updated_at, deleted_at, fencing_epoch
  )
  SELECT l.tenant_id, l.id, 'metrics:location:' || l.id::text,
    COALESCE(inv.cnt90, 0), COALESCE(inv.value90, 0), COALESCE(inv.buyers90, 0),
    COALESCE(est.open_count, 0), COALESCE(est.open_value, 0),
    COALESCE(ord.open_count, 0), COALESCE(ord.open_value, 0),
    COALESCE(inv.receivable, 0), COALESCE(inv.overdue, 0),
    COALESCE(stock.warehouse_count, 0), COALESCE(stock.stocked, 0),
    COALESCE(stock.low_stock, 0), COALESCE(stock.out_of_stock, 0),
    GREATEST(l.updated_at, inv.watermark, est.watermark, ord.watermark, stock.watermark),
    v_now, 1, gen_random_uuid(), v_now, NULL, p_fencing_epoch
  FROM app.locations l JOIN pg_temp.metrics_location_keys k ON k.id = l.id
  LEFT JOIN LATERAL (
    SELECT COUNT(*) FILTER (WHERE app.metric_day_ist(i.invoice_date, i.created_at) >= v_today - 89 AND app.invoice_status_gmv_included(i.status)) AS cnt90,
      COALESCE(SUM(i.total_amount) FILTER (WHERE app.metric_day_ist(i.invoice_date, i.created_at) >= v_today - 89 AND app.invoice_status_gmv_included(i.status)), 0) AS value90,
      COUNT(DISTINCT i.buyer_id) FILTER (WHERE app.metric_day_ist(i.invoice_date, i.created_at) >= v_today - 89 AND app.invoice_status_gmv_included(i.status)) AS buyers90,
      COALESCE(SUM(i.outstanding_balance) FILTER (WHERE app.invoice_status_has_receivable(i.status, i.outstanding_balance)), 0) AS receivable,
      COALESCE(SUM(i.outstanding_balance) FILTER (WHERE app.invoice_is_overdue(i.status, i.due_date, i.outstanding_balance)), 0) AS overdue,
      MAX(i.updated_at) AS watermark
    FROM app.invoices i WHERE i.tenant_id = p_tenant_id AND i.location_id = l.id AND i.deleted_at IS NULL
  ) inv ON true
  LEFT JOIN LATERAL (
    SELECT COUNT(*) FILTER (WHERE app.estimate_status_is_open(e.status)) AS open_count,
      COALESCE(SUM(e.total_amount) FILTER (WHERE app.estimate_status_is_open(e.status)), 0) AS open_value,
      MAX(e.updated_at) AS watermark
    FROM app.estimates e WHERE e.tenant_id = p_tenant_id AND e.location_id = l.id AND e.deleted_at IS NULL
  ) est ON true
  LEFT JOIN LATERAL (
    SELECT COUNT(*) FILTER (WHERE app.order_status_is_open(o.status)) AS open_count,
      COALESCE(SUM(o.total_amount) FILTER (WHERE app.order_status_is_open(o.status)), 0) AS open_value,
      MAX(o.updated_at) AS watermark
    FROM app.orders o WHERE o.tenant_id = p_tenant_id AND o.location_id = l.id AND o.deleted_at IS NULL
  ) ord ON true
  LEFT JOIN LATERAL (
    SELECT COUNT(DISTINCT w.id) AS warehouse_count,
      COUNT(DISTINCT ti.tenant_product_id) FILTER (WHERE COALESCE(ti.qty_available, 0) - COALESCE(ti.qty_reserved, 0) > 0) AS stocked,
      COUNT(DISTINCT ti.tenant_product_id) FILTER (
        WHERE COALESCE(ti.qty_available, 0) - COALESCE(ti.qty_reserved, 0) > 0
          AND COALESCE(ti.qty_available, 0) - COALESCE(ti.qty_reserved, 0) <= COALESCE(ti.reorder_point, 0)
      ) AS low_stock,
      COUNT(DISTINCT ti.tenant_product_id) FILTER (WHERE COALESCE(ti.qty_available, 0) - COALESCE(ti.qty_reserved, 0) <= 0) AS out_of_stock,
      MAX(GREATEST(w.updated_at, ti.updated_at)) AS watermark
    FROM app.warehouses w LEFT JOIN app.tenant_inventory ti ON ti.warehouse_id = w.id AND ti.deleted_at IS NULL
    WHERE w.tenant_id = p_tenant_id AND w.location_id = l.id AND w.deleted_at IS NULL AND w.status = 'active'
  ) stock ON true
  WHERE l.tenant_id = p_tenant_id AND l.deleted_at IS NULL
  ON CONFLICT (tenant_id, location_id) WHERE deleted_at IS NULL DO UPDATE SET
    invoice_count_90d = EXCLUDED.invoice_count_90d, invoice_value_90d = EXCLUDED.invoice_value_90d,
    purchasing_buyers_90d = EXCLUDED.purchasing_buyers_90d,
    open_estimate_count = EXCLUDED.open_estimate_count, open_estimate_value = EXCLUDED.open_estimate_value,
    open_order_count = EXCLUDED.open_order_count, open_order_value = EXCLUDED.open_order_value,
    receivable_amount = EXCLUDED.receivable_amount, overdue_amount = EXCLUDED.overdue_amount,
    linked_warehouse_count = EXCLUDED.linked_warehouse_count, stocked_product_count = EXCLUDED.stocked_product_count,
    low_stock_product_count = EXCLUDED.low_stock_product_count, out_of_stock_product_count = EXCLUDED.out_of_stock_product_count,
    source_watermark = EXCLUDED.source_watermark, computed_at = EXCLUDED.computed_at,
    generation_id = EXCLUDED.generation_id, updated_at = EXCLUDED.updated_at,
    fencing_epoch = EXCLUDED.fencing_epoch
  WHERE ROW(
    app.metrics_location_snapshot.invoice_count_90d, app.metrics_location_snapshot.invoice_value_90d,
    app.metrics_location_snapshot.purchasing_buyers_90d, app.metrics_location_snapshot.open_estimate_count,
    app.metrics_location_snapshot.open_estimate_value, app.metrics_location_snapshot.open_order_count,
    app.metrics_location_snapshot.open_order_value, app.metrics_location_snapshot.receivable_amount,
    app.metrics_location_snapshot.overdue_amount, app.metrics_location_snapshot.linked_warehouse_count,
    app.metrics_location_snapshot.stocked_product_count, app.metrics_location_snapshot.low_stock_product_count,
    app.metrics_location_snapshot.out_of_stock_product_count, app.metrics_location_snapshot.source_watermark
  ) IS DISTINCT FROM ROW(
    EXCLUDED.invoice_count_90d, EXCLUDED.invoice_value_90d, EXCLUDED.purchasing_buyers_90d,
    EXCLUDED.open_estimate_count, EXCLUDED.open_estimate_value, EXCLUDED.open_order_count,
    EXCLUDED.open_order_value, EXCLUDED.receivable_amount, EXCLUDED.overdue_amount,
    EXCLUDED.linked_warehouse_count, EXCLUDED.stocked_product_count,
    EXCLUDED.low_stock_product_count, EXCLUDED.out_of_stock_product_count, EXCLUDED.source_watermark
  );
  GET DIAGNOSTICS v_count = ROW_COUNT; v_rows := v_rows + v_count;

  -- Entity/location snapshots are sparse: only explicitly invalidated pairs.
  CREATE TEMP TABLE IF NOT EXISTS pg_temp.metrics_buyer_location_keys (
    location_id uuid NOT NULL, buyer_id uuid NOT NULL,
    PRIMARY KEY (location_id, buyer_id)
  ) ON COMMIT DROP;
  TRUNCATE pg_temp.metrics_buyer_location_keys;
  INSERT INTO pg_temp.metrics_buyer_location_keys(location_id, buyer_id)
  SELECT old_location_id, old_buyer_id FROM app.metrics_dirty_work
    WHERE lease_owner = p_owner_token AND dirty_from IS NULL
      AND old_location_id IS NOT NULL AND old_buyer_id IS NOT NULL
  UNION
  SELECT new_location_id, new_buyer_id FROM app.metrics_dirty_work
    WHERE lease_owner = p_owner_token AND dirty_from IS NULL
      AND new_location_id IS NOT NULL AND new_buyer_id IS NOT NULL;

  INSERT INTO app.metrics_buyer_location_snapshot (
    tenant_id, location_id, buyer_id, external_ref,
    invoice_count_90d, invoice_value_90d, estimate_count_90d, estimate_value_90d,
    order_count_90d, order_value_90d, receivable_amount, overdue_amount,
    last_invoice_at, last_estimate_at, last_order_at, source_watermark,
    computed_at, calculation_version, generation_id, updated_at, deleted_at, fencing_epoch
  )
  SELECT p_tenant_id, lk.id, bk.id, 'metrics:buyer-location:' || bk.id::text || ':' || lk.id::text,
    COALESCE(ir.cnt90, 0), COALESCE(ir.value90, 0), COALESCE(er.cnt90, 0), COALESCE(er.value90, 0),
    COALESCE(orx.cnt90, 0), COALESCE(orx.value90, 0), COALESCE(ir.receivable, 0), COALESCE(ir.overdue, 0),
    ir.last_at, er.last_at, orx.last_at, GREATEST(ir.watermark, er.watermark, orx.watermark),
    v_now, 1, gen_random_uuid(), v_now, NULL, p_fencing_epoch
  FROM pg_temp.metrics_buyer_location_keys pair
  JOIN LATERAL (SELECT pair.location_id AS id) lk ON true
  JOIN LATERAL (SELECT pair.buyer_id AS id) bk ON true
  LEFT JOIN LATERAL (
    SELECT COUNT(*) FILTER (WHERE app.metric_day_ist(i.invoice_date, i.created_at) >= v_today - 89 AND app.invoice_status_gmv_included(i.status)) AS cnt90,
      COALESCE(SUM(i.total_amount) FILTER (WHERE app.metric_day_ist(i.invoice_date, i.created_at) >= v_today - 89 AND app.invoice_status_gmv_included(i.status)), 0) AS value90,
      COALESCE(SUM(i.outstanding_balance) FILTER (WHERE app.invoice_status_has_receivable(i.status, i.outstanding_balance)), 0) AS receivable,
      COALESCE(SUM(i.outstanding_balance) FILTER (WHERE app.invoice_is_overdue(i.status, i.due_date, i.outstanding_balance)), 0) AS overdue,
      MAX(app.metric_day_ist(i.invoice_date, i.created_at)::timestamp AT TIME ZONE 'Asia/Kolkata') AS last_at,
      MAX(i.updated_at) AS watermark FROM app.invoices i
    WHERE i.tenant_id = p_tenant_id AND i.location_id = lk.id AND i.buyer_id = bk.id AND i.deleted_at IS NULL
  ) ir ON true
  LEFT JOIN LATERAL (
    SELECT COUNT(*) FILTER (WHERE app.metric_day_ist(e.estimate_date, e.created_at) >= v_today - 89) AS cnt90,
      COALESCE(SUM(e.total_amount) FILTER (WHERE app.metric_day_ist(e.estimate_date, e.created_at) >= v_today - 89), 0) AS value90,
      MAX(app.metric_day_ist(e.estimate_date, e.created_at)::timestamp AT TIME ZONE 'Asia/Kolkata') AS last_at,
      MAX(e.updated_at) AS watermark FROM app.estimates e
    WHERE e.tenant_id = p_tenant_id AND e.location_id = lk.id AND e.buyer_id = bk.id AND e.deleted_at IS NULL
  ) er ON true
  LEFT JOIN LATERAL (
    SELECT COUNT(*) FILTER (WHERE app.metric_day_ist(o.order_date, o.created_at) >= v_today - 89 AND app.order_status_in_flow(o.status)) AS cnt90,
      COALESCE(SUM(o.total_amount) FILTER (WHERE app.metric_day_ist(o.order_date, o.created_at) >= v_today - 89 AND app.order_status_in_flow(o.status)), 0) AS value90,
      MAX(app.metric_day_ist(o.order_date, o.created_at)::timestamp AT TIME ZONE 'Asia/Kolkata') AS last_at,
      MAX(o.updated_at) AS watermark FROM app.orders o
    WHERE o.tenant_id = p_tenant_id AND o.location_id = lk.id AND o.buyer_id = bk.id AND o.deleted_at IS NULL
  ) orx ON true
  WHERE COALESCE(ir.cnt90, 0) + COALESCE(er.cnt90, 0) + COALESCE(orx.cnt90, 0) > 0
    OR COALESCE(ir.receivable, 0) <> 0 OR COALESCE(ir.overdue, 0) <> 0
  ON CONFLICT (tenant_id, location_id, buyer_id) WHERE deleted_at IS NULL DO UPDATE SET
    invoice_count_90d = EXCLUDED.invoice_count_90d, invoice_value_90d = EXCLUDED.invoice_value_90d,
    estimate_count_90d = EXCLUDED.estimate_count_90d, estimate_value_90d = EXCLUDED.estimate_value_90d,
    order_count_90d = EXCLUDED.order_count_90d, order_value_90d = EXCLUDED.order_value_90d,
    receivable_amount = EXCLUDED.receivable_amount, overdue_amount = EXCLUDED.overdue_amount,
    last_invoice_at = EXCLUDED.last_invoice_at, last_estimate_at = EXCLUDED.last_estimate_at,
    last_order_at = EXCLUDED.last_order_at, source_watermark = EXCLUDED.source_watermark,
    computed_at = EXCLUDED.computed_at, generation_id = EXCLUDED.generation_id,
    updated_at = EXCLUDED.updated_at, fencing_epoch = EXCLUDED.fencing_epoch
  WHERE ROW(
    app.metrics_buyer_location_snapshot.invoice_count_90d, app.metrics_buyer_location_snapshot.invoice_value_90d,
    app.metrics_buyer_location_snapshot.estimate_count_90d, app.metrics_buyer_location_snapshot.estimate_value_90d,
    app.metrics_buyer_location_snapshot.order_count_90d, app.metrics_buyer_location_snapshot.order_value_90d,
    app.metrics_buyer_location_snapshot.receivable_amount, app.metrics_buyer_location_snapshot.overdue_amount,
    app.metrics_buyer_location_snapshot.last_invoice_at, app.metrics_buyer_location_snapshot.last_estimate_at,
    app.metrics_buyer_location_snapshot.last_order_at, app.metrics_buyer_location_snapshot.source_watermark
  ) IS DISTINCT FROM ROW(
    EXCLUDED.invoice_count_90d, EXCLUDED.invoice_value_90d, EXCLUDED.estimate_count_90d,
    EXCLUDED.estimate_value_90d, EXCLUDED.order_count_90d, EXCLUDED.order_value_90d,
    EXCLUDED.receivable_amount, EXCLUDED.overdue_amount, EXCLUDED.last_invoice_at,
    EXCLUDED.last_estimate_at, EXCLUDED.last_order_at, EXCLUDED.source_watermark
  );
  GET DIAGNOSTICS v_count = ROW_COUNT; v_rows := v_rows + v_count;

  UPDATE app.metrics_buyer_location_snapshot s
  SET deleted_at = v_now, updated_at = v_now, computed_at = v_now, fencing_epoch = p_fencing_epoch
  FROM pg_temp.metrics_buyer_location_keys k
  WHERE s.tenant_id = p_tenant_id AND s.location_id = k.location_id AND s.buyer_id = k.buyer_id
    AND s.deleted_at IS NULL
    AND NOT EXISTS (SELECT 1 FROM app.invoices i WHERE i.tenant_id=p_tenant_id
      AND i.location_id=k.location_id AND i.buyer_id=k.buyer_id AND i.deleted_at IS NULL
      AND (app.invoice_status_gmv_included(i.status)
        AND app.metric_day_ist(i.invoice_date, i.created_at) >= v_today - 89
        OR app.invoice_status_has_receivable(i.status, i.outstanding_balance)))
    AND NOT EXISTS (SELECT 1 FROM app.estimates e WHERE e.tenant_id=p_tenant_id
      AND e.location_id=k.location_id AND e.buyer_id=k.buyer_id AND e.deleted_at IS NULL
      AND app.metric_day_ist(e.estimate_date, e.created_at) >= v_today - 89)
    AND NOT EXISTS (SELECT 1 FROM app.orders o WHERE o.tenant_id=p_tenant_id
      AND o.location_id=k.location_id AND o.buyer_id=k.buyer_id AND o.deleted_at IS NULL
      AND app.order_status_in_flow(o.status)
      AND app.metric_day_ist(o.order_date, o.created_at) >= v_today - 89);
  GET DIAGNOSTICS v_count = ROW_COUNT; v_rows := v_rows + v_count;

  CREATE TEMP TABLE IF NOT EXISTS pg_temp.metrics_product_location_keys (
    location_id uuid NOT NULL,
    tenant_product_id uuid NOT NULL,
    PRIMARY KEY (location_id, tenant_product_id)
  ) ON COMMIT DROP;
  TRUNCATE pg_temp.metrics_product_location_keys;
  INSERT INTO pg_temp.metrics_product_location_keys(location_id, tenant_product_id)
  SELECT location_id, tenant_product_id
  FROM (
    SELECT mdw.old_location_id AS location_id, mdw.old_tenant_product_id AS tenant_product_id
    FROM app.metrics_dirty_work mdw
    WHERE mdw.lease_owner = p_owner_token AND mdw.dirty_from IS NULL
      AND mdw.old_location_id IS NOT NULL AND mdw.old_tenant_product_id IS NOT NULL
    UNION
    SELECT mdw.new_location_id, mdw.new_tenant_product_id
    FROM app.metrics_dirty_work mdw
    WHERE mdw.lease_owner = p_owner_token AND mdw.dirty_from IS NULL
      AND mdw.new_location_id IS NOT NULL AND mdw.new_tenant_product_id IS NOT NULL
    UNION
    SELECT wh.location_id, ti.tenant_product_id
    FROM app.tenant_inventory ti JOIN app.warehouses wh ON wh.id = ti.warehouse_id
    JOIN app.metrics_dirty_work mdw ON mdw.lease_owner = p_owner_token
      AND mdw.dirty_from IS NOT NULL
      AND current_setting('app.metrics_cursor_stage', true) = 'product_location'
    WHERE wh.tenant_id = p_tenant_id AND wh.location_id IS NOT NULL
      AND ti.deleted_at IS NULL AND wh.deleted_at IS NULL
      AND (mdw.cursor_id IS NULL OR (ti.tenant_product_id, wh.location_id) > (mdw.cursor_id, mdw.cursor_aux_id))
    UNION
    SELECT i.location_id, ii.tenant_product_id
    FROM app.invoice_items ii JOIN app.invoices i ON i.id = ii.invoice_id
    JOIN app.metrics_dirty_work mdw ON mdw.lease_owner = p_owner_token
      AND mdw.dirty_from IS NOT NULL
      AND current_setting('app.metrics_cursor_stage', true) = 'product_location'
    WHERE i.tenant_id = p_tenant_id AND i.location_id IS NOT NULL
      AND ii.deleted_at IS NULL AND i.deleted_at IS NULL
      AND app.metric_day_ist(i.invoice_date, i.created_at) BETWEEN mdw.dirty_from AND COALESCE(mdw.dirty_to, mdw.dirty_from)
      AND (mdw.cursor_id IS NULL OR (ii.tenant_product_id, i.location_id) > (mdw.cursor_id, mdw.cursor_aux_id))
    UNION
    SELECT s.location_id, s.tenant_product_id
    FROM app.metrics_product_location_snapshot s
    JOIN app.metrics_dirty_work mdw ON mdw.lease_owner = p_owner_token
      AND mdw.dirty_from IS NOT NULL
      AND current_setting('app.metrics_cursor_stage', true) = 'product_location'
    WHERE s.tenant_id = p_tenant_id AND s.deleted_at IS NULL
      AND (mdw.cursor_id IS NULL OR (s.tenant_product_id, s.location_id) > (mdw.cursor_id, mdw.cursor_aux_id))
  ) pairs
  WHERE location_id IS NOT NULL AND tenant_product_id IS NOT NULL
  ORDER BY tenant_product_id, location_id
  LIMIT 100;

  INSERT INTO app.metrics_product_location_snapshot (
    tenant_id, location_id, tenant_product_id, external_ref,
    on_hand, reserved, available, low_stock, out_of_stock,
    invoice_units_90d, invoice_value_90d, last_invoice_at, source_watermark,
    computed_at, calculation_version, generation_id, updated_at, deleted_at, fencing_epoch
  )
  SELECT p_tenant_id, k.location_id, k.tenant_product_id,
    'metrics:product-location:' || k.location_id::text || ':' || k.tenant_product_id::text,
    COALESCE(inv.on_hand, 0), COALESCE(inv.reserved, 0),
    COALESCE(inv.on_hand, 0) - COALESCE(inv.reserved, 0),
    COALESCE(inv.on_hand, 0) - COALESCE(inv.reserved, 0) > 0
      AND COALESCE(inv.on_hand, 0) - COALESCE(inv.reserved, 0) <= COALESCE(inv.reorder_point, 0),
    COALESCE(inv.on_hand, 0) - COALESCE(inv.reserved, 0) <= 0, COALESCE(sales.units90, 0),
    COALESCE(sales.value90, 0), sales.last_at,
    GREATEST(inv.watermark, sales.watermark), v_now, 1, gen_random_uuid(), v_now, NULL, p_fencing_epoch
  FROM pg_temp.metrics_product_location_keys k
  LEFT JOIN LATERAL (
    SELECT SUM(ti.qty_available) AS on_hand, SUM(ti.qty_reserved) AS reserved,
      MAX(ti.reorder_point) AS reorder_point, MAX(GREATEST(ti.updated_at, w.updated_at)) AS watermark
    FROM app.tenant_inventory ti JOIN app.warehouses w ON w.id = ti.warehouse_id
    WHERE ti.tenant_product_id = k.tenant_product_id AND w.location_id = k.location_id
      AND w.tenant_id = p_tenant_id AND ti.deleted_at IS NULL
      AND w.deleted_at IS NULL AND w.status = 'active'
  ) inv ON true
  LEFT JOIN LATERAL (
    SELECT SUM(ii.qty) AS units90,
      SUM(COALESCE(ii.line_total, ii.qty * ii.unit_price)) AS value90,
      MAX(app.metric_day_ist(i.invoice_date, i.created_at)::timestamp AT TIME ZONE 'Asia/Kolkata') AS last_at,
      MAX(GREATEST(i.updated_at, ii.updated_at)) AS watermark
    FROM app.invoice_items ii JOIN app.invoices i ON i.id = ii.invoice_id
    WHERE ii.tenant_product_id = k.tenant_product_id AND i.location_id = k.location_id
      AND i.tenant_id = p_tenant_id AND ii.deleted_at IS NULL AND i.deleted_at IS NULL
      AND app.invoice_status_gmv_included(i.status)
      AND app.metric_day_ist(i.invoice_date, i.created_at) >= v_today - 89
  ) sales ON true
  ON CONFLICT (tenant_id, location_id, tenant_product_id) WHERE deleted_at IS NULL DO UPDATE SET
    on_hand = EXCLUDED.on_hand, reserved = EXCLUDED.reserved, available = EXCLUDED.available,
    low_stock = EXCLUDED.low_stock, out_of_stock = EXCLUDED.out_of_stock,
    invoice_units_90d = EXCLUDED.invoice_units_90d, invoice_value_90d = EXCLUDED.invoice_value_90d,
    last_invoice_at = EXCLUDED.last_invoice_at, source_watermark = EXCLUDED.source_watermark,
    computed_at = EXCLUDED.computed_at, generation_id = EXCLUDED.generation_id,
    updated_at = EXCLUDED.updated_at, fencing_epoch = EXCLUDED.fencing_epoch
  WHERE ROW(app.metrics_product_location_snapshot.on_hand,
    app.metrics_product_location_snapshot.reserved, app.metrics_product_location_snapshot.available,
    app.metrics_product_location_snapshot.low_stock, app.metrics_product_location_snapshot.out_of_stock,
    app.metrics_product_location_snapshot.invoice_units_90d,
    app.metrics_product_location_snapshot.invoice_value_90d,
    app.metrics_product_location_snapshot.last_invoice_at,
    app.metrics_product_location_snapshot.source_watermark)
  IS DISTINCT FROM ROW(EXCLUDED.on_hand, EXCLUDED.reserved, EXCLUDED.available,
    EXCLUDED.low_stock, EXCLUDED.out_of_stock, EXCLUDED.invoice_units_90d,
    EXCLUDED.invoice_value_90d, EXCLUDED.last_invoice_at, EXCLUDED.source_watermark);
  GET DIAGNOSTICS v_count = ROW_COUNT; v_rows := v_rows + v_count;

  INSERT INTO pg_temp.metrics_location_day_keys(location_id, day)
  SELECT old_location_id, old_day
  FROM app.metrics_dirty_work WHERE lease_owner = p_owner_token AND dirty_from IS NULL
    AND old_location_id IS NOT NULL AND old_day IS NOT NULL
  UNION
  SELECT new_location_id, new_day
  FROM app.metrics_dirty_work WHERE lease_owner = p_owner_token AND dirty_from IS NULL
    AND new_location_id IS NOT NULL AND new_day IS NOT NULL
  UNION
  SELECT lk.id, d.day FROM pg_temp.metrics_location_keys lk CROSS JOIN pg_temp.metrics_scope_days d
  WHERE current_setting('app.metrics_cursor_stage', true) = 'location_day'
  ORDER BY 1, 2 LIMIT 100;

  -- Purge soft-deleted rows matching keys we're about to insert.
  -- The ON CONFLICT clause below is partial (WHERE deleted_at IS NULL) and
  -- won't fire for prior soft-deletes; a stale soft-deleted row with the same
  -- (tenant_id, external_ref) would trip the non-partial unique constraint.
  DELETE FROM app.metrics_location_daily
  WHERE tenant_id = p_tenant_id
    AND deleted_at IS NOT NULL
    AND (location_id, day) IN (SELECT location_id, day FROM pg_temp.metrics_location_day_keys);

  INSERT INTO app.metrics_location_daily (
    tenant_id, location_id, external_ref, day,
    invoice_count, invoice_value, invoice_units, estimate_count, estimate_value, estimate_units,
    order_count, order_value, order_units, app_invoice_count, app_invoice_value,
    app_estimate_count, app_estimate_value, app_order_count, app_order_value,
    source_watermark, computed_at, calculation_version, updated_at, deleted_at, fencing_epoch
  )
  WITH keys AS (
    SELECT location_id, day FROM pg_temp.metrics_location_day_keys
  ), facts AS (
    SELECT i.location_id, app.metric_day_ist(i.invoice_date, i.created_at) AS day,
      COUNT(*) FILTER (WHERE app.invoice_status_gmv_included(i.status)) AS invoice_count,
      COALESCE(SUM(i.total_amount) FILTER (WHERE app.invoice_status_gmv_included(i.status)), 0) AS invoice_value,
      COALESCE(SUM(li.units) FILTER (WHERE app.invoice_status_gmv_included(i.status)), 0) AS invoice_units,
      0::bigint AS estimate_count, 0::numeric AS estimate_value, 0::numeric AS estimate_units,
      0::bigint AS order_count, 0::numeric AS order_value, 0::numeric AS order_units,
      COUNT(*) FILTER (WHERE i.is_buyer_app_invoice AND app.invoice_status_gmv_included(i.status)) AS app_invoice_count,
      COALESCE(SUM(i.total_amount) FILTER (WHERE i.is_buyer_app_invoice AND app.invoice_status_gmv_included(i.status)), 0) AS app_invoice_value,
      0::bigint AS app_estimate_count, 0::numeric AS app_estimate_value,
      0::bigint AS app_order_count, 0::numeric AS app_order_value,
      MAX(GREATEST(i.updated_at, li.watermark)) AS watermark
    FROM app.invoices i JOIN keys k ON k.location_id = i.location_id
      AND k.day = app.metric_day_ist(i.invoice_date, i.created_at)
    LEFT JOIN LATERAL (SELECT SUM(ii.qty) units, MAX(ii.updated_at) watermark
      FROM app.invoice_items ii WHERE ii.invoice_id = i.id AND ii.deleted_at IS NULL) li ON true
    WHERE i.tenant_id = p_tenant_id AND i.deleted_at IS NULL GROUP BY i.location_id, 2
    UNION ALL
    SELECT e.location_id, app.metric_day_ist(e.estimate_date, e.created_at),
      0,0,0, COUNT(*), COALESCE(SUM(e.total_amount),0), COALESCE(SUM(li.units),0), 0,0,0,
      0,0, COUNT(*) FILTER (WHERE e.is_buyer_app_estimate),
      COALESCE(SUM(e.total_amount) FILTER (WHERE e.is_buyer_app_estimate),0), 0,0,
      MAX(GREATEST(e.updated_at, li.watermark))
    FROM app.estimates e JOIN keys k ON k.location_id = e.location_id
      AND k.day = app.metric_day_ist(e.estimate_date, e.created_at)
    LEFT JOIN LATERAL (SELECT SUM(ei.qty) units, MAX(ei.updated_at) watermark
      FROM app.estimate_items ei WHERE ei.estimate_id = e.id AND ei.deleted_at IS NULL) li ON true
    WHERE e.tenant_id = p_tenant_id AND e.deleted_at IS NULL GROUP BY e.location_id, 2
    UNION ALL
    SELECT o.location_id, app.metric_day_ist(o.order_date, o.created_at),
      0,0,0,0,0,0,
      COUNT(*) FILTER (WHERE app.order_status_in_flow(o.status)),
      COALESCE(SUM(o.total_amount) FILTER (WHERE app.order_status_in_flow(o.status)),0),
      COALESCE(SUM(li.units) FILTER (WHERE app.order_status_in_flow(o.status)),0),
      0,0,0,0,
      COUNT(*) FILTER (WHERE o.is_buyer_app_order AND app.order_status_in_flow(o.status)),
      COALESCE(SUM(o.total_amount) FILTER (WHERE o.is_buyer_app_order AND app.order_status_in_flow(o.status)),0),
      MAX(GREATEST(o.updated_at, li.watermark))
    FROM app.orders o JOIN keys k ON k.location_id = o.location_id
      AND k.day = app.metric_day_ist(o.order_date, o.created_at)
    LEFT JOIN LATERAL (SELECT SUM(oi.qty) units, MAX(oi.updated_at) watermark
      FROM app.order_items oi WHERE oi.order_id = o.id AND oi.deleted_at IS NULL) li ON true
    WHERE o.tenant_id = p_tenant_id AND o.deleted_at IS NULL GROUP BY o.location_id, 2
  ), rollup AS (
    SELECT location_id, day, SUM(invoice_count) invoice_count, SUM(invoice_value) invoice_value,
      SUM(invoice_units) invoice_units, SUM(estimate_count) estimate_count, SUM(estimate_value) estimate_value,
      SUM(estimate_units) estimate_units, SUM(order_count) order_count, SUM(order_value) order_value,
      SUM(order_units) order_units, SUM(app_invoice_count) app_invoice_count,
      SUM(app_invoice_value) app_invoice_value, SUM(app_estimate_count) app_estimate_count,
      SUM(app_estimate_value) app_estimate_value, SUM(app_order_count) app_order_count,
      SUM(app_order_value) app_order_value, MAX(watermark) watermark
    FROM facts GROUP BY location_id, day
  )
  SELECT p_tenant_id, r.location_id, 'metrics:location-day:' || r.location_id::text || ':' || r.day::text,
    r.day, r.invoice_count, r.invoice_value, r.invoice_units, r.estimate_count, r.estimate_value,
    r.estimate_units, r.order_count, r.order_value, r.order_units, r.app_invoice_count,
    r.app_invoice_value, r.app_estimate_count, r.app_estimate_value, r.app_order_count,
    r.app_order_value, r.watermark, v_now, 1, v_now, NULL, p_fencing_epoch
  FROM rollup r
  ON CONFLICT (tenant_id, location_id, day) WHERE deleted_at IS NULL DO UPDATE SET
    invoice_count=EXCLUDED.invoice_count, invoice_value=EXCLUDED.invoice_value, invoice_units=EXCLUDED.invoice_units,
    estimate_count=EXCLUDED.estimate_count, estimate_value=EXCLUDED.estimate_value, estimate_units=EXCLUDED.estimate_units,
    order_count=EXCLUDED.order_count, order_value=EXCLUDED.order_value, order_units=EXCLUDED.order_units,
    app_invoice_count=EXCLUDED.app_invoice_count, app_invoice_value=EXCLUDED.app_invoice_value,
    app_estimate_count=EXCLUDED.app_estimate_count, app_estimate_value=EXCLUDED.app_estimate_value,
    app_order_count=EXCLUDED.app_order_count, app_order_value=EXCLUDED.app_order_value,
    source_watermark=EXCLUDED.source_watermark, computed_at=EXCLUDED.computed_at,
    updated_at=EXCLUDED.updated_at, deleted_at=NULL, fencing_epoch=EXCLUDED.fencing_epoch
  WHERE ROW(app.metrics_location_daily.invoice_count, app.metrics_location_daily.invoice_value,
    app.metrics_location_daily.invoice_units, app.metrics_location_daily.estimate_count,
    app.metrics_location_daily.estimate_value, app.metrics_location_daily.estimate_units,
    app.metrics_location_daily.order_count, app.metrics_location_daily.order_value,
    app.metrics_location_daily.order_units, app.metrics_location_daily.app_invoice_count,
    app.metrics_location_daily.app_invoice_value, app.metrics_location_daily.app_estimate_count,
    app.metrics_location_daily.app_estimate_value, app.metrics_location_daily.app_order_count,
    app.metrics_location_daily.app_order_value, app.metrics_location_daily.source_watermark)
  IS DISTINCT FROM ROW(EXCLUDED.invoice_count, EXCLUDED.invoice_value, EXCLUDED.invoice_units,
    EXCLUDED.estimate_count, EXCLUDED.estimate_value, EXCLUDED.estimate_units,
    EXCLUDED.order_count, EXCLUDED.order_value, EXCLUDED.order_units, EXCLUDED.app_invoice_count,
    EXCLUDED.app_invoice_value, EXCLUDED.app_estimate_count, EXCLUDED.app_estimate_value,
    EXCLUDED.app_order_count, EXCLUDED.app_order_value, EXCLUDED.source_watermark);
  GET DIAGNOSTICS v_count = ROW_COUNT; v_rows := v_rows + v_count;

  UPDATE app.metrics_dirty_work w
  SET cursor_id = CASE WHEN (SELECT COUNT(*) FROM pg_temp.metrics_product_location_keys) >= 100
      THEN (SELECT tenant_product_id FROM pg_temp.metrics_product_location_keys
        ORDER BY tenant_product_id DESC, location_id DESC LIMIT 1) ELSE NULL END,
    cursor_aux_id = CASE WHEN (SELECT COUNT(*) FROM pg_temp.metrics_product_location_keys) >= 100
      THEN (SELECT location_id FROM pg_temp.metrics_product_location_keys
        ORDER BY tenant_product_id DESC, location_id DESC LIMIT 1) ELSE NULL END,
    cursor_kind = CASE WHEN (SELECT COUNT(*) FROM pg_temp.metrics_product_location_keys) >= 100
      THEN 'product_location' ELSE 'location' END,
    updated_at = clock_timestamp()
  WHERE w.lease_owner = p_owner_token AND w.state = 'claimed'
    AND w.claimed_version = w.dirty_version AND w.dirty_from IS NOT NULL
    AND current_setting('app.metrics_cursor_stage', true) = 'product_location';

  UPDATE app.metrics_location_daily ld
  SET deleted_at=v_now, updated_at=v_now, computed_at=v_now, fencing_epoch=p_fencing_epoch
  WHERE ld.tenant_id=p_tenant_id AND ld.deleted_at IS NULL
    AND (ld.location_id, ld.day) IN (SELECT location_id, day FROM pg_temp.metrics_location_day_keys)
    AND NOT EXISTS (
      SELECT 1 FROM app.estimates e WHERE e.tenant_id=p_tenant_id AND e.location_id=ld.location_id
        AND e.deleted_at IS NULL AND app.metric_day_ist(e.estimate_date,e.created_at)=ld.day
      UNION ALL
      SELECT 1 FROM app.orders o WHERE o.tenant_id=p_tenant_id AND o.location_id=ld.location_id
        AND o.deleted_at IS NULL AND app.order_status_in_flow(o.status)
        AND app.metric_day_ist(o.order_date,o.created_at)=ld.day
      UNION ALL
      SELECT 1 FROM app.invoices i WHERE i.tenant_id=p_tenant_id AND i.location_id=ld.location_id
        AND i.deleted_at IS NULL AND app.invoice_status_gmv_included(i.status)
        AND app.metric_day_ist(i.invoice_date,i.created_at)=ld.day
    );
  GET DIAGNOSTICS v_count = ROW_COUNT; v_rows := v_rows + v_count;

  UPDATE app.metrics_dirty_work w
  SET cursor_id = CASE WHEN (SELECT COUNT(*) FROM pg_temp.metrics_location_keys) >= 100
      THEN (SELECT id FROM pg_temp.metrics_location_keys ORDER BY id DESC LIMIT 1) ELSE NULL END,
    cursor_kind = CASE
      WHEN (SELECT COUNT(*) FROM pg_temp.metrics_location_keys) >= 100 THEN 'location'
      WHEN w.domain = 'commercial' THEN 'day' ELSE 'done' END,
    updated_at = clock_timestamp()
  WHERE w.lease_owner = p_owner_token AND w.state = 'claimed'
    AND w.claimed_version = w.dirty_version AND w.dirty_from IS NOT NULL
    AND current_setting('app.metrics_cursor_stage', true) = 'location';

  UPDATE app.metrics_dirty_work w
  SET cursor_id = CASE WHEN (SELECT COUNT(*) FROM pg_temp.metrics_location_keys) = 0
      THEN NULL ELSE (SELECT id FROM pg_temp.metrics_location_keys ORDER BY id DESC LIMIT 1) END,
    cursor_day = CASE WHEN (SELECT COUNT(*) FROM pg_temp.metrics_location_keys) > 0
        AND (SELECT COUNT(*) FROM pg_temp.metrics_scope_days) >= 100
      THEN (SELECT MAX(day) FROM pg_temp.metrics_scope_days) ELSE NULL END,
    cursor_kind = CASE WHEN (SELECT COUNT(*) FROM pg_temp.metrics_location_keys) = 0
      THEN 'done' ELSE 'location_day' END,
    updated_at = clock_timestamp()
  WHERE w.lease_owner = p_owner_token AND w.state = 'claimed'
    AND w.claimed_version = w.dirty_version AND w.dirty_from IS NOT NULL
    AND current_setting('app.metrics_cursor_stage', true) = 'location_day';

  RETURN QUERY SELECT v_rows, 6;
END;
$$;
