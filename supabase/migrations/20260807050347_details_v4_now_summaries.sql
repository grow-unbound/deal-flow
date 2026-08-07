-- Details-page v4 metrics: fill the now_summary gaps needed to move
-- Customer/Product/Campaign/Cohort/Price List/Brand/Location/Warehouse/Category
-- Details pages off the v2 detail RPCs onto the same v4 summary tables Landing
-- already reads. See specs/performance-upgrade-2026-07.md and the Details v4
-- cutover plan for the full context.
--
-- Table shape, index shape, and RLS policy below are copied verbatim from the
-- conventions in 20260731081042_metrics_v4_period_summaries_landing_snapshots.sql
-- (common audit columns, one partial unique index per active row, tenant-scoped
-- SELECT policy via app.jwt_tenant_id()). No fillfactor override -- the base
-- migration doesn't set one on any period/now summary table; that's reserved
-- for the high-churn app.metrics_dirty_work queue table only.

-- =====================================================================
-- New now_summary tables
-- =====================================================================

CREATE TABLE IF NOT EXISTS app.metrics_brand_now_summary (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES app.tenants(id) ON DELETE RESTRICT,
  tenant_brand_id uuid NOT NULL REFERENCES app.tenant_brands(id) ON DELETE RESTRICT,
  external_ref text NOT NULL,
  member_product_count bigint DEFAULT 0 NOT NULL,
  selling_product_out_of_stock_count bigint DEFAULT 0 NOT NULL,
  low_stock_product_count bigint DEFAULT 0 NOT NULL,
  source_watermark timestamptz,
  computed_at timestamptz DEFAULT now() NOT NULL,
  calculation_version integer DEFAULT 4 NOT NULL,
  generation_id uuid DEFAULT gen_random_uuid() NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL,
  created_by uuid REFERENCES auth.users(id) ON DELETE RESTRICT,
  updated_by uuid REFERENCES auth.users(id) ON DELETE RESTRICT,
  deleted_at timestamptz
);

CREATE UNIQUE INDEX IF NOT EXISTS metrics_brand_now_summary_active_uk
  ON app.metrics_brand_now_summary (tenant_id, tenant_brand_id)
  WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS app.metrics_category_now_summary (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES app.tenants(id) ON DELETE RESTRICT,
  tenant_category_id uuid NOT NULL REFERENCES app.tenant_categories(id) ON DELETE RESTRICT,
  external_ref text NOT NULL,
  product_count bigint DEFAULT 0 NOT NULL,
  brand_count bigint DEFAULT 0 NOT NULL,
  source_watermark timestamptz,
  computed_at timestamptz DEFAULT now() NOT NULL,
  calculation_version integer DEFAULT 4 NOT NULL,
  generation_id uuid DEFAULT gen_random_uuid() NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL,
  created_by uuid REFERENCES auth.users(id) ON DELETE RESTRICT,
  updated_by uuid REFERENCES auth.users(id) ON DELETE RESTRICT,
  deleted_at timestamptz
);

CREATE UNIQUE INDEX IF NOT EXISTS metrics_category_now_summary_active_uk
  ON app.metrics_category_now_summary (tenant_id, tenant_category_id)
  WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS app.metrics_warehouse_now_summary (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES app.tenants(id) ON DELETE RESTRICT,
  warehouse_id uuid NOT NULL REFERENCES app.warehouses(id) ON DELETE RESTRICT,
  external_ref text NOT NULL,
  available_product_count bigint DEFAULT 0 NOT NULL,
  in_stock_product_count bigint DEFAULT 0 NOT NULL,
  sellable_units numeric(14,2) DEFAULT 0 NOT NULL,
  low_stock_product_count bigint DEFAULT 0 NOT NULL,
  out_of_stock_product_count bigint DEFAULT 0 NOT NULL,
  idle_stock_product_count bigint DEFAULT 0 NOT NULL,
  idle_stock_units numeric(14,2) DEFAULT 0 NOT NULL,
  source_watermark timestamptz,
  computed_at timestamptz DEFAULT now() NOT NULL,
  calculation_version integer DEFAULT 4 NOT NULL,
  generation_id uuid DEFAULT gen_random_uuid() NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL,
  created_by uuid REFERENCES auth.users(id) ON DELETE RESTRICT,
  updated_by uuid REFERENCES auth.users(id) ON DELETE RESTRICT,
  deleted_at timestamptz
);

CREATE UNIQUE INDEX IF NOT EXISTS metrics_warehouse_now_summary_active_uk
  ON app.metrics_warehouse_now_summary (tenant_id, warehouse_id)
  WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS app.metrics_price_lists_now_summary (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES app.tenants(id) ON DELETE RESTRICT,
  price_list_id uuid NOT NULL REFERENCES app.price_lists(id) ON DELETE RESTRICT,
  external_ref text NOT NULL,
  member_product_count bigint DEFAULT 0 NOT NULL,
  assigned_cohort_count bigint DEFAULT 0 NOT NULL,
  assigned_buyer_count bigint DEFAULT 0 NOT NULL,
  avg_discount_pct numeric(6,2) DEFAULT 0 NOT NULL,
  avg_margin_pct numeric(6,2) DEFAULT 0 NOT NULL,
  source_watermark timestamptz,
  computed_at timestamptz DEFAULT now() NOT NULL,
  calculation_version integer DEFAULT 4 NOT NULL,
  generation_id uuid DEFAULT gen_random_uuid() NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL,
  created_by uuid REFERENCES auth.users(id) ON DELETE RESTRICT,
  updated_by uuid REFERENCES auth.users(id) ON DELETE RESTRICT,
  deleted_at timestamptz
);

CREATE UNIQUE INDEX IF NOT EXISTS metrics_price_lists_now_summary_active_uk
  ON app.metrics_price_lists_now_summary (tenant_id, price_list_id)
  WHERE deleted_at IS NULL;

ALTER TABLE app.metrics_brand_now_summary ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.metrics_category_now_summary ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.metrics_warehouse_now_summary ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.metrics_price_lists_now_summary ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
  v_table text;
