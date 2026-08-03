-- CRITICAL correctness fix, found via reconciliation against real data
-- (WineYard tenant, May 2026): metrics_tenant_period_summary's invoice/
-- estimate/order LATERALs joined the *_items table in the same query used
-- to SUM(*.total_amount) -- a header-level column. For an invoice with N
-- line items, that join repeats the invoice row N times, so
-- SUM(i.total_amount) summed the same total N times. Confirmed on real
-- data: invoice_count and invoice_buyer_count matched raw exactly (both
-- correctly used COUNT(DISTINCT)), but invoice_value was 5.7x too high
-- (snapshot 145,378,065 vs raw 25,499,938 for the same month). invoice_units
-- (SUM(ii.qty)) was NOT wrong -- that's legitimately item-level and is
-- supposed to fan out. Same shape existed for estimate_value, order_value,
-- app_estimate_value, app_order_value.
--
-- Fix: split each of the three LATERALs into a header subquery (count/
-- value/buyer_count, no item join) and an items subquery (units/
-- product_count, needs the item join), combined with a plain cross join.
-- No other summary table has this shape -- buyer_period_summary and
-- location_period_summary aggregate directly from invoices/estimates/
-- orders with no item join, and product_period_summary correctly sums
-- ii.line_total (item-level) rather than i.total_amount (header-level).
CREATE OR REPLACE FUNCTION app._metrics_v4_refresh_claimed_periods(
  p_owner_token uuid,
  p_fencing_epoch bigint,
  p_tenant_id uuid,
  p_domain text
)
RETURNS TABLE (rows_written integer, statement_groups integer, source_watermark timestamptz)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, app, pg_temp
AS $$
DECLARE
  v_now timestamptz := clock_timestamp();
  v_today date := (clock_timestamp() AT TIME ZONE 'Asia/Kolkata')::date;
  v_primary text := app.metrics_v4_primary_demand_kind(p_tenant_id);
  v_rows integer := 0;
  v_count integer;
  v_dirty_day_count integer := 0;
  v_buyer_key_count integer := 0;
  v_product_key_count integer := 0;
  v_watermark timestamptz;
  -- Single common budget, shared across all tenants -- read from the same
  -- app.metrics_runtime_control global row v2's claim step already uses.
  -- Was previously a hardcoded 100 here, disconnected from that config
  -- entirely; that's fixed now so there's one source of truth, not two.
  v_max_refresh_keys integer;
