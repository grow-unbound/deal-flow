-- Derive tenant month/quarter rows from day + entity summaries instead of raw.
--
-- Step 4 (final) of specs/metrics-v4-period-rollup-design-2026-08-04.md.
--
-- The problem: the raw scan was bounded by MIN(period_start)..
-- MAX(period_end_exclusive) across ALL FOUR period keys, and quarter is always
-- one of them -- so every tick scanned from the start of the current quarter to
-- today no matter how little had changed, and that window grew all quarter.
--
-- Measured on the live tenant, one dirty day producing four period keys:
--   all 4 grains, complete quarter (Q2) : 14,018 docs, 8,826 buffers, 651ms (spilling)
--   day + week only                     :  1,089 docs,   758 buffers,  ~38ms
--
-- Q3 currently holds ~40% of Q2's volume, and the observed peak tick during the
-- 2026-08-03 Zoho sync was already 4,541ms against a hard 5,000ms ceiling.
--
-- After this change:
--   day, week      -> raw, window bounded by the dirty-day span (+6 for the
--                     enclosing week). Never grows with quarter position. This
--                     is the self-healing floor and must stay on raw.
--   month, quarter -> additive measures summed from this tenant's day rows;
--                     distinct counts counted from metrics_buyer_period_summary
--                     and metrics_product_period_summary at the same grain.
--
-- Why the distinct counts need the entity tables: COUNT(DISTINCT ...) does not
-- sum. A buyer active on 12 days of a month counts once, not twice, so no
-- amount of day-row arithmetic can produce it. The per-entity tables already
-- carry exactly that de-duplication and are maintained at 'month' and 'quarter'
-- and no other grain -- the grains being derived.
--
-- Verified before implementing: the derivation reproduces all 7 stored
-- month/quarter rows exactly across 8 measures, including invoice_buyer_count,
-- invoice_product_count and primary_demand_buyer_count.
--
-- Cost of the design, stated plainly: month/quarter rows are no longer
-- independently correct -- they inherit any error in the day or entity rows.
-- The nightly raw drift check added alongside this is what makes that
-- acceptable. metrics_brand_period_summary and metrics_category_period_summary
-- have always had this same property.
--
-- Body below is otherwise a verbatim copy of the current live definition
-- (20260804041031_reorder_tenant_period_write_after_entities.sql).
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
  -- Per-(product, grain, period) aggregates, materialized once up front so the
  -- product_period_summary INSERT and its DELETE guard both read them instead
  -- of each re-deriving them per product via a correlated LATERAL.
  CREATE TEMP TABLE IF NOT EXISTS pg_temp.metrics_v4_product_agg(
    tenant_product_id uuid NOT NULL, grain text NOT NULL, period_start date NOT NULL,
    inv_units numeric, inv_value numeric, inv_count bigint, inv_buyers bigint, inv_watermark timestamptz,
    est_units numeric, est_value numeric, est_count bigint, est_watermark timestamptz,
    ord_units numeric, ord_value numeric, ord_count bigint, ord_watermark timestamptz,
    PRIMARY KEY (tenant_product_id, grain, period_start)
  ) ON COMMIT DROP;
  CREATE TEMP TABLE IF NOT EXISTS pg_temp.metrics_v4_location_keys(location_id uuid PRIMARY KEY) ON COMMIT DROP;
  -- Separate, tighter day subset for the buyer/product/location entity-key
  -- collection subqueries below -- capped to a single day, since those
  -- subqueries fan out to every buyer/product/location touched tenant-wide
  -- on each referenced day (real cost, not bounded by dirty-mark count).
  -- metrics_v4_period_keys still reads the full (up to 100-row)
  -- metrics_v4_dirty_days, unaffected -- period summaries legitimately need
  -- every touched day/week/month/quarter and don't carry this fan-out risk.
  CREATE TEMP TABLE IF NOT EXISTS pg_temp.metrics_v4_key_collection_days(day date PRIMARY KEY) ON COMMIT DROP;
  TRUNCATE pg_temp.metrics_v4_dirty_days, pg_temp.metrics_v4_period_keys, pg_temp.metrics_v4_buyer_ids, pg_temp.metrics_v4_product_ids, pg_temp.metrics_v4_buyer_period_keys, pg_temp.metrics_v4_product_period_keys, pg_temp.metrics_v4_location_keys, pg_temp.metrics_v4_key_collection_days, pg_temp.metrics_v4_product_agg;

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

  INSERT INTO pg_temp.metrics_v4_key_collection_days(day)
  SELECT day FROM pg_temp.metrics_v4_dirty_days ORDER BY day LIMIT 1
  ON CONFLICT DO NOTHING;

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

  -- Buyer/product key collection: only 'commercial' reads
  -- metrics_v4_buyer_period_keys/metrics_v4_product_period_keys
  -- (metrics_tenant_period_summary, metrics_buyer_period_summary,
  -- metrics_product_period_summary) -- skip entirely on other domains.
  IF p_domain = 'commercial' THEN
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
      AND EXISTS (SELECT 1 FROM pg_temp.metrics_v4_key_collection_days d WHERE d.day = app.metric_day_ist(e.estimate_date, e.created_at))
    UNION
    SELECT o.buyer_id
    FROM app.orders o
    WHERE o.tenant_id = p_tenant_id AND o.deleted_at IS NULL
      AND EXISTS (SELECT 1 FROM pg_temp.metrics_v4_key_collection_days d WHERE d.day = app.metric_day_ist(o.order_date, o.created_at))
    UNION
    SELECT i.buyer_id
    FROM app.invoices i
    WHERE i.tenant_id = p_tenant_id AND i.deleted_at IS NULL
      AND EXISTS (SELECT 1 FROM pg_temp.metrics_v4_key_collection_days d WHERE d.day = app.metric_day_ist(i.invoice_date, i.created_at))
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
      AND EXISTS (SELECT 1 FROM pg_temp.metrics_v4_key_collection_days d WHERE d.day = app.metric_day_ist(e.estimate_date, e.created_at))
    UNION
    SELECT oi.tenant_product_id
    FROM app.order_items oi JOIN app.orders o ON o.id = oi.order_id AND o.tenant_id = p_tenant_id AND o.deleted_at IS NULL
    WHERE oi.deleted_at IS NULL
      AND EXISTS (SELECT 1 FROM pg_temp.metrics_v4_key_collection_days d WHERE d.day = app.metric_day_ist(o.order_date, o.created_at))
    UNION
    SELECT ii.tenant_product_id
    FROM app.invoice_items ii JOIN app.invoices i ON i.id = ii.invoice_id AND i.tenant_id = p_tenant_id AND i.deleted_at IS NULL
    WHERE ii.deleted_at IS NULL
      AND EXISTS (SELECT 1 FROM pg_temp.metrics_v4_key_collection_days d WHERE d.day = app.metric_day_ist(i.invoice_date, i.created_at))
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
  END IF;

  -- Location key collection: 'commercial' (metrics_location_now_summary) and
  -- 'inventory' (metrics_location_period_summary, metrics_warehouse_period_summary)
  -- both read metrics_v4_location_keys -- skip on 'buyer_app'/'setup'.
  IF p_domain = 'commercial' OR p_domain = 'inventory' THEN
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
      AND EXISTS (SELECT 1 FROM pg_temp.metrics_v4_key_collection_days d WHERE d.day = app.metric_day_ist(e.estimate_date, e.created_at))
    UNION
    SELECT o.location_id
    FROM app.orders o
    WHERE o.tenant_id = p_tenant_id AND o.deleted_at IS NULL
      AND EXISTS (SELECT 1 FROM pg_temp.metrics_v4_key_collection_days d WHERE d.day = app.metric_day_ist(o.order_date, o.created_at))
    UNION
    SELECT i.location_id
    FROM app.invoices i
    WHERE i.tenant_id = p_tenant_id AND i.deleted_at IS NULL
      AND EXISTS (SELECT 1 FROM pg_temp.metrics_v4_key_collection_days d WHERE d.day = app.metric_day_ist(i.invoice_date, i.created_at))
  ) k
  WHERE location_id IS NOT NULL
  ORDER BY location_id
  LIMIT (v_max_refresh_keys + 1)
  ON CONFLICT DO NOTHING;
  IF (SELECT COUNT(*) FROM pg_temp.metrics_v4_location_keys) > v_max_refresh_keys THEN
    RAISE EXCEPTION 'metrics_v4_location_key_budget_exceeded: split reconciliation/import dirty work into smaller windows';
  END IF;
  END IF;

  -- Domain-scoped writes. Each of the four tick domains (commercial/inventory/
  -- buyer_app/setup) claims dirty work independently and calls this function
  -- with a different p_domain; without this gate all four ran the identical
  -- commercial block, quadrupling write cost while never touching the
  -- location/warehouse/campaign/cohort tables those domains own.
  IF p_domain = 'commercial' THEN

  INSERT INTO app.metrics_buyer_period_summary AS tgt (
    tenant_id, buyer_id, external_ref, grain, period_start, period_end_exclusive,
    invoice_count, invoice_value, estimate_count, estimate_value, order_count, order_value,
    app_demand_count, app_demand_value,
    app_estimate_count, app_estimate_value, app_order_count, app_order_value,
    primary_demand_count, primary_demand_value,
    source_watermark, computed_at, updated_at, deleted_at
  )
  SELECT p_tenant_id, k.buyer_id, concat_ws(':', p_tenant_id::text, k.buyer_id::text, k.grain, k.period_start::text), k.grain, k.period_start, k.period_end_exclusive,
    COALESCE(inv.invoice_count,0), COALESCE(inv.invoice_value,0),
    COALESCE(est.estimate_count,0), COALESCE(est.estimate_value,0),
    COALESCE(ord.order_count,0), COALESCE(ord.order_value,0),
    -- app_demand_* stay as the sum, unchanged, so existing readers are unaffected.
    COALESCE(est.app_estimate_count,0) + COALESCE(ord.app_order_count,0),
    COALESCE(est.app_estimate_value,0) + COALESCE(ord.app_order_value,0),
    -- ...and the same two values are now also stored unsummed, so the tenant
    -- rollup can tell an app estimate from an app order per buyer.
    COALESCE(est.app_estimate_count,0), COALESCE(est.app_estimate_value,0),
    COALESCE(ord.app_order_count,0), COALESCE(ord.app_order_value,0),
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
    SELECT COUNT(*) FILTER (WHERE app.estimate_status_counts_as_demand(e.status))::bigint AS estimate_count,
      COALESCE(SUM(e.total_amount) FILTER (WHERE app.estimate_status_counts_as_demand(e.status)),0)::numeric AS estimate_value,
      COUNT(*) FILTER (WHERE e.is_buyer_app_estimate AND (app.estimate_status_counts_as_demand(e.status)))::bigint AS app_estimate_count,
      COALESCE(SUM(e.total_amount) FILTER (WHERE e.is_buyer_app_estimate AND (app.estimate_status_counts_as_demand(e.status))),0)::numeric AS app_estimate_value,
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
    app_estimate_count = EXCLUDED.app_estimate_count, app_estimate_value = EXCLUDED.app_estimate_value,
    app_order_count = EXCLUDED.app_order_count, app_order_value = EXCLUDED.app_order_value,
    primary_demand_count = EXCLUDED.primary_demand_count, primary_demand_value = EXCLUDED.primary_demand_value,
    source_watermark = EXCLUDED.source_watermark, computed_at = EXCLUDED.computed_at, generation_id = gen_random_uuid(), updated_at = EXCLUDED.updated_at, deleted_at = NULL
  WHERE (tgt.period_end_exclusive,
         tgt.invoice_count, tgt.invoice_value, tgt.estimate_count, tgt.estimate_value, tgt.order_count, tgt.order_value,
         tgt.app_demand_count, tgt.app_demand_value,
         tgt.app_estimate_count, tgt.app_estimate_value, tgt.app_order_count, tgt.app_order_value,
         tgt.primary_demand_count, tgt.primary_demand_value,
         tgt.source_watermark)
    IS DISTINCT FROM
        (EXCLUDED.period_end_exclusive,
         EXCLUDED.invoice_count, EXCLUDED.invoice_value, EXCLUDED.estimate_count, EXCLUDED.estimate_value, EXCLUDED.order_count, EXCLUDED.order_value,
         EXCLUDED.app_demand_count, EXCLUDED.app_demand_value,
         EXCLUDED.app_estimate_count, EXCLUDED.app_estimate_value, EXCLUDED.app_order_count, EXCLUDED.app_order_value,
         EXCLUDED.primary_demand_count, EXCLUDED.primary_demand_value,
         EXCLUDED.source_watermark);
  GET DIAGNOSTICS v_count = ROW_COUNT; v_rows := v_rows + v_count;

  DELETE FROM app.metrics_buyer_period_summary s
  USING pg_temp.metrics_v4_buyer_period_keys k
  WHERE s.tenant_id = p_tenant_id AND s.buyer_id = k.buyer_id AND s.grain = k.grain AND s.period_start = k.period_start AND s.deleted_at IS NULL
    AND NOT EXISTS (
      SELECT 1 FROM app.invoices i WHERE i.tenant_id = p_tenant_id AND i.buyer_id = k.buyer_id AND i.deleted_at IS NULL AND app.invoice_status_gmv_included(i.status) AND app.metric_day_ist(i.invoice_date, i.created_at) >= k.period_start AND app.metric_day_ist(i.invoice_date, i.created_at) < k.period_end_exclusive
      UNION ALL SELECT 1 FROM app.estimates e WHERE e.tenant_id = p_tenant_id AND e.buyer_id = k.buyer_id AND e.deleted_at IS NULL AND (app.estimate_status_counts_as_demand(e.status)) AND app.metric_day_ist(e.estimate_date, e.created_at) >= k.period_start AND app.metric_day_ist(e.estimate_date, e.created_at) < k.period_end_exclusive
      UNION ALL SELECT 1 FROM app.orders o WHERE o.tenant_id = p_tenant_id AND o.buyer_id = k.buyer_id AND o.deleted_at IS NULL AND app.order_status_in_flow(o.status) AND app.metric_day_ist(o.order_date, o.created_at) >= k.period_start AND app.metric_day_ist(o.order_date, o.created_at) < k.period_end_exclusive
    );
  GET DIAGNOSTICS v_count = ROW_COUNT; v_rows := v_rows + v_count;

  INSERT INTO app.metrics_buyer_now_summary AS tgt (
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
      -- Redundant with both FILTER predicates for the two money columns (see
      -- header), and what makes invoices_now_buyer_receivable_idx usable --
      -- turning an all-time heap scan of the buyer's invoices into a small
      -- partial-index scan.
      --
      -- NOTE: this DOES narrow source_watermark, which is a MAX over the same
      -- rows. It now tracks only invoices with an outstanding balance rather
      -- than all of the buyer's invoices ever. That is deliberate: this row
      -- stores nothing but credit_limit, receivable, overdue and
      -- credit_available, and a fully-settled invoice cannot move any of them,
      -- so its updated_at was never a meaningful freshness signal here. The
      -- buyer's own updated_at is still GREATEST-ed in above.
      AND i.outstanding_balance > 0
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
    deleted_at = NULL
  WHERE (tgt.credit_limit, tgt.receivable_amount, tgt.overdue_amount, tgt.credit_available, tgt.source_watermark)
    IS DISTINCT FROM
        (EXCLUDED.credit_limit, EXCLUDED.receivable_amount, EXCLUDED.overdue_amount, EXCLUDED.credit_available, EXCLUDED.source_watermark);
  GET DIAGNOSTICS v_count = ROW_COUNT; v_rows := v_rows + v_count;

  INSERT INTO app.metrics_location_now_summary AS tgt (
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
  -- Same narrowing as metrics_buyer_now_summary above: the status/balance
  -- predicates move from FILTER into WHERE so the partial indexes added by
  -- this migration apply. This row holds only open counts and an overdue
  -- amount, so closed/settled documents cannot affect any of its values --
  -- and, as documented in the header, source_watermark now tracks only the
  -- open/unsettled documents that can.
  LEFT JOIN LATERAL (
    SELECT COUNT(*)::bigint AS open_estimate_count,
      MAX(e.updated_at) AS watermark
    FROM app.estimates e
    WHERE e.tenant_id = p_tenant_id AND e.location_id = l.id AND e.deleted_at IS NULL
      AND app.estimate_status_is_open(e.status)
  ) est ON true
  LEFT JOIN LATERAL (
    SELECT COUNT(*)::bigint AS open_order_count,
      MAX(o.updated_at) AS watermark
    FROM app.orders o
    WHERE o.tenant_id = p_tenant_id AND o.location_id = l.id AND o.deleted_at IS NULL
      AND app.order_status_is_open(o.status)
  ) ord ON true
  LEFT JOIN LATERAL (
    SELECT COALESCE(SUM(i.outstanding_balance) FILTER (WHERE app.invoice_is_overdue(i.status, i.due_date, i.outstanding_balance)), 0)::numeric AS overdue_amount,
      MAX(i.updated_at) AS watermark
    FROM app.invoices i
    WHERE i.tenant_id = p_tenant_id AND i.location_id = l.id AND i.deleted_at IS NULL
      AND i.outstanding_balance > 0
  ) inv ON true
  ON CONFLICT (tenant_id, location_id) WHERE deleted_at IS NULL DO UPDATE SET
    open_estimate_count = EXCLUDED.open_estimate_count,
    open_order_count = EXCLUDED.open_order_count,
    overdue_amount = EXCLUDED.overdue_amount,
    source_watermark = EXCLUDED.source_watermark,
    computed_at = EXCLUDED.computed_at,
    generation_id = gen_random_uuid(),
    updated_at = EXCLUDED.updated_at,
    deleted_at = NULL
  WHERE (tgt.open_estimate_count, tgt.open_order_count, tgt.overdue_amount, tgt.source_watermark)
    IS DISTINCT FROM
        (EXCLUDED.open_estimate_count, EXCLUDED.open_order_count, EXCLUDED.overdue_amount, EXCLUDED.source_watermark);
  GET DIAGNOSTICS v_count = ROW_COUNT; v_rows := v_rows + v_count;

  -- Materialize per-(product, grain, period) aggregates ONCE. Each of the
  -- three branches scans its parent doc table once per distinct period (not
  -- once per product x period), joins down to its item table, and groups by
  -- product. Branches emit NULL for the columns they do not own; the outer
  -- GROUP BY collapses them with MAX, which is safe because each branch
  -- contributes at most one row per (product, grain, period).
  INSERT INTO pg_temp.metrics_v4_product_agg(
    tenant_product_id, grain, period_start,
    inv_units, inv_value, inv_count, inv_buyers, inv_watermark,
    est_units, est_value, est_count, est_watermark,
    ord_units, ord_value, ord_count, ord_watermark
  )
  SELECT u.tenant_product_id, u.grain, u.period_start,
    MAX(u.inv_units), MAX(u.inv_value), MAX(u.inv_count), MAX(u.inv_buyers), MAX(u.inv_watermark),
    MAX(u.est_units), MAX(u.est_value), MAX(u.est_count), MAX(u.est_watermark),
    MAX(u.ord_units), MAX(u.ord_value), MAX(u.ord_count), MAX(u.ord_watermark)
  FROM (
    SELECT ii.tenant_product_id, d.grain, d.period_start,
      COALESCE(SUM(ii.qty),0)::numeric AS inv_units, COALESCE(SUM(ii.line_total),0)::numeric AS inv_value,
      COUNT(DISTINCT d.id)::bigint AS inv_count, COUNT(DISTINCT d.buyer_id)::bigint AS inv_buyers,
      MAX(GREATEST(d.updated_at, ii.updated_at)) AS inv_watermark,
      NULL::numeric AS est_units, NULL::numeric AS est_value, NULL::bigint AS est_count, NULL::timestamptz AS est_watermark,
      NULL::numeric AS ord_units, NULL::numeric AS ord_value, NULL::bigint AS ord_count, NULL::timestamptz AS ord_watermark
    FROM (
      SELECT p.grain, p.period_start, i.id, i.buyer_id, i.updated_at
      FROM (SELECT DISTINCT grain, period_start, period_end_exclusive FROM pg_temp.metrics_v4_product_period_keys) p
      JOIN app.invoices i ON i.tenant_id = p_tenant_id AND i.deleted_at IS NULL
        AND app.invoice_status_gmv_included(i.status)
        AND app.metric_day_ist(i.invoice_date, i.created_at) >= p.period_start
        AND app.metric_day_ist(i.invoice_date, i.created_at) <  p.period_end_exclusive
    ) d
    JOIN app.invoice_items ii ON ii.invoice_id = d.id AND ii.deleted_at IS NULL
    WHERE EXISTS (SELECT 1 FROM pg_temp.metrics_v4_product_ids pr WHERE pr.tenant_product_id = ii.tenant_product_id)
    GROUP BY 1,2,3
    UNION ALL
    SELECT ei.tenant_product_id, d.grain, d.period_start,
      NULL, NULL, NULL, NULL, NULL,
      COALESCE(SUM(ei.qty),0)::numeric, COALESCE(SUM(ei.line_total),0)::numeric,
      COUNT(DISTINCT d.id)::bigint, MAX(GREATEST(d.updated_at, ei.updated_at)),
      NULL, NULL, NULL, NULL
    FROM (
      SELECT p.grain, p.period_start, e.id, e.updated_at
      FROM (SELECT DISTINCT grain, period_start, period_end_exclusive FROM pg_temp.metrics_v4_product_period_keys) p
      JOIN app.estimates e ON e.tenant_id = p_tenant_id AND e.deleted_at IS NULL
        AND (app.estimate_status_counts_as_demand(e.status))
        AND app.metric_day_ist(e.estimate_date, e.created_at) >= p.period_start
        AND app.metric_day_ist(e.estimate_date, e.created_at) <  p.period_end_exclusive
    ) d
    JOIN app.estimate_items ei ON ei.estimate_id = d.id AND ei.deleted_at IS NULL
    WHERE EXISTS (SELECT 1 FROM pg_temp.metrics_v4_product_ids pr WHERE pr.tenant_product_id = ei.tenant_product_id)
    GROUP BY 1,2,3
    UNION ALL
    SELECT oi.tenant_product_id, d.grain, d.period_start,
      NULL, NULL, NULL, NULL, NULL,
      NULL, NULL, NULL, NULL,
      COALESCE(SUM(oi.qty),0)::numeric, COALESCE(SUM(oi.line_total),0)::numeric,
      COUNT(DISTINCT d.id)::bigint, MAX(GREATEST(d.updated_at, oi.updated_at))
    FROM (
      SELECT p.grain, p.period_start, o.id, o.updated_at
      FROM (SELECT DISTINCT grain, period_start, period_end_exclusive FROM pg_temp.metrics_v4_product_period_keys) p
      JOIN app.orders o ON o.tenant_id = p_tenant_id AND o.deleted_at IS NULL
        AND app.order_status_in_flow(o.status)
        AND app.metric_day_ist(o.order_date, o.created_at) >= p.period_start
        AND app.metric_day_ist(o.order_date, o.created_at) <  p.period_end_exclusive
    ) d
    JOIN app.order_items oi ON oi.order_id = d.id AND oi.deleted_at IS NULL
    WHERE EXISTS (SELECT 1 FROM pg_temp.metrics_v4_product_ids pr WHERE pr.tenant_product_id = oi.tenant_product_id)
    GROUP BY 1,2,3
  ) u
  GROUP BY 1,2,3
  ON CONFLICT DO NOTHING;

  INSERT INTO app.metrics_product_period_summary AS tgt (
    tenant_id, tenant_product_id, external_ref, grain, period_start, period_end_exclusive,
    invoice_units, invoice_value, invoice_count, invoice_buyer_count,
    estimate_units, estimate_value, estimate_count,
    order_units, order_value, order_count,
    source_watermark, computed_at, updated_at, deleted_at
  )
  SELECT p_tenant_id, k.tenant_product_id, concat_ws(':', p_tenant_id::text, k.tenant_product_id::text, k.grain, k.period_start::text), k.grain, k.period_start, k.period_end_exclusive,
    COALESCE(a.inv_units,0), COALESCE(a.inv_value,0), COALESCE(a.inv_count,0), COALESCE(a.inv_buyers,0),
    COALESCE(a.est_units,0), COALESCE(a.est_value,0), COALESCE(a.est_count,0),
    COALESCE(a.ord_units,0), COALESCE(a.ord_value,0), COALESCE(a.ord_count,0),
    GREATEST(a.inv_watermark, a.est_watermark, a.ord_watermark), v_now, v_now, NULL
  FROM pg_temp.metrics_v4_product_period_keys k
  -- Reads the pre-materialized pg_temp.metrics_v4_product_agg (populated once
  -- above) instead of re-deriving per product via a correlated LATERAL. The
  -- old shape pinned the item-side join order with MATERIALIZED but still
  -- re-scanned the parent doc table's whole tenant+date-range window on every
  -- product x grain iteration -- see this migration's header for the profile.
  JOIN pg_temp.metrics_v4_product_agg a
    ON a.tenant_product_id = k.tenant_product_id AND a.grain = k.grain AND a.period_start = k.period_start
  WHERE COALESCE(a.inv_count,0) > 0 OR COALESCE(a.est_count,0) > 0 OR COALESCE(a.ord_count,0) > 0
  ON CONFLICT (tenant_id, tenant_product_id, grain, period_start) WHERE deleted_at IS NULL DO UPDATE SET
    period_end_exclusive = EXCLUDED.period_end_exclusive,
    invoice_units = EXCLUDED.invoice_units, invoice_value = EXCLUDED.invoice_value, invoice_count = EXCLUDED.invoice_count, invoice_buyer_count = EXCLUDED.invoice_buyer_count,
    estimate_units = EXCLUDED.estimate_units, estimate_value = EXCLUDED.estimate_value, estimate_count = EXCLUDED.estimate_count,
    order_units = EXCLUDED.order_units, order_value = EXCLUDED.order_value, order_count = EXCLUDED.order_count,
    source_watermark = EXCLUDED.source_watermark, computed_at = EXCLUDED.computed_at, generation_id = gen_random_uuid(), updated_at = EXCLUDED.updated_at, deleted_at = NULL
  WHERE (tgt.period_end_exclusive,
         tgt.invoice_units, tgt.invoice_value, tgt.invoice_count, tgt.invoice_buyer_count,
         tgt.estimate_units, tgt.estimate_value, tgt.estimate_count,
         tgt.order_units, tgt.order_value, tgt.order_count,
         tgt.source_watermark)
    IS DISTINCT FROM
        (EXCLUDED.period_end_exclusive,
         EXCLUDED.invoice_units, EXCLUDED.invoice_value, EXCLUDED.invoice_count, EXCLUDED.invoice_buyer_count,
         EXCLUDED.estimate_units, EXCLUDED.estimate_value, EXCLUDED.estimate_count,
         EXCLUDED.order_units, EXCLUDED.order_value, EXCLUDED.order_count,
         EXCLUDED.source_watermark);
  GET DIAGNOSTICS v_count = ROW_COUNT; v_rows := v_rows + v_count;

  -- Same rewrite as the insert above: the old NOT EXISTS had the identical
  -- item-table -> parent-doc-table shape with a correlated date range, so it
  -- re-scanned the parent's whole period window once per candidate row. The
  -- pre-materialized agg already encodes exactly this predicate -- a key with
  -- no agg row, or one whose three counts are all zero, has no activity.
  DELETE FROM app.metrics_product_period_summary s
  USING pg_temp.metrics_v4_product_period_keys k
  WHERE s.tenant_id = p_tenant_id AND s.tenant_product_id = k.tenant_product_id AND s.grain = k.grain AND s.period_start = k.period_start AND s.deleted_at IS NULL
    AND NOT EXISTS (
      SELECT 1 FROM pg_temp.metrics_v4_product_agg a
      WHERE a.tenant_product_id = k.tenant_product_id AND a.grain = k.grain AND a.period_start = k.period_start
        AND (COALESCE(a.inv_count,0) > 0 OR COALESCE(a.est_count,0) > 0 OR COALESCE(a.ord_count,0) > 0)
    );
  GET DIAGNOSTICS v_count = ROW_COUNT; v_rows := v_rows + v_count;

  -- NOTE: this block used to run FIRST in the commercial branch, ahead of the
  -- buyer and product writes. It was moved here -- after buyer_period,
  -- product_period and their DELETE guards -- so that a later change can derive
  -- the month/quarter rows from those tables. Deriving them while this ran
  -- first would have read the PREVIOUS tick's entity rows.
  --
  -- Pure reordering: nothing between the old and new position reads
  -- metrics_tenant_period_summary. brand/category read product_period,
  -- buyer_now reads the buyer key temp table, and the tail
  -- _metrics_v4_refresh_landing_kpis still runs after everything.
  INSERT INTO app.metrics_tenant_period_summary AS tgt (
    tenant_id, external_ref, grain, period_start, period_end_exclusive,
    invoice_count, invoice_value, invoice_units, invoice_buyer_count, invoice_product_count,
    estimate_count, estimate_value, estimate_units, estimate_buyer_count, estimate_product_count,
    order_count, order_value, order_units, order_buyer_count, order_product_count,
    app_estimate_count, app_estimate_value, app_estimate_buyer_count,
    app_order_count, app_order_value, app_order_buyer_count,
    primary_demand_kind, primary_demand_count, primary_demand_value, primary_demand_buyer_count,
    source_watermark, computed_at, updated_at, deleted_at
  )
  -- Each *_docs CTE is scanned ONCE over the union of every period window
  -- (MIN(period_start) .. MAX(period_end_exclusive)); the per-grain rollups
  -- below then re-use those rows instead of re-reading the table per key.
  -- MATERIALIZED is required: without it the planner inlines the CTE back into
  -- each rollup and we are straight back to one scan per grain.
  WITH bounds AS (
    SELECT MIN(period_start) AS lo, MAX(period_end_exclusive) AS hi
    FROM pg_temp.metrics_v4_period_keys
    -- Only day/week are computed from raw now, so the scan window is bounded by
    -- the dirty-day span (+6 for the enclosing week) instead of by how far into
    -- the quarter we are. This is the whole point of the change.
    WHERE grain IN ('day','week')
  ),
  inv_docs AS MATERIALIZED (
    SELECT i.id, i.buyer_id, i.total_amount, i.status, i.updated_at,
           app.metric_day_ist(i.invoice_date, i.created_at) AS d
    FROM app.invoices i, bounds b
    WHERE i.tenant_id = p_tenant_id AND i.deleted_at IS NULL
      AND app.metric_day_ist(i.invoice_date, i.created_at) >= b.lo
      AND app.metric_day_ist(i.invoice_date, i.created_at) <  b.hi
  ),
  inv_h AS (
    SELECT p.grain, p.period_start,
      COUNT(DISTINCT d.id) FILTER (WHERE app.invoice_status_gmv_included(d.status))::bigint AS invoice_count,
      COALESCE(SUM(d.total_amount) FILTER (WHERE app.invoice_status_gmv_included(d.status)),0)::numeric AS invoice_value,
      COUNT(DISTINCT d.buyer_id) FILTER (WHERE app.invoice_status_gmv_included(d.status))::bigint AS invoice_buyer_count,
      MAX(d.updated_at) AS wm
    FROM (SELECT * FROM pg_temp.metrics_v4_period_keys WHERE grain IN ('day','week')) p
    JOIN inv_docs d ON d.d >= p.period_start AND d.d < p.period_end_exclusive
    GROUP BY 1,2
  ),
  inv_i AS (
    SELECT p.grain, p.period_start,
      COALESCE(SUM(ii.qty) FILTER (WHERE app.invoice_status_gmv_included(d.status)),0)::numeric AS invoice_units,
      COUNT(DISTINCT ii.tenant_product_id) FILTER (WHERE app.invoice_status_gmv_included(d.status))::bigint AS invoice_product_count,
      MAX(ii.updated_at) AS wm
    FROM (SELECT * FROM pg_temp.metrics_v4_period_keys WHERE grain IN ('day','week')) p
    JOIN inv_docs d ON d.d >= p.period_start AND d.d < p.period_end_exclusive
    JOIN app.invoice_items ii ON ii.invoice_id = d.id AND ii.deleted_at IS NULL
    GROUP BY 1,2
  ),
  inv AS (
    SELECT h.grain, h.period_start, h.invoice_count, h.invoice_value,
      COALESCE(i.invoice_units,0) AS invoice_units, h.invoice_buyer_count,
      COALESCE(i.invoice_product_count,0) AS invoice_product_count,
      GREATEST(h.wm, i.wm) AS watermark
    FROM inv_h h LEFT JOIN inv_i i ON i.grain = h.grain AND i.period_start = h.period_start
  ),
  est_docs AS MATERIALIZED (
    SELECT e.id, e.buyer_id, e.total_amount, e.status, e.is_buyer_app_estimate, e.updated_at,
           app.metric_day_ist(e.estimate_date, e.created_at) AS d
    FROM app.estimates e, bounds b
    WHERE e.tenant_id = p_tenant_id AND e.deleted_at IS NULL
      AND app.metric_day_ist(e.estimate_date, e.created_at) >= b.lo
      AND app.metric_day_ist(e.estimate_date, e.created_at) <  b.hi
  ),
  est_h AS (
    SELECT p.grain, p.period_start,
      COUNT(DISTINCT d.id) FILTER (WHERE app.estimate_status_counts_as_demand(d.status))::bigint AS estimate_count,
      COALESCE(SUM(d.total_amount) FILTER (WHERE app.estimate_status_counts_as_demand(d.status)),0)::numeric AS estimate_value,
      COUNT(DISTINCT d.buyer_id) FILTER (WHERE app.estimate_status_counts_as_demand(d.status))::bigint AS estimate_buyer_count,
      COUNT(DISTINCT d.id) FILTER (WHERE d.is_buyer_app_estimate AND app.estimate_status_counts_as_demand(d.status))::bigint AS app_estimate_count,
      COALESCE(SUM(d.total_amount) FILTER (WHERE d.is_buyer_app_estimate AND app.estimate_status_counts_as_demand(d.status)),0)::numeric AS app_estimate_value,
      COUNT(DISTINCT d.buyer_id) FILTER (WHERE d.is_buyer_app_estimate AND app.estimate_status_counts_as_demand(d.status))::bigint AS app_estimate_buyer_count,
      MAX(d.updated_at) AS wm
    FROM (SELECT * FROM pg_temp.metrics_v4_period_keys WHERE grain IN ('day','week')) p
    JOIN est_docs d ON d.d >= p.period_start AND d.d < p.period_end_exclusive
    GROUP BY 1,2
  ),
  est_i AS (
    SELECT p.grain, p.period_start,
      COALESCE(SUM(ei.qty) FILTER (WHERE app.estimate_status_counts_as_demand(d.status)),0)::numeric AS estimate_units,
      COUNT(DISTINCT ei.tenant_product_id) FILTER (WHERE app.estimate_status_counts_as_demand(d.status))::bigint AS estimate_product_count,
      MAX(ei.updated_at) AS wm
    FROM (SELECT * FROM pg_temp.metrics_v4_period_keys WHERE grain IN ('day','week')) p
    JOIN est_docs d ON d.d >= p.period_start AND d.d < p.period_end_exclusive
    JOIN app.estimate_items ei ON ei.estimate_id = d.id AND ei.deleted_at IS NULL
    GROUP BY 1,2
  ),
  est AS (
    SELECT h.grain, h.period_start, h.estimate_count, h.estimate_value,
      COALESCE(i.estimate_units,0) AS estimate_units, h.estimate_buyer_count,
      COALESCE(i.estimate_product_count,0) AS estimate_product_count,
      h.app_estimate_count, h.app_estimate_value, h.app_estimate_buyer_count,
      GREATEST(h.wm, i.wm) AS watermark
    FROM est_h h LEFT JOIN est_i i ON i.grain = h.grain AND i.period_start = h.period_start
  ),
  ord_docs AS MATERIALIZED (
    SELECT o.id, o.buyer_id, o.total_amount, o.status, o.is_buyer_app_order, o.updated_at,
           app.metric_day_ist(o.order_date, o.created_at) AS d
    FROM app.orders o, bounds b
    WHERE o.tenant_id = p_tenant_id AND o.deleted_at IS NULL
      AND app.metric_day_ist(o.order_date, o.created_at) >= b.lo
      AND app.metric_day_ist(o.order_date, o.created_at) <  b.hi
  ),
  ord_h AS (
    SELECT p.grain, p.period_start,
      COUNT(DISTINCT d.id) FILTER (WHERE app.order_status_in_flow(d.status))::bigint AS order_count,
      COALESCE(SUM(d.total_amount) FILTER (WHERE app.order_status_in_flow(d.status)),0)::numeric AS order_value,
      COUNT(DISTINCT d.buyer_id) FILTER (WHERE app.order_status_in_flow(d.status))::bigint AS order_buyer_count,
      COUNT(DISTINCT d.id) FILTER (WHERE d.is_buyer_app_order AND app.order_status_in_flow(d.status))::bigint AS app_order_count,
      COALESCE(SUM(d.total_amount) FILTER (WHERE d.is_buyer_app_order AND app.order_status_in_flow(d.status)),0)::numeric AS app_order_value,
      COUNT(DISTINCT d.buyer_id) FILTER (WHERE d.is_buyer_app_order AND app.order_status_in_flow(d.status))::bigint AS app_order_buyer_count,
      MAX(d.updated_at) AS wm
    FROM (SELECT * FROM pg_temp.metrics_v4_period_keys WHERE grain IN ('day','week')) p
    JOIN ord_docs d ON d.d >= p.period_start AND d.d < p.period_end_exclusive
    GROUP BY 1,2
  ),
  ord_i AS (
    SELECT p.grain, p.period_start,
      COALESCE(SUM(oi.qty) FILTER (WHERE app.order_status_in_flow(d.status)),0)::numeric AS order_units,
      COUNT(DISTINCT oi.tenant_product_id) FILTER (WHERE app.order_status_in_flow(d.status))::bigint AS order_product_count,
      MAX(oi.updated_at) AS wm
    FROM (SELECT * FROM pg_temp.metrics_v4_period_keys WHERE grain IN ('day','week')) p
    JOIN ord_docs d ON d.d >= p.period_start AND d.d < p.period_end_exclusive
    JOIN app.order_items oi ON oi.order_id = d.id AND oi.deleted_at IS NULL
    GROUP BY 1,2
  ),
  ord AS (
    SELECT h.grain, h.period_start, h.order_count, h.order_value,
      COALESCE(i.order_units,0) AS order_units, h.order_buyer_count,
      COALESCE(i.order_product_count,0) AS order_product_count,
      h.app_order_count, h.app_order_value, h.app_order_buyer_count,
      GREATEST(h.wm, i.wm) AS watermark
    FROM ord_h h LEFT JOIN ord_i i ON i.grain = h.grain AND i.period_start = h.period_start
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
  FROM (SELECT * FROM pg_temp.metrics_v4_period_keys WHERE grain IN ('day','week')) p
  LEFT JOIN inv ON inv.grain = p.grain AND inv.period_start = p.period_start
  LEFT JOIN est ON est.grain = p.grain AND est.period_start = p.period_start
  LEFT JOIN ord ON ord.grain = p.grain AND ord.period_start = p.period_start
  ON CONFLICT (tenant_id, grain, period_start) WHERE deleted_at IS NULL DO UPDATE SET
    period_end_exclusive = EXCLUDED.period_end_exclusive,
    invoice_count = EXCLUDED.invoice_count, invoice_value = EXCLUDED.invoice_value, invoice_units = EXCLUDED.invoice_units, invoice_buyer_count = EXCLUDED.invoice_buyer_count, invoice_product_count = EXCLUDED.invoice_product_count,
    estimate_count = EXCLUDED.estimate_count, estimate_value = EXCLUDED.estimate_value, estimate_units = EXCLUDED.estimate_units, estimate_buyer_count = EXCLUDED.estimate_buyer_count, estimate_product_count = EXCLUDED.estimate_product_count,
    order_count = EXCLUDED.order_count, order_value = EXCLUDED.order_value, order_units = EXCLUDED.order_units, order_buyer_count = EXCLUDED.order_buyer_count, order_product_count = EXCLUDED.order_product_count,
    app_estimate_count = EXCLUDED.app_estimate_count, app_estimate_value = EXCLUDED.app_estimate_value, app_estimate_buyer_count = EXCLUDED.app_estimate_buyer_count,
    app_order_count = EXCLUDED.app_order_count, app_order_value = EXCLUDED.app_order_value, app_order_buyer_count = EXCLUDED.app_order_buyer_count,
    primary_demand_kind = EXCLUDED.primary_demand_kind, primary_demand_count = EXCLUDED.primary_demand_count, primary_demand_value = EXCLUDED.primary_demand_value, primary_demand_buyer_count = EXCLUDED.primary_demand_buyer_count,
    source_watermark = EXCLUDED.source_watermark, computed_at = EXCLUDED.computed_at, generation_id = gen_random_uuid(), updated_at = EXCLUDED.updated_at, deleted_at = NULL
  WHERE (tgt.period_end_exclusive,
         tgt.invoice_count, tgt.invoice_value, tgt.invoice_units, tgt.invoice_buyer_count, tgt.invoice_product_count,
         tgt.estimate_count, tgt.estimate_value, tgt.estimate_units, tgt.estimate_buyer_count, tgt.estimate_product_count,
         tgt.order_count, tgt.order_value, tgt.order_units, tgt.order_buyer_count, tgt.order_product_count,
         tgt.app_estimate_count, tgt.app_estimate_value, tgt.app_estimate_buyer_count,
         tgt.app_order_count, tgt.app_order_value, tgt.app_order_buyer_count,
         tgt.primary_demand_kind, tgt.primary_demand_count, tgt.primary_demand_value, tgt.primary_demand_buyer_count,
         tgt.source_watermark)
    IS DISTINCT FROM
        (EXCLUDED.period_end_exclusive,
         EXCLUDED.invoice_count, EXCLUDED.invoice_value, EXCLUDED.invoice_units, EXCLUDED.invoice_buyer_count, EXCLUDED.invoice_product_count,
         EXCLUDED.estimate_count, EXCLUDED.estimate_value, EXCLUDED.estimate_units, EXCLUDED.estimate_buyer_count, EXCLUDED.estimate_product_count,
         EXCLUDED.order_count, EXCLUDED.order_value, EXCLUDED.order_units, EXCLUDED.order_buyer_count, EXCLUDED.order_product_count,
         EXCLUDED.app_estimate_count, EXCLUDED.app_estimate_value, EXCLUDED.app_estimate_buyer_count,
         EXCLUDED.app_order_count, EXCLUDED.app_order_value, EXCLUDED.app_order_buyer_count,
         EXCLUDED.primary_demand_kind, EXCLUDED.primary_demand_count, EXCLUDED.primary_demand_value, EXCLUDED.primary_demand_buyer_count,
         EXCLUDED.source_watermark);
  GET DIAGNOSTICS v_count = ROW_COUNT; v_rows := v_rows + v_count;


  -- month/quarter are NOT recomputed from raw. They roll up from rows this
  -- same tick has already written:
  --
  --   additive measures  <- SUM over this tenant's 'day' rows in the window
  --   distinct counts    <- COUNT over metrics_buyer_period_summary /
  --                         metrics_product_period_summary at the SAME grain
  --
  -- The second half is the part that cannot be done any other way. A distinct
  -- count does not sum: a buyer active on 12 days counts once, not twice. The
  -- per-entity tables already hold exactly that de-duplication, and they are
  -- maintained at 'month' and 'quarter' and no other grain (see the
  -- metrics_v4_*_period_keys inserts, WHERE p.grain IN ('month','quarter')) --
  -- precisely the grains being derived here.
  --
  -- This block MUST run after the buyer and product writes above; the statement
  -- order in this branch was changed for that reason.
  --
  -- Trade-off accepted, and guarded by a nightly raw drift check: a month/quarter
  -- row is no longer independently correct -- it inherits any error in the day or
  -- entity rows it reads. metrics_brand_period_summary and
  -- metrics_category_period_summary have always had this same property.
  --
  -- primary_demand_* is recomputed from the summed estimate/order figures via
  -- v_primary rather than summing the stored primary_demand_* columns, so a
  -- change to the tenant's primary demand kind takes effect immediately instead
  -- of inheriting whatever kind was in force when the day rows were written.
  INSERT INTO app.metrics_tenant_period_summary AS tgt (
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
    COALESCE(d.invoice_count,0), COALESCE(d.invoice_value,0), COALESCE(d.invoice_units,0),
    COALESCE(b.invoice_buyer_count,0), COALESCE(pr.invoice_product_count,0),
    COALESCE(d.estimate_count,0), COALESCE(d.estimate_value,0), COALESCE(d.estimate_units,0),
    COALESCE(b.estimate_buyer_count,0), COALESCE(pr.estimate_product_count,0),
    COALESCE(d.order_count,0), COALESCE(d.order_value,0), COALESCE(d.order_units,0),
    COALESCE(b.order_buyer_count,0), COALESCE(pr.order_product_count,0),
    COALESCE(d.app_estimate_count,0), COALESCE(d.app_estimate_value,0), COALESCE(b.app_estimate_buyer_count,0),
    COALESCE(d.app_order_count,0), COALESCE(d.app_order_value,0), COALESCE(b.app_order_buyer_count,0),
    v_primary,
    CASE WHEN v_primary = 'estimates' THEN COALESCE(d.estimate_count,0) WHEN v_primary = 'orders' THEN COALESCE(d.order_count,0) ELSE 0 END,
    CASE WHEN v_primary = 'estimates' THEN COALESCE(d.estimate_value,0) WHEN v_primary = 'orders' THEN COALESCE(d.order_value,0) ELSE 0 END,
    CASE WHEN v_primary = 'estimates' THEN COALESCE(b.estimate_buyer_count,0) WHEN v_primary = 'orders' THEN COALESCE(b.order_buyer_count,0) ELSE 0 END,
    d.watermark, v_now, v_now, NULL
  FROM (SELECT * FROM pg_temp.metrics_v4_period_keys WHERE grain IN ('month','quarter')) p
  LEFT JOIN LATERAL (
    SELECT
      SUM(dd.invoice_count)::bigint  AS invoice_count,  SUM(dd.invoice_value)  AS invoice_value,  SUM(dd.invoice_units)  AS invoice_units,
      SUM(dd.estimate_count)::bigint AS estimate_count, SUM(dd.estimate_value) AS estimate_value, SUM(dd.estimate_units) AS estimate_units,
      SUM(dd.order_count)::bigint    AS order_count,    SUM(dd.order_value)    AS order_value,    SUM(dd.order_units)    AS order_units,
      SUM(dd.app_estimate_count)::bigint AS app_estimate_count, SUM(dd.app_estimate_value) AS app_estimate_value,
      SUM(dd.app_order_count)::bigint    AS app_order_count,    SUM(dd.app_order_value)    AS app_order_value,
      MAX(dd.source_watermark) AS watermark
    FROM app.metrics_tenant_period_summary dd
    WHERE dd.tenant_id = p_tenant_id AND dd.grain = 'day' AND dd.deleted_at IS NULL
      AND dd.period_start >= p.period_start AND dd.period_start < p.period_end_exclusive
  ) d ON true
  LEFT JOIN LATERAL (
    SELECT
      COUNT(*) FILTER (WHERE bb.invoice_count  > 0)::bigint AS invoice_buyer_count,
      COUNT(*) FILTER (WHERE bb.estimate_count > 0)::bigint AS estimate_buyer_count,
      COUNT(*) FILTER (WHERE bb.order_count    > 0)::bigint AS order_buyer_count,
      COUNT(*) FILTER (WHERE bb.app_estimate_count > 0)::bigint AS app_estimate_buyer_count,
      COUNT(*) FILTER (WHERE bb.app_order_count    > 0)::bigint AS app_order_buyer_count
    FROM app.metrics_buyer_period_summary bb
    WHERE bb.tenant_id = p_tenant_id AND bb.grain = p.grain
      AND bb.period_start = p.period_start AND bb.deleted_at IS NULL
  ) b ON true
  LEFT JOIN LATERAL (
    SELECT
      COUNT(*) FILTER (WHERE pp.invoice_count  > 0)::bigint AS invoice_product_count,
      COUNT(*) FILTER (WHERE pp.estimate_count > 0)::bigint AS estimate_product_count,
      COUNT(*) FILTER (WHERE pp.order_count    > 0)::bigint AS order_product_count
    FROM app.metrics_product_period_summary pp
    WHERE pp.tenant_id = p_tenant_id AND pp.grain = p.grain
      AND pp.period_start = p.period_start AND pp.deleted_at IS NULL
  ) pr ON true
  ON CONFLICT (tenant_id, grain, period_start) WHERE deleted_at IS NULL DO UPDATE SET
    period_end_exclusive = EXCLUDED.period_end_exclusive,
    invoice_count = EXCLUDED.invoice_count, invoice_value = EXCLUDED.invoice_value, invoice_units = EXCLUDED.invoice_units, invoice_buyer_count = EXCLUDED.invoice_buyer_count, invoice_product_count = EXCLUDED.invoice_product_count,
    estimate_count = EXCLUDED.estimate_count, estimate_value = EXCLUDED.estimate_value, estimate_units = EXCLUDED.estimate_units, estimate_buyer_count = EXCLUDED.estimate_buyer_count, estimate_product_count = EXCLUDED.estimate_product_count,
    order_count = EXCLUDED.order_count, order_value = EXCLUDED.order_value, order_units = EXCLUDED.order_units, order_buyer_count = EXCLUDED.order_buyer_count, order_product_count = EXCLUDED.order_product_count,
    app_estimate_count = EXCLUDED.app_estimate_count, app_estimate_value = EXCLUDED.app_estimate_value, app_estimate_buyer_count = EXCLUDED.app_estimate_buyer_count,
    app_order_count = EXCLUDED.app_order_count, app_order_value = EXCLUDED.app_order_value, app_order_buyer_count = EXCLUDED.app_order_buyer_count,
    primary_demand_kind = EXCLUDED.primary_demand_kind, primary_demand_count = EXCLUDED.primary_demand_count, primary_demand_value = EXCLUDED.primary_demand_value, primary_demand_buyer_count = EXCLUDED.primary_demand_buyer_count,
    source_watermark = EXCLUDED.source_watermark, computed_at = EXCLUDED.computed_at, generation_id = gen_random_uuid(), updated_at = EXCLUDED.updated_at, deleted_at = NULL
  WHERE (tgt.period_end_exclusive,
         tgt.invoice_count, tgt.invoice_value, tgt.invoice_units, tgt.invoice_buyer_count, tgt.invoice_product_count,
         tgt.estimate_count, tgt.estimate_value, tgt.estimate_units, tgt.estimate_buyer_count, tgt.estimate_product_count,
         tgt.order_count, tgt.order_value, tgt.order_units, tgt.order_buyer_count, tgt.order_product_count,
         tgt.app_estimate_count, tgt.app_estimate_value, tgt.app_estimate_buyer_count,
         tgt.app_order_count, tgt.app_order_value, tgt.app_order_buyer_count,
         tgt.primary_demand_kind, tgt.primary_demand_count, tgt.primary_demand_value, tgt.primary_demand_buyer_count,
         tgt.source_watermark)
    IS DISTINCT FROM
        (EXCLUDED.period_end_exclusive,
         EXCLUDED.invoice_count, EXCLUDED.invoice_value, EXCLUDED.invoice_units, EXCLUDED.invoice_buyer_count, EXCLUDED.invoice_product_count,
         EXCLUDED.estimate_count, EXCLUDED.estimate_value, EXCLUDED.estimate_units, EXCLUDED.estimate_buyer_count, EXCLUDED.estimate_product_count,
         EXCLUDED.order_count, EXCLUDED.order_value, EXCLUDED.order_units, EXCLUDED.order_buyer_count, EXCLUDED.order_product_count,
         EXCLUDED.app_estimate_count, EXCLUDED.app_estimate_value, EXCLUDED.app_estimate_buyer_count,
         EXCLUDED.app_order_count, EXCLUDED.app_order_value, EXCLUDED.app_order_buyer_count,
         EXCLUDED.primary_demand_kind, EXCLUDED.primary_demand_count, EXCLUDED.primary_demand_value, EXCLUDED.primary_demand_buyer_count,
         EXCLUDED.source_watermark);
  GET DIAGNOSTICS v_count = ROW_COUNT; v_rows := v_rows + v_count;

  INSERT INTO app.metrics_brand_period_summary AS tgt (
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
    source_watermark = EXCLUDED.source_watermark, computed_at = EXCLUDED.computed_at, generation_id = gen_random_uuid(), updated_at = EXCLUDED.updated_at, deleted_at = NULL
  WHERE (tgt.period_end_exclusive, tgt.invoice_count, tgt.invoice_value, tgt.invoice_product_count, tgt.invoice_buyer_count, tgt.source_watermark)
    IS DISTINCT FROM
        (EXCLUDED.period_end_exclusive, EXCLUDED.invoice_count, EXCLUDED.invoice_value, EXCLUDED.invoice_product_count, EXCLUDED.invoice_buyer_count, EXCLUDED.source_watermark);
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

  INSERT INTO app.metrics_category_period_summary AS tgt (
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
    source_watermark = EXCLUDED.source_watermark, computed_at = EXCLUDED.computed_at, generation_id = gen_random_uuid(), updated_at = EXCLUDED.updated_at, deleted_at = NULL
  WHERE (tgt.period_end_exclusive, tgt.invoice_count, tgt.invoice_value, tgt.invoice_product_count, tgt.invoice_buyer_count, tgt.source_watermark)
    IS DISTINCT FROM
        (EXCLUDED.period_end_exclusive, EXCLUDED.invoice_count, EXCLUDED.invoice_value, EXCLUDED.invoice_product_count, EXCLUDED.invoice_buyer_count, EXCLUDED.source_watermark);
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
  INSERT INTO app.metrics_location_period_summary AS tgt (
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
    SELECT COUNT(*) FILTER (WHERE app.estimate_status_counts_as_demand(e.status))::bigint AS estimate_count,
      COALESCE(SUM(e.total_amount) FILTER (WHERE app.estimate_status_counts_as_demand(e.status)), 0)::numeric AS estimate_value,
      COUNT(DISTINCT e.buyer_id) FILTER (WHERE app.estimate_status_counts_as_demand(e.status))::bigint AS estimate_buyer_count,
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
    source_watermark = EXCLUDED.source_watermark, computed_at = EXCLUDED.computed_at, generation_id = gen_random_uuid(), updated_at = EXCLUDED.updated_at, deleted_at = NULL
  WHERE (tgt.period_end_exclusive,
         tgt.invoice_count, tgt.invoice_value, tgt.invoice_buyer_count,
         tgt.estimate_count, tgt.estimate_value, tgt.estimate_buyer_count,
         tgt.order_count, tgt.order_value, tgt.order_buyer_count,
         tgt.primary_demand_kind, tgt.primary_demand_count, tgt.primary_demand_value, tgt.primary_demand_buyer_count,
         tgt.source_watermark)
    IS DISTINCT FROM
        (EXCLUDED.period_end_exclusive,
         EXCLUDED.invoice_count, EXCLUDED.invoice_value, EXCLUDED.invoice_buyer_count,
         EXCLUDED.estimate_count, EXCLUDED.estimate_value, EXCLUDED.estimate_buyer_count,
         EXCLUDED.order_count, EXCLUDED.order_value, EXCLUDED.order_buyer_count,
         EXCLUDED.primary_demand_kind, EXCLUDED.primary_demand_count, EXCLUDED.primary_demand_value, EXCLUDED.primary_demand_buyer_count,
         EXCLUDED.source_watermark);
  GET DIAGNOSTICS v_count = ROW_COUNT; v_rows := v_rows + v_count;

  -- Warehouse coverage is derived from metrics_product_period_summary, which
  -- the 'commercial' domain writes for the same dirty period keys. If this
  -- inventory tick runs before that commercial tick has landed for the same
  -- window, warehouse rows simply catch up on the next inventory tick —
  -- same eventual-consistency model the brand/category rollups already rely on.
  INSERT INTO app.metrics_warehouse_period_summary AS tgt (
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
    source_watermark = EXCLUDED.source_watermark, computed_at = EXCLUDED.computed_at, generation_id = gen_random_uuid(), updated_at = EXCLUDED.updated_at, deleted_at = NULL
  WHERE (tgt.period_end_exclusive, tgt.sold_sku_count, tgt.sold_units, tgt.invoice_value, tgt.source_watermark)
    IS DISTINCT FROM
        (EXCLUDED.period_end_exclusive, EXCLUDED.sold_sku_count, EXCLUDED.sold_units, EXCLUDED.invoice_value, EXCLUDED.source_watermark);
  GET DIAGNOSTICS v_count = ROW_COUNT; v_rows := v_rows + v_count;

  ELSIF p_domain = 'buyer_app' THEN

  -- Campaign and cohort coverage. Both are low-cardinality per tenant.
  -- Cohort rollups read metrics_buyer_period_summary, which the 'commercial'
  -- domain writes — same catch-up-on-next-tick model as warehouse above.
  INSERT INTO app.metrics_campaign_period_summary AS tgt (
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
    SELECT COUNT(*) FILTER (WHERE app.estimate_status_counts_as_demand(e.status))::bigint AS estimate_count,
      COALESCE(SUM(e.total_amount) FILTER (WHERE app.estimate_status_counts_as_demand(e.status)), 0)::numeric AS estimate_value,
      COUNT(DISTINCT e.buyer_id) FILTER (WHERE app.estimate_status_counts_as_demand(e.status))::bigint AS demand_buyer_count
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
    source_watermark = EXCLUDED.source_watermark, computed_at = EXCLUDED.computed_at, generation_id = gen_random_uuid(), updated_at = EXCLUDED.updated_at, deleted_at = NULL
  -- source_watermark is deliberately NOT compared here: unlike the other
  -- summaries, this INSERT sets it to v_now rather than to a MAX over source
  -- rows, so it changes on every execution by construction and including it
  -- would make this guard dead code.
  WHERE (tgt.period_end_exclusive,
         tgt.viewed_buyer_count, tgt.view_count,
         tgt.estimate_count, tgt.estimate_value, tgt.order_count, tgt.order_value,
         tgt.invoice_count, tgt.invoice_value,
         tgt.demand_buyer_count, tgt.revenue_buyer_count)
    IS DISTINCT FROM
        (EXCLUDED.period_end_exclusive,
         EXCLUDED.viewed_buyer_count, EXCLUDED.view_count,
         EXCLUDED.estimate_count, EXCLUDED.estimate_value, EXCLUDED.order_count, EXCLUDED.order_value,
         EXCLUDED.invoice_count, EXCLUDED.invoice_value,
         EXCLUDED.demand_buyer_count, EXCLUDED.revenue_buyer_count);
  GET DIAGNOSTICS v_count = ROW_COUNT; v_rows := v_rows + v_count;

  INSERT INTO app.metrics_cohort_period_summary AS tgt (
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
    source_watermark = EXCLUDED.source_watermark, computed_at = EXCLUDED.computed_at, generation_id = gen_random_uuid(), updated_at = EXCLUDED.updated_at, deleted_at = NULL
  -- source_watermark omitted from the comparison for the same reason as
  -- metrics_campaign_period_summary above: it is set to v_now, not to a MAX
  -- over source rows.
  WHERE (tgt.period_end_exclusive,
         tgt.member_count, tgt.active_member_count,
         tgt.demand_count, tgt.demand_value, tgt.invoice_count, tgt.invoice_value)
    IS DISTINCT FROM
        (EXCLUDED.period_end_exclusive,
         EXCLUDED.member_count, EXCLUDED.active_member_count,
         EXCLUDED.demand_count, EXCLUDED.demand_value, EXCLUDED.invoice_count, EXCLUDED.invoice_value);
  GET DIAGNOSTICS v_count = ROW_COUNT; v_rows := v_rows + v_count;

  END IF;

  SELECT MAX(s.source_watermark) INTO v_watermark
  FROM app.metrics_tenant_period_summary s
  WHERE s.tenant_id = p_tenant_id AND s.deleted_at IS NULL
    AND (s.grain, s.period_start) IN (SELECT k.grain, k.period_start FROM pg_temp.metrics_v4_period_keys k);

  v_rows := v_rows + app._metrics_v4_refresh_landing_kpis(p_tenant_id, p_domain => p_domain, p_dirty_days => (SELECT array_agg(day) FROM pg_temp.metrics_v4_dirty_days));

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