BEGIN
  FOREACH v_table IN ARRAY ARRAY[
    'metrics_brand_now_summary',
    'metrics_category_now_summary',
    'metrics_warehouse_now_summary',
    'metrics_price_lists_now_summary'
  ]
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON app.%I', v_table || '_tenant_select', v_table);
    EXECUTE format(
      'CREATE POLICY %I ON app.%I FOR SELECT USING (tenant_id = app.jwt_tenant_id())',
      v_table || '_tenant_select',
      v_table
    );
    EXECUTE format('GRANT SELECT ON app.%I TO authenticated', v_table);
    EXECUTE format('GRANT ALL ON app.%I TO service_role', v_table);
  END LOOP;
END $$;

-- =====================================================================
-- Alter existing now_summary / period_summary tables
-- =====================================================================

ALTER TABLE app.metrics_buyer_now_summary
  ADD COLUMN IF NOT EXISTS receivable_invoice_count bigint DEFAULT 0 NOT NULL,
  ADD COLUMN IF NOT EXISTS overdue_invoice_count bigint DEFAULT 0 NOT NULL;

ALTER TABLE app.metrics_location_now_summary
  ADD COLUMN IF NOT EXISTS overdue_invoice_count bigint DEFAULT 0 NOT NULL,
  ADD COLUMN IF NOT EXISTS receivable_invoice_count bigint DEFAULT 0 NOT NULL,
  ADD COLUMN IF NOT EXISTS overdue_buyer_count bigint DEFAULT 0 NOT NULL,
  ADD COLUMN IF NOT EXISTS receivable_buyer_count bigint DEFAULT 0 NOT NULL,
  ADD COLUMN IF NOT EXISTS open_estimate_value numeric(14,2) DEFAULT 0 NOT NULL,
  ADD COLUMN IF NOT EXISTS open_order_value numeric(14,2) DEFAULT 0 NOT NULL;

-- Brand Details' "Selling Products QTD" needs units sold, not just product
-- count -- metrics_brand_period_summary only ever carried invoice_count/value/
-- product_count/buyer_count.
ALTER TABLE app.metrics_brand_period_summary
  ADD COLUMN IF NOT EXISTS invoice_units numeric(14,3) DEFAULT 0 NOT NULL;