BEGIN
  PERFORM app._metrics_assert_refresh_fence(p_owner_token, p_fencing_epoch, p_tenant_id, p_domain);

  SELECT COALESCE(c.max_refresh_keys_per_tick, 100) INTO v_max_refresh_keys
  FROM app.metrics_runtime_control c
  WHERE c.control_scope = 'global'
  LIMIT 1;
  v_max_refresh_keys := COALESCE(v_max_refresh_keys, 100);

  IF EXISTS (
    SELECT 1
    FROM app.metrics_dirty_work w
    WHERE w.lease_owner = p_owner_token
      AND w.state = 'claimed'
      AND w.claimed_version = w.dirty_version
      AND w.dirty_from IS NOT NULL
      AND COALESCE(w.dirty_to, w.dirty_from) - w.dirty_from > 99
  ) THEN
    RAISE EXCEPTION 'metrics_v4_dirty_range_too_large: mark integration/import reconciliation in <=100 day windows';
  END IF;

  CREATE TEMP TABLE IF NOT EXISTS pg_temp.metrics_v4_dirty_days(day date PRIMARY KEY) ON COMMIT DROP;
  CREATE TEMP TABLE IF NOT EXISTS pg_temp.metrics_v4_period_keys(grain text NOT NULL, period_start date NOT NULL, period_end_exclusive date NOT NULL, PRIMARY KEY (grain, period_start)) ON COMMIT DROP;
  -- Buyer/product ids are collected and budget-checked ONCE here (real cost:
  -- one raw-table scan per entity), then expanded into both grains below.
  -- Previously the budget check counted buyer x grain rows directly, so
  -- every entity silently cost 2x against the budget for work that only
  -- happens once -- that's what was blowing the ceiling, not real load.
  CREATE TEMP TABLE IF NOT EXISTS pg_temp.metrics_v4_buyer_ids(buyer_id uuid PRIMARY KEY) ON COMMIT DROP;
  CREATE TEMP TABLE IF NOT EXISTS pg_temp.metrics_v4_product_ids(tenant_product_id uuid PRIMARY KEY) ON COMMIT DROP;
  CREATE TEMP TABLE IF NOT EXISTS pg_temp.metrics_v4_buyer_period_keys(buyer_id uuid NOT NULL, grain text NOT NULL, period_start date NOT NULL, period_end_exclusive date NOT NULL, PRIMARY KEY (buyer_id, grain, period_start)) ON COMMIT DROP;
  CREATE TEMP TABLE IF NOT EXISTS pg_temp.metrics_v4_product_period_keys(tenant_product_id uuid NOT NULL, grain text NOT NULL, period_start date NOT NULL, period_end_exclusive date NOT NULL, PRIMARY KEY (tenant_product_id, grain, period_start)) ON COMMIT DROP;
  CREATE TEMP TABLE IF NOT EXISTS pg_temp.metrics_v4_location_keys(location_id uuid PRIMARY KEY) ON COMMIT DROP;
  TRUNCATE pg_temp.metrics_v4_dirty_days, pg_temp.metrics_v4_period_keys, pg_temp.metrics_v4_buyer_ids, pg_temp.metrics_v4_product_ids, pg_temp.metrics_v4_buyer_period_keys, pg_temp.metrics_v4_product_period_keys, pg_temp.metrics_v4_location_keys;

  INSERT INTO pg_temp.metrics_v4_dirty_days(day)
  SELECT day
  FROM (
    SELECT w.old_day AS day FROM app.metrics_dirty_work w WHERE w.lease_owner = p_owner_token AND w.claimed_version IS NOT NULL
    UNION
    SELECT w.new_day FROM app.metrics_dirty_work w WHERE w.lease_owner = p_owner_token AND w.claimed_version IS NOT NULL
    UNION
    SELECT gs::date
    FROM app.metrics_dirty_work w
    CROSS JOIN LATERAL generate_series(w.dirty_from, COALESCE(w.dirty_to, w.dirty_from), interval '1 day') gs
    WHERE w.lease_owner = p_owner_token AND w.claimed_version IS NOT NULL AND w.dirty_from IS NOT NULL
  ) d
  WHERE day IS NOT NULL
  ORDER BY day
  LIMIT 100
  ON CONFLICT DO NOTHING;
  GET DIAGNOSTICS v_dirty_day_count = ROW_COUNT;

  IF NOT EXISTS (SELECT 1 FROM pg_temp.metrics_v4_dirty_days) THEN
    INSERT INTO pg_temp.metrics_v4_dirty_days(day) VALUES (v_today) ON CONFLICT DO NOTHING;
  END IF;

  INSERT INTO pg_temp.metrics_v4_period_keys(grain, period_start, period_end_exclusive)
  SELECT grain, period_start, period_end_exclusive
  FROM (
    SELECT 'day'::text AS grain, d.day AS period_start, d.day + 1 AS period_end_exclusive
    FROM pg_temp.metrics_v4_dirty_days d
    UNION
    SELECT 'week', (d.day - ((EXTRACT(isodow FROM d.day)::integer - 1) * interval '1 day'))::date,
      ((d.day - ((EXTRACT(isodow FROM d.day)::integer - 1) * interval '1 day')) + interval '7 days')::date
    FROM pg_temp.metrics_v4_dirty_days d
    UNION
    SELECT 'month', date_trunc('month', d.day)::date, (date_trunc('month', d.day) + interval '1 month')::date
    FROM pg_temp.metrics_v4_dirty_days d
    UNION
    SELECT 'quarter', date_trunc('quarter', d.day)::date, (date_trunc('quarter', d.day) + interval '3 months')::date
    FROM pg_temp.metrics_v4_dirty_days d
  ) p
  ON CONFLICT DO NOTHING;

  INSERT INTO pg_temp.metrics_v4_buyer_ids(buyer_id)
  SELECT buyer_id
  FROM (
    SELECT w.old_buyer_id AS buyer_id
    FROM app.metrics_dirty_work w
    WHERE w.lease_owner = p_owner_token AND w.claimed_version IS NOT NULL
    UNION
    SELECT w.new_buyer_id
    FROM app.metrics_dirty_work w
    WHERE w.lease_owner = p_owner_token AND w.claimed_version IS NOT NULL
    UNION
    SELECT e.buyer_id
    FROM app.estimates e
    WHERE e.tenant_id = p_tenant_id AND e.deleted_at IS NULL
      AND EXISTS (SELECT 1 FROM pg_temp.metrics_v4_dirty_days d WHERE d.day = app.metric_day_ist(e.estimate_date, e.created_at))
    UNION
    SELECT o.buyer_id
    FROM app.orders o
    WHERE o.tenant_id = p_tenant_id AND o.deleted_at IS NULL
      AND EXISTS (SELECT 1 FROM pg_temp.metrics_v4_dirty_days d WHERE d.day = app.metric_day_ist(o.order_date, o.created_at))
    UNION
    SELECT i.buyer_id
    FROM app.invoices i
    WHERE i.tenant_id = p_tenant_id AND i.deleted_at IS NULL
      AND EXISTS (SELECT 1 FROM pg_temp.metrics_v4_dirty_days d WHERE d.day = app.metric_day_ist(i.invoice_date, i.created_at))
  ) k
  WHERE buyer_id IS NOT NULL
  ORDER BY buyer_id
  LIMIT (v_max_refresh_keys + 1)
  ON CONFLICT DO NOTHING;
  SELECT COUNT(*) INTO v_buyer_key_count FROM pg_temp.metrics_v4_buyer_ids;
  IF v_buyer_key_count > v_max_refresh_keys THEN
    RAISE EXCEPTION 'metrics_v4_buyer_key_budget_exceeded: split reconciliation/import dirty work into smaller windows';
  END IF;

  INSERT INTO pg_temp.metrics_v4_buyer_period_keys(buyer_id, grain, period_start, period_end_exclusive)
  SELECT b.buyer_id, p.grain, p.period_start, p.period_end_exclusive
  FROM pg_temp.metrics_v4_buyer_ids b
  CROSS JOIN pg_temp.metrics_v4_period_keys p
  WHERE p.grain IN ('month','quarter')
  ON CONFLICT DO NOTHING;

  INSERT INTO pg_temp.metrics_v4_product_ids(tenant_product_id)
  SELECT tenant_product_id
  FROM (
    SELECT w.old_tenant_product_id AS tenant_product_id
    FROM app.metrics_dirty_work w
    WHERE w.lease_owner = p_owner_token AND w.claimed_version IS NOT NULL
    UNION
    SELECT w.new_tenant_product_id
    FROM app.metrics_dirty_work w
    WHERE w.lease_owner = p_owner_token AND w.claimed_version IS NOT NULL
    UNION
    SELECT ei.tenant_product_id
    FROM app.estimate_items ei JOIN app.estimates e ON e.id = ei.estimate_id AND e.tenant_id = p_tenant_id AND e.deleted_at IS NULL
    WHERE ei.deleted_at IS NULL
      AND EXISTS (SELECT 1 FROM pg_temp.metrics_v4_dirty_days d WHERE d.day = app.metric_day_ist(e.estimate_date, e.created_at))
    UNION
    SELECT oi.tenant_product_id
    FROM app.order_items oi JOIN app.orders o ON o.id = oi.order_id AND o.tenant_id = p_tenant_id AND o.deleted_at IS NULL
    WHERE oi.deleted_at IS NULL
      AND EXISTS (SELECT 1 FROM pg_temp.metrics_v4_dirty_days d WHERE d.day = app.metric_day_ist(o.order_date, o.created_at))
    UNION
    SELECT ii.tenant_product_id
    FROM app.invoice_items ii JOIN app.invoices i ON i.id = ii.invoice_id AND i.tenant_id = p_tenant_id AND i.deleted_at IS NULL
    WHERE ii.deleted_at IS NULL
      AND EXISTS (SELECT 1 FROM pg_temp.metrics_v4_dirty_days d WHERE d.day = app.metric_day_ist(i.invoice_date, i.created_at))
  ) k
  WHERE tenant_product_id IS NOT NULL
  ORDER BY tenant_product_id
  LIMIT (v_max_refresh_keys + 1)
  ON CONFLICT DO NOTHING;
  SELECT COUNT(*) INTO v_product_key_count FROM pg_temp.metrics_v4_product_ids;
  IF v_product_key_count > v_max_refresh_keys THEN
    RAISE EXCEPTION 'metrics_v4_product_key_budget_exceeded: split reconciliation/import dirty work into smaller windows';
  END IF;

  INSERT INTO pg_temp.metrics_v4_product_period_keys(tenant_product_id, grain, period_start, period_end_exclusive)
  SELECT pr.tenant_product_id, p.grain, p.period_start, p.period_end_exclusive
  FROM pg_temp.metrics_v4_product_ids pr
  CROSS JOIN pg_temp.metrics_v4_period_keys p
  WHERE p.grain IN ('month','quarter')
  ON CONFLICT DO NOTHING;

  INSERT INTO pg_temp.metrics_v4_location_keys(location_id)
  SELECT location_id
  FROM (
    SELECT w.old_location_id AS location_id
    FROM app.metrics_dirty_work w
    WHERE w.lease_owner = p_owner_token AND w.claimed_version IS NOT NULL
    UNION
    SELECT w.new_location_id
    FROM app.metrics_dirty_work w
    WHERE w.lease_owner = p_owner_token AND w.claimed_version IS NOT NULL
    UNION
    SELECT e.location_id
    FROM app.estimates e
    WHERE e.tenant_id = p_tenant_id AND e.deleted_at IS NULL
      AND EXISTS (SELECT 1 FROM pg_temp.metrics_v4_dirty_days d WHERE d.day = app.metric_day_ist(e.estimate_date, e.created_at))
    UNION
    SELECT o.location_id
    FROM app.orders o
    WHERE o.tenant_id = p_tenant_id AND o.deleted_at IS NULL
      AND EXISTS (SELECT 1 FROM pg_temp.metrics_v4_dirty_days d WHERE d.day = app.metric_day_ist(o.order_date, o.created_at))
    UNION
    SELECT i.location_id
    FROM app.invoices i
    WHERE i.tenant_id = p_tenant_id AND i.deleted_at IS NULL
      AND EXISTS (SELECT 1 FROM pg_temp.metrics_v4_dirty_days d WHERE d.day = app.metric_day_ist(i.invoice_date, i.created_at))
  ) k
  WHERE location_id IS NOT NULL
  ORDER BY location_id
  LIMIT (v_max_refresh_keys + 1)
  ON CONFLICT DO NOTHING;
  IF (SELECT COUNT(*) FROM pg_temp.metrics_v4_location_keys) > v_max_refresh_keys THEN
    RAISE EXCEPTION 'metrics_v4_location_key_budget_exceeded: split reconciliation/import dirty work into smaller windows';
  END IF;

  -- Domain-scoped writes. Each of the four tick domains (commercial/inventory/
  -- buyer_app/setup) claims dirty work independently and calls this function
  -- with a different p_domain; without this gate all four ran the identical
  -- commercial block, quadrupling write cost while never touching the
  -- location/warehouse/campaign/cohort tables those domains own.
  IF p_domain = 'commercial' THEN

  INSERT INTO app.metrics_tenant_period_summary (
    tenant_id, external_ref, grain, period_start, period_end_exclusive,
    invoice_count, invoice_value, invoice_units, invoice_buyer_count, invoice_product_count,
    estimate_count, estimate_value, estimate_units, estimate_buyer_count, estimate_product_count,
    order_count, order_value, order_units, order_buyer_count, order_product_count,
    app_estimate_count, app_estimate_value, app_estimate_buyer_count,
    app_order_count, app_order_value, app_order_buyer_count,
    primary_demand_kind, primary_demand_count, primary_demand_value, primary_demand_buyer_count,
    source_watermark, computed_at, updated_at, deleted_at
  )
  SELECT p_tenant_id, concat_ws(':', p_tenant_id::text, 'tenant', p.grain, p.period_start::text),
    p.grain, p.period_start, p.period_end_exclusive,
    COALESCE(inv.invoice_count,0), COALESCE(inv.invoice_value,0), COALESCE(inv.invoice_units,0), COALESCE(inv.invoice_buyer_count,0), COALESCE(inv.invoice_product_count,0),
    COALESCE(est.estimate_count,0), COALESCE(est.estimate_value,0), COALESCE(est.estimate_units,0), COALESCE(est.estimate_buyer_count,0), COALESCE(est.estimate_product_count,0),
    COALESCE(ord.order_count,0), COALESCE(ord.order_value,0), COALESCE(ord.order_units,0), COALESCE(ord.order_buyer_count,0), COALESCE(ord.order_product_count,0),
    COALESCE(est.app_estimate_count,0), COALESCE(est.app_estimate_value,0), COALESCE(est.app_estimate_buyer_count,0),
    COALESCE(ord.app_order_count,0), COALESCE(ord.app_order_value,0), COALESCE(ord.app_order_buyer_count,0),
    v_primary,
    CASE WHEN v_primary = 'estimates' THEN COALESCE(est.estimate_count,0) WHEN v_primary = 'orders' THEN COALESCE(ord.order_count,0) ELSE 0 END,
    CASE WHEN v_primary = 'estimates' THEN COALESCE(est.estimate_value,0) WHEN v_primary = 'orders' THEN COALESCE(ord.order_value,0) ELSE 0 END,
    CASE WHEN v_primary = 'estimates' THEN COALESCE(est.estimate_buyer_count,0) WHEN v_primary = 'orders' THEN COALESCE(ord.order_buyer_count,0) ELSE 0 END,
    GREATEST(inv.watermark, est.watermark, ord.watermark), v_now, v_now, NULL
  FROM pg_temp.metrics_v4_period_keys p
  -- Header aggregates (count/value/buyer_count) are computed from invoices
  -- alone, NOT joined to items. Item aggregates (units/product_count) need
  -- the item join. Combining both in one query (as this used to do) fans
  -- i.total_amount out once per line item, inflating SUM(i.total_amount) by
  -- the average items-per-invoice -- confirmed on real data: count and
  -- buyer_count matched raw exactly, invoice_value was 5.7x too high.
  -- invoice_units is legitimately item-level and fans out correctly; only
  -- the header-level SUM was wrong. Same shape existed for estimates/orders.
  LEFT JOIN LATERAL (
    WITH hdr AS (
      SELECT COUNT(DISTINCT i.id) FILTER (WHERE app.invoice_status_gmv_included(i.status))::bigint AS invoice_count,
        COALESCE(SUM(i.total_amount) FILTER (WHERE app.invoice_status_gmv_included(i.status)),0)::numeric AS invoice_value,
        COUNT(DISTINCT i.buyer_id) FILTER (WHERE app.invoice_status_gmv_included(i.status))::bigint AS invoice_buyer_count,
        MAX(i.updated_at) AS watermark_h
      FROM app.invoices i
      WHERE i.tenant_id = p_tenant_id AND i.deleted_at IS NULL
        AND app.metric_day_ist(i.invoice_date, i.created_at) >= p.period_start
        AND app.metric_day_ist(i.invoice_date, i.created_at) < p.period_end_exclusive
    ), items AS (
      SELECT COALESCE(SUM(ii.qty) FILTER (WHERE app.invoice_status_gmv_included(i.status)),0)::numeric AS invoice_units,
        COUNT(DISTINCT ii.tenant_product_id) FILTER (WHERE app.invoice_status_gmv_included(i.status))::bigint AS invoice_product_count,
        MAX(ii.updated_at) AS watermark_i
      FROM app.invoices i LEFT JOIN app.invoice_items ii ON ii.invoice_id = i.id AND ii.deleted_at IS NULL
      WHERE i.tenant_id = p_tenant_id AND i.deleted_at IS NULL
        AND app.metric_day_ist(i.invoice_date, i.created_at) >= p.period_start
        AND app.metric_day_ist(i.invoice_date, i.created_at) < p.period_end_exclusive
    )
    SELECT hdr.invoice_count, hdr.invoice_value, items.invoice_units, hdr.invoice_buyer_count, items.invoice_product_count,
      GREATEST(hdr.watermark_h, items.watermark_i) AS watermark
    FROM hdr, items
  ) inv ON true
  LEFT JOIN LATERAL (
    WITH hdr AS (
      SELECT COUNT(DISTINCT e.id) FILTER (WHERE app.estimate_status_is_open(e.status) OR e.status = 'accepted')::bigint AS estimate_count,
        COALESCE(SUM(e.total_amount) FILTER (WHERE app.estimate_status_is_open(e.status) OR e.status = 'accepted'),0)::numeric AS estimate_value,
        COUNT(DISTINCT e.buyer_id) FILTER (WHERE app.estimate_status_is_open(e.status) OR e.status = 'accepted')::bigint AS estimate_buyer_count,
        COUNT(DISTINCT e.id) FILTER (WHERE e.is_buyer_app_estimate AND (app.estimate_status_is_open(e.status) OR e.status = 'accepted'))::bigint AS app_estimate_count,
        COALESCE(SUM(e.total_amount) FILTER (WHERE e.is_buyer_app_estimate AND (app.estimate_status_is_open(e.status) OR e.status = 'accepted')),0)::numeric AS app_estimate_value,
        COUNT(DISTINCT e.buyer_id) FILTER (WHERE e.is_buyer_app_estimate AND (app.estimate_status_is_open(e.status) OR e.status = 'accepted'))::bigint AS app_estimate_buyer_count,
        MAX(e.updated_at) AS watermark_h
      FROM app.estimates e
      WHERE e.tenant_id = p_tenant_id AND e.deleted_at IS NULL
        AND app.metric_day_ist(e.estimate_date, e.created_at) >= p.period_start
        AND app.metric_day_ist(e.estimate_date, e.created_at) < p.period_end_exclusive
    ), items AS (
      SELECT COALESCE(SUM(ei.qty) FILTER (WHERE app.estimate_status_is_open(e.status) OR e.status = 'accepted'),0)::numeric AS estimate_units,
        COUNT(DISTINCT ei.tenant_product_id) FILTER (WHERE app.estimate_status_is_open(e.status) OR e.status = 'accepted')::bigint AS estimate_product_count,
        MAX(ei.updated_at) AS watermark_i
      FROM app.estimates e LEFT JOIN app.estimate_items ei ON ei.estimate_id = e.id AND ei.deleted_at IS NULL
      WHERE e.tenant_id = p_tenant_id AND e.deleted_at IS NULL
        AND app.metric_day_ist(e.estimate_date, e.created_at) >= p.period_start
        AND app.metric_day_ist(e.estimate_date, e.created_at) < p.period_end_exclusive
    )
    SELECT hdr.estimate_count, hdr.estimate_value, items.estimate_units, hdr.estimate_buyer_count, items.estimate_product_count,
      hdr.app_estimate_count, hdr.app_estimate_value, hdr.app_estimate_buyer_count,
      GREATEST(hdr.watermark_h, items.watermark_i) AS watermark
    FROM hdr, items
  ) est ON true
  LEFT JOIN LATERAL (
    WITH hdr AS (
      SELECT COUNT(DISTINCT o.id) FILTER (WHERE app.order_status_in_flow(o.status))::bigint AS order_count,
        COALESCE(SUM(o.total_amount) FILTER (WHERE app.order_status_in_flow(o.status)),0)::numeric AS order_value,
        COUNT(DISTINCT o.buyer_id) FILTER (WHERE app.order_status_in_flow(o.status))::bigint AS order_buyer_count,
        COUNT(DISTINCT o.id) FILTER (WHERE o.is_buyer_app_order AND app.order_status_in_flow(o.status))::bigint AS app_order_count,
        COALESCE(SUM(o.total_amount) FILTER (WHERE o.is_buyer_app_order AND app.order_status_in_flow(o.status)),0)::numeric AS app_order_value,
        COUNT(DISTINCT o.buyer_id) FILTER (WHERE o.is_buyer_app_order AND app.order_status_in_flow(o.status))::bigint AS app_order_buyer_count,
        MAX(o.updated_at) AS watermark_h
      FROM app.orders o
      WHERE o.tenant_id = p_tenant_id AND o.deleted_at IS NULL
        AND app.metric_day_ist(o.order_date, o.created_at) >= p.period_start
        AND app.metric_day_ist(o.order_date, o.created_at) < p.period_end_exclusive
    ), items AS (
      SELECT COALESCE(SUM(oi.qty) FILTER (WHERE app.order_status_in_flow(o.status)),0)::numeric AS order_units,
        COUNT(DISTINCT oi.tenant_product_id) FILTER (WHERE app.order_status_in_flow(o.status))::bigint AS order_product_count,
        MAX(oi.updated_at) AS watermark_i
      FROM app.orders o LEFT JOIN app.order_items oi ON oi.order_id = o.id AND oi.deleted_at IS NULL
      WHERE o.tenant_id = p_tenant_id AND o.deleted_at IS NULL
        AND app.metric_day_ist(o.order_date, o.created_at) >= p.period_start
        AND app.metric_day_ist(o.order_date, o.created_at) < p.period_end_exclusive
    )
    SELECT hdr.order_count, hdr.order_value, items.order_units, hdr.order_buyer_count, items.order_product_count,
      hdr.app_order_count, hdr.app_order_value, hdr.app_order_buyer_count,
      GREATEST(hdr.watermark_h, items.watermark_i) AS watermark
    FROM hdr, items
  ) ord ON true
  ON CONFLICT (tenant_id, grain, period_start) WHERE deleted_at IS NULL DO UPDATE SET
    period_end_exclusive = EXCLUDED.period_end_exclusive,
    invoice_count = EXCLUDED.invoice_count, invoice_value = EXCLUDED.invoice_value, invoice_units = EXCLUDED.invoice_units, invoice_buyer_count = EXCLUDED.invoice_buyer_count, invoice_product_count = EXCLUDED.invoice_product_count,
    estimate_count = EXCLUDED.estimate_count, estimate_value = EXCLUDED.estimate_value, estimate_units = EXCLUDED.estimate_units, estimate_buyer_count = EXCLUDED.estimate_buyer_count, estimate_product_count = EXCLUDED.estimate_product_count,
    order_count = EXCLUDED.order_count, order_value = EXCLUDED.order_value, order_units = EXCLUDED.order_units, order_buyer_count = EXCLUDED.order_buyer_count, order_product_count = EXCLUDED.order_product_count,
    app_estimate_count = EXCLUDED.app_estimate_count, app_estimate_value = EXCLUDED.app_estimate_value, app_estimate_buyer_count = EXCLUDED.app_estimate_buyer_count,
    app_order_count = EXCLUDED.app_order_count, app_order_value = EXCLUDED.app_order_value, app_order_buyer_count = EXCLUDED.app_order_buyer_count,
    primary_demand_kind = EXCLUDED.primary_demand_kind, primary_demand_count = EXCLUDED.primary_demand_count, primary_demand_value = EXCLUDED.primary_demand_value, primary_demand_buyer_count = EXCLUDED.primary_demand_buyer_count,
    source_watermark = EXCLUDED.source_watermark, computed_at = EXCLUDED.computed_at, generation_id = gen_random_uuid(), updated_at = EXCLUDED.updated_at, deleted_at = NULL;
  GET DIAGNOSTICS v_count = ROW_COUNT; v_rows := v_rows + v_count;

  INSERT INTO app.metrics_buyer_period_summary (
    tenant_id, buyer_id, external_ref, grain, period_start, period_end_exclusive,
    invoice_count, invoice_value, estimate_count, estimate_value, order_count, order_value,
    app_demand_count, app_demand_value, primary_demand_count, primary_demand_value,
    source_watermark, computed_at, updated_at, deleted_at
  )
  SELECT p_tenant_id, k.buyer_id, concat_ws(':', p_tenant_id::text, k.buyer_id::text, k.grain, k.period_start::text), k.grain, k.period_start, k.period_end_exclusive,
    COALESCE(inv.invoice_count,0), COALESCE(inv.invoice_value,0),
    COALESCE(est.estimate_count,0), COALESCE(est.estimate_value,0),
    COALESCE(ord.order_count,0), COALESCE(ord.order_value,0),
    COALESCE(est.app_estimate_count,0) + COALESCE(ord.app_order_count,0),
    COALESCE(est.app_estimate_value,0) + COALESCE(ord.app_order_value,0),
    CASE WHEN v_primary = 'estimates' THEN COALESCE(est.estimate_count,0) WHEN v_primary = 'orders' THEN COALESCE(ord.order_count,0) ELSE 0 END,
    CASE WHEN v_primary = 'estimates' THEN COALESCE(est.estimate_value,0) WHEN v_primary = 'orders' THEN COALESCE(ord.order_value,0) ELSE 0 END,
    GREATEST(inv.watermark, est.watermark, ord.watermark), v_now, v_now, NULL
  FROM pg_temp.metrics_v4_buyer_period_keys k
  LEFT JOIN LATERAL (
    SELECT COUNT(*) FILTER (WHERE app.invoice_status_gmv_included(i.status))::bigint AS invoice_count,
      COALESCE(SUM(i.total_amount) FILTER (WHERE app.invoice_status_gmv_included(i.status)),0)::numeric AS invoice_value,
      MAX(i.updated_at) AS watermark
    FROM app.invoices i WHERE i.tenant_id = p_tenant_id AND i.buyer_id = k.buyer_id AND i.deleted_at IS NULL
      AND app.metric_day_ist(i.invoice_date, i.created_at) >= k.period_start AND app.metric_day_ist(i.invoice_date, i.created_at) < k.period_end_exclusive
  ) inv ON true
  LEFT JOIN LATERAL (
    SELECT COUNT(*) FILTER (WHERE app.estimate_status_is_open(e.status) OR e.status = 'accepted')::bigint AS estimate_count,
      COALESCE(SUM(e.total_amount) FILTER (WHERE app.estimate_status_is_open(e.status) OR e.status = 'accepted'),0)::numeric AS estimate_value,
      COUNT(*) FILTER (WHERE e.is_buyer_app_estimate AND (app.estimate_status_is_open(e.status) OR e.status = 'accepted'))::bigint AS app_estimate_count,
      COALESCE(SUM(e.total_amount) FILTER (WHERE e.is_buyer_app_estimate AND (app.estimate_status_is_open(e.status) OR e.status = 'accepted')),0)::numeric AS app_estimate_value,
      MAX(e.updated_at) AS watermark
    FROM app.estimates e WHERE e.tenant_id = p_tenant_id AND e.buyer_id = k.buyer_id AND e.deleted_at IS NULL
      AND app.metric_day_ist(e.estimate_date, e.created_at) >= k.period_start AND app.metric_day_ist(e.estimate_date, e.created_at) < k.period_end_exclusive
  ) est ON true
  LEFT JOIN LATERAL (
    SELECT COUNT(*) FILTER (WHERE app.order_status_in_flow(o.status))::bigint AS order_count,
      COALESCE(SUM(o.total_amount) FILTER (WHERE app.order_status_in_flow(o.status)),0)::numeric AS order_value,
      COUNT(*) FILTER (WHERE o.is_buyer_app_order AND app.order_status_in_flow(o.status))::bigint AS app_order_count,
      COALESCE(SUM(o.total_amount) FILTER (WHERE o.is_buyer_app_order AND app.order_status_in_flow(o.status)),0)::numeric AS app_order_value,
      MAX(o.updated_at) AS watermark
    FROM app.orders o WHERE o.tenant_id = p_tenant_id AND o.buyer_id = k.buyer_id AND o.deleted_at IS NULL
      AND app.metric_day_ist(o.order_date, o.created_at) >= k.period_start AND app.metric_day_ist(o.order_date, o.created_at) < k.period_end_exclusive
  ) ord ON true
  WHERE COALESCE(inv.invoice_count,0) > 0 OR COALESCE(est.estimate_count,0) > 0 OR COALESCE(ord.order_count,0) > 0
  ON CONFLICT (tenant_id, buyer_id, grain, period_start) WHERE deleted_at IS NULL DO UPDATE SET
    period_end_exclusive = EXCLUDED.period_end_exclusive,
    invoice_count = EXCLUDED.invoice_count, invoice_value = EXCLUDED.invoice_value,
    estimate_count = EXCLUDED.estimate_count, estimate_value = EXCLUDED.estimate_value,
    order_count = EXCLUDED.order_count, order_value = EXCLUDED.order_value,
    app_demand_count = EXCLUDED.app_demand_count, app_demand_value = EXCLUDED.app_demand_value,
    primary_demand_count = EXCLUDED.primary_demand_count, primary_demand_value = EXCLUDED.primary_demand_value,
    source_watermark = EXCLUDED.source_watermark, computed_at = EXCLUDED.computed_at, generation_id = gen_random_uuid(), updated_at = EXCLUDED.updated_at, deleted_at = NULL;
  GET DIAGNOSTICS v_count = ROW_COUNT; v_rows := v_rows + v_count;

  DELETE FROM app.metrics_buyer_period_summary s
  USING pg_temp.metrics_v4_buyer_period_keys k
  WHERE s.tenant_id = p_tenant_id AND s.buyer_id = k.buyer_id AND s.grain = k.grain AND s.period_start = k.period_start AND s.deleted_at IS NULL
    AND NOT EXISTS (
      SELECT 1 FROM app.invoices i WHERE i.tenant_id = p_tenant_id AND i.buyer_id = k.buyer_id AND i.deleted_at IS NULL AND app.invoice_status_gmv_included(i.status) AND app.metric_day_ist(i.invoice_date, i.created_at) >= k.period_start AND app.metric_day_ist(i.invoice_date, i.created_at) < k.period_end_exclusive
      UNION ALL SELECT 1 FROM app.estimates e WHERE e.tenant_id = p_tenant_id AND e.buyer_id = k.buyer_id AND e.deleted_at IS NULL AND (app.estimate_status_is_open(e.status) OR e.status = 'accepted') AND app.metric_day_ist(e.estimate_date, e.created_at) >= k.period_start AND app.metric_day_ist(e.estimate_date, e.created_at) < k.period_end_exclusive
      UNION ALL SELECT 1 FROM app.orders o WHERE o.tenant_id = p_tenant_id AND o.buyer_id = k.buyer_id AND o.deleted_at IS NULL AND app.order_status_in_flow(o.status) AND app.metric_day_ist(o.order_date, o.created_at) >= k.period_start AND app.metric_day_ist(o.order_date, o.created_at) < k.period_end_exclusive
    );
  GET DIAGNOSTICS v_count = ROW_COUNT; v_rows := v_rows + v_count;

  INSERT INTO app.metrics_buyer_now_summary (
    tenant_id, buyer_id, external_ref,
    credit_limit, receivable_amount, overdue_amount, credit_available,
    source_watermark, computed_at, updated_at, deleted_at
  )
  SELECT
    p_tenant_id,
    b.id,
    concat_ws(':', p_tenant_id::text, b.id::text, 'buyer-now'),
    COALESCE(b.credit_limit, 0),
    COALESCE(inv.receivable_amount, 0),
    COALESCE(inv.overdue_amount, 0),
    COALESCE(b.credit_limit, 0) - COALESCE(inv.receivable_amount, 0),
    GREATEST(b.updated_at, inv.watermark),
    v_now,
    v_now,
    NULL
  FROM (
    SELECT DISTINCT buyer_id FROM pg_temp.metrics_v4_buyer_period_keys
  ) k
  JOIN app.buyers b ON b.id = k.buyer_id AND b.tenant_id = p_tenant_id AND b.deleted_at IS NULL
  LEFT JOIN LATERAL (
    SELECT
      COALESCE(SUM(i.outstanding_balance) FILTER (WHERE app.invoice_status_has_receivable(i.status, i.outstanding_balance)), 0)::numeric AS receivable_amount,
      COALESCE(SUM(i.outstanding_balance) FILTER (WHERE app.invoice_is_overdue(i.status, i.due_date, i.outstanding_balance)), 0)::numeric AS overdue_amount,
      MAX(i.updated_at) AS watermark
    FROM app.invoices i
    WHERE i.tenant_id = p_tenant_id
      AND i.buyer_id = b.id
      AND i.deleted_at IS NULL
  ) inv ON true
  ON CONFLICT (tenant_id, buyer_id) WHERE deleted_at IS NULL DO UPDATE SET
    credit_limit = EXCLUDED.credit_limit,
    receivable_amount = EXCLUDED.receivable_amount,
    overdue_amount = EXCLUDED.overdue_amount,
    credit_available = EXCLUDED.credit_available,
    source_watermark = EXCLUDED.source_watermark,
    computed_at = EXCLUDED.computed_at,
    generation_id = gen_random_uuid(),
    updated_at = EXCLUDED.updated_at,
    deleted_at = NULL;
  GET DIAGNOSTICS v_count = ROW_COUNT; v_rows := v_rows + v_count;

  INSERT INTO app.metrics_location_now_summary (
    tenant_id, location_id, external_ref,
    open_estimate_count, open_order_count, overdue_amount,
    source_watermark, computed_at, updated_at, deleted_at
  )
  SELECT
    p_tenant_id,
    l.id,
    concat_ws(':', p_tenant_id::text, l.id::text, 'location-now'),
    COALESCE(est.open_estimate_count, 0),
    COALESCE(ord.open_order_count, 0),
    COALESCE(inv.overdue_amount, 0),
    GREATEST(l.updated_at, est.watermark, ord.watermark, inv.watermark),
    v_now,
    v_now,
    NULL
  FROM pg_temp.metrics_v4_location_keys k
  JOIN app.locations l ON l.id = k.location_id AND l.tenant_id = p_tenant_id AND l.deleted_at IS NULL
  LEFT JOIN LATERAL (
    SELECT COUNT(*) FILTER (WHERE app.estimate_status_is_open(e.status))::bigint AS open_estimate_count,
      MAX(e.updated_at) AS watermark
    FROM app.estimates e
    WHERE e.tenant_id = p_tenant_id AND e.location_id = l.id AND e.deleted_at IS NULL
  ) est ON true
  LEFT JOIN LATERAL (
    SELECT COUNT(*) FILTER (WHERE app.order_status_is_open(o.status))::bigint AS open_order_count,
      MAX(o.updated_at) AS watermark
    FROM app.orders o
    WHERE o.tenant_id = p_tenant_id AND o.location_id = l.id AND o.deleted_at IS NULL
  ) ord ON true
  LEFT JOIN LATERAL (
    SELECT COALESCE(SUM(i.outstanding_balance) FILTER (WHERE app.invoice_is_overdue(i.status, i.due_date, i.outstanding_balance)), 0)::numeric AS overdue_amount,
      MAX(i.updated_at) AS watermark
    FROM app.invoices i
    WHERE i.tenant_id = p_tenant_id AND i.location_id = l.id AND i.deleted_at IS NULL
  ) inv ON true
  ON CONFLICT (tenant_id, location_id) WHERE deleted_at IS NULL DO UPDATE SET
    open_estimate_count = EXCLUDED.open_estimate_count,
    open_order_count = EXCLUDED.open_order_count,
    overdue_amount = EXCLUDED.overdue_amount,
    source_watermark = EXCLUDED.source_watermark,
    computed_at = EXCLUDED.computed_at,
    generation_id = gen_random_uuid(),
    updated_at = EXCLUDED.updated_at,
    deleted_at = NULL;
  GET DIAGNOSTICS v_count = ROW_COUNT; v_rows := v_rows + v_count;

  INSERT INTO app.metrics_product_period_summary (
    tenant_id, tenant_product_id, external_ref, grain, period_start, period_end_exclusive,
    invoice_units, invoice_value, invoice_count, invoice_buyer_count,
    estimate_units, estimate_value, estimate_count,
    order_units, order_value, order_count,
    source_watermark, computed_at, updated_at, deleted_at
  )
  SELECT p_tenant_id, k.tenant_product_id, concat_ws(':', p_tenant_id::text, k.tenant_product_id::text, k.grain, k.period_start::text), k.grain, k.period_start, k.period_end_exclusive,
    COALESCE(inv.units,0), COALESCE(inv.value,0), COALESCE(inv.count,0), COALESCE(inv.buyers,0),
    COALESCE(est.units,0), COALESCE(est.value,0), COALESCE(est.count,0),
    COALESCE(ord.units,0), COALESCE(ord.value,0), COALESCE(ord.count,0),
    GREATEST(inv.watermark, est.watermark, ord.watermark), v_now, v_now, NULL
  FROM pg_temp.metrics_v4_product_period_keys k
  -- MATERIALIZED forces Postgres to filter each item table by
  -- tenant_product_id FIRST (cheap, selective, uses the composite
  -- (tenant_product_id, <doc>_id) index) before joining up to the parent
  -- doc table. Without this, the planner drives from the parent doc table
  -- instead (its LATERAL-correlated date-range condition can't be sampled
  -- at plan time, so its row estimate is wildly optimistic -- observed 3
  -- estimated vs 2610 actual on a real tenant), re-scanning the ENTIRE
  -- tenant+date-range window from scratch on every one of the (typically
  -- hundreds of) product x grain loop iterations. Profiled: this dropped
  -- the product_period_summary insert from ~11.8s to ~1.2s for a single
  -- busy tenant/day (see backfill run notes). Same pattern for all three
  -- doc types.
  LEFT JOIN LATERAL (
    WITH items AS MATERIALIZED (
      SELECT ii.invoice_id, ii.qty, ii.line_total, ii.updated_at
      FROM app.invoice_items ii
      WHERE ii.tenant_product_id = k.tenant_product_id AND ii.deleted_at IS NULL
    )
    SELECT COALESCE(SUM(items.qty),0)::numeric AS units, COALESCE(SUM(items.line_total),0)::numeric AS value, COUNT(DISTINCT i.id)::bigint AS count, COUNT(DISTINCT i.buyer_id)::bigint AS buyers, MAX(GREATEST(i.updated_at, items.updated_at)) AS watermark
    FROM items JOIN app.invoices i ON i.id = items.invoice_id AND i.tenant_id = p_tenant_id AND i.deleted_at IS NULL AND app.invoice_status_gmv_included(i.status)
      AND app.metric_day_ist(i.invoice_date, i.created_at) >= k.period_start AND app.metric_day_ist(i.invoice_date, i.created_at) < k.period_end_exclusive
  ) inv ON true
  LEFT JOIN LATERAL (
    WITH items AS MATERIALIZED (
      SELECT ei.estimate_id, ei.qty, ei.line_total, ei.updated_at
      FROM app.estimate_items ei
      WHERE ei.tenant_product_id = k.tenant_product_id AND ei.deleted_at IS NULL
    )
    SELECT COALESCE(SUM(items.qty),0)::numeric AS units, COALESCE(SUM(items.line_total),0)::numeric AS value, COUNT(DISTINCT e.id)::bigint AS count, MAX(GREATEST(e.updated_at, items.updated_at)) AS watermark
    FROM items JOIN app.estimates e ON e.id = items.estimate_id AND e.tenant_id = p_tenant_id AND e.deleted_at IS NULL AND (app.estimate_status_is_open(e.status) OR e.status = 'accepted')
      AND app.metric_day_ist(e.estimate_date, e.created_at) >= k.period_start AND app.metric_day_ist(e.estimate_date, e.created_at) < k.period_end_exclusive
  ) est ON true
  LEFT JOIN LATERAL (
    WITH items AS MATERIALIZED (
      SELECT oi.order_id, oi.qty, oi.line_total, oi.updated_at
      FROM app.order_items oi
      WHERE oi.tenant_product_id = k.tenant_product_id AND oi.deleted_at IS NULL
    )
    SELECT COALESCE(SUM(items.qty),0)::numeric AS units, COALESCE(SUM(items.line_total),0)::numeric AS value, COUNT(DISTINCT o.id)::bigint AS count, MAX(GREATEST(o.updated_at, items.updated_at)) AS watermark
    FROM items JOIN app.orders o ON o.id = items.order_id AND o.tenant_id = p_tenant_id AND o.deleted_at IS NULL AND app.order_status_in_flow(o.status)
      AND app.metric_day_ist(o.order_date, o.created_at) >= k.period_start AND app.metric_day_ist(o.order_date, o.created_at) < k.period_end_exclusive
  ) ord ON true
  WHERE COALESCE(inv.count,0) > 0 OR COALESCE(est.count,0) > 0 OR COALESCE(ord.count,0) > 0
  ON CONFLICT (tenant_id, tenant_product_id, grain, period_start) WHERE deleted_at IS NULL DO UPDATE SET
    period_end_exclusive = EXCLUDED.period_end_exclusive,
    invoice_units = EXCLUDED.invoice_units, invoice_value = EXCLUDED.invoice_value, invoice_count = EXCLUDED.invoice_count, invoice_buyer_count = EXCLUDED.invoice_buyer_count,
    estimate_units = EXCLUDED.estimate_units, estimate_value = EXCLUDED.estimate_value, estimate_count = EXCLUDED.estimate_count,
    order_units = EXCLUDED.order_units, order_value = EXCLUDED.order_value, order_count = EXCLUDED.order_count,
    source_watermark = EXCLUDED.source_watermark, computed_at = EXCLUDED.computed_at, generation_id = gen_random_uuid(), updated_at = EXCLUDED.updated_at, deleted_at = NULL;
  GET DIAGNOSTICS v_count = ROW_COUNT; v_rows := v_rows + v_count;

  -- Same MATERIALIZED reasoning as the insert above -- this NOT EXISTS has
  -- the identical join shape (item table -> parent doc table, correlated
  -- date range), so it hits the same bad-estimate/wrong-join-order problem
  -- on every candidate row.
  DELETE FROM app.metrics_product_period_summary s
  USING pg_temp.metrics_v4_product_period_keys k
  WHERE s.tenant_id = p_tenant_id AND s.tenant_product_id = k.tenant_product_id AND s.grain = k.grain AND s.period_start = k.period_start AND s.deleted_at IS NULL
    AND NOT EXISTS (
      WITH inv_items AS MATERIALIZED (
        SELECT ii.invoice_id FROM app.invoice_items ii WHERE ii.tenant_product_id = k.tenant_product_id AND ii.deleted_at IS NULL
      ), est_items AS MATERIALIZED (
        SELECT ei.estimate_id FROM app.estimate_items ei WHERE ei.tenant_product_id = k.tenant_product_id AND ei.deleted_at IS NULL
      ), ord_items AS MATERIALIZED (
        SELECT oi.order_id FROM app.order_items oi WHERE oi.tenant_product_id = k.tenant_product_id AND oi.deleted_at IS NULL
      )
      SELECT 1 FROM inv_items JOIN app.invoices i ON i.id = inv_items.invoice_id AND i.tenant_id = p_tenant_id AND i.deleted_at IS NULL AND app.invoice_status_gmv_included(i.status)
        AND app.metric_day_ist(i.invoice_date, i.created_at) >= k.period_start AND app.metric_day_ist(i.invoice_date, i.created_at) < k.period_end_exclusive
      UNION ALL
      SELECT 1 FROM est_items JOIN app.estimates e ON e.id = est_items.estimate_id AND e.tenant_id = p_tenant_id AND e.deleted_at IS NULL AND (app.estimate_status_is_open(e.status) OR e.status = 'accepted')
        AND app.metric_day_ist(e.estimate_date, e.created_at) >= k.period_start AND app.metric_day_ist(e.estimate_date, e.created_at) < k.period_end_exclusive
      UNION ALL
      SELECT 1 FROM ord_items JOIN app.orders o ON o.id = ord_items.order_id AND o.tenant_id = p_tenant_id AND o.deleted_at IS NULL AND app.order_status_in_flow(o.status)
        AND app.metric_day_ist(o.order_date, o.created_at) >= k.period_start AND app.metric_day_ist(o.order_date, o.created_at) < k.period_end_exclusive
    );
  GET DIAGNOSTICS v_count = ROW_COUNT; v_rows := v_rows + v_count;

  INSERT INTO app.metrics_brand_period_summary (
    tenant_id, tenant_brand_id, external_ref, grain, period_start, period_end_exclusive,
    invoice_count, invoice_value, invoice_product_count, invoice_buyer_count,
    source_watermark, computed_at, updated_at, deleted_at
  )
  SELECT p_tenant_id, tp.tenant_brand_id, concat_ws(':', p_tenant_id::text, tp.tenant_brand_id::text, p.grain, p.period_start::text),
    p.grain, p.period_start, p.period_end_exclusive,
    SUM(ps.invoice_count)::bigint, SUM(ps.invoice_value), COUNT(DISTINCT ps.tenant_product_id)::bigint, SUM(ps.invoice_buyer_count)::bigint,
    MAX(ps.source_watermark), v_now, v_now, NULL
  FROM (SELECT DISTINCT grain, period_start, period_end_exclusive FROM pg_temp.metrics_v4_product_period_keys) p
  JOIN app.metrics_product_period_summary ps
    ON ps.tenant_id = p_tenant_id AND ps.grain = p.grain AND ps.period_start = p.period_start AND ps.deleted_at IS NULL AND ps.invoice_count > 0
  JOIN app.tenant_products tp ON tp.id = ps.tenant_product_id AND tp.tenant_brand_id IS NOT NULL
  GROUP BY tp.tenant_brand_id, p.grain, p.period_start, p.period_end_exclusive
  ON CONFLICT (tenant_id, tenant_brand_id, grain, period_start) WHERE deleted_at IS NULL DO UPDATE SET
    period_end_exclusive = EXCLUDED.period_end_exclusive,
    invoice_count = EXCLUDED.invoice_count, invoice_value = EXCLUDED.invoice_value,
    invoice_product_count = EXCLUDED.invoice_product_count, invoice_buyer_count = EXCLUDED.invoice_buyer_count,
    source_watermark = EXCLUDED.source_watermark, computed_at = EXCLUDED.computed_at, generation_id = gen_random_uuid(), updated_at = EXCLUDED.updated_at, deleted_at = NULL;
  GET DIAGNOSTICS v_count = ROW_COUNT; v_rows := v_rows + v_count;

  DELETE FROM app.metrics_brand_period_summary s
  WHERE s.tenant_id = p_tenant_id AND s.deleted_at IS NULL
    AND (s.grain, s.period_start) IN (SELECT DISTINCT k.grain, k.period_start FROM pg_temp.metrics_v4_product_period_keys k)
    AND NOT EXISTS (
      SELECT 1
      FROM app.metrics_product_period_summary ps
      JOIN app.tenant_products tp ON tp.id = ps.tenant_product_id
      WHERE ps.tenant_id = p_tenant_id AND ps.grain = s.grain AND ps.period_start = s.period_start
        AND ps.deleted_at IS NULL AND ps.invoice_count > 0 AND tp.tenant_brand_id = s.tenant_brand_id
    );
  GET DIAGNOSTICS v_count = ROW_COUNT; v_rows := v_rows + v_count;

  INSERT INTO app.metrics_category_period_summary (
    tenant_id, tenant_category_id, external_ref, grain, period_start, period_end_exclusive,
    invoice_count, invoice_value, invoice_product_count, invoice_buyer_count,
    source_watermark, computed_at, updated_at, deleted_at
  )
  SELECT p_tenant_id, tp.tenant_category_id, concat_ws(':', p_tenant_id::text, tp.tenant_category_id::text, p.grain, p.period_start::text),
    p.grain, p.period_start, p.period_end_exclusive,
    SUM(ps.invoice_count)::bigint, SUM(ps.invoice_value), COUNT(DISTINCT ps.tenant_product_id)::bigint, SUM(ps.invoice_buyer_count)::bigint,
    MAX(ps.source_watermark), v_now, v_now, NULL
  FROM (SELECT DISTINCT grain, period_start, period_end_exclusive FROM pg_temp.metrics_v4_product_period_keys) p
  JOIN app.metrics_product_period_summary ps
    ON ps.tenant_id = p_tenant_id AND ps.grain = p.grain AND ps.period_start = p.period_start AND ps.deleted_at IS NULL AND ps.invoice_count > 0
  JOIN app.tenant_products tp ON tp.id = ps.tenant_product_id AND tp.tenant_category_id IS NOT NULL
  GROUP BY tp.tenant_category_id, p.grain, p.period_start, p.period_end_exclusive
  ON CONFLICT (tenant_id, tenant_category_id, grain, period_start) WHERE deleted_at IS NULL DO UPDATE SET
    period_end_exclusive = EXCLUDED.period_end_exclusive,
    invoice_count = EXCLUDED.invoice_count, invoice_value = EXCLUDED.invoice_value,
    invoice_product_count = EXCLUDED.invoice_product_count, invoice_buyer_count = EXCLUDED.invoice_buyer_count,
    source_watermark = EXCLUDED.source_watermark, computed_at = EXCLUDED.computed_at, generation_id = gen_random_uuid(), updated_at = EXCLUDED.updated_at, deleted_at = NULL;
  GET DIAGNOSTICS v_count = ROW_COUNT; v_rows := v_rows + v_count;

  DELETE FROM app.metrics_category_period_summary s
  WHERE s.tenant_id = p_tenant_id AND s.deleted_at IS NULL
    AND (s.grain, s.period_start) IN (SELECT DISTINCT k.grain, k.period_start FROM pg_temp.metrics_v4_product_period_keys k)
    AND NOT EXISTS (
      SELECT 1
      FROM app.metrics_product_period_summary ps
      JOIN app.tenant_products tp ON tp.id = ps.tenant_product_id
      WHERE ps.tenant_id = p_tenant_id AND ps.grain = s.grain AND ps.period_start = s.period_start
        AND ps.deleted_at IS NULL AND ps.invoice_count > 0 AND tp.tenant_category_id = s.tenant_category_id
    );
  GET DIAGNOSTICS v_count = ROW_COUNT; v_rows := v_rows + v_count;

  ELSIF p_domain = 'inventory' THEN

  -- Location coverage. Cardinality is low per tenant (per spec: "a handful
  -- of locations"), so no separate per-entity budget check is needed beyond
  -- the location_keys cap already enforced above.
  INSERT INTO app.metrics_location_period_summary (
    tenant_id, location_id, external_ref, grain, period_start, period_end_exclusive,
    invoice_count, invoice_value, invoice_buyer_count,
    estimate_count, estimate_value, estimate_buyer_count,
    order_count, order_value, order_buyer_count,
    primary_demand_kind, primary_demand_count, primary_demand_value, primary_demand_buyer_count,
    source_watermark, computed_at, updated_at, deleted_at
  )
  SELECT
    p_tenant_id, l.id, concat_ws(':', p_tenant_id::text, l.id::text, p.grain, p.period_start::text),
    p.grain, p.period_start, p.period_end_exclusive,
    COALESCE(inv.invoice_count, 0), COALESCE(inv.invoice_value, 0), COALESCE(inv.invoice_buyer_count, 0),
    COALESCE(est.estimate_count, 0), COALESCE(est.estimate_value, 0), COALESCE(est.estimate_buyer_count, 0),
    COALESCE(ord.order_count, 0), COALESCE(ord.order_value, 0), COALESCE(ord.order_buyer_count, 0),
    v_primary,
    CASE WHEN v_primary = 'estimates' THEN COALESCE(est.estimate_count, 0) WHEN v_primary = 'orders' THEN COALESCE(ord.order_count, 0) ELSE 0 END,
    CASE WHEN v_primary = 'estimates' THEN COALESCE(est.estimate_value, 0) WHEN v_primary = 'orders' THEN COALESCE(ord.order_value, 0) ELSE 0 END,
    CASE WHEN v_primary = 'estimates' THEN COALESCE(est.estimate_buyer_count, 0) WHEN v_primary = 'orders' THEN COALESCE(ord.order_buyer_count, 0) ELSE 0 END,
    GREATEST(inv.watermark, est.watermark, ord.watermark), v_now, v_now, NULL
  FROM app.locations l
  CROSS JOIN pg_temp.metrics_v4_period_keys p
  LEFT JOIN LATERAL (
    SELECT COUNT(*) FILTER (WHERE app.invoice_status_gmv_included(i.status))::bigint AS invoice_count,
      COALESCE(SUM(i.total_amount) FILTER (WHERE app.invoice_status_gmv_included(i.status)), 0)::numeric AS invoice_value,
      COUNT(DISTINCT i.buyer_id) FILTER (WHERE app.invoice_status_gmv_included(i.status))::bigint AS invoice_buyer_count,
      MAX(i.updated_at) AS watermark
    FROM app.invoices i
    WHERE i.tenant_id = p_tenant_id AND i.location_id = l.id AND i.deleted_at IS NULL
      AND app.metric_day_ist(i.invoice_date, i.created_at) >= p.period_start
      AND app.metric_day_ist(i.invoice_date, i.created_at) < p.period_end_exclusive
  ) inv ON true
  LEFT JOIN LATERAL (
    SELECT COUNT(*) FILTER (WHERE app.estimate_status_is_open(e.status) OR e.status = 'accepted')::bigint AS estimate_count,
      COALESCE(SUM(e.total_amount) FILTER (WHERE app.estimate_status_is_open(e.status) OR e.status = 'accepted'), 0)::numeric AS estimate_value,
      COUNT(DISTINCT e.buyer_id) FILTER (WHERE app.estimate_status_is_open(e.status) OR e.status = 'accepted')::bigint AS estimate_buyer_count,
      MAX(e.updated_at) AS watermark
    FROM app.estimates e
    WHERE e.tenant_id = p_tenant_id AND e.location_id = l.id AND e.deleted_at IS NULL
      AND app.metric_day_ist(e.estimate_date, e.created_at) >= p.period_start
      AND app.metric_day_ist(e.estimate_date, e.created_at) < p.period_end_exclusive
  ) est ON true
  LEFT JOIN LATERAL (
    SELECT COUNT(*) FILTER (WHERE app.order_status_in_flow(o.status))::bigint AS order_count,
      COALESCE(SUM(o.total_amount) FILTER (WHERE app.order_status_in_flow(o.status)), 0)::numeric AS order_value,
      COUNT(DISTINCT o.buyer_id) FILTER (WHERE app.order_status_in_flow(o.status))::bigint AS order_buyer_count,
      MAX(o.updated_at) AS watermark
    FROM app.orders o
    WHERE o.tenant_id = p_tenant_id AND o.location_id = l.id AND o.deleted_at IS NULL
      AND app.metric_day_ist(o.order_date, o.created_at) >= p.period_start
      AND app.metric_day_ist(o.order_date, o.created_at) < p.period_end_exclusive
  ) ord ON true
  WHERE l.tenant_id = p_tenant_id AND l.deleted_at IS NULL
    AND (COALESCE(inv.invoice_count,0) > 0 OR COALESCE(est.estimate_count,0) > 0 OR COALESCE(ord.order_count,0) > 0)
  ON CONFLICT (tenant_id, location_id, grain, period_start) WHERE deleted_at IS NULL DO UPDATE SET
    period_end_exclusive = EXCLUDED.period_end_exclusive,
    invoice_count = EXCLUDED.invoice_count, invoice_value = EXCLUDED.invoice_value, invoice_buyer_count = EXCLUDED.invoice_buyer_count,
    estimate_count = EXCLUDED.estimate_count, estimate_value = EXCLUDED.estimate_value, estimate_buyer_count = EXCLUDED.estimate_buyer_count,
    order_count = EXCLUDED.order_count, order_value = EXCLUDED.order_value, order_buyer_count = EXCLUDED.order_buyer_count,
    primary_demand_kind = EXCLUDED.primary_demand_kind, primary_demand_count = EXCLUDED.primary_demand_count, primary_demand_value = EXCLUDED.primary_demand_value, primary_demand_buyer_count = EXCLUDED.primary_demand_buyer_count,
    source_watermark = EXCLUDED.source_watermark, computed_at = EXCLUDED.computed_at, generation_id = gen_random_uuid(), updated_at = EXCLUDED.updated_at, deleted_at = NULL;
  GET DIAGNOSTICS v_count = ROW_COUNT; v_rows := v_rows + v_count;

  -- Warehouse coverage is derived from metrics_product_period_summary, which
  -- the 'commercial' domain writes for the same dirty period keys. If this
  -- inventory tick runs before that commercial tick has landed for the same
  -- window, warehouse rows simply catch up on the next inventory tick —
  -- same eventual-consistency model the brand/category rollups already rely on.
  INSERT INTO app.metrics_warehouse_period_summary (
    tenant_id, warehouse_id, external_ref, grain, period_start, period_end_exclusive,
    sold_sku_count, sold_units, invoice_value, source_watermark, computed_at, updated_at, deleted_at
  )
  SELECT p_tenant_id, wh.id, concat_ws(':', p_tenant_id::text, wh.id::text, ps.grain, ps.period_start::text),
    ps.grain, ps.period_start, ps.period_end_exclusive,
    COUNT(DISTINCT ps.tenant_product_id)::bigint, SUM(ps.invoice_units), SUM(ps.invoice_value),
    MAX(ps.source_watermark), v_now, v_now, NULL
  FROM app.warehouses wh
  JOIN app.tenant_inventory ti ON ti.warehouse_id = wh.id AND ti.deleted_at IS NULL
  JOIN app.metrics_product_period_summary ps ON ps.tenant_id = p_tenant_id AND ps.tenant_product_id = ti.tenant_product_id AND ps.deleted_at IS NULL AND ps.invoice_count > 0
  JOIN (SELECT DISTINCT grain, period_start, period_end_exclusive FROM pg_temp.metrics_v4_product_period_keys) p
    ON p.grain = ps.grain AND p.period_start = ps.period_start
  WHERE wh.tenant_id = p_tenant_id AND wh.deleted_at IS NULL
  GROUP BY wh.id, ps.grain, ps.period_start, ps.period_end_exclusive
  ON CONFLICT (tenant_id, warehouse_id, grain, period_start) WHERE deleted_at IS NULL DO UPDATE SET
    period_end_exclusive = EXCLUDED.period_end_exclusive,
    sold_sku_count = EXCLUDED.sold_sku_count, sold_units = EXCLUDED.sold_units, invoice_value = EXCLUDED.invoice_value,
    source_watermark = EXCLUDED.source_watermark, computed_at = EXCLUDED.computed_at, generation_id = gen_random_uuid(), updated_at = EXCLUDED.updated_at, deleted_at = NULL;
  GET DIAGNOSTICS v_count = ROW_COUNT; v_rows := v_rows + v_count;

  ELSIF p_domain = 'buyer_app' THEN

  -- Campaign and cohort coverage. Both are low-cardinality per tenant.
  -- Cohort rollups read metrics_buyer_period_summary, which the 'commercial'
  -- domain writes — same catch-up-on-next-tick model as warehouse above.
  INSERT INTO app.metrics_campaign_period_summary (
    tenant_id, campaign_id, external_ref, grain, period_start, period_end_exclusive,
    viewed_buyer_count, view_count,
    estimate_count, estimate_value, order_count, order_value, invoice_count, invoice_value,
    demand_buyer_count, revenue_buyer_count, source_watermark, computed_at, updated_at, deleted_at
  )
  SELECT
    p_tenant_id, c.id, concat_ws(':', p_tenant_id::text, c.id::text, p.grain, p.period_start::text),
    p.grain, p.period_start, p.period_end_exclusive,
    COALESCE(v.viewed_buyer_count, 0), COALESCE(v.view_count, 0),
    COALESCE(est.estimate_count, 0), COALESCE(est.estimate_value, 0),
    COALESCE(ord.order_count, 0), COALESCE(ord.order_value, 0),
    COALESCE(inv.invoice_count, 0), COALESCE(inv.invoice_value, 0),
    COALESCE(est.demand_buyer_count, 0) + COALESCE(ord.demand_buyer_count, 0),
    COALESCE(inv.revenue_buyer_count, 0), v_now, v_now, v_now, NULL
  FROM app.campaigns c
  CROSS JOIN (SELECT DISTINCT grain, period_start, period_end_exclusive FROM pg_temp.metrics_v4_period_keys WHERE grain IN ('month','quarter')) p
  LEFT JOIN LATERAL (
    SELECT COUNT(*)::bigint AS view_count, COUNT(DISTINCT cv.buyer_id)::bigint AS viewed_buyer_count
    FROM app.campaign_views cv
    WHERE cv.tenant_id = p_tenant_id AND cv.campaign_id = c.id AND cv.deleted_at IS NULL
      AND (cv.viewed_at AT TIME ZONE 'Asia/Kolkata')::date >= p.period_start
      AND (cv.viewed_at AT TIME ZONE 'Asia/Kolkata')::date < p.period_end_exclusive
  ) v ON true
  LEFT JOIN LATERAL (
    SELECT COUNT(*) FILTER (WHERE app.estimate_status_is_open(e.status) OR e.status = 'accepted')::bigint AS estimate_count,
      COALESCE(SUM(e.total_amount) FILTER (WHERE app.estimate_status_is_open(e.status) OR e.status = 'accepted'), 0)::numeric AS estimate_value,
      COUNT(DISTINCT e.buyer_id) FILTER (WHERE app.estimate_status_is_open(e.status) OR e.status = 'accepted')::bigint AS demand_buyer_count
    FROM app.estimates e
    WHERE e.tenant_id = p_tenant_id AND e.campaign_id = c.id AND e.deleted_at IS NULL
      AND app.metric_day_ist(e.estimate_date, e.created_at) >= p.period_start
      AND app.metric_day_ist(e.estimate_date, e.created_at) < p.period_end_exclusive
  ) est ON true
  LEFT JOIN LATERAL (
    SELECT COUNT(*) FILTER (WHERE app.order_status_in_flow(o.status))::bigint AS order_count,
      COALESCE(SUM(o.total_amount) FILTER (WHERE app.order_status_in_flow(o.status)), 0)::numeric AS order_value,
      COUNT(DISTINCT o.buyer_id) FILTER (WHERE app.order_status_in_flow(o.status))::bigint AS demand_buyer_count
    FROM app.orders o
    WHERE o.tenant_id = p_tenant_id AND o.campaign_id = c.id AND o.deleted_at IS NULL
      AND app.metric_day_ist(o.order_date, o.created_at) >= p.period_start
      AND app.metric_day_ist(o.order_date, o.created_at) < p.period_end_exclusive
  ) ord ON true
  LEFT JOIN LATERAL (
    SELECT COUNT(*) FILTER (WHERE app.invoice_status_gmv_included(i.status))::bigint AS invoice_count,
      COALESCE(SUM(i.total_amount) FILTER (WHERE app.invoice_status_gmv_included(i.status)), 0)::numeric AS invoice_value,
      COUNT(DISTINCT i.buyer_id) FILTER (WHERE app.invoice_status_gmv_included(i.status))::bigint AS revenue_buyer_count
    FROM app.invoices i
    JOIN app.orders o ON o.id = i.order_id AND o.campaign_id = c.id
    WHERE i.tenant_id = p_tenant_id AND i.deleted_at IS NULL
      AND app.metric_day_ist(i.invoice_date, i.created_at) >= p.period_start
      AND app.metric_day_ist(i.invoice_date, i.created_at) < p.period_end_exclusive
  ) inv ON true
  WHERE c.tenant_id = p_tenant_id AND c.deleted_at IS NULL
    AND (COALESCE(v.view_count,0) > 0 OR COALESCE(est.estimate_count,0) > 0 OR COALESCE(ord.order_count,0) > 0 OR COALESCE(inv.invoice_count,0) > 0)
  ON CONFLICT (tenant_id, campaign_id, grain, period_start) WHERE deleted_at IS NULL DO UPDATE SET
    period_end_exclusive = EXCLUDED.period_end_exclusive,
    viewed_buyer_count = EXCLUDED.viewed_buyer_count, view_count = EXCLUDED.view_count,
    estimate_count = EXCLUDED.estimate_count, estimate_value = EXCLUDED.estimate_value,
    order_count = EXCLUDED.order_count, order_value = EXCLUDED.order_value,
    invoice_count = EXCLUDED.invoice_count, invoice_value = EXCLUDED.invoice_value,
    demand_buyer_count = EXCLUDED.demand_buyer_count, revenue_buyer_count = EXCLUDED.revenue_buyer_count,
    source_watermark = EXCLUDED.source_watermark, computed_at = EXCLUDED.computed_at, generation_id = gen_random_uuid(), updated_at = EXCLUDED.updated_at, deleted_at = NULL;
  GET DIAGNOSTICS v_count = ROW_COUNT; v_rows := v_rows + v_count;

  INSERT INTO app.metrics_cohort_period_summary (
    tenant_id, cohort_id, external_ref, grain, period_start, period_end_exclusive,
    member_count, active_member_count, demand_count, demand_value, invoice_count, invoice_value,
    source_watermark, computed_at, updated_at, deleted_at
  )
  SELECT
    p_tenant_id, c.id, concat_ws(':', p_tenant_id::text, c.id::text, p.grain, p.period_start::text),
    p.grain, p.period_start, p.period_end_exclusive,
    COUNT(DISTINCT cm.buyer_id)::bigint,
    COUNT(DISTINCT bps.buyer_id) FILTER (WHERE bps.primary_demand_count > 0)::bigint,
    COALESCE(SUM(bps.primary_demand_count), 0)::bigint,
    COALESCE(SUM(bps.primary_demand_value), 0)::numeric,
    COALESCE(SUM(bps.invoice_count), 0)::bigint,
    COALESCE(SUM(bps.invoice_value), 0)::numeric,
    v_now, v_now, v_now, NULL
  FROM app.cohorts c
  CROSS JOIN (SELECT DISTINCT grain, period_start, period_end_exclusive FROM pg_temp.metrics_v4_period_keys WHERE grain IN ('month','quarter')) p
  LEFT JOIN app.cohort_members_active cm ON cm.cohort_id = c.id
  LEFT JOIN app.metrics_buyer_period_summary bps
    ON bps.tenant_id = p_tenant_id AND bps.buyer_id = cm.buyer_id
   AND bps.grain = p.grain AND bps.period_start = p.period_start AND bps.deleted_at IS NULL
  WHERE c.tenant_id = p_tenant_id AND c.deleted_at IS NULL
  GROUP BY c.id, p.grain, p.period_start, p.period_end_exclusive
  ON CONFLICT (tenant_id, cohort_id, grain, period_start) WHERE deleted_at IS NULL DO UPDATE SET
    period_end_exclusive = EXCLUDED.period_end_exclusive,
    member_count = EXCLUDED.member_count, active_member_count = EXCLUDED.active_member_count,
    demand_count = EXCLUDED.demand_count, demand_value = EXCLUDED.demand_value,
    invoice_count = EXCLUDED.invoice_count, invoice_value = EXCLUDED.invoice_value,
    source_watermark = EXCLUDED.source_watermark, computed_at = EXCLUDED.computed_at, generation_id = gen_random_uuid(), updated_at = EXCLUDED.updated_at, deleted_at = NULL;
  GET DIAGNOSTICS v_count = ROW_COUNT; v_rows := v_rows + v_count;

  END IF;

  SELECT MAX(s.source_watermark) INTO v_watermark
  FROM app.metrics_tenant_period_summary s
  WHERE s.tenant_id = p_tenant_id AND s.deleted_at IS NULL
    AND (s.grain, s.period_start) IN (SELECT k.grain, k.period_start FROM pg_temp.metrics_v4_period_keys k);

  v_rows := v_rows + app._metrics_v4_refresh_landing_kpis(p_tenant_id);

  UPDATE app.metrics_dirty_work w
  SET cursor_kind = 'done',
      cursor_id = NULL,
      cursor_aux_id = NULL,
      cursor_day = NULL,
      updated_at = clock_timestamp()
  WHERE w.lease_owner = p_owner_token
    AND w.state = 'claimed'
    AND w.claimed_version = w.dirty_version
    AND w.dirty_from IS NOT NULL;

  RETURN QUERY SELECT v_rows,
    CASE p_domain WHEN 'commercial' THEN 5 WHEN 'inventory' THEN 2 WHEN 'buyer_app' THEN 2 ELSE 0 END,
    COALESCE(v_watermark, v_now);
END;
$$;