-- =====================================================================
-- Refresh pipeline: extend app._metrics_v4_refresh_claimed_periods
-- =====================================================================
-- Full function body, copied from 20260803131547_bound_now_summary_lifetime_scans.sql
-- (the current live definition as of this migration) with the following
-- additions only:
--   * 'commercial' branch: metrics_buyer_now_summary gains
--     receivable_invoice_count/overdue_invoice_count; metrics_location_now_summary
--     gains overdue/receivable invoice+buyer counts and open estimate/order value.
--   * 'inventory' branch: metrics_brand_period_summary gains invoice_units;
--     new metrics_brand_now_summary / metrics_category_now_summary /
--     metrics_warehouse_now_summary / metrics_price_lists_now_summary blocks,
--     following the same low-cardinality-per-tenant, no-separate-budget-check
--     pattern already used for locations/campaigns/cohorts in this function.
-- Everything else is unchanged from the live definition.

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
  CREATE TEMP TABLE IF NOT EXISTS pg_temp.metrics_v4_buyer_ids(buyer_id uuid PRIMARY KEY) ON COMMIT DROP;
  CREATE TEMP TABLE IF NOT EXISTS pg_temp.metrics_v4_product_ids(tenant_product_id uuid PRIMARY KEY) ON COMMIT DROP;
  CREATE TEMP TABLE IF NOT EXISTS pg_temp.metrics_v4_buyer_period_keys(buyer_id uuid NOT NULL, grain text NOT NULL, period_start date NOT NULL, period_end_exclusive date NOT NULL, PRIMARY KEY (buyer_id, grain, period_start)) ON COMMIT DROP;
  CREATE TEMP TABLE IF NOT EXISTS pg_temp.metrics_v4_product_period_keys(tenant_product_id uuid NOT NULL, grain text NOT NULL, period_start date NOT NULL, period_end_exclusive date NOT NULL, PRIMARY KEY (tenant_product_id, grain, period_start)) ON COMMIT DROP;
  CREATE TEMP TABLE IF NOT EXISTS pg_temp.metrics_v4_product_agg(
    tenant_product_id uuid NOT NULL, grain text NOT NULL, period_start date NOT NULL,
    inv_units numeric, inv_value numeric, inv_count bigint, inv_buyers bigint, inv_watermark timestamptz,
    est_units numeric, est_value numeric, est_count bigint, est_watermark timestamptz,
    ord_units numeric, ord_value numeric, ord_count bigint, ord_watermark timestamptz,
    PRIMARY KEY (tenant_product_id, grain, period_start)
  ) ON COMMIT DROP;
  CREATE TEMP TABLE IF NOT EXISTS pg_temp.metrics_v4_location_keys(location_id uuid PRIMARY KEY) ON COMMIT DROP;
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
      SELECT COUNT(DISTINCT e.id) FILTER (WHERE app.estimate_status_counts_as_demand(e.status))::bigint AS estimate_count,
        COALESCE(SUM(e.total_amount) FILTER (WHERE app.estimate_status_counts_as_demand(e.status)),0)::numeric AS estimate_value,
        COUNT(DISTINCT e.buyer_id) FILTER (WHERE app.estimate_status_counts_as_demand(e.status))::bigint AS estimate_buyer_count,
        COUNT(DISTINCT e.id) FILTER (WHERE e.is_buyer_app_estimate AND (app.estimate_status_counts_as_demand(e.status)))::bigint AS app_estimate_count,
        COALESCE(SUM(e.total_amount) FILTER (WHERE e.is_buyer_app_estimate AND (app.estimate_status_counts_as_demand(e.status))),0)::numeric AS app_estimate_value,
        COUNT(DISTINCT e.buyer_id) FILTER (WHERE e.is_buyer_app_estimate AND (app.estimate_status_counts_as_demand(e.status)))::bigint AS app_estimate_buyer_count,
        MAX(e.updated_at) AS watermark_h
      FROM app.estimates e
      WHERE e.tenant_id = p_tenant_id AND e.deleted_at IS NULL
        AND app.metric_day_ist(e.estimate_date, e.created_at) >= p.period_start
        AND app.metric_day_ist(e.estimate_date, e.created_at) < p.period_end_exclusive
    ), items AS (
      SELECT COALESCE(SUM(ei.qty) FILTER (WHERE app.estimate_status_counts_as_demand(e.status)),0)::numeric AS estimate_units,
        COUNT(DISTINCT ei.tenant_product_id) FILTER (WHERE app.estimate_status_counts_as_demand(e.status))::bigint AS estimate_product_count,
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
    primary_demand_count = EXCLUDED.primary_demand_count, primary_demand_value = EXCLUDED.primary_demand_value,
    source_watermark = EXCLUDED.source_watermark, computed_at = EXCLUDED.computed_at, generation_id = gen_random_uuid(), updated_at = EXCLUDED.updated_at, deleted_at = NULL;
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

  -- metrics_buyer_now_summary: now also carries receivable_invoice_count /
  -- overdue_invoice_count alongside the money columns, same
  -- outstanding_balance > 0 narrowing as the money aggregates (see the
  -- comment on `inv` below) so the new counts and the existing partial index
  -- agree on which invoices they're counting.
  INSERT INTO app.metrics_buyer_now_summary (
    tenant_id, buyer_id, external_ref,
    credit_limit, receivable_amount, receivable_invoice_count, overdue_amount, overdue_invoice_count, credit_available,
    source_watermark, computed_at, updated_at, deleted_at
  )
  SELECT
    p_tenant_id,
    b.id,
    concat_ws(':', p_tenant_id::text, b.id::text, 'buyer-now'),
    COALESCE(b.credit_limit, 0),
    COALESCE(inv.receivable_amount, 0),
    COALESCE(inv.receivable_invoice_count, 0),
    COALESCE(inv.overdue_amount, 0),
    COALESCE(inv.overdue_invoice_count, 0),
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
      COUNT(*) FILTER (WHERE app.invoice_status_has_receivable(i.status, i.outstanding_balance))::bigint AS receivable_invoice_count,
      COALESCE(SUM(i.outstanding_balance) FILTER (WHERE app.invoice_is_overdue(i.status, i.due_date, i.outstanding_balance)), 0)::numeric AS overdue_amount,
      COUNT(*) FILTER (WHERE app.invoice_is_overdue(i.status, i.due_date, i.outstanding_balance))::bigint AS overdue_invoice_count,
      MAX(i.updated_at) AS watermark
    FROM app.invoices i
    WHERE i.tenant_id = p_tenant_id
      AND i.buyer_id = b.id
      AND i.deleted_at IS NULL
      AND i.outstanding_balance > 0
  ) inv ON true
  ON CONFLICT (tenant_id, buyer_id) WHERE deleted_at IS NULL DO UPDATE SET
    credit_limit = EXCLUDED.credit_limit,
    receivable_amount = EXCLUDED.receivable_amount,
    receivable_invoice_count = EXCLUDED.receivable_invoice_count,
    overdue_amount = EXCLUDED.overdue_amount,
    overdue_invoice_count = EXCLUDED.overdue_invoice_count,
    credit_available = EXCLUDED.credit_available,
    source_watermark = EXCLUDED.source_watermark,
    computed_at = EXCLUDED.computed_at,
    generation_id = gen_random_uuid(),
    updated_at = EXCLUDED.updated_at,
    deleted_at = NULL;
  GET DIAGNOSTICS v_count = ROW_COUNT; v_rows := v_rows + v_count;

  -- metrics_location_now_summary: now also carries overdue/receivable invoice
  -- and buyer counts plus open estimate/order value, mirroring what
  -- metrics_tenant_now_summary already tracks tenant-wide.
  INSERT INTO app.metrics_location_now_summary (
    tenant_id, location_id, external_ref,
    open_estimate_count, open_estimate_value, open_order_count, open_order_value,
    overdue_amount, overdue_invoice_count, overdue_buyer_count,
    receivable_invoice_count, receivable_buyer_count,
    source_watermark, computed_at, updated_at, deleted_at
  )
  SELECT
    p_tenant_id,
    l.id,
    concat_ws(':', p_tenant_id::text, l.id::text, 'location-now'),
    COALESCE(est.open_estimate_count, 0),
    COALESCE(est.open_estimate_value, 0),
    COALESCE(ord.open_order_count, 0),
    COALESCE(ord.open_order_value, 0),
    COALESCE(inv.overdue_amount, 0),
    COALESCE(inv.overdue_invoice_count, 0),
    COALESCE(inv.overdue_buyer_count, 0),
    COALESCE(inv.receivable_invoice_count, 0),
    COALESCE(inv.receivable_buyer_count, 0),
    GREATEST(l.updated_at, est.watermark, ord.watermark, inv.watermark),
    v_now,
    v_now,
    NULL
  FROM pg_temp.metrics_v4_location_keys k
  JOIN app.locations l ON l.id = k.location_id AND l.tenant_id = p_tenant_id AND l.deleted_at IS NULL
  LEFT JOIN LATERAL (
    SELECT COUNT(*)::bigint AS open_estimate_count,
      COALESCE(SUM(e.total_amount), 0)::numeric AS open_estimate_value,
      MAX(e.updated_at) AS watermark
    FROM app.estimates e
    WHERE e.tenant_id = p_tenant_id AND e.location_id = l.id AND e.deleted_at IS NULL
      AND app.estimate_status_is_open(e.status)
  ) est ON true
  LEFT JOIN LATERAL (
    SELECT COUNT(*)::bigint AS open_order_count,
      COALESCE(SUM(o.total_amount), 0)::numeric AS open_order_value,
      MAX(o.updated_at) AS watermark
    FROM app.orders o
    WHERE o.tenant_id = p_tenant_id AND o.location_id = l.id AND o.deleted_at IS NULL
      AND app.order_status_is_open(o.status)
  ) ord ON true
  LEFT JOIN LATERAL (
    SELECT
      COALESCE(SUM(i.outstanding_balance) FILTER (WHERE app.invoice_is_overdue(i.status, i.due_date, i.outstanding_balance)), 0)::numeric AS overdue_amount,
      COUNT(*) FILTER (WHERE app.invoice_is_overdue(i.status, i.due_date, i.outstanding_balance))::bigint AS overdue_invoice_count,
      COUNT(DISTINCT i.buyer_id) FILTER (WHERE app.invoice_is_overdue(i.status, i.due_date, i.outstanding_balance))::bigint AS overdue_buyer_count,
      COUNT(*) FILTER (WHERE app.invoice_status_has_receivable(i.status, i.outstanding_balance))::bigint AS receivable_invoice_count,
      COUNT(DISTINCT i.buyer_id) FILTER (WHERE app.invoice_status_has_receivable(i.status, i.outstanding_balance))::bigint AS receivable_buyer_count,
      MAX(i.updated_at) AS watermark
    FROM app.invoices i
    WHERE i.tenant_id = p_tenant_id AND i.location_id = l.id AND i.deleted_at IS NULL
      AND i.outstanding_balance > 0
  ) inv ON true
  ON CONFLICT (tenant_id, location_id) WHERE deleted_at IS NULL DO UPDATE SET
    open_estimate_count = EXCLUDED.open_estimate_count,
    open_estimate_value = EXCLUDED.open_estimate_value,
    open_order_count = EXCLUDED.open_order_count,
    open_order_value = EXCLUDED.open_order_value,
    overdue_amount = EXCLUDED.overdue_amount,
    overdue_invoice_count = EXCLUDED.overdue_invoice_count,
    overdue_buyer_count = EXCLUDED.overdue_buyer_count,
    receivable_invoice_count = EXCLUDED.receivable_invoice_count,
    receivable_buyer_count = EXCLUDED.receivable_buyer_count,
    source_watermark = EXCLUDED.source_watermark,
    computed_at = EXCLUDED.computed_at,
    generation_id = gen_random_uuid(),
    updated_at = EXCLUDED.updated_at,
    deleted_at = NULL;
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

  INSERT INTO app.metrics_product_period_summary (
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
  JOIN pg_temp.metrics_v4_product_agg a
    ON a.tenant_product_id = k.tenant_product_id AND a.grain = k.grain AND a.period_start = k.period_start
  WHERE COALESCE(a.inv_count,0) > 0 OR COALESCE(a.est_count,0) > 0 OR COALESCE(a.ord_count,0) > 0
  ON CONFLICT (tenant_id, tenant_product_id, grain, period_start) WHERE deleted_at IS NULL DO UPDATE SET
    period_end_exclusive = EXCLUDED.period_end_exclusive,
    invoice_units = EXCLUDED.invoice_units, invoice_value = EXCLUDED.invoice_value, invoice_count = EXCLUDED.invoice_count, invoice_buyer_count = EXCLUDED.invoice_buyer_count,
    estimate_units = EXCLUDED.estimate_units, estimate_value = EXCLUDED.estimate_value, estimate_count = EXCLUDED.estimate_count,
    order_units = EXCLUDED.order_units, order_value = EXCLUDED.order_value, order_count = EXCLUDED.order_count,
    source_watermark = EXCLUDED.source_watermark, computed_at = EXCLUDED.computed_at, generation_id = gen_random_uuid(), updated_at = EXCLUDED.updated_at, deleted_at = NULL;
  GET DIAGNOSTICS v_count = ROW_COUNT; v_rows := v_rows + v_count;

  DELETE FROM app.metrics_product_period_summary s
  USING pg_temp.metrics_v4_product_period_keys k
  WHERE s.tenant_id = p_tenant_id AND s.tenant_product_id = k.tenant_product_id AND s.grain = k.grain AND s.period_start = k.period_start AND s.deleted_at IS NULL
    AND NOT EXISTS (
      SELECT 1 FROM pg_temp.metrics_v4_product_agg a
      WHERE a.tenant_product_id = k.tenant_product_id AND a.grain = k.grain AND a.period_start = k.period_start
        AND (COALESCE(a.inv_count,0) > 0 OR COALESCE(a.est_count,0) > 0 OR COALESCE(a.ord_count,0) > 0)
    );
  GET DIAGNOSTICS v_count = ROW_COUNT; v_rows := v_rows + v_count;

  INSERT INTO app.metrics_brand_period_summary (
    tenant_id, tenant_brand_id, external_ref, grain, period_start, period_end_exclusive,
    invoice_count, invoice_value, invoice_units, invoice_product_count, invoice_buyer_count,
    source_watermark, computed_at, updated_at, deleted_at
  )
  SELECT p_tenant_id, tp.tenant_brand_id, concat_ws(':', p_tenant_id::text, tp.tenant_brand_id::text, p.grain, p.period_start::text),
    p.grain, p.period_start, p.period_end_exclusive,
    SUM(ps.invoice_count)::bigint, SUM(ps.invoice_value), SUM(ps.invoice_units), COUNT(DISTINCT ps.tenant_product_id)::bigint, SUM(ps.invoice_buyer_count)::bigint,
    MAX(ps.source_watermark), v_now, v_now, NULL
  FROM (SELECT DISTINCT grain, period_start, period_end_exclusive FROM pg_temp.metrics_v4_product_period_keys) p
  JOIN app.metrics_product_period_summary ps
    ON ps.tenant_id = p_tenant_id AND ps.grain = p.grain AND ps.period_start = p.period_start AND ps.deleted_at IS NULL AND ps.invoice_count > 0
  JOIN app.tenant_products tp ON tp.id = ps.tenant_product_id AND tp.tenant_brand_id IS NOT NULL
  GROUP BY tp.tenant_brand_id, p.grain, p.period_start, p.period_end_exclusive
  ON CONFLICT (tenant_id, tenant_brand_id, grain, period_start) WHERE deleted_at IS NULL DO UPDATE SET
    period_end_exclusive = EXCLUDED.period_end_exclusive,
    invoice_count = EXCLUDED.invoice_count, invoice_value = EXCLUDED.invoice_value, invoice_units = EXCLUDED.invoice_units,
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
    source_watermark = EXCLUDED.source_watermark, computed_at = EXCLUDED.computed_at, generation_id = gen_random_uuid(), updated_at = EXCLUDED.updated_at, deleted_at = NULL;
  GET DIAGNOSTICS v_count = ROW_COUNT; v_rows := v_rows + v_count;

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

-- =====================================================================
-- Refresh pipeline: extend app._metrics_v4_refresh_setup_now
-- =====================================================================
-- The four new now_summary tables are current-state, low-cardinality-per-tenant
-- rollups -- the same shape as metrics_tenant_now_summary's own
-- sellable_units/low_stock_product_count/oos_product_count, which this
-- function already computes directly from live app.tenant_inventory on every
-- call rather than through the dirty-key-windowed tick path. They belong here,
-- not in _metrics_v4_refresh_claimed_periods, for the same reason: there's no
-- period to window against, just current truth, and cardinality per tenant is
-- small (a handful of brands/categories/warehouses/price lists).
--
-- Low-stock/out-of-stock thresholds match the tenant-level computation already
-- live in this function: qty_available > 0 AND <= 10 is low stock; SUM
-- qty_available <= 0 (or no inventory row) is out of stock. "Selling products
-- out of stock" (brand) and "idle stock" (warehouse) additionally cross-reference
-- metrics_product_period_summary for the current quarter to distinguish
-- "sold this quarter but now out of stock" / "has stock but hasn't sold this
-- quarter" from plain in-stock/out-of-stock.

CREATE OR REPLACE FUNCTION app._metrics_v4_refresh_setup_now(
  p_tenant_id uuid,
  p_as_of timestamptz DEFAULT clock_timestamp()
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, app, pg_temp
AS $$
DECLARE
  v_now timestamptz := COALESCE(p_as_of, clock_timestamp());
  v_quarter_start date := date_trunc('quarter', (COALESCE(p_as_of, clock_timestamp()) AT TIME ZONE 'Asia/Kolkata'))::date;
  v_rows integer := 0;
  v_count integer;
  v_watermark timestamptz;
BEGIN
  SELECT MAX(x.updated_at) INTO v_watermark
  FROM (
    SELECT MAX(updated_at) AS updated_at FROM app.buyers WHERE tenant_id = p_tenant_id
    UNION ALL SELECT MAX(bu.updated_at) FROM app.buyer_users bu JOIN app.buyers b ON b.id = bu.buyer_id WHERE b.tenant_id = p_tenant_id
    UNION ALL SELECT MAX(updated_at) FROM app.tenant_brands WHERE tenant_id = p_tenant_id
    UNION ALL SELECT MAX(updated_at) FROM app.tenant_products WHERE tenant_id = p_tenant_id
    UNION ALL SELECT MAX(updated_at) FROM app.locations WHERE tenant_id = p_tenant_id
    UNION ALL SELECT MAX(updated_at) FROM app.warehouses WHERE tenant_id = p_tenant_id
    UNION ALL SELECT MAX(updated_at) FROM app.campaigns WHERE tenant_id = p_tenant_id
    UNION ALL SELECT MAX(updated_at) FROM app.cohorts WHERE tenant_id = p_tenant_id
    UNION ALL SELECT MAX(updated_at) FROM app.price_lists WHERE tenant_id = p_tenant_id
    UNION ALL SELECT MAX(updated_at) FROM app.invoices WHERE tenant_id = p_tenant_id
    UNION ALL SELECT MAX(updated_at) FROM app.estimates WHERE tenant_id = p_tenant_id
    UNION ALL SELECT MAX(updated_at) FROM app.orders WHERE tenant_id = p_tenant_id
    UNION ALL SELECT MAX(ti.updated_at) FROM app.tenant_inventory ti JOIN app.tenant_products tp ON tp.id = ti.tenant_product_id WHERE tp.tenant_id = p_tenant_id
  ) x;

  INSERT INTO app.metrics_tenant_now_summary (
    tenant_id, external_ref,
    receivable_amount, receivable_invoice_count, receivable_buyer_count,
    overdue_amount, overdue_invoice_count, overdue_buyer_count,
    open_estimate_count, open_estimate_value, open_order_count, open_order_value,
    active_buyer_count, active_brand_count, active_product_count, active_category_count, active_location_count,
    active_warehouse_count, active_campaign_count, active_cohort_count, active_price_list_count,
    enabled_buyer_count, sellable_units, sellable_sku_count, low_stock_product_count, oos_product_count,
    source_watermark, computed_at, updated_at, deleted_at
  )
  SELECT
    p_tenant_id, concat_ws(':', p_tenant_id::text, 'tenant-now'),
    COALESCE((SELECT SUM(receivable_amount) FROM app.metrics_buyer_now_summary WHERE tenant_id = p_tenant_id AND deleted_at IS NULL),0),
    COALESCE((SELECT COUNT(*) FROM app.invoices i WHERE i.tenant_id = p_tenant_id AND i.deleted_at IS NULL AND app.invoice_status_has_receivable(i.status, i.outstanding_balance)),0),
    COALESCE((SELECT COUNT(*) FROM app.metrics_buyer_now_summary WHERE tenant_id = p_tenant_id AND receivable_amount > 0 AND deleted_at IS NULL),0),
    COALESCE((SELECT SUM(overdue_amount) FROM app.metrics_buyer_now_summary WHERE tenant_id = p_tenant_id AND deleted_at IS NULL),0),
    COALESCE((SELECT COUNT(*) FROM app.invoices i WHERE i.tenant_id = p_tenant_id AND i.deleted_at IS NULL AND app.invoice_is_overdue(i.status, i.due_date, i.outstanding_balance)),0),
    COALESCE((SELECT COUNT(*) FROM app.metrics_buyer_now_summary WHERE tenant_id = p_tenant_id AND overdue_amount > 0 AND deleted_at IS NULL),0),
    COALESCE((SELECT COUNT(*) FROM app.estimates e WHERE e.tenant_id = p_tenant_id AND e.deleted_at IS NULL AND app.estimate_status_is_open(e.status)),0),
    COALESCE((SELECT SUM(e.total_amount) FROM app.estimates e WHERE e.tenant_id = p_tenant_id AND e.deleted_at IS NULL AND app.estimate_status_is_open(e.status)),0),
    COALESCE((SELECT COUNT(*) FROM app.orders o WHERE o.tenant_id = p_tenant_id AND o.deleted_at IS NULL AND app.order_status_is_open(o.status)),0),
    COALESCE((SELECT SUM(o.total_amount) FROM app.orders o WHERE o.tenant_id = p_tenant_id AND o.deleted_at IS NULL AND app.order_status_is_open(o.status)),0),
    COALESCE((SELECT COUNT(*) FROM app.buyers WHERE tenant_id = p_tenant_id AND deleted_at IS NULL),0),
    COALESCE((SELECT COUNT(*) FROM app.tenant_brands WHERE tenant_id = p_tenant_id AND deleted_at IS NULL),0),
    COALESCE((SELECT COUNT(*) FROM app.tenant_products WHERE tenant_id = p_tenant_id AND deleted_at IS NULL),0),
    COALESCE((SELECT COUNT(*) FROM app.tenant_categories WHERE tenant_id = p_tenant_id AND deleted_at IS NULL AND is_active),0),
    COALESCE((SELECT COUNT(*) FROM app.locations WHERE tenant_id = p_tenant_id AND deleted_at IS NULL),0),
    COALESCE((SELECT COUNT(*) FROM app.warehouses WHERE tenant_id = p_tenant_id AND deleted_at IS NULL),0),
    COALESCE((SELECT COUNT(*) FROM app.campaigns WHERE tenant_id = p_tenant_id AND deleted_at IS NULL AND status = 'published'),0),
    COALESCE((SELECT COUNT(*) FROM app.cohorts WHERE tenant_id = p_tenant_id AND deleted_at IS NULL),0),
    COALESCE((SELECT COUNT(*) FROM app.price_lists WHERE tenant_id = p_tenant_id AND deleted_at IS NULL),0),
    COALESCE((SELECT COUNT(DISTINCT bu.buyer_id) FROM app.buyer_users bu JOIN app.buyers b ON b.id = bu.buyer_id WHERE b.tenant_id = p_tenant_id AND bu.deleted_at IS NULL AND b.deleted_at IS NULL),0),
    COALESCE((SELECT SUM(ti.qty_available) FROM app.tenant_inventory ti JOIN app.tenant_products tp ON tp.id = ti.tenant_product_id WHERE tp.tenant_id = p_tenant_id AND ti.deleted_at IS NULL AND tp.deleted_at IS NULL AND ti.qty_available > 0),0),
    COALESCE((SELECT COUNT(DISTINCT ti.tenant_product_id) FROM app.tenant_inventory ti JOIN app.tenant_products tp ON tp.id = ti.tenant_product_id WHERE tp.tenant_id = p_tenant_id AND ti.deleted_at IS NULL AND tp.deleted_at IS NULL AND ti.qty_available > 0),0),
    COALESCE((SELECT COUNT(DISTINCT ti.tenant_product_id) FROM app.tenant_inventory ti JOIN app.tenant_products tp ON tp.id = ti.tenant_product_id WHERE tp.tenant_id = p_tenant_id AND ti.deleted_at IS NULL AND tp.deleted_at IS NULL AND ti.qty_available > 0 AND ti.qty_available <= 10),0),
    COALESCE((SELECT COUNT(*) FROM (SELECT tp.id FROM app.tenant_products tp LEFT JOIN app.tenant_inventory ti ON ti.tenant_product_id = tp.id AND ti.deleted_at IS NULL WHERE tp.tenant_id = p_tenant_id AND tp.deleted_at IS NULL GROUP BY tp.id HAVING COALESCE(SUM(ti.qty_available),0) <= 0) oos),0),
    v_watermark, v_now, v_now, NULL
  ON CONFLICT (tenant_id) WHERE deleted_at IS NULL DO UPDATE SET
    receivable_amount = EXCLUDED.receivable_amount,
    receivable_invoice_count = EXCLUDED.receivable_invoice_count,
    receivable_buyer_count = EXCLUDED.receivable_buyer_count,
    overdue_amount = EXCLUDED.overdue_amount,
    overdue_invoice_count = EXCLUDED.overdue_invoice_count,
    overdue_buyer_count = EXCLUDED.overdue_buyer_count,
    open_estimate_count = EXCLUDED.open_estimate_count,
    open_estimate_value = EXCLUDED.open_estimate_value,
    open_order_count = EXCLUDED.open_order_count,
    open_order_value = EXCLUDED.open_order_value,
    active_buyer_count = EXCLUDED.active_buyer_count,
    active_brand_count = EXCLUDED.active_brand_count,
    active_product_count = EXCLUDED.active_product_count,
    active_category_count = EXCLUDED.active_category_count,
    active_location_count = EXCLUDED.active_location_count,
    active_warehouse_count = EXCLUDED.active_warehouse_count,
    active_campaign_count = EXCLUDED.active_campaign_count,
    active_cohort_count = EXCLUDED.active_cohort_count,
    active_price_list_count = EXCLUDED.active_price_list_count,
    enabled_buyer_count = EXCLUDED.enabled_buyer_count,
    sellable_units = EXCLUDED.sellable_units,
    sellable_sku_count = EXCLUDED.sellable_sku_count,
    low_stock_product_count = EXCLUDED.low_stock_product_count,
    oos_product_count = EXCLUDED.oos_product_count,
    source_watermark = EXCLUDED.source_watermark,
    computed_at = EXCLUDED.computed_at,
    generation_id = gen_random_uuid(),
    updated_at = EXCLUDED.updated_at,
    deleted_at = NULL;
  GET DIAGNOSTICS v_count = ROW_COUNT; v_rows := v_rows + v_count;

  INSERT INTO app.metrics_brand_now_summary (
    tenant_id, tenant_brand_id, external_ref,
    member_product_count, selling_product_out_of_stock_count, low_stock_product_count,
    source_watermark, computed_at, updated_at, deleted_at
  )
  SELECT
    p_tenant_id, tb.id, concat_ws(':', p_tenant_id::text, tb.id::text, 'brand-now'),
    COALESCE(prod.member_product_count, 0),
    COALESCE(prod.selling_out_of_stock_count, 0),
    COALESCE(prod.low_stock_count, 0),
    v_watermark, v_now, v_now, NULL
  FROM app.tenant_brands tb
  LEFT JOIN LATERAL (
    SELECT
      COUNT(*)::bigint AS member_product_count,
      COUNT(*) FILTER (
        WHERE COALESCE(stock.qty_available, 0) <= 0
          AND EXISTS (
            SELECT 1 FROM app.metrics_product_period_summary qps
            WHERE qps.tenant_product_id = tp.id AND qps.grain = 'quarter'
              AND qps.period_start = v_quarter_start AND qps.deleted_at IS NULL AND qps.invoice_count > 0
          )
      )::bigint AS selling_out_of_stock_count,
      COUNT(*) FILTER (WHERE stock.qty_available > 0 AND stock.qty_available <= 10)::bigint AS low_stock_count
    FROM app.tenant_products tp
    LEFT JOIN LATERAL (
      SELECT SUM(ti.qty_available) AS qty_available
      FROM app.tenant_inventory ti
      WHERE ti.tenant_product_id = tp.id AND ti.deleted_at IS NULL
    ) stock ON true
    WHERE tp.tenant_brand_id = tb.id AND tp.deleted_at IS NULL
  ) prod ON true
  WHERE tb.tenant_id = p_tenant_id AND tb.deleted_at IS NULL
  ON CONFLICT (tenant_id, tenant_brand_id) WHERE deleted_at IS NULL DO UPDATE SET
    member_product_count = EXCLUDED.member_product_count,
    selling_product_out_of_stock_count = EXCLUDED.selling_product_out_of_stock_count,
    low_stock_product_count = EXCLUDED.low_stock_product_count,
    source_watermark = EXCLUDED.source_watermark,
    computed_at = EXCLUDED.computed_at,
    generation_id = gen_random_uuid(),
    updated_at = EXCLUDED.updated_at,
    deleted_at = NULL;
  GET DIAGNOSTICS v_count = ROW_COUNT; v_rows := v_rows + v_count;

  INSERT INTO app.metrics_category_now_summary (
    tenant_id, tenant_category_id, external_ref,
    product_count, brand_count, source_watermark, computed_at, updated_at, deleted_at
  )
  SELECT
    p_tenant_id, tc.id, concat_ws(':', p_tenant_id::text, tc.id::text, 'category-now'),
    COALESCE(agg.product_count, 0), COALESCE(agg.brand_count, 0),
    v_watermark, v_now, v_now, NULL
  FROM app.tenant_categories tc
  LEFT JOIN LATERAL (
    SELECT COUNT(*)::bigint AS product_count, COUNT(DISTINCT tp.tenant_brand_id)::bigint AS brand_count
    FROM app.tenant_products tp
    WHERE tp.tenant_category_id = tc.id AND tp.deleted_at IS NULL
  ) agg ON true
  WHERE tc.tenant_id = p_tenant_id AND tc.deleted_at IS NULL
  ON CONFLICT (tenant_id, tenant_category_id) WHERE deleted_at IS NULL DO UPDATE SET
    product_count = EXCLUDED.product_count,
    brand_count = EXCLUDED.brand_count,
    source_watermark = EXCLUDED.source_watermark,
    computed_at = EXCLUDED.computed_at,
    generation_id = gen_random_uuid(),
    updated_at = EXCLUDED.updated_at,
    deleted_at = NULL;
  GET DIAGNOSTICS v_count = ROW_COUNT; v_rows := v_rows + v_count;

  INSERT INTO app.metrics_warehouse_now_summary (
    tenant_id, warehouse_id, external_ref,
    available_product_count, in_stock_product_count, sellable_units,
    low_stock_product_count, out_of_stock_product_count, idle_stock_product_count, idle_stock_units,
    source_watermark, computed_at, updated_at, deleted_at
  )
  SELECT
    p_tenant_id, wh.id, concat_ws(':', p_tenant_id::text, wh.id::text, 'warehouse-now'),
    COALESCE(agg.available_product_count, 0), COALESCE(agg.in_stock_product_count, 0), COALESCE(agg.sellable_units, 0),
    COALESCE(agg.low_stock_product_count, 0), COALESCE(agg.out_of_stock_product_count, 0),
    COALESCE(agg.idle_stock_product_count, 0), COALESCE(agg.idle_stock_units, 0),
    v_watermark, v_now, v_now, NULL
  FROM app.warehouses wh
  LEFT JOIN LATERAL (
    SELECT
      COUNT(*) FILTER (WHERE ti.qty_available > 0)::bigint AS available_product_count,
      COUNT(*) FILTER (WHERE ti.qty_available > 0)::bigint AS in_stock_product_count,
      COALESCE(SUM(ti.qty_available) FILTER (WHERE ti.qty_available > 0), 0)::numeric AS sellable_units,
      COUNT(*) FILTER (WHERE ti.qty_available > 0 AND ti.qty_available <= 10)::bigint AS low_stock_product_count,
      COUNT(*) FILTER (WHERE COALESCE(ti.qty_available,0) <= 0)::bigint AS out_of_stock_product_count,
      COUNT(*) FILTER (
        WHERE ti.qty_available > 0
          AND NOT EXISTS (
            SELECT 1 FROM app.metrics_product_period_summary qps
            WHERE qps.tenant_product_id = ti.tenant_product_id AND qps.grain = 'quarter'
              AND qps.period_start = v_quarter_start AND qps.deleted_at IS NULL AND qps.invoice_count > 0
          )
      )::bigint AS idle_stock_product_count,
      COALESCE(SUM(ti.qty_available) FILTER (
        WHERE ti.qty_available > 0
          AND NOT EXISTS (
            SELECT 1 FROM app.metrics_product_period_summary qps
            WHERE qps.tenant_product_id = ti.tenant_product_id AND qps.grain = 'quarter'
              AND qps.period_start = v_quarter_start AND qps.deleted_at IS NULL AND qps.invoice_count > 0
          )
      ), 0)::numeric AS idle_stock_units
    FROM app.tenant_inventory ti
    JOIN app.tenant_products tp ON tp.id = ti.tenant_product_id AND tp.tenant_id = p_tenant_id AND tp.deleted_at IS NULL
    WHERE ti.warehouse_id = wh.id AND ti.deleted_at IS NULL
  ) agg ON true
  WHERE wh.tenant_id = p_tenant_id AND wh.deleted_at IS NULL
  ON CONFLICT (tenant_id, warehouse_id) WHERE deleted_at IS NULL DO UPDATE SET
    available_product_count = EXCLUDED.available_product_count,
    in_stock_product_count = EXCLUDED.in_stock_product_count,
    sellable_units = EXCLUDED.sellable_units,
    low_stock_product_count = EXCLUDED.low_stock_product_count,
    out_of_stock_product_count = EXCLUDED.out_of_stock_product_count,
    idle_stock_product_count = EXCLUDED.idle_stock_product_count,
    idle_stock_units = EXCLUDED.idle_stock_units,
    source_watermark = EXCLUDED.source_watermark,
    computed_at = EXCLUDED.computed_at,
    generation_id = gen_random_uuid(),
    updated_at = EXCLUDED.updated_at,
    deleted_at = NULL;
  GET DIAGNOSTICS v_count = ROW_COUNT; v_rows := v_rows + v_count;

  -- assigned_buyer_count de-dupes buyers reachable through more than one
  -- assignment (a direct buyer assignment AND a cohort they also belong to)
  -- via UNION over the three target_type branches before counting distinct.
  INSERT INTO app.metrics_price_lists_now_summary (
    tenant_id, price_list_id, external_ref,
    member_product_count, assigned_cohort_count, assigned_buyer_count,
    avg_discount_pct, avg_margin_pct,
    source_watermark, computed_at, updated_at, deleted_at
  )
  SELECT
    p_tenant_id, pl.id, concat_ws(':', p_tenant_id::text, pl.id::text, 'price-list-now'),
    COALESCE(items.member_product_count, 0),
    COALESCE(cohort_ct.assigned_cohort_count, 0),
    COALESCE(buyer_ct.assigned_buyer_count, 0),
    COALESCE(items.avg_discount_pct, 0),
    COALESCE(items.avg_margin_pct, 0),
    v_watermark, v_now, v_now, NULL
  FROM app.price_lists pl
  LEFT JOIN LATERAL (
    SELECT
      COUNT(*)::bigint AS member_product_count,
      COALESCE(AVG(
        CASE WHEN tp.base_selling_price > 0 THEN (tp.base_selling_price - pli.price) / tp.base_selling_price * 100 END
      ), 0)::numeric AS avg_discount_pct,
      COALESCE(AVG(
        CASE WHEN pli.price > 0 AND tp.cost_price IS NOT NULL THEN (pli.price - tp.cost_price) / pli.price * 100 END
      ), 0)::numeric AS avg_margin_pct
    FROM app.price_list_items pli
    JOIN app.tenant_products tp ON tp.id = pli.tenant_product_id AND tp.deleted_at IS NULL
    WHERE pli.price_list_id = pl.id AND pli.deleted_at IS NULL
  ) items ON true
  LEFT JOIN LATERAL (
    SELECT COUNT(*) FILTER (WHERE a.target_type = 'cohort')::bigint AS assigned_cohort_count
    FROM app.price_list_assignments a
    WHERE a.price_list_id = pl.id AND a.deleted_at IS NULL
  ) cohort_ct ON true
  LEFT JOIN LATERAL (
    SELECT COUNT(DISTINCT buyer_id)::bigint AS assigned_buyer_count
    FROM (
      SELECT a.target_id AS buyer_id
      FROM app.price_list_assignments a
      WHERE a.price_list_id = pl.id AND a.deleted_at IS NULL AND a.target_type = 'buyer'
      UNION
      SELECT cm.buyer_id
      FROM app.price_list_assignments a
      JOIN app.cohort_members_active cm ON cm.cohort_id = a.target_id
      WHERE a.price_list_id = pl.id AND a.deleted_at IS NULL AND a.target_type = 'cohort'
      UNION
      SELECT b.id
      FROM app.price_list_assignments a
      JOIN app.buyers b ON b.tenant_id = p_tenant_id AND b.deleted_at IS NULL
      WHERE a.price_list_id = pl.id AND a.deleted_at IS NULL AND a.target_type = 'all_buyers'
    ) buyer_ids
  ) buyer_ct ON true
  WHERE pl.tenant_id = p_tenant_id AND pl.deleted_at IS NULL
  ON CONFLICT (tenant_id, price_list_id) WHERE deleted_at IS NULL DO UPDATE SET
    member_product_count = EXCLUDED.member_product_count,
    assigned_cohort_count = EXCLUDED.assigned_cohort_count,
    assigned_buyer_count = EXCLUDED.assigned_buyer_count,
    avg_discount_pct = EXCLUDED.avg_discount_pct,
    avg_margin_pct = EXCLUDED.avg_margin_pct,
    source_watermark = EXCLUDED.source_watermark,
    computed_at = EXCLUDED.computed_at,
    generation_id = gen_random_uuid(),
    updated_at = EXCLUDED.updated_at,
    deleted_at = NULL;
  GET DIAGNOSTICS v_count = ROW_COUNT; v_rows := v_rows + v_count;

  RETURN v_rows;
END;
$$;