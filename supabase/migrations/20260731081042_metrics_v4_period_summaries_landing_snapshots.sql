-- Metrics V4: period summaries + landing KPI snapshots.
--
-- Additive DB read layer:
--   * runtime landing KPI reads are one indexed snapshot lookup;
--   * detail/list drill-downs can read sparse period summaries + NOW snapshots;
--   * steady-state refresh uses the existing metrics_dirty_work /
--     metrics_refresh_tick lease flow and recomputes only claimed dirty keys.

CREATE OR REPLACE FUNCTION app.metrics_v4_period_bounds(
  p_period_key text,
  p_as_of timestamptz DEFAULT clock_timestamp()
)
RETURNS TABLE (
  period_key text,
  grain text,
  period_start date,
  period_end_exclusive date,
  previous_start date,
  previous_end_exclusive date,
  label text
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = pg_catalog, app, pg_temp
AS $$
  WITH base AS (
    SELECT
      COALESCE(p_period_key, 'this_month') AS key,
      (COALESCE(p_as_of, clock_timestamp()) AT TIME ZONE 'Asia/Kolkata')::date AS today
  ), anchors AS (
    SELECT
      key,
      today,
      (today - ((EXTRACT(isodow FROM today)::integer - 1) * interval '1 day'))::date AS week_start,
      date_trunc('month', today)::date AS month_start,
      date_trunc('quarter', today)::date AS quarter_start
    FROM base
  )
  SELECT
    a.key AS period_key,
    CASE
      WHEN a.key IN ('now') THEN 'now'
      WHEN a.key IN ('today') THEN 'day'
      WHEN a.key IN ('this_week', 'last_week') THEN 'week'
      WHEN a.key IN ('this_month', 'last_month') THEN 'month'
      WHEN a.key IN ('this_quarter', 'last_quarter') THEN 'quarter'
    END AS grain,
    CASE
      WHEN a.key = 'now' THEN a.today
      WHEN a.key = 'today' THEN a.today
      WHEN a.key = 'this_week' THEN a.week_start
      WHEN a.key = 'last_week' THEN (a.week_start - interval '7 days')::date
      WHEN a.key = 'this_month' THEN a.month_start
      WHEN a.key = 'last_month' THEN (a.month_start - interval '1 month')::date
      WHEN a.key = 'this_quarter' THEN a.quarter_start
      WHEN a.key = 'last_quarter' THEN (a.quarter_start - interval '3 months')::date
      ELSE NULL
    END AS period_start,
    CASE
      WHEN a.key = 'now' THEN (a.today + 1)
      WHEN a.key = 'today' THEN (a.today + 1)
      WHEN a.key = 'this_week' THEN (a.week_start + interval '7 days')::date
      WHEN a.key = 'last_week' THEN a.week_start
      WHEN a.key = 'this_month' THEN (a.month_start + interval '1 month')::date
      WHEN a.key = 'last_month' THEN a.month_start
      WHEN a.key = 'this_quarter' THEN (a.quarter_start + interval '3 months')::date
      WHEN a.key = 'last_quarter' THEN a.quarter_start
      ELSE NULL
    END AS period_end_exclusive,
    CASE
      WHEN a.key = 'now' THEN a.today
      WHEN a.key = 'today' THEN (a.today - 1)
      WHEN a.key = 'this_week' THEN (a.week_start - interval '7 days')::date
      WHEN a.key = 'last_week' THEN (a.week_start - interval '14 days')::date
      WHEN a.key = 'this_month' THEN (a.month_start - interval '1 month')::date
      WHEN a.key = 'last_month' THEN (a.month_start - interval '2 months')::date
      WHEN a.key = 'this_quarter' THEN (a.quarter_start - interval '3 months')::date
      WHEN a.key = 'last_quarter' THEN (a.quarter_start - interval '6 months')::date
      ELSE NULL
    END AS previous_start,
    CASE
      WHEN a.key = 'now' THEN (a.today + 1)
      WHEN a.key = 'today' THEN a.today
      WHEN a.key = 'this_week' THEN a.week_start
      WHEN a.key = 'last_week' THEN (a.week_start - interval '7 days')::date
      WHEN a.key = 'this_month' THEN a.month_start
      WHEN a.key = 'last_month' THEN (a.month_start - interval '1 month')::date
      WHEN a.key = 'this_quarter' THEN a.quarter_start
      WHEN a.key = 'last_quarter' THEN (a.quarter_start - interval '3 months')::date
      ELSE NULL
    END AS previous_end_exclusive,
    CASE a.key
      WHEN 'now' THEN 'Now'
      WHEN 'today' THEN 'Today'
      WHEN 'this_week' THEN 'This Week'
      WHEN 'last_week' THEN 'Last Week'
      WHEN 'this_month' THEN 'This Month'
      WHEN 'last_month' THEN 'Last Month'
      WHEN 'this_quarter' THEN 'This Quarter'
      WHEN 'last_quarter' THEN 'Last Quarter'
    END AS label
  FROM anchors a
  WHERE a.key = ANY (ARRAY[
    'now', 'today', 'this_week', 'last_week', 'this_month', 'last_month', 'this_quarter', 'last_quarter'
  ]);
$$;

CREATE OR REPLACE FUNCTION app.metrics_v4_primary_demand_kind(p_tenant_id uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = pg_catalog, app, pg_temp
AS $$
  SELECT CASE
    WHEN COALESCE((ts.settings #>> '{orders,features,sales_orders}')::boolean, false) THEN 'orders'
    WHEN COALESCE((ts.settings #>> '{orders,features,enquiries}')::boolean, false) THEN 'estimates'
    ELSE 'none'
  END
  FROM app.tenant_settings ts
  WHERE ts.tenant_id = p_tenant_id
  UNION ALL
  SELECT 'none'
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION app.metrics_v4_period_windows(p_as_of timestamptz DEFAULT clock_timestamp())
RETURNS TABLE (period_key text, grain text, period_start date, period_end_exclusive date)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = pg_catalog, app, pg_temp
AS $$
  SELECT b.period_key, b.grain, b.period_start, b.period_end_exclusive
  FROM unnest(ARRAY[
    'today', 'this_week', 'last_week', 'this_month', 'last_month', 'this_quarter', 'last_quarter'
  ]) AS keys(period_key)
  CROSS JOIN LATERAL app.metrics_v4_period_bounds(keys.period_key, p_as_of) b;
$$;

CREATE OR REPLACE FUNCTION app.metrics_v4_kpi(
  p_id text,
  p_label text,
  p_value numeric DEFAULT 0,
  p_entity_count bigint DEFAULT 0,
  p_document_count bigint DEFAULT NULL,
  p_secondary_value numeric DEFAULT NULL,
  p_supporting_text text DEFAULT NULL,
  p_time_basis text DEFAULT 'period',
  p_filter_preset jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
SECURITY INVOKER
SET search_path = pg_catalog, app, pg_temp
AS $$
  SELECT jsonb_strip_nulls(jsonb_build_object(
    'id', p_id,
    'label', p_label,
    'value', COALESCE(p_value, 0),
    'entity_count', COALESCE(p_entity_count, 0),
    'document_count', p_document_count,
    'secondary_value', p_secondary_value,
    'supporting_text', COALESCE(p_supporting_text, ''),
    'time_basis', p_time_basis,
    'filter_preset', COALESCE(p_filter_preset, '{}'::jsonb)
  ));
$$;

CREATE TABLE IF NOT EXISTS app.metrics_tenant_period_summary (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES app.tenants(id) ON DELETE RESTRICT,
  external_ref text NOT NULL,
  grain text NOT NULL,
  period_start date NOT NULL,
  period_end_exclusive date NOT NULL,
  invoice_count bigint DEFAULT 0 NOT NULL,
  invoice_value numeric(14,2) DEFAULT 0 NOT NULL,
  invoice_units numeric(14,3) DEFAULT 0 NOT NULL,
  invoice_buyer_count bigint DEFAULT 0 NOT NULL,
  invoice_product_count bigint DEFAULT 0 NOT NULL,
  estimate_count bigint DEFAULT 0 NOT NULL,
  estimate_value numeric(14,2) DEFAULT 0 NOT NULL,
  estimate_units numeric(14,3) DEFAULT 0 NOT NULL,
  estimate_buyer_count bigint DEFAULT 0 NOT NULL,
  estimate_product_count bigint DEFAULT 0 NOT NULL,
  order_count bigint DEFAULT 0 NOT NULL,
  order_value numeric(14,2) DEFAULT 0 NOT NULL,
  order_units numeric(14,3) DEFAULT 0 NOT NULL,
  order_buyer_count bigint DEFAULT 0 NOT NULL,
  order_product_count bigint DEFAULT 0 NOT NULL,
  app_estimate_count bigint DEFAULT 0 NOT NULL,
  app_estimate_value numeric(14,2) DEFAULT 0 NOT NULL,
  app_estimate_buyer_count bigint DEFAULT 0 NOT NULL,
  app_order_count bigint DEFAULT 0 NOT NULL,
  app_order_value numeric(14,2) DEFAULT 0 NOT NULL,
  app_order_buyer_count bigint DEFAULT 0 NOT NULL,
  primary_demand_kind text DEFAULT 'orders' NOT NULL,
  primary_demand_count bigint DEFAULT 0 NOT NULL,
  primary_demand_value numeric(14,2) DEFAULT 0 NOT NULL,
  primary_demand_buyer_count bigint DEFAULT 0 NOT NULL,
  source_watermark timestamptz,
  computed_at timestamptz DEFAULT now() NOT NULL,
  calculation_version integer DEFAULT 4 NOT NULL,
  generation_id uuid DEFAULT gen_random_uuid() NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL,
  created_by uuid REFERENCES auth.users(id) ON DELETE RESTRICT,
  updated_by uuid REFERENCES auth.users(id) ON DELETE RESTRICT,
  deleted_at timestamptz,
  CONSTRAINT metrics_tenant_period_summary_grain_check CHECK (grain = ANY (ARRAY['day','week','month','quarter'])),
  CONSTRAINT metrics_tenant_period_summary_window_check CHECK (period_start < period_end_exclusive)
);

CREATE UNIQUE INDEX IF NOT EXISTS metrics_tenant_period_summary_active_uk
  ON app.metrics_tenant_period_summary (tenant_id, grain, period_start)
  WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS app.metrics_location_period_summary (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES app.tenants(id) ON DELETE RESTRICT,
  location_id uuid NOT NULL REFERENCES app.locations(id) ON DELETE RESTRICT,
  external_ref text NOT NULL,
  grain text NOT NULL,
  period_start date NOT NULL,
  period_end_exclusive date NOT NULL,
  invoice_count bigint DEFAULT 0 NOT NULL,
  invoice_value numeric(14,2) DEFAULT 0 NOT NULL,
  invoice_buyer_count bigint DEFAULT 0 NOT NULL,
  estimate_count bigint DEFAULT 0 NOT NULL,
  estimate_value numeric(14,2) DEFAULT 0 NOT NULL,
  estimate_buyer_count bigint DEFAULT 0 NOT NULL,
  order_count bigint DEFAULT 0 NOT NULL,
  order_value numeric(14,2) DEFAULT 0 NOT NULL,
  order_buyer_count bigint DEFAULT 0 NOT NULL,
  primary_demand_kind text DEFAULT 'orders' NOT NULL,
  primary_demand_count bigint DEFAULT 0 NOT NULL,
  primary_demand_value numeric(14,2) DEFAULT 0 NOT NULL,
  primary_demand_buyer_count bigint DEFAULT 0 NOT NULL,
  source_watermark timestamptz,
  computed_at timestamptz DEFAULT now() NOT NULL,
  calculation_version integer DEFAULT 4 NOT NULL,
  generation_id uuid DEFAULT gen_random_uuid() NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL,
  created_by uuid REFERENCES auth.users(id) ON DELETE RESTRICT,
  updated_by uuid REFERENCES auth.users(id) ON DELETE RESTRICT,
  deleted_at timestamptz,
  CONSTRAINT metrics_location_period_summary_grain_check CHECK (grain = ANY (ARRAY['day','week','month','quarter'])),
  CONSTRAINT metrics_location_period_summary_window_check CHECK (period_start < period_end_exclusive)
);

CREATE UNIQUE INDEX IF NOT EXISTS metrics_location_period_summary_active_uk
  ON app.metrics_location_period_summary (tenant_id, location_id, grain, period_start)
  WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS app.metrics_buyer_period_summary (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES app.tenants(id) ON DELETE RESTRICT,
  buyer_id uuid NOT NULL REFERENCES app.buyers(id) ON DELETE RESTRICT,
  external_ref text NOT NULL,
  grain text NOT NULL,
  period_start date NOT NULL,
  period_end_exclusive date NOT NULL,
  invoice_count bigint DEFAULT 0 NOT NULL,
  invoice_value numeric(14,2) DEFAULT 0 NOT NULL,
  estimate_count bigint DEFAULT 0 NOT NULL,
  estimate_value numeric(14,2) DEFAULT 0 NOT NULL,
  order_count bigint DEFAULT 0 NOT NULL,
  order_value numeric(14,2) DEFAULT 0 NOT NULL,
  app_demand_count bigint DEFAULT 0 NOT NULL,
  app_demand_value numeric(14,2) DEFAULT 0 NOT NULL,
  primary_demand_count bigint DEFAULT 0 NOT NULL,
  primary_demand_value numeric(14,2) DEFAULT 0 NOT NULL,
  source_watermark timestamptz,
  computed_at timestamptz DEFAULT now() NOT NULL,
  calculation_version integer DEFAULT 4 NOT NULL,
  generation_id uuid DEFAULT gen_random_uuid() NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL,
  created_by uuid REFERENCES auth.users(id) ON DELETE RESTRICT,
  updated_by uuid REFERENCES auth.users(id) ON DELETE RESTRICT,
  deleted_at timestamptz,
  CONSTRAINT metrics_buyer_period_summary_grain_check CHECK (grain = ANY (ARRAY['month','quarter'])),
  CONSTRAINT metrics_buyer_period_summary_sparse_check CHECK (
    invoice_count > 0 OR estimate_count > 0 OR order_count > 0 OR app_demand_count > 0
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS metrics_buyer_period_summary_active_uk
  ON app.metrics_buyer_period_summary (tenant_id, buyer_id, grain, period_start)
  WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS metrics_buyer_period_summary_period_idx
  ON app.metrics_buyer_period_summary (tenant_id, grain, period_start, primary_demand_value DESC)
  WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS app.metrics_product_period_summary (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES app.tenants(id) ON DELETE RESTRICT,
  tenant_product_id uuid NOT NULL REFERENCES app.tenant_products(id) ON DELETE RESTRICT,
  external_ref text NOT NULL,
  grain text NOT NULL,
  period_start date NOT NULL,
  period_end_exclusive date NOT NULL,
  invoice_units numeric(14,3) DEFAULT 0 NOT NULL,
  invoice_value numeric(14,2) DEFAULT 0 NOT NULL,
  invoice_count bigint DEFAULT 0 NOT NULL,
  invoice_buyer_count bigint DEFAULT 0 NOT NULL,
  estimate_units numeric(14,3) DEFAULT 0 NOT NULL,
  estimate_value numeric(14,2) DEFAULT 0 NOT NULL,
  estimate_count bigint DEFAULT 0 NOT NULL,
  order_units numeric(14,3) DEFAULT 0 NOT NULL,
  order_value numeric(14,2) DEFAULT 0 NOT NULL,
  order_count bigint DEFAULT 0 NOT NULL,
  source_watermark timestamptz,
  computed_at timestamptz DEFAULT now() NOT NULL,
  calculation_version integer DEFAULT 4 NOT NULL,
  generation_id uuid DEFAULT gen_random_uuid() NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL,
  created_by uuid REFERENCES auth.users(id) ON DELETE RESTRICT,
  updated_by uuid REFERENCES auth.users(id) ON DELETE RESTRICT,
  deleted_at timestamptz,
  CONSTRAINT metrics_product_period_summary_grain_check CHECK (grain = ANY (ARRAY['month','quarter'])),
  CONSTRAINT metrics_product_period_summary_sparse_check CHECK (
    invoice_count > 0 OR estimate_count > 0 OR order_count > 0
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS metrics_product_period_summary_active_uk
  ON app.metrics_product_period_summary (tenant_id, tenant_product_id, grain, period_start)
  WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS metrics_product_period_summary_period_idx
  ON app.metrics_product_period_summary (tenant_id, grain, period_start, invoice_units DESC)
  WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS app.metrics_brand_period_summary (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES app.tenants(id) ON DELETE RESTRICT,
  tenant_brand_id uuid NOT NULL REFERENCES app.tenant_brands(id) ON DELETE RESTRICT,
  external_ref text NOT NULL,
  grain text NOT NULL,
  period_start date NOT NULL,
  period_end_exclusive date NOT NULL,
  invoice_count bigint DEFAULT 0 NOT NULL,
  invoice_value numeric(14,2) DEFAULT 0 NOT NULL,
  invoice_product_count bigint DEFAULT 0 NOT NULL,
  invoice_buyer_count bigint DEFAULT 0 NOT NULL,
  source_watermark timestamptz,
  computed_at timestamptz DEFAULT now() NOT NULL,
  calculation_version integer DEFAULT 4 NOT NULL,
  generation_id uuid DEFAULT gen_random_uuid() NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL,
  created_by uuid REFERENCES auth.users(id) ON DELETE RESTRICT,
  updated_by uuid REFERENCES auth.users(id) ON DELETE RESTRICT,
  deleted_at timestamptz,
  CONSTRAINT metrics_brand_period_summary_grain_check CHECK (grain = ANY (ARRAY['month','quarter'])),
  CONSTRAINT metrics_brand_period_summary_sparse_check CHECK (invoice_count > 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS metrics_brand_period_summary_active_uk
  ON app.metrics_brand_period_summary (tenant_id, tenant_brand_id, grain, period_start)
  WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS app.metrics_category_period_summary (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES app.tenants(id) ON DELETE RESTRICT,
  tenant_category_id uuid NOT NULL REFERENCES app.tenant_categories(id) ON DELETE RESTRICT,
  external_ref text NOT NULL,
  grain text NOT NULL,
  period_start date NOT NULL,
  period_end_exclusive date NOT NULL,
  invoice_count bigint DEFAULT 0 NOT NULL,
  invoice_value numeric(14,2) DEFAULT 0 NOT NULL,
  invoice_product_count bigint DEFAULT 0 NOT NULL,
  invoice_buyer_count bigint DEFAULT 0 NOT NULL,
  source_watermark timestamptz,
  computed_at timestamptz DEFAULT now() NOT NULL,
  calculation_version integer DEFAULT 4 NOT NULL,
  generation_id uuid DEFAULT gen_random_uuid() NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL,
  created_by uuid REFERENCES auth.users(id) ON DELETE RESTRICT,
  updated_by uuid REFERENCES auth.users(id) ON DELETE RESTRICT,
  deleted_at timestamptz,
  CONSTRAINT metrics_category_period_summary_grain_check CHECK (grain = ANY (ARRAY['month','quarter'])),
  CONSTRAINT metrics_category_period_summary_sparse_check CHECK (invoice_count > 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS metrics_category_period_summary_active_uk
  ON app.metrics_category_period_summary (tenant_id, tenant_category_id, grain, period_start)
  WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS app.metrics_warehouse_period_summary (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES app.tenants(id) ON DELETE RESTRICT,
  warehouse_id uuid NOT NULL REFERENCES app.warehouses(id) ON DELETE RESTRICT,
  external_ref text NOT NULL,
  grain text NOT NULL,
  period_start date NOT NULL,
  period_end_exclusive date NOT NULL,
  sold_sku_count bigint DEFAULT 0 NOT NULL,
  sold_units numeric(14,3) DEFAULT 0 NOT NULL,
  invoice_value numeric(14,2) DEFAULT 0 NOT NULL,
  source_watermark timestamptz,
  computed_at timestamptz DEFAULT now() NOT NULL,
  calculation_version integer DEFAULT 4 NOT NULL,
  generation_id uuid DEFAULT gen_random_uuid() NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL,
  created_by uuid REFERENCES auth.users(id) ON DELETE RESTRICT,
  updated_by uuid REFERENCES auth.users(id) ON DELETE RESTRICT,
  deleted_at timestamptz,
  CONSTRAINT metrics_warehouse_period_summary_grain_check CHECK (grain = ANY (ARRAY['month','quarter'])),
  CONSTRAINT metrics_warehouse_period_summary_sparse_check CHECK (sold_sku_count > 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS metrics_warehouse_period_summary_active_uk
  ON app.metrics_warehouse_period_summary (tenant_id, warehouse_id, grain, period_start)
  WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS app.metrics_campaign_period_summary (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES app.tenants(id) ON DELETE RESTRICT,
  campaign_id uuid NOT NULL REFERENCES app.campaigns(id) ON DELETE RESTRICT,
  external_ref text NOT NULL,
  grain text NOT NULL,
  period_start date NOT NULL,
  period_end_exclusive date NOT NULL,
  viewed_buyer_count bigint DEFAULT 0 NOT NULL,
  view_count bigint DEFAULT 0 NOT NULL,
  estimate_count bigint DEFAULT 0 NOT NULL,
  estimate_value numeric(14,2) DEFAULT 0 NOT NULL,
  order_count bigint DEFAULT 0 NOT NULL,
  order_value numeric(14,2) DEFAULT 0 NOT NULL,
  invoice_count bigint DEFAULT 0 NOT NULL,
  invoice_value numeric(14,2) DEFAULT 0 NOT NULL,
  demand_buyer_count bigint DEFAULT 0 NOT NULL,
  revenue_buyer_count bigint DEFAULT 0 NOT NULL,
  source_watermark timestamptz,
  computed_at timestamptz DEFAULT now() NOT NULL,
  calculation_version integer DEFAULT 4 NOT NULL,
  generation_id uuid DEFAULT gen_random_uuid() NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL,
  created_by uuid REFERENCES auth.users(id) ON DELETE RESTRICT,
  updated_by uuid REFERENCES auth.users(id) ON DELETE RESTRICT,
  deleted_at timestamptz,
  CONSTRAINT metrics_campaign_period_summary_grain_check CHECK (grain = ANY (ARRAY['month','quarter'])),
  CONSTRAINT metrics_campaign_period_summary_sparse_check CHECK (
    view_count > 0 OR estimate_count > 0 OR order_count > 0 OR invoice_count > 0
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS metrics_campaign_period_summary_active_uk
  ON app.metrics_campaign_period_summary (tenant_id, campaign_id, grain, period_start)
  WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS app.metrics_cohort_period_summary (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES app.tenants(id) ON DELETE RESTRICT,
  cohort_id uuid NOT NULL REFERENCES app.cohorts(id) ON DELETE RESTRICT,
  external_ref text NOT NULL,
  grain text NOT NULL,
  period_start date NOT NULL,
  period_end_exclusive date NOT NULL,
  member_count bigint DEFAULT 0 NOT NULL,
  active_member_count bigint DEFAULT 0 NOT NULL,
  demand_count bigint DEFAULT 0 NOT NULL,
  demand_value numeric(14,2) DEFAULT 0 NOT NULL,
  invoice_count bigint DEFAULT 0 NOT NULL,
  invoice_value numeric(14,2) DEFAULT 0 NOT NULL,
  source_watermark timestamptz,
  computed_at timestamptz DEFAULT now() NOT NULL,
  calculation_version integer DEFAULT 4 NOT NULL,
  generation_id uuid DEFAULT gen_random_uuid() NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL,
  created_by uuid REFERENCES auth.users(id) ON DELETE RESTRICT,
  updated_by uuid REFERENCES auth.users(id) ON DELETE RESTRICT,
  deleted_at timestamptz,
  CONSTRAINT metrics_cohort_period_summary_grain_check CHECK (grain = ANY (ARRAY['month','quarter']))
);

CREATE UNIQUE INDEX IF NOT EXISTS metrics_cohort_period_summary_active_uk
  ON app.metrics_cohort_period_summary (tenant_id, cohort_id, grain, period_start)
  WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS app.metrics_tenant_now_summary (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES app.tenants(id) ON DELETE RESTRICT,
  external_ref text NOT NULL,
  receivable_amount numeric(14,2) DEFAULT 0 NOT NULL,
  receivable_invoice_count bigint DEFAULT 0 NOT NULL,
  receivable_buyer_count bigint DEFAULT 0 NOT NULL,
  overdue_amount numeric(14,2) DEFAULT 0 NOT NULL,
  overdue_invoice_count bigint DEFAULT 0 NOT NULL,
  overdue_buyer_count bigint DEFAULT 0 NOT NULL,
  open_estimate_count bigint DEFAULT 0 NOT NULL,
  open_estimate_value numeric(14,2) DEFAULT 0 NOT NULL,
  open_order_count bigint DEFAULT 0 NOT NULL,
  open_order_value numeric(14,2) DEFAULT 0 NOT NULL,
  active_buyer_count bigint DEFAULT 0 NOT NULL,
  active_brand_count bigint DEFAULT 0 NOT NULL,
  active_product_count bigint DEFAULT 0 NOT NULL,
  active_location_count bigint DEFAULT 0 NOT NULL,
  active_warehouse_count bigint DEFAULT 0 NOT NULL,
  active_campaign_count bigint DEFAULT 0 NOT NULL,
  active_cohort_count bigint DEFAULT 0 NOT NULL,
  active_price_list_count bigint DEFAULT 0 NOT NULL,
  enabled_buyer_count bigint DEFAULT 0 NOT NULL,
  sellable_units numeric(14,2) DEFAULT 0 NOT NULL,
  sellable_sku_count bigint DEFAULT 0 NOT NULL,
  low_stock_product_count bigint DEFAULT 0 NOT NULL,
  oos_product_count bigint DEFAULT 0 NOT NULL,
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

CREATE UNIQUE INDEX IF NOT EXISTS metrics_tenant_now_summary_active_uk
  ON app.metrics_tenant_now_summary (tenant_id)
  WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS app.metrics_buyer_now_summary (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES app.tenants(id) ON DELETE RESTRICT,
  buyer_id uuid NOT NULL REFERENCES app.buyers(id) ON DELETE RESTRICT,
  external_ref text NOT NULL,
  credit_limit numeric(14,2) DEFAULT 0 NOT NULL,
  receivable_amount numeric(14,2) DEFAULT 0 NOT NULL,
  overdue_amount numeric(14,2) DEFAULT 0 NOT NULL,
  credit_available numeric(14,2) DEFAULT 0 NOT NULL,
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

CREATE UNIQUE INDEX IF NOT EXISTS metrics_buyer_now_summary_active_uk
  ON app.metrics_buyer_now_summary (tenant_id, buyer_id)
  WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS app.metrics_location_now_summary (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES app.tenants(id) ON DELETE RESTRICT,
  location_id uuid NOT NULL REFERENCES app.locations(id) ON DELETE RESTRICT,
  external_ref text NOT NULL,
  open_estimate_count bigint DEFAULT 0 NOT NULL,
  open_order_count bigint DEFAULT 0 NOT NULL,
  overdue_amount numeric(14,2) DEFAULT 0 NOT NULL,
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

CREATE UNIQUE INDEX IF NOT EXISTS metrics_location_now_summary_active_uk
  ON app.metrics_location_now_summary (tenant_id, location_id)
  WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS app.metrics_landing_kpi_snapshot (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES app.tenants(id) ON DELETE RESTRICT,
  external_ref text NOT NULL,
  page_key text NOT NULL,
  scope_kind text DEFAULT 'tenant' NOT NULL,
  scope_id uuid,
  period_key text NOT NULL,
  period_start date NOT NULL,
  kpis jsonb DEFAULT '[]'::jsonb NOT NULL,
  source_watermark timestamptz,
  computed_at timestamptz DEFAULT now() NOT NULL,
  calculation_version integer DEFAULT 4 NOT NULL,
  generation_id uuid DEFAULT gen_random_uuid() NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL,
  created_by uuid REFERENCES auth.users(id) ON DELETE RESTRICT,
  updated_by uuid REFERENCES auth.users(id) ON DELETE RESTRICT,
  deleted_at timestamptz,
  CONSTRAINT metrics_landing_kpi_snapshot_scope_check CHECK (
    (scope_kind = 'tenant' AND scope_id IS NULL)
    OR (scope_kind <> 'tenant' AND scope_id IS NOT NULL)
  ),
  CONSTRAINT metrics_landing_kpi_snapshot_kpis_array_check CHECK (jsonb_typeof(kpis) = 'array')
);

CREATE UNIQUE INDEX IF NOT EXISTS metrics_landing_kpi_snapshot_active_uk
  ON app.metrics_landing_kpi_snapshot (tenant_id, page_key, scope_kind, COALESCE(scope_id, '00000000-0000-0000-0000-000000000000'::uuid), period_key, period_start)
  WHERE deleted_at IS NULL;

ALTER TABLE app.metrics_tenant_period_summary ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.metrics_location_period_summary ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.metrics_buyer_period_summary ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.metrics_product_period_summary ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.metrics_brand_period_summary ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.metrics_category_period_summary ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.metrics_warehouse_period_summary ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.metrics_campaign_period_summary ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.metrics_cohort_period_summary ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.metrics_tenant_now_summary ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.metrics_buyer_now_summary ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.metrics_location_now_summary ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.metrics_landing_kpi_snapshot ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
  v_table text;
BEGIN
  FOREACH v_table IN ARRAY ARRAY[
    'metrics_tenant_period_summary',
    'metrics_location_period_summary',
    'metrics_buyer_period_summary',
    'metrics_product_period_summary',
    'metrics_brand_period_summary',
    'metrics_category_period_summary',
    'metrics_warehouse_period_summary',
    'metrics_campaign_period_summary',
    'metrics_cohort_period_summary',
    'metrics_tenant_now_summary',
    'metrics_buyer_now_summary',
    'metrics_location_now_summary',
    'metrics_landing_kpi_snapshot'
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

CREATE OR REPLACE FUNCTION app._metrics_v4_upsert_landing_kpis(
  p_tenant_id uuid,
  p_page_key text,
  p_period_key text,
  p_period_start date,
  p_kpis jsonb,
  p_source_watermark timestamptz DEFAULT NULL,
  p_scope_kind text DEFAULT 'tenant',
  p_scope_id uuid DEFAULT NULL
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, app, pg_temp
AS $$
BEGIN
  INSERT INTO app.metrics_landing_kpi_snapshot (
    tenant_id, external_ref, page_key, scope_kind, scope_id, period_key, period_start,
    kpis, source_watermark, computed_at, updated_at
  )
  VALUES (
    p_tenant_id,
    concat_ws(':', p_tenant_id::text, p_page_key, p_scope_kind, COALESCE(p_scope_id::text, 'tenant'), p_period_key, p_period_start::text),
    p_page_key, p_scope_kind, p_scope_id, p_period_key, p_period_start,
    COALESCE(p_kpis, '[]'::jsonb), p_source_watermark, clock_timestamp(), clock_timestamp()
  )
  ON CONFLICT (tenant_id, page_key, scope_kind, COALESCE(scope_id, '00000000-0000-0000-0000-000000000000'::uuid), period_key, period_start)
    WHERE deleted_at IS NULL
  DO UPDATE SET
    kpis = EXCLUDED.kpis,
    source_watermark = EXCLUDED.source_watermark,
    computed_at = EXCLUDED.computed_at,
    updated_at = EXCLUDED.updated_at,
    generation_id = gen_random_uuid(),
    calculation_version = 4;
  RETURN 1;
END;
$$;

-- Full-tenant rebuild helper for backfills and reconciliation only. The
-- 15-second tick path uses app._metrics_v4_refresh_claimed_periods below.
CREATE OR REPLACE FUNCTION app._metrics_v4_refresh_commercial_periods(
  p_tenant_id uuid,
  p_as_of timestamptz DEFAULT clock_timestamp()
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, app, pg_temp
AS $$
DECLARE
  v_primary text := app.metrics_v4_primary_demand_kind(p_tenant_id);
  v_rows integer := 0;
  v_count integer;
  v_watermark timestamptz;
BEGIN
  RAISE EXCEPTION 'metrics_v4_full_commercial_refresh_disabled: use metrics_mark_reconciliation + metrics_refresh_tick' USING ERRCODE = '55000';

  SELECT MAX(x.updated_at) INTO v_watermark FROM (
    SELECT MAX(updated_at) AS updated_at FROM app.estimates WHERE tenant_id = p_tenant_id
    UNION ALL SELECT MAX(updated_at) FROM app.orders WHERE tenant_id = p_tenant_id
    UNION ALL SELECT MAX(updated_at) FROM app.invoices WHERE tenant_id = p_tenant_id
  ) x;


  INSERT INTO app.metrics_tenant_period_summary (
    tenant_id, external_ref, grain, period_start, period_end_exclusive,
    invoice_count, invoice_value, invoice_units, invoice_buyer_count, invoice_product_count,
    estimate_count, estimate_value, estimate_units, estimate_buyer_count, estimate_product_count,
    order_count, order_value, order_units, order_buyer_count, order_product_count,
    app_estimate_count, app_estimate_value, app_estimate_buyer_count,
    app_order_count, app_order_value, app_order_buyer_count,
    primary_demand_kind, primary_demand_count, primary_demand_value, primary_demand_buyer_count,
    source_watermark
  )
  SELECT
    p_tenant_id, concat_ws(':', p_tenant_id::text, 'tenant', w.grain, w.period_start::text),
    w.grain, w.period_start, w.period_end_exclusive,
    COALESCE(inv.invoice_count, 0), COALESCE(inv.invoice_value, 0), COALESCE(inv.invoice_units, 0), COALESCE(inv.invoice_buyer_count, 0), COALESCE(inv.invoice_product_count, 0),
    COALESCE(est.estimate_count, 0), COALESCE(est.estimate_value, 0), COALESCE(est.estimate_units, 0), COALESCE(est.estimate_buyer_count, 0), COALESCE(est.estimate_product_count, 0),
    COALESCE(ord.order_count, 0), COALESCE(ord.order_value, 0), COALESCE(ord.order_units, 0), COALESCE(ord.order_buyer_count, 0), COALESCE(ord.order_product_count, 0),
    COALESCE(est.app_estimate_count, 0), COALESCE(est.app_estimate_value, 0), COALESCE(est.app_estimate_buyer_count, 0),
    COALESCE(ord.app_order_count, 0), COALESCE(ord.app_order_value, 0), COALESCE(ord.app_order_buyer_count, 0),
    v_primary,
    CASE WHEN v_primary = 'estimates' THEN COALESCE(est.estimate_count, 0) ELSE COALESCE(ord.order_count, 0) END,
    CASE WHEN v_primary = 'estimates' THEN COALESCE(est.estimate_value, 0) ELSE COALESCE(ord.order_value, 0) END,
    CASE WHEN v_primary = 'estimates' THEN COALESCE(est.estimate_buyer_count, 0) ELSE COALESCE(ord.order_buyer_count, 0) END,
    v_watermark
  FROM app.metrics_v4_period_windows(p_as_of) w
  LEFT JOIN LATERAL (
    SELECT COUNT(DISTINCT i.id)::bigint AS invoice_count,
      COALESCE(SUM(i.total_amount) FILTER (WHERE app.invoice_status_gmv_included(i.status)), 0)::numeric AS invoice_value,
      COALESCE(SUM(ii.qty) FILTER (WHERE app.invoice_status_gmv_included(i.status)), 0)::numeric AS invoice_units,
      COUNT(DISTINCT i.buyer_id) FILTER (WHERE app.invoice_status_gmv_included(i.status))::bigint AS invoice_buyer_count,
      COUNT(DISTINCT ii.tenant_product_id) FILTER (WHERE app.invoice_status_gmv_included(i.status))::bigint AS invoice_product_count
    FROM app.invoices i
    LEFT JOIN app.invoice_items ii ON ii.invoice_id = i.id AND ii.deleted_at IS NULL
    WHERE i.tenant_id = p_tenant_id AND i.deleted_at IS NULL
      AND app.metric_day_ist(i.invoice_date, i.created_at) >= w.period_start
      AND app.metric_day_ist(i.invoice_date, i.created_at) < w.period_end_exclusive
  ) inv ON true
  LEFT JOIN LATERAL (
    SELECT COUNT(DISTINCT e.id) FILTER (WHERE app.estimate_status_is_open(e.status) OR e.status = 'accepted')::bigint AS estimate_count,
      COALESCE(SUM(e.total_amount) FILTER (WHERE app.estimate_status_is_open(e.status) OR e.status = 'accepted'), 0)::numeric AS estimate_value,
      COALESCE(SUM(ei.qty) FILTER (WHERE app.estimate_status_is_open(e.status) OR e.status = 'accepted'), 0)::numeric AS estimate_units,
      COUNT(DISTINCT e.buyer_id) FILTER (WHERE app.estimate_status_is_open(e.status) OR e.status = 'accepted')::bigint AS estimate_buyer_count,
      COUNT(DISTINCT ei.tenant_product_id) FILTER (WHERE app.estimate_status_is_open(e.status) OR e.status = 'accepted')::bigint AS estimate_product_count,
      COUNT(DISTINCT e.id) FILTER (WHERE e.is_buyer_app_estimate AND (app.estimate_status_is_open(e.status) OR e.status = 'accepted'))::bigint AS app_estimate_count,
      COALESCE(SUM(e.total_amount) FILTER (WHERE e.is_buyer_app_estimate AND (app.estimate_status_is_open(e.status) OR e.status = 'accepted')), 0)::numeric AS app_estimate_value,
      COUNT(DISTINCT e.buyer_id) FILTER (WHERE e.is_buyer_app_estimate AND (app.estimate_status_is_open(e.status) OR e.status = 'accepted'))::bigint AS app_estimate_buyer_count
    FROM app.estimates e
    LEFT JOIN app.estimate_items ei ON ei.estimate_id = e.id AND ei.deleted_at IS NULL
    WHERE e.tenant_id = p_tenant_id AND e.deleted_at IS NULL
      AND app.metric_day_ist(e.estimate_date, e.created_at) >= w.period_start
      AND app.metric_day_ist(e.estimate_date, e.created_at) < w.period_end_exclusive
  ) est ON true
  LEFT JOIN LATERAL (
    SELECT COUNT(DISTINCT o.id) FILTER (WHERE app.order_status_in_flow(o.status))::bigint AS order_count,
      COALESCE(SUM(o.total_amount) FILTER (WHERE app.order_status_in_flow(o.status)), 0)::numeric AS order_value,
      COALESCE(SUM(oi.qty) FILTER (WHERE app.order_status_in_flow(o.status)), 0)::numeric AS order_units,
      COUNT(DISTINCT o.buyer_id) FILTER (WHERE app.order_status_in_flow(o.status))::bigint AS order_buyer_count,
      COUNT(DISTINCT oi.tenant_product_id) FILTER (WHERE app.order_status_in_flow(o.status))::bigint AS order_product_count,
      COUNT(DISTINCT o.id) FILTER (WHERE o.is_buyer_app_order AND app.order_status_in_flow(o.status))::bigint AS app_order_count,
      COALESCE(SUM(o.total_amount) FILTER (WHERE o.is_buyer_app_order AND app.order_status_in_flow(o.status)), 0)::numeric AS app_order_value,
      COUNT(DISTINCT o.buyer_id) FILTER (WHERE o.is_buyer_app_order AND app.order_status_in_flow(o.status))::bigint AS app_order_buyer_count
    FROM app.orders o
    LEFT JOIN app.order_items oi ON oi.order_id = o.id AND oi.deleted_at IS NULL
    WHERE o.tenant_id = p_tenant_id AND o.deleted_at IS NULL
      AND app.metric_day_ist(o.order_date, o.created_at) >= w.period_start
      AND app.metric_day_ist(o.order_date, o.created_at) < w.period_end_exclusive
  ) ord ON true;
  GET DIAGNOSTICS v_count = ROW_COUNT; v_rows := v_rows + v_count;


  INSERT INTO app.metrics_location_period_summary (
    tenant_id, location_id, external_ref, grain, period_start, period_end_exclusive,
    invoice_count, invoice_value, invoice_buyer_count,
    estimate_count, estimate_value, estimate_buyer_count,
    order_count, order_value, order_buyer_count,
    primary_demand_kind, primary_demand_count, primary_demand_value, primary_demand_buyer_count,
    source_watermark
  )
  SELECT
    p_tenant_id, l.id, concat_ws(':', p_tenant_id::text, l.id::text, w.grain, w.period_start::text),
    w.grain, w.period_start, w.period_end_exclusive,
    COALESCE(inv.invoice_count, 0), COALESCE(inv.invoice_value, 0), COALESCE(inv.invoice_buyer_count, 0),
    COALESCE(est.estimate_count, 0), COALESCE(est.estimate_value, 0), COALESCE(est.estimate_buyer_count, 0),
    COALESCE(ord.order_count, 0), COALESCE(ord.order_value, 0), COALESCE(ord.order_buyer_count, 0),
    v_primary,
    CASE WHEN v_primary = 'estimates' THEN COALESCE(est.estimate_count, 0) ELSE COALESCE(ord.order_count, 0) END,
    CASE WHEN v_primary = 'estimates' THEN COALESCE(est.estimate_value, 0) ELSE COALESCE(ord.order_value, 0) END,
    CASE WHEN v_primary = 'estimates' THEN COALESCE(est.estimate_buyer_count, 0) ELSE COALESCE(ord.order_buyer_count, 0) END,
    v_watermark
  FROM app.locations l
  CROSS JOIN app.metrics_v4_period_windows(p_as_of) w
  LEFT JOIN LATERAL (
    SELECT COUNT(*) FILTER (WHERE app.invoice_status_gmv_included(i.status))::bigint AS invoice_count,
      COALESCE(SUM(i.total_amount) FILTER (WHERE app.invoice_status_gmv_included(i.status)), 0)::numeric AS invoice_value,
      COUNT(DISTINCT i.buyer_id) FILTER (WHERE app.invoice_status_gmv_included(i.status))::bigint AS invoice_buyer_count
    FROM app.invoices i
    WHERE i.tenant_id = p_tenant_id AND i.location_id = l.id AND i.deleted_at IS NULL
      AND app.metric_day_ist(i.invoice_date, i.created_at) >= w.period_start
      AND app.metric_day_ist(i.invoice_date, i.created_at) < w.period_end_exclusive
  ) inv ON true
  LEFT JOIN LATERAL (
    SELECT COUNT(*) FILTER (WHERE app.estimate_status_is_open(e.status) OR e.status = 'accepted')::bigint AS estimate_count,
      COALESCE(SUM(e.total_amount) FILTER (WHERE app.estimate_status_is_open(e.status) OR e.status = 'accepted'), 0)::numeric AS estimate_value,
      COUNT(DISTINCT e.buyer_id) FILTER (WHERE app.estimate_status_is_open(e.status) OR e.status = 'accepted')::bigint AS estimate_buyer_count
    FROM app.estimates e
    WHERE e.tenant_id = p_tenant_id AND e.location_id = l.id AND e.deleted_at IS NULL
      AND app.metric_day_ist(e.estimate_date, e.created_at) >= w.period_start
      AND app.metric_day_ist(e.estimate_date, e.created_at) < w.period_end_exclusive
  ) est ON true
  LEFT JOIN LATERAL (
    SELECT COUNT(*) FILTER (WHERE app.order_status_in_flow(o.status))::bigint AS order_count,
      COALESCE(SUM(o.total_amount) FILTER (WHERE app.order_status_in_flow(o.status)), 0)::numeric AS order_value,
      COUNT(DISTINCT o.buyer_id) FILTER (WHERE app.order_status_in_flow(o.status))::bigint AS order_buyer_count
    FROM app.orders o
    WHERE o.tenant_id = p_tenant_id AND o.location_id = l.id AND o.deleted_at IS NULL
      AND app.metric_day_ist(o.order_date, o.created_at) >= w.period_start
      AND app.metric_day_ist(o.order_date, o.created_at) < w.period_end_exclusive
  ) ord ON true
  WHERE l.tenant_id = p_tenant_id AND l.deleted_at IS NULL
    AND (COALESCE(inv.invoice_count,0) > 0 OR COALESCE(est.estimate_count,0) > 0 OR COALESCE(ord.order_count,0) > 0);
  GET DIAGNOSTICS v_count = ROW_COUNT; v_rows := v_rows + v_count;

  RETURN v_rows;
END;
$$;

-- Full-tenant rebuild helper for backfills and reconciliation only. The
-- 15-second tick path uses app._metrics_v4_refresh_claimed_periods below.
CREATE OR REPLACE FUNCTION app._metrics_v4_refresh_entity_periods(
  p_tenant_id uuid,
  p_as_of timestamptz DEFAULT clock_timestamp()
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, app, pg_temp
AS $$
DECLARE
  v_primary text := app.metrics_v4_primary_demand_kind(p_tenant_id);
  v_rows integer := 0;
  v_count integer;
  v_watermark timestamptz;
BEGIN
  RAISE EXCEPTION 'metrics_v4_full_entity_refresh_disabled: use metrics_mark_reconciliation + metrics_refresh_tick' USING ERRCODE = '55000';

  SELECT MAX(x.updated_at) INTO v_watermark FROM (
    SELECT MAX(updated_at) AS updated_at FROM app.estimates WHERE tenant_id = p_tenant_id
    UNION ALL SELECT MAX(updated_at) FROM app.orders WHERE tenant_id = p_tenant_id
    UNION ALL SELECT MAX(updated_at) FROM app.invoices WHERE tenant_id = p_tenant_id
    UNION ALL SELECT MAX(updated_at) FROM app.tenant_products WHERE tenant_id = p_tenant_id
    UNION ALL SELECT MAX(ti.updated_at) FROM app.tenant_inventory ti JOIN app.tenant_products tp ON tp.id = ti.tenant_product_id WHERE tp.tenant_id = p_tenant_id
  ) x;


  INSERT INTO app.metrics_buyer_period_summary (
    tenant_id, buyer_id, external_ref, grain, period_start, period_end_exclusive,
    invoice_count, invoice_value, estimate_count, estimate_value, order_count, order_value,
    app_demand_count, app_demand_value, primary_demand_count, primary_demand_value, source_watermark
  )
  SELECT
    p_tenant_id, b.id, concat_ws(':', p_tenant_id::text, b.id::text, w.grain, w.period_start::text),
    w.grain, w.period_start, w.period_end_exclusive,
    COALESCE(inv.invoice_count, 0), COALESCE(inv.invoice_value, 0),
    COALESCE(est.estimate_count, 0), COALESCE(est.estimate_value, 0),
    COALESCE(ord.order_count, 0), COALESCE(ord.order_value, 0),
    COALESCE(est.app_estimate_count, 0) + COALESCE(ord.app_order_count, 0),
    COALESCE(est.app_estimate_value, 0) + COALESCE(ord.app_order_value, 0),
    CASE WHEN v_primary = 'estimates' THEN COALESCE(est.estimate_count, 0) ELSE COALESCE(ord.order_count, 0) END,
    CASE WHEN v_primary = 'estimates' THEN COALESCE(est.estimate_value, 0) ELSE COALESCE(ord.order_value, 0) END,
    v_watermark
  FROM app.buyers b
  CROSS JOIN app.metrics_v4_period_windows(p_as_of) w
  LEFT JOIN LATERAL (
    SELECT COUNT(*) FILTER (WHERE app.invoice_status_gmv_included(i.status))::bigint AS invoice_count,
      COALESCE(SUM(i.total_amount) FILTER (WHERE app.invoice_status_gmv_included(i.status)), 0)::numeric AS invoice_value
    FROM app.invoices i
    WHERE i.tenant_id = p_tenant_id AND i.buyer_id = b.id AND i.deleted_at IS NULL
      AND app.metric_day_ist(i.invoice_date, i.created_at) >= w.period_start
      AND app.metric_day_ist(i.invoice_date, i.created_at) < w.period_end_exclusive
  ) inv ON true
  LEFT JOIN LATERAL (
    SELECT COUNT(*) FILTER (WHERE app.estimate_status_is_open(e.status) OR e.status = 'accepted')::bigint AS estimate_count,
      COALESCE(SUM(e.total_amount) FILTER (WHERE app.estimate_status_is_open(e.status) OR e.status = 'accepted'), 0)::numeric AS estimate_value,
      COUNT(*) FILTER (WHERE e.is_buyer_app_estimate AND (app.estimate_status_is_open(e.status) OR e.status = 'accepted'))::bigint AS app_estimate_count,
      COALESCE(SUM(e.total_amount) FILTER (WHERE e.is_buyer_app_estimate AND (app.estimate_status_is_open(e.status) OR e.status = 'accepted')), 0)::numeric AS app_estimate_value
    FROM app.estimates e
    WHERE e.tenant_id = p_tenant_id AND e.buyer_id = b.id AND e.deleted_at IS NULL
      AND app.metric_day_ist(e.estimate_date, e.created_at) >= w.period_start
      AND app.metric_day_ist(e.estimate_date, e.created_at) < w.period_end_exclusive
  ) est ON true
  LEFT JOIN LATERAL (
    SELECT COUNT(*) FILTER (WHERE app.order_status_in_flow(o.status))::bigint AS order_count,
      COALESCE(SUM(o.total_amount) FILTER (WHERE app.order_status_in_flow(o.status)), 0)::numeric AS order_value,
      COUNT(*) FILTER (WHERE o.is_buyer_app_order AND app.order_status_in_flow(o.status))::bigint AS app_order_count,
      COALESCE(SUM(o.total_amount) FILTER (WHERE o.is_buyer_app_order AND app.order_status_in_flow(o.status)), 0)::numeric AS app_order_value
    FROM app.orders o
    WHERE o.tenant_id = p_tenant_id AND o.buyer_id = b.id AND o.deleted_at IS NULL
      AND app.metric_day_ist(o.order_date, o.created_at) >= w.period_start
      AND app.metric_day_ist(o.order_date, o.created_at) < w.period_end_exclusive
  ) ord ON true
  WHERE b.tenant_id = p_tenant_id AND b.deleted_at IS NULL AND w.grain IN ('month','quarter')
    AND (COALESCE(inv.invoice_count,0) > 0 OR COALESCE(est.estimate_count,0) > 0 OR COALESCE(ord.order_count,0) > 0);
  GET DIAGNOSTICS v_count = ROW_COUNT; v_rows := v_rows + v_count;


  INSERT INTO app.metrics_product_period_summary (
    tenant_id, tenant_product_id, external_ref, grain, period_start, period_end_exclusive,
    invoice_units, invoice_value, invoice_count, invoice_buyer_count,
    estimate_units, estimate_value, estimate_count,
    order_units, order_value, order_count,
    source_watermark
  )
  SELECT
    p_tenant_id, tp.id, concat_ws(':', p_tenant_id::text, tp.id::text, w.grain, w.period_start::text),
    w.grain, w.period_start, w.period_end_exclusive,
    COALESCE(inv.units, 0), COALESCE(inv.value, 0), COALESCE(inv.count, 0), COALESCE(inv.buyers, 0),
    COALESCE(est.units, 0), COALESCE(est.value, 0), COALESCE(est.count, 0),
    COALESCE(ord.units, 0), COALESCE(ord.value, 0), COALESCE(ord.count, 0),
    v_watermark
  FROM app.tenant_products tp
  CROSS JOIN app.metrics_v4_period_windows(p_as_of) w
  LEFT JOIN LATERAL (
    SELECT COALESCE(SUM(ii.qty),0)::numeric AS units, COALESCE(SUM(ii.line_total),0)::numeric AS value,
      COUNT(DISTINCT i.id)::bigint AS count, COUNT(DISTINCT i.buyer_id)::bigint AS buyers
    FROM app.invoice_items ii
    JOIN app.invoices i ON i.id = ii.invoice_id AND i.tenant_id = p_tenant_id AND i.deleted_at IS NULL AND app.invoice_status_gmv_included(i.status)
    WHERE ii.tenant_product_id = tp.id AND ii.deleted_at IS NULL
      AND app.metric_day_ist(i.invoice_date, i.created_at) >= w.period_start
      AND app.metric_day_ist(i.invoice_date, i.created_at) < w.period_end_exclusive
  ) inv ON true
  LEFT JOIN LATERAL (
    SELECT COALESCE(SUM(ei.qty),0)::numeric AS units, COALESCE(SUM(ei.line_total),0)::numeric AS value,
      COUNT(DISTINCT e.id)::bigint AS count
    FROM app.estimate_items ei
    JOIN app.estimates e ON e.id = ei.estimate_id AND e.tenant_id = p_tenant_id AND e.deleted_at IS NULL AND (app.estimate_status_is_open(e.status) OR e.status = 'accepted')
    WHERE ei.tenant_product_id = tp.id AND ei.deleted_at IS NULL
      AND app.metric_day_ist(e.estimate_date, e.created_at) >= w.period_start
      AND app.metric_day_ist(e.estimate_date, e.created_at) < w.period_end_exclusive
  ) est ON true
  LEFT JOIN LATERAL (
    SELECT COALESCE(SUM(oi.qty),0)::numeric AS units, COALESCE(SUM(oi.line_total),0)::numeric AS value,
      COUNT(DISTINCT o.id)::bigint AS count
    FROM app.order_items oi
    JOIN app.orders o ON o.id = oi.order_id AND o.tenant_id = p_tenant_id AND o.deleted_at IS NULL AND app.order_status_in_flow(o.status)
    WHERE oi.tenant_product_id = tp.id AND oi.deleted_at IS NULL
      AND app.metric_day_ist(o.order_date, o.created_at) >= w.period_start
      AND app.metric_day_ist(o.order_date, o.created_at) < w.period_end_exclusive
  ) ord ON true
  WHERE tp.tenant_id = p_tenant_id AND tp.deleted_at IS NULL AND w.grain IN ('month','quarter')
    AND (COALESCE(inv.count,0) > 0 OR COALESCE(est.count,0) > 0 OR COALESCE(ord.count,0) > 0);
  GET DIAGNOSTICS v_count = ROW_COUNT; v_rows := v_rows + v_count;

  INSERT INTO app.metrics_brand_period_summary (
    tenant_id, tenant_brand_id, external_ref, grain, period_start, period_end_exclusive,
    invoice_count, invoice_value, invoice_product_count, invoice_buyer_count, source_watermark
  )
  SELECT tp.tenant_id, tp.tenant_brand_id, concat_ws(':', p_tenant_id::text, tp.tenant_brand_id::text, ps.grain, ps.period_start::text),
    ps.grain, ps.period_start, ps.period_end_exclusive,
    SUM(ps.invoice_count)::bigint, SUM(ps.invoice_value), COUNT(DISTINCT ps.tenant_product_id)::bigint, SUM(ps.invoice_buyer_count)::bigint, v_watermark
  FROM app.metrics_product_period_summary ps
  JOIN app.tenant_products tp ON tp.id = ps.tenant_product_id
  WHERE ps.tenant_id = p_tenant_id AND ps.deleted_at IS NULL AND ps.invoice_count > 0
    AND ps.grain IN ('month','quarter')
    AND EXISTS (SELECT 1 FROM app.metrics_v4_period_windows(p_as_of) w WHERE w.grain = ps.grain AND w.period_start = ps.period_start)
  GROUP BY tp.tenant_id, tp.tenant_brand_id, ps.grain, ps.period_start, ps.period_end_exclusive;
  GET DIAGNOSTICS v_count = ROW_COUNT; v_rows := v_rows + v_count;

  INSERT INTO app.metrics_category_period_summary (
    tenant_id, tenant_category_id, external_ref, grain, period_start, period_end_exclusive,
    invoice_count, invoice_value, invoice_product_count, invoice_buyer_count, source_watermark
  )
  SELECT tp.tenant_id, tp.tenant_category_id, concat_ws(':', p_tenant_id::text, tp.tenant_category_id::text, ps.grain, ps.period_start::text),
    ps.grain, ps.period_start, ps.period_end_exclusive,
    SUM(ps.invoice_count)::bigint, SUM(ps.invoice_value), COUNT(DISTINCT ps.tenant_product_id)::bigint, SUM(ps.invoice_buyer_count)::bigint, v_watermark
  FROM app.metrics_product_period_summary ps
  JOIN app.tenant_products tp ON tp.id = ps.tenant_product_id
  WHERE ps.tenant_id = p_tenant_id AND ps.deleted_at IS NULL AND ps.invoice_count > 0 AND tp.tenant_category_id IS NOT NULL
    AND ps.grain IN ('month','quarter')
    AND EXISTS (SELECT 1 FROM app.metrics_v4_period_windows(p_as_of) w WHERE w.grain = ps.grain AND w.period_start = ps.period_start)
  GROUP BY tp.tenant_id, tp.tenant_category_id, ps.grain, ps.period_start, ps.period_end_exclusive;
  GET DIAGNOSTICS v_count = ROW_COUNT; v_rows := v_rows + v_count;

  INSERT INTO app.metrics_warehouse_period_summary (
    tenant_id, warehouse_id, external_ref, grain, period_start, period_end_exclusive,
    sold_sku_count, sold_units, invoice_value, source_watermark
  )
  SELECT p_tenant_id, wh.id, concat_ws(':', p_tenant_id::text, wh.id::text, ps.grain, ps.period_start::text),
    ps.grain, ps.period_start, ps.period_end_exclusive,
    COUNT(DISTINCT ps.tenant_product_id)::bigint, SUM(ps.invoice_units), SUM(ps.invoice_value), v_watermark
  FROM app.warehouses wh
  JOIN app.tenant_inventory ti ON ti.warehouse_id = wh.id AND ti.deleted_at IS NULL
  JOIN app.metrics_product_period_summary ps ON ps.tenant_product_id = ti.tenant_product_id AND ps.deleted_at IS NULL AND ps.invoice_count > 0
  WHERE wh.tenant_id = p_tenant_id AND wh.deleted_at IS NULL
    AND ps.grain IN ('month','quarter')
    AND EXISTS (SELECT 1 FROM app.metrics_v4_period_windows(p_as_of) w WHERE w.grain = ps.grain AND w.period_start = ps.period_start)
  GROUP BY wh.id, ps.grain, ps.period_start, ps.period_end_exclusive;
  GET DIAGNOSTICS v_count = ROW_COUNT; v_rows := v_rows + v_count;

  RETURN v_rows;
END;
$$;

-- Full-tenant rebuild helper for backfills and reconciliation only. The
-- 15-second tick path uses app._metrics_v4_refresh_claimed_periods below.
CREATE OR REPLACE FUNCTION app._metrics_v4_refresh_campaign_periods(
  p_tenant_id uuid,
  p_as_of timestamptz DEFAULT clock_timestamp()
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, app, pg_temp
AS $$
DECLARE
  v_rows integer := 0;
  v_count integer;
  v_watermark timestamptz;
BEGIN
  RAISE EXCEPTION 'metrics_v4_full_campaign_refresh_disabled: use metrics_mark_reconciliation + metrics_refresh_tick' USING ERRCODE = '55000';

  SELECT MAX(x.updated_at) INTO v_watermark FROM (
    SELECT MAX(updated_at) AS updated_at FROM app.campaigns WHERE tenant_id = p_tenant_id
    UNION ALL SELECT MAX(updated_at) FROM app.campaign_views WHERE tenant_id = p_tenant_id
    UNION ALL SELECT MAX(updated_at) FROM app.estimates WHERE tenant_id = p_tenant_id AND campaign_id IS NOT NULL
    UNION ALL SELECT MAX(updated_at) FROM app.orders WHERE tenant_id = p_tenant_id AND campaign_id IS NOT NULL
    UNION ALL SELECT MAX(updated_at) FROM app.invoices WHERE tenant_id = p_tenant_id
  ) x;


  INSERT INTO app.metrics_campaign_period_summary (
    tenant_id, campaign_id, external_ref, grain, period_start, period_end_exclusive,
    viewed_buyer_count, view_count,
    estimate_count, estimate_value, order_count, order_value, invoice_count, invoice_value,
    demand_buyer_count, revenue_buyer_count, source_watermark
  )
  SELECT
    p_tenant_id, c.id, concat_ws(':', p_tenant_id::text, c.id::text, w.grain, w.period_start::text),
    w.grain, w.period_start, w.period_end_exclusive,
    COALESCE(v.viewed_buyer_count, 0), COALESCE(v.view_count, 0),
    COALESCE(est.estimate_count, 0), COALESCE(est.estimate_value, 0),
    COALESCE(ord.order_count, 0), COALESCE(ord.order_value, 0),
    COALESCE(inv.invoice_count, 0), COALESCE(inv.invoice_value, 0),
    COALESCE(est.demand_buyer_count, 0) + COALESCE(ord.demand_buyer_count, 0),
    COALESCE(inv.revenue_buyer_count, 0), v_watermark
  FROM app.campaigns c
  CROSS JOIN app.metrics_v4_period_windows(p_as_of) w
  LEFT JOIN LATERAL (
    SELECT COUNT(*)::bigint AS view_count, COUNT(DISTINCT cv.buyer_id)::bigint AS viewed_buyer_count
    FROM app.campaign_views cv
    WHERE cv.tenant_id = p_tenant_id AND cv.campaign_id = c.id AND cv.deleted_at IS NULL
      AND (cv.viewed_at AT TIME ZONE 'Asia/Kolkata')::date >= w.period_start
      AND (cv.viewed_at AT TIME ZONE 'Asia/Kolkata')::date < w.period_end_exclusive
  ) v ON true
  LEFT JOIN LATERAL (
    SELECT COUNT(*) FILTER (WHERE app.estimate_status_is_open(e.status) OR e.status = 'accepted')::bigint AS estimate_count,
      COALESCE(SUM(e.total_amount) FILTER (WHERE app.estimate_status_is_open(e.status) OR e.status = 'accepted'), 0)::numeric AS estimate_value,
      COUNT(DISTINCT e.buyer_id) FILTER (WHERE app.estimate_status_is_open(e.status) OR e.status = 'accepted')::bigint AS demand_buyer_count
    FROM app.estimates e
    WHERE e.tenant_id = p_tenant_id AND e.campaign_id = c.id AND e.deleted_at IS NULL
      AND app.metric_day_ist(e.estimate_date, e.created_at) >= w.period_start
      AND app.metric_day_ist(e.estimate_date, e.created_at) < w.period_end_exclusive
  ) est ON true
  LEFT JOIN LATERAL (
    SELECT COUNT(*) FILTER (WHERE app.order_status_in_flow(o.status))::bigint AS order_count,
      COALESCE(SUM(o.total_amount) FILTER (WHERE app.order_status_in_flow(o.status)), 0)::numeric AS order_value,
      COUNT(DISTINCT o.buyer_id) FILTER (WHERE app.order_status_in_flow(o.status))::bigint AS demand_buyer_count
    FROM app.orders o
    WHERE o.tenant_id = p_tenant_id AND o.campaign_id = c.id AND o.deleted_at IS NULL
      AND app.metric_day_ist(o.order_date, o.created_at) >= w.period_start
      AND app.metric_day_ist(o.order_date, o.created_at) < w.period_end_exclusive
  ) ord ON true
  LEFT JOIN LATERAL (
    SELECT COUNT(*) FILTER (WHERE app.invoice_status_gmv_included(i.status))::bigint AS invoice_count,
      COALESCE(SUM(i.total_amount) FILTER (WHERE app.invoice_status_gmv_included(i.status)), 0)::numeric AS invoice_value,
      COUNT(DISTINCT i.buyer_id) FILTER (WHERE app.invoice_status_gmv_included(i.status))::bigint AS revenue_buyer_count
    FROM app.invoices i
    JOIN app.orders o ON o.id = i.order_id AND o.campaign_id = c.id
    WHERE i.tenant_id = p_tenant_id AND i.deleted_at IS NULL
      AND app.metric_day_ist(i.invoice_date, i.created_at) >= w.period_start
      AND app.metric_day_ist(i.invoice_date, i.created_at) < w.period_end_exclusive
  ) inv ON true
  WHERE c.tenant_id = p_tenant_id AND c.deleted_at IS NULL AND w.grain IN ('month','quarter')
    AND (COALESCE(v.view_count,0) > 0 OR COALESCE(est.estimate_count,0) > 0 OR COALESCE(ord.order_count,0) > 0 OR COALESCE(inv.invoice_count,0) > 0);
  GET DIAGNOSTICS v_count = ROW_COUNT; v_rows := v_rows + v_count;


  INSERT INTO app.metrics_cohort_period_summary (
    tenant_id, cohort_id, external_ref, grain, period_start, period_end_exclusive,
    member_count, active_member_count, demand_count, demand_value, invoice_count, invoice_value, source_watermark
  )
  SELECT
    p_tenant_id, c.id, concat_ws(':', p_tenant_id::text, c.id::text, w.grain, w.period_start::text),
    w.grain, w.period_start, w.period_end_exclusive,
    COUNT(DISTINCT cm.buyer_id)::bigint,
    COUNT(DISTINCT bps.buyer_id) FILTER (WHERE bps.primary_demand_count > 0)::bigint,
    COALESCE(SUM(bps.primary_demand_count), 0)::bigint,
    COALESCE(SUM(bps.primary_demand_value), 0)::numeric,
    COALESCE(SUM(bps.invoice_count), 0)::bigint,
    COALESCE(SUM(bps.invoice_value), 0)::numeric,
    v_watermark
  FROM app.cohorts c
  CROSS JOIN app.metrics_v4_period_windows(p_as_of) w
  LEFT JOIN app.cohort_members_active cm ON cm.cohort_id = c.id
  LEFT JOIN app.metrics_buyer_period_summary bps
    ON bps.tenant_id = p_tenant_id AND bps.buyer_id = cm.buyer_id
   AND bps.grain = w.grain AND bps.period_start = w.period_start AND bps.deleted_at IS NULL
  WHERE c.tenant_id = p_tenant_id AND c.deleted_at IS NULL AND w.grain IN ('month','quarter')
  GROUP BY c.id, w.grain, w.period_start, w.period_end_exclusive;
  GET DIAGNOSTICS v_count = ROW_COUNT; v_rows := v_rows + v_count;

  RETURN v_rows;
END;
$$;

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
    active_buyer_count, active_brand_count, active_product_count, active_location_count,
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

  RETURN v_rows;
END;
$$;

CREATE OR REPLACE FUNCTION app._metrics_v4_refresh_landing_kpis(
  p_tenant_id uuid,
  p_as_of timestamptz DEFAULT clock_timestamp()
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, app, pg_temp
AS $$
DECLARE
  v_rows integer := 0;
  v_period record;
  v_quarter record;
  v_primary text := app.metrics_v4_primary_demand_kind(p_tenant_id);
  v_now_summary app.metrics_tenant_now_summary%ROWTYPE;
  v_now timestamptz := COALESCE(p_as_of, clock_timestamp());
  v_watermark timestamptz;
  v_due_7_count bigint;
  v_due_7_value numeric;
  v_due_7_buyers bigint;
  v_est_awaiting_count bigint;
  v_est_awaiting_value numeric;
  v_est_awaiting_buyers bigint;
  v_est_expiring_count bigint;
  v_est_expiring_value numeric;
  v_est_expiring_buyers bigint;
  v_ord_waiting_count bigint;
  v_ord_waiting_value numeric;
  v_ord_waiting_buyers bigint;
  v_ord_dispatch_count bigint;
  v_ord_dispatch_value numeric;
  v_ord_dispatch_buyers bigint;
  v_active_customers bigint;
  v_dormant_customers bigint;
  v_top80_customers bigint;
  v_sold_products bigint;
  v_oos_products bigint;
  v_low_products bigint;
  v_no_sale_products bigint;
  v_sold_categories bigint;
  v_oos_categories bigint;
  v_low_categories bigint;
  v_no_sale_categories bigint;
  v_live_campaigns bigint;
  v_live_campaigns_expiring bigint;
  v_campaign_views bigint;
  v_campaign_openers bigint;
  v_campaign_demand_count bigint;
  v_campaign_demand_value numeric;
  v_campaign_demand_buyers bigint;
  v_campaign_invoice_count bigint;
  v_campaign_invoice_value numeric;
  v_campaign_invoice_buyers bigint;
  v_active_groups bigint;
  v_grouped_buyers bigint;
  v_valuable_no_group bigint;
  v_grouped_purchased bigint;
  v_custom_price_products bigint;
  v_custom_price_buyers bigint;
  v_below_base_products bigint;
  v_expiring_price_lists bigint;
  v_active_brands bigint;
  v_top80_brands bigint;
  v_no_sale_brands bigint;
  v_dormant_brands bigint;
  v_top80_locations bigint;
  v_sellable_units numeric;
  v_warehouse_skus bigint;
  v_warehouse_oos bigint;
  v_warehouse_no_sales bigint;
BEGIN
  SELECT * INTO v_period FROM app.metrics_v4_period_bounds('this_month', p_as_of);
  SELECT * INTO v_quarter FROM app.metrics_v4_period_bounds('this_quarter', p_as_of);
  SELECT * INTO v_now_summary FROM app.metrics_tenant_now_summary WHERE tenant_id = p_tenant_id AND deleted_at IS NULL ORDER BY computed_at DESC LIMIT 1;

  SELECT MAX(source_watermark) INTO v_watermark FROM (
    SELECT source_watermark FROM app.metrics_tenant_period_summary WHERE tenant_id = p_tenant_id
    UNION ALL SELECT source_watermark FROM app.metrics_buyer_period_summary WHERE tenant_id = p_tenant_id
    UNION ALL SELECT source_watermark FROM app.metrics_product_period_summary WHERE tenant_id = p_tenant_id
  ) x;

  SELECT
    COUNT(*) FILTER (WHERE app.invoice_status_has_receivable(i.status, i.outstanding_balance) AND i.due_date < v_now + interval '7 days')::bigint,
    COALESCE(SUM(i.outstanding_balance) FILTER (WHERE app.invoice_status_has_receivable(i.status, i.outstanding_balance) AND i.due_date < v_now + interval '7 days'), 0)::numeric,
    COUNT(DISTINCT i.buyer_id) FILTER (WHERE app.invoice_status_has_receivable(i.status, i.outstanding_balance) AND i.due_date < v_now + interval '7 days')::bigint
  INTO v_due_7_count, v_due_7_value, v_due_7_buyers
  FROM app.invoices i WHERE i.tenant_id = p_tenant_id AND i.deleted_at IS NULL;

  SELECT
    COUNT(*) FILTER (WHERE e.status = 'sent' AND COALESCE(e.sent_at, e.created_at) < v_now - interval '3 days')::bigint,
    COALESCE(SUM(e.total_amount) FILTER (WHERE e.status = 'sent' AND COALESCE(e.sent_at, e.created_at) < v_now - interval '3 days'),0)::numeric,
    COUNT(DISTINCT e.buyer_id) FILTER (WHERE e.status = 'sent' AND COALESCE(e.sent_at, e.created_at) < v_now - interval '3 days')::bigint,
    COUNT(*) FILTER (WHERE app.estimate_status_is_open(e.status) AND e.valid_until <= (v_now AT TIME ZONE 'Asia/Kolkata')::date + 7)::bigint,
    COALESCE(SUM(e.total_amount) FILTER (WHERE app.estimate_status_is_open(e.status) AND e.valid_until <= (v_now AT TIME ZONE 'Asia/Kolkata')::date + 7),0)::numeric,
    COUNT(DISTINCT e.buyer_id) FILTER (WHERE app.estimate_status_is_open(e.status) AND e.valid_until <= (v_now AT TIME ZONE 'Asia/Kolkata')::date + 7)::bigint
  INTO v_est_awaiting_count, v_est_awaiting_value, v_est_awaiting_buyers, v_est_expiring_count, v_est_expiring_value, v_est_expiring_buyers
  FROM app.estimates e WHERE e.tenant_id = p_tenant_id AND e.deleted_at IS NULL;

  SELECT
    COUNT(*) FILTER (WHERE o.status = 'received')::bigint,
    COALESCE(SUM(o.total_amount) FILTER (WHERE o.status = 'received'),0)::numeric,
    COUNT(DISTINCT o.buyer_id) FILTER (WHERE o.status = 'received')::bigint,
    COUNT(*) FILTER (WHERE o.status = 'confirmed' AND COALESCE(o.confirmed_at, o.updated_at, o.created_at) < v_now - interval '3 days')::bigint,
    COALESCE(SUM(o.total_amount) FILTER (WHERE o.status = 'confirmed' AND COALESCE(o.confirmed_at, o.updated_at, o.created_at) < v_now - interval '3 days'),0)::numeric,
    COUNT(DISTINCT o.buyer_id) FILTER (WHERE o.status = 'confirmed' AND COALESCE(o.confirmed_at, o.updated_at, o.created_at) < v_now - interval '3 days')::bigint
  INTO v_ord_waiting_count, v_ord_waiting_value, v_ord_waiting_buyers, v_ord_dispatch_count, v_ord_dispatch_value, v_ord_dispatch_buyers
  FROM app.orders o WHERE o.tenant_id = p_tenant_id AND o.deleted_at IS NULL;

  SELECT COUNT(*) FILTER (WHERE bps.invoice_count > 0)::bigint
  INTO v_active_customers
  FROM app.metrics_buyer_period_summary bps
  WHERE bps.tenant_id = p_tenant_id AND bps.grain = 'quarter' AND bps.period_start = v_quarter.period_start AND bps.deleted_at IS NULL;
  SELECT GREATEST(COALESCE(v_now_summary.active_buyer_count, 0) - COALESCE(v_active_customers, 0), 0) INTO v_dormant_customers;
  SELECT COUNT(*)::bigint INTO v_top80_customers FROM (
    SELECT buyer_id, SUM(invoice_value) OVER (ORDER BY invoice_value DESC) AS running,
      SUM(invoice_value) OVER () AS total
    FROM app.metrics_buyer_period_summary
    WHERE tenant_id = p_tenant_id AND grain = 'quarter' AND period_start = v_quarter.period_start AND deleted_at IS NULL AND invoice_value > 0
  ) ranked WHERE total > 0 AND running <= total * 0.8;

  SELECT
    COUNT(*) FILTER (WHERE ps.invoice_count > 0)::bigint,
    COUNT(*) FILTER (WHERE ps.invoice_count > 0 AND COALESCE(snap.available, snap.on_hand, 0) <= 0)::bigint,
    COUNT(*) FILTER (WHERE ps.invoice_count > 0 AND (snap.low_stock OR COALESCE(snap.days_cover, 999999) <= 14))::bigint
  INTO v_sold_products, v_oos_products, v_low_products
  FROM app.metrics_product_period_summary ps
  JOIN app.metrics_product_snapshot snap ON snap.tenant_product_id = ps.tenant_product_id AND snap.tenant_id = p_tenant_id AND snap.deleted_at IS NULL
  WHERE ps.tenant_id = p_tenant_id AND ps.grain = 'quarter' AND ps.period_start = v_quarter.period_start AND ps.deleted_at IS NULL;
  SELECT COUNT(*)::bigint INTO v_no_sale_products
  FROM app.metrics_product_snapshot snap
  WHERE snap.tenant_id = p_tenant_id AND snap.deleted_at IS NULL AND snap.is_active AND COALESCE(snap.available, snap.on_hand, 0) > 0
    AND NOT EXISTS (
      SELECT 1 FROM app.metrics_product_period_summary ps
      WHERE ps.tenant_id = p_tenant_id AND ps.tenant_product_id = snap.tenant_product_id
        AND ps.grain = 'quarter' AND ps.period_start = v_quarter.period_start AND ps.deleted_at IS NULL AND ps.invoice_count > 0
    );

  SELECT COUNT(*) FILTER (WHERE cps.invoice_count > 0)::bigint INTO v_sold_categories
  FROM app.metrics_category_period_summary cps
  WHERE cps.tenant_id = p_tenant_id AND cps.grain = 'quarter' AND cps.period_start = v_quarter.period_start AND cps.deleted_at IS NULL;
  SELECT COUNT(DISTINCT tp.tenant_category_id) FILTER (WHERE snap.out_of_stock)::bigint,
         COUNT(DISTINCT tp.tenant_category_id) FILTER (WHERE snap.low_stock OR COALESCE(snap.days_cover, 999999) <= 14)::bigint
  INTO v_oos_categories, v_low_categories
  FROM app.metrics_product_period_summary ps
  JOIN app.tenant_products tp ON tp.id = ps.tenant_product_id
  JOIN app.metrics_product_snapshot snap ON snap.tenant_product_id = ps.tenant_product_id AND snap.tenant_id = p_tenant_id AND snap.deleted_at IS NULL
  WHERE ps.tenant_id = p_tenant_id AND ps.grain = 'quarter' AND ps.period_start = v_quarter.period_start AND ps.deleted_at IS NULL AND ps.invoice_count > 0;
  SELECT COUNT(*)::bigint INTO v_no_sale_categories
  FROM app.tenant_categories tc
  WHERE tc.tenant_id = p_tenant_id AND tc.deleted_at IS NULL AND tc.is_active
    AND NOT EXISTS (
      SELECT 1 FROM app.metrics_category_period_summary cps
      WHERE cps.tenant_id = p_tenant_id AND cps.tenant_category_id = tc.id
        AND cps.grain = 'quarter' AND cps.period_start = v_quarter.period_start AND cps.deleted_at IS NULL
    );

  SELECT COUNT(*)::bigint,
         COUNT(*) FILTER (WHERE c.valid_to IS NOT NULL AND c.valid_to < v_now + interval '7 days')::bigint
  INTO v_live_campaigns, v_live_campaigns_expiring
  FROM app.campaigns c
  WHERE c.tenant_id = p_tenant_id AND c.deleted_at IS NULL AND c.status = 'published'
    AND c.valid_from <= v_now AND (c.valid_to IS NULL OR c.valid_to >= v_now);
  SELECT
    COALESCE(SUM(view_count),0)::bigint, COALESCE(SUM(viewed_buyer_count),0)::bigint,
    COALESCE(SUM(estimate_count + order_count),0)::bigint, COALESCE(SUM(estimate_value + order_value),0)::numeric,
    COALESCE(SUM(demand_buyer_count),0)::bigint,
    COALESCE(SUM(invoice_count),0)::bigint, COALESCE(SUM(invoice_value),0)::numeric, COALESCE(SUM(revenue_buyer_count),0)::bigint
  INTO v_campaign_views, v_campaign_openers, v_campaign_demand_count, v_campaign_demand_value, v_campaign_demand_buyers,
       v_campaign_invoice_count, v_campaign_invoice_value, v_campaign_invoice_buyers
  FROM app.metrics_campaign_period_summary
  WHERE tenant_id = p_tenant_id AND grain = 'quarter' AND period_start = v_quarter.period_start AND deleted_at IS NULL;

  SELECT COUNT(*)::bigint INTO v_active_groups FROM app.cohorts c WHERE c.tenant_id = p_tenant_id AND c.deleted_at IS NULL;
  SELECT COUNT(DISTINCT cm.buyer_id)::bigint INTO v_grouped_buyers
  FROM app.cohorts c JOIN app.cohort_members_active cm ON cm.cohort_id = c.id
  WHERE c.tenant_id = p_tenant_id AND c.deleted_at IS NULL;
  SELECT COUNT(*)::bigint INTO v_valuable_no_group
  FROM app.metrics_buyer_period_summary bps
  WHERE bps.tenant_id = p_tenant_id AND bps.grain = 'quarter' AND bps.period_start = v_quarter.period_start
    AND bps.deleted_at IS NULL AND bps.invoice_value > 0
    AND NOT EXISTS (SELECT 1 FROM app.cohort_members_active cm WHERE cm.buyer_id = bps.buyer_id);
  SELECT COUNT(DISTINCT cps.cohort_id)::bigint INTO v_grouped_purchased
  FROM app.metrics_cohort_period_summary cps
  WHERE cps.tenant_id = p_tenant_id AND cps.grain = 'quarter' AND cps.period_start = v_quarter.period_start
    AND cps.deleted_at IS NULL AND cps.active_member_count > 0;

  SELECT COUNT(DISTINCT pli.tenant_product_id)::bigint,
         COUNT(DISTINCT pli.tenant_product_id) FILTER (WHERE pli.price < tp.base_selling_price)::bigint
  INTO v_custom_price_products, v_below_base_products
  FROM app.price_list_items pli
  JOIN app.price_lists pl ON pl.id = pli.price_list_id
  JOIN app.tenant_products tp ON tp.id = pli.tenant_product_id
  WHERE pl.tenant_id = p_tenant_id AND pl.deleted_at IS NULL AND pli.deleted_at IS NULL
    AND pl.is_active AND pl.valid_from <= v_now AND (pl.valid_to IS NULL OR pl.valid_to >= v_now);
  SELECT COUNT(DISTINCT buyer_id)::bigint INTO v_custom_price_buyers FROM (
    SELECT pla.target_id AS buyer_id
    FROM app.price_list_assignments pla
    JOIN app.price_lists pl ON pl.id = pla.price_list_id
    WHERE pl.tenant_id = p_tenant_id AND pla.deleted_at IS NULL AND pla.target_type = 'buyer'
      AND pl.deleted_at IS NULL AND pl.is_active AND pl.valid_from <= v_now AND (pl.valid_to IS NULL OR pl.valid_to >= v_now)
    UNION
    SELECT cm.buyer_id
    FROM app.price_list_assignments pla
    JOIN app.price_lists pl ON pl.id = pla.price_list_id
    JOIN app.cohort_members_active cm ON cm.cohort_id = pla.target_id
    WHERE pl.tenant_id = p_tenant_id AND pla.deleted_at IS NULL AND pla.target_type = 'cohort'
      AND pl.deleted_at IS NULL AND pl.is_active AND pl.valid_from <= v_now AND (pl.valid_to IS NULL OR pl.valid_to >= v_now)
  ) x WHERE buyer_id IS NOT NULL;
  SELECT COUNT(*)::bigint INTO v_expiring_price_lists
  FROM app.price_lists pl WHERE pl.tenant_id = p_tenant_id AND pl.deleted_at IS NULL AND pl.is_active
    AND pl.valid_to IS NOT NULL AND pl.valid_to >= v_now AND pl.valid_to < v_now + interval '7 days';

  SELECT COUNT(*)::bigint INTO v_active_brands
  FROM app.metrics_brand_period_summary bps WHERE bps.tenant_id = p_tenant_id AND bps.grain = 'month' AND bps.period_start = v_period.period_start AND bps.deleted_at IS NULL;
  SELECT COUNT(*)::bigint INTO v_top80_brands FROM (
    SELECT tenant_brand_id, SUM(invoice_value) OVER (ORDER BY invoice_value DESC) AS running, SUM(invoice_value) OVER () AS total
    FROM app.metrics_brand_period_summary
    WHERE tenant_id = p_tenant_id AND grain = 'month' AND period_start = v_period.period_start AND deleted_at IS NULL AND invoice_value > 0
  ) ranked WHERE total > 0 AND running <= total * 0.8;
  SELECT GREATEST(COALESCE(v_now_summary.active_brand_count,0) - COALESCE(v_active_brands,0), 0) INTO v_no_sale_brands;
  SELECT COUNT(*)::bigint INTO v_dormant_brands
  FROM app.metrics_brand_period_summary prev
  WHERE prev.tenant_id = p_tenant_id AND prev.grain = 'month' AND prev.period_start = v_period.previous_start AND prev.deleted_at IS NULL
    AND NOT EXISTS (
      SELECT 1 FROM app.metrics_brand_period_summary cur
      WHERE cur.tenant_id = p_tenant_id AND cur.tenant_brand_id = prev.tenant_brand_id
        AND cur.grain = 'month' AND cur.period_start = v_period.period_start AND cur.deleted_at IS NULL
    );

  SELECT COUNT(*)::bigint INTO v_top80_locations FROM (
    SELECT location_id, SUM(invoice_value) OVER (ORDER BY invoice_value DESC) AS running, SUM(invoice_value) OVER () AS total
    FROM app.metrics_location_period_summary
    WHERE tenant_id = p_tenant_id AND grain = 'month' AND period_start = v_period.period_start AND deleted_at IS NULL AND invoice_value > 0
  ) ranked WHERE total > 0 AND running <= total * 0.8;

  SELECT COALESCE(SUM(ws.sellable_units),0), COALESCE(SUM(ws.tracked_skus),0), COALESCE(SUM(ws.stockout_skus),0)
  INTO v_sellable_units, v_warehouse_skus, v_warehouse_oos
  FROM app.warehouses_snapshot ws WHERE ws.tenant_id = p_tenant_id;
  SELECT COUNT(*)::bigint INTO v_warehouse_no_sales
  FROM app.warehouses_snapshot ws
  WHERE ws.tenant_id = p_tenant_id AND ws.sellable_units > 0
    AND NOT EXISTS (
      SELECT 1 FROM app.metrics_warehouse_period_summary wps
      WHERE wps.tenant_id = p_tenant_id AND wps.warehouse_id = ws.warehouse_id
        AND wps.grain = 'quarter' AND wps.period_start = v_quarter.period_start AND wps.deleted_at IS NULL
    );

  v_rows := v_rows + app._metrics_v4_upsert_landing_kpis(p_tenant_id, 'dashboard', 'this_month', v_period.period_start, jsonb_build_array(
    app.metrics_v4_kpi('invoiced_sales', 'Invoiced Sales', COALESCE((SELECT invoice_value FROM app.metrics_tenant_period_summary WHERE tenant_id = p_tenant_id AND grain = 'month' AND period_start = v_period.period_start AND deleted_at IS NULL),0), COALESCE((SELECT invoice_buyer_count FROM app.metrics_tenant_period_summary WHERE tenant_id = p_tenant_id AND grain = 'month' AND period_start = v_period.period_start AND deleted_at IS NULL),0), COALESCE((SELECT invoice_count FROM app.metrics_tenant_period_summary WHERE tenant_id = p_tenant_id AND grain = 'month' AND period_start = v_period.period_start AND deleted_at IS NULL),0), NULL, 'customers and invoices', 'month', jsonb_build_object('target','invoices','date_period','this_month')),
    app.metrics_v4_kpi('demand', 'Demand', COALESCE((SELECT primary_demand_value FROM app.metrics_tenant_period_summary WHERE tenant_id = p_tenant_id AND grain = 'month' AND period_start = v_period.period_start AND deleted_at IS NULL),0), COALESCE((SELECT primary_demand_buyer_count FROM app.metrics_tenant_period_summary WHERE tenant_id = p_tenant_id AND grain = 'month' AND period_start = v_period.period_start AND deleted_at IS NULL),0), COALESCE((SELECT primary_demand_count FROM app.metrics_tenant_period_summary WHERE tenant_id = p_tenant_id AND grain = 'month' AND period_start = v_period.period_start AND deleted_at IS NULL),0), NULL, 'customers and demand documents', 'month', jsonb_build_object('target', v_primary, 'date_period','this_month')),
    app.metrics_v4_kpi('outstanding_dues', 'Outstanding dues', COALESCE(v_now_summary.receivable_amount,0), COALESCE((SELECT COUNT(*) FROM app.metrics_buyer_now_summary WHERE tenant_id = p_tenant_id AND receivable_amount > 0 AND deleted_at IS NULL),0), COALESCE(v_now_summary.receivable_invoice_count,0), NULL, 'customers and invoices', 'now', jsonb_build_object('target','invoices','balance_gt',0)),
    app.metrics_v4_kpi('overdue_receivables', 'Overdue receivables', COALESCE(v_now_summary.overdue_amount,0), COALESCE((SELECT COUNT(*) FROM app.metrics_buyer_now_summary WHERE tenant_id = p_tenant_id AND overdue_amount > 0 AND deleted_at IS NULL),0), COALESCE(v_now_summary.overdue_invoice_count,0), NULL, 'customers and invoices', 'now', jsonb_build_object('target','invoices','overdue',true))
  ), v_watermark);

  v_rows := v_rows + app._metrics_v4_upsert_landing_kpis(p_tenant_id, 'estimates', 'this_month', v_period.period_start, jsonb_build_array(
    app.metrics_v4_kpi('estimate_value_created', 'Estimate value created', COALESCE((SELECT estimate_value FROM app.metrics_tenant_period_summary WHERE tenant_id = p_tenant_id AND grain = 'month' AND period_start = v_period.period_start AND deleted_at IS NULL),0), COALESCE((SELECT estimate_buyer_count FROM app.metrics_tenant_period_summary WHERE tenant_id = p_tenant_id AND grain = 'month' AND period_start = v_period.period_start AND deleted_at IS NULL),0), COALESCE((SELECT estimate_count FROM app.metrics_tenant_period_summary WHERE tenant_id = p_tenant_id AND grain = 'month' AND period_start = v_period.period_start AND deleted_at IS NULL),0), NULL, 'customers and estimates', 'month', jsonb_build_object('date_period','this_month')),
    app.metrics_v4_kpi('open_estimates', 'Open estimates', COALESCE(v_now_summary.open_estimate_value,0), COALESCE((SELECT COUNT(DISTINCT buyer_id) FROM app.estimates WHERE tenant_id = p_tenant_id AND deleted_at IS NULL AND app.estimate_status_is_open(status)),0), COALESCE(v_now_summary.open_estimate_count,0), NULL, 'customers and estimates', 'now', jsonb_build_object('status','open')),
    app.metrics_v4_kpi('awaiting_action_3d', 'Awaiting action 3+ days', v_est_awaiting_value, v_est_awaiting_buyers, v_est_awaiting_count, NULL, 'customers and estimates', 'now', jsonb_build_object('status','sent','age_gte_days',3)),
    app.metrics_v4_kpi('expiring_7d', 'Expiring in 7 days', v_est_expiring_value, v_est_expiring_buyers, v_est_expiring_count, NULL, 'customers and estimates', 'now', jsonb_build_object('expiry_lte_days',7))
  ), v_watermark);

  v_rows := v_rows + app._metrics_v4_upsert_landing_kpis(p_tenant_id, 'orders', 'this_month', v_period.period_start, jsonb_build_array(
    app.metrics_v4_kpi('order_value_created', 'Order value created', COALESCE((SELECT order_value FROM app.metrics_tenant_period_summary WHERE tenant_id = p_tenant_id AND grain = 'month' AND period_start = v_period.period_start AND deleted_at IS NULL),0), COALESCE((SELECT order_buyer_count FROM app.metrics_tenant_period_summary WHERE tenant_id = p_tenant_id AND grain = 'month' AND period_start = v_period.period_start AND deleted_at IS NULL),0), COALESCE((SELECT order_count FROM app.metrics_tenant_period_summary WHERE tenant_id = p_tenant_id AND grain = 'month' AND period_start = v_period.period_start AND deleted_at IS NULL),0), NULL, 'customers and orders', 'month', jsonb_build_object('date_period','this_month')),
    app.metrics_v4_kpi('open_orders', 'Open orders', COALESCE(v_now_summary.open_order_value,0), COALESCE((SELECT COUNT(DISTINCT buyer_id) FROM app.orders WHERE tenant_id = p_tenant_id AND deleted_at IS NULL AND app.order_status_is_open(status)),0), COALESCE(v_now_summary.open_order_count,0), NULL, 'customers and orders', 'now', jsonb_build_object('status','open')),
    app.metrics_v4_kpi('waiting_confirmation', 'Waiting for confirmation', v_ord_waiting_value, v_ord_waiting_buyers, v_ord_waiting_count, NULL, 'customers and orders', 'now', jsonb_build_object('status','received')),
    app.metrics_v4_kpi('awaiting_dispatch_3d', 'Awaiting dispatch 3+ days', v_ord_dispatch_value, v_ord_dispatch_buyers, v_ord_dispatch_count, NULL, 'customers and orders', 'now', jsonb_build_object('status','confirmed','age_gte_days',3))
  ), v_watermark);

  v_rows := v_rows + app._metrics_v4_upsert_landing_kpis(p_tenant_id, 'invoices', 'this_month', v_period.period_start, jsonb_build_array(
    app.metrics_v4_kpi('invoiced_sales', 'Invoiced Sales', COALESCE((SELECT invoice_value FROM app.metrics_tenant_period_summary WHERE tenant_id = p_tenant_id AND grain = 'month' AND period_start = v_period.period_start AND deleted_at IS NULL),0), COALESCE((SELECT invoice_buyer_count FROM app.metrics_tenant_period_summary WHERE tenant_id = p_tenant_id AND grain = 'month' AND period_start = v_period.period_start AND deleted_at IS NULL),0), COALESCE((SELECT invoice_count FROM app.metrics_tenant_period_summary WHERE tenant_id = p_tenant_id AND grain = 'month' AND period_start = v_period.period_start AND deleted_at IS NULL),0), NULL, 'customers and invoices', 'month', jsonb_build_object('date_period','this_month')),
    app.metrics_v4_kpi('outstanding_dues', 'Outstanding dues', COALESCE(v_now_summary.receivable_amount,0), COALESCE((SELECT COUNT(*) FROM app.metrics_buyer_now_summary WHERE tenant_id = p_tenant_id AND receivable_amount > 0 AND deleted_at IS NULL),0), COALESCE(v_now_summary.receivable_invoice_count,0), NULL, 'customers and invoices', 'now', jsonb_build_object('balance_gt',0)),
    app.metrics_v4_kpi('overdue_receivables', 'Overdue receivables', COALESCE(v_now_summary.overdue_amount,0), COALESCE((SELECT COUNT(*) FROM app.metrics_buyer_now_summary WHERE tenant_id = p_tenant_id AND overdue_amount > 0 AND deleted_at IS NULL),0), COALESCE(v_now_summary.overdue_invoice_count,0), NULL, 'customers and invoices', 'now', jsonb_build_object('overdue',true)),
    app.metrics_v4_kpi('due_7d', 'Due in 7 days', v_due_7_value, v_due_7_buyers, v_due_7_count, NULL, 'customers and invoices', 'now', jsonb_build_object('due_lte_days',7))
  ), v_watermark);

  v_rows := v_rows + app._metrics_v4_upsert_landing_kpis(p_tenant_id, 'customers', 'this_quarter', v_quarter.period_start, jsonb_build_array(
    app.metrics_v4_kpi('active_customers', 'Active Customers', v_active_customers, v_active_customers, NULL, NULL, 'purchased at least once', 'quarter', jsonb_build_object('purchased_gte',1,'period','this_quarter')),
    app.metrics_v4_kpi('dormant_customers', 'Dormant Customers', v_dormant_customers, v_dormant_customers, NULL, NULL, 'no purchase in quarter', 'quarter', jsonb_build_object('dormant_period','this_quarter')),
    app.metrics_v4_kpi('overdue_receivables', 'Overdue receivables', COALESCE(v_now_summary.overdue_amount,0), COALESCE((SELECT COUNT(*) FROM app.metrics_buyer_now_summary WHERE tenant_id = p_tenant_id AND overdue_amount > 0 AND deleted_at IS NULL),0), COALESCE(v_now_summary.overdue_invoice_count,0), NULL, 'customers and invoices', 'now', jsonb_build_object('overdue',true)),
    app.metrics_v4_kpi('top80_customers', 'Top customers driving 80% of revenue', v_top80_customers, v_top80_customers, NULL, NULL, 'customers in revenue concentration set', 'quarter', jsonb_build_object('sort','invoice_value_desc','cutoff','top80'))
  ), v_watermark);

  v_rows := v_rows + app._metrics_v4_upsert_landing_kpis(p_tenant_id, 'products', 'this_quarter', v_quarter.period_start, jsonb_build_array(
    app.metrics_v4_kpi('products_sold', 'Products that sold', v_sold_products, v_sold_products, NULL, NULL, 'products sold in quarter', 'quarter', jsonb_build_object('sold_gte',1,'period','this_quarter')),
    app.metrics_v4_kpi('recently_sold_oos', 'Recently sold, now out of stock', v_oos_products, v_oos_products, NULL, NULL, 'sold QTD and stock is zero', 'quarter_now', jsonb_build_object('sold_period','this_quarter','stock','out')),
    app.metrics_v4_kpi('running_low', 'Products running low', v_low_products, v_low_products, NULL, NULL, 'sold QTD and low stock', 'quarter_now', jsonb_build_object('sold_period','this_quarter','stock','low')),
    app.metrics_v4_kpi('did_not_sell', 'Products that did not sell', v_no_sale_products, v_no_sale_products, NULL, NULL, 'stocked products with no QTD sale', 'quarter_now', jsonb_build_object('not_sold_period','this_quarter','stock_gt',0))
  ), v_watermark);

  v_rows := v_rows + app._metrics_v4_upsert_landing_kpis(p_tenant_id, 'buyer_app', 'this_month', v_period.period_start, jsonb_build_array(
    app.metrics_v4_kpi('customers_with_access', 'Customers with app access', COALESCE(v_now_summary.enabled_buyer_count,0), COALESCE(v_now_summary.enabled_buyer_count,0), NULL, NULL, 'enabled customers', 'now', jsonb_build_object('buyer_app_enabled',true)),
    app.metrics_v4_kpi('customers_submitting_app_demand', 'Customers submitting App Demand', COALESCE((SELECT app_estimate_buyer_count + app_order_buyer_count FROM app.metrics_tenant_period_summary WHERE tenant_id = p_tenant_id AND grain = 'month' AND period_start = v_period.period_start AND deleted_at IS NULL),0), COALESCE((SELECT app_estimate_buyer_count + app_order_buyer_count FROM app.metrics_tenant_period_summary WHERE tenant_id = p_tenant_id AND grain = 'month' AND period_start = v_period.period_start AND deleted_at IS NULL),0), NULL, NULL, 'enabled customers with demand', 'month', jsonb_build_object('source','buyer_app','period','this_month')),
    app.metrics_v4_kpi('app_sourced_demand', 'App-sourced Demand', COALESCE((SELECT app_estimate_value + app_order_value FROM app.metrics_tenant_period_summary WHERE tenant_id = p_tenant_id AND grain = 'month' AND period_start = v_period.period_start AND deleted_at IS NULL),0), COALESCE((SELECT app_estimate_buyer_count + app_order_buyer_count FROM app.metrics_tenant_period_summary WHERE tenant_id = p_tenant_id AND grain = 'month' AND period_start = v_period.period_start AND deleted_at IS NULL),0), COALESCE((SELECT app_estimate_count + app_order_count FROM app.metrics_tenant_period_summary WHERE tenant_id = p_tenant_id AND grain = 'month' AND period_start = v_period.period_start AND deleted_at IS NULL),0), NULL, 'customers and demand docs', 'month', jsonb_build_object('source','buyer_app','period','this_month')),
    app.metrics_v4_kpi('repeat_app_customers', 'Repeat App Customers', COALESCE((SELECT COUNT(*) FROM app.metrics_buyer_period_summary WHERE tenant_id = p_tenant_id AND grain = 'quarter' AND period_start = v_quarter.period_start AND app_demand_count >= 2 AND deleted_at IS NULL),0), COALESCE((SELECT COUNT(*) FROM app.metrics_buyer_period_summary WHERE tenant_id = p_tenant_id AND grain = 'quarter' AND period_start = v_quarter.period_start AND app_demand_count >= 2 AND deleted_at IS NULL),0), NULL, NULL, 'two or more app demand docs', 'quarter', jsonb_build_object('source','buyer_app','demand_count_gte',2,'period','this_quarter'))
  ), v_watermark);

  v_rows := v_rows + app._metrics_v4_upsert_landing_kpis(p_tenant_id, 'campaigns', 'this_quarter', v_quarter.period_start, jsonb_build_array(
    app.metrics_v4_kpi('live_campaigns', 'Live Campaigns', v_live_campaigns, v_live_campaigns, NULL, v_live_campaigns_expiring, 'expiring in 7 days', 'now', jsonb_build_object('status','live')),
    app.metrics_v4_kpi('campaign_open_rate', 'Campaign Open rate', v_campaign_openers, v_campaign_openers, v_campaign_views, NULL, 'customers viewed', 'quarter', jsonb_build_object('period','this_quarter','has_views',true)),
    app.metrics_v4_kpi('campaign_demand', 'Campaign demand', v_campaign_demand_value, v_campaign_demand_buyers, v_campaign_demand_count, NULL, 'customers and demand docs', 'quarter', jsonb_build_object('period','this_quarter','has_demand',true)),
    app.metrics_v4_kpi('campaign_revenue', 'Campaign revenue', v_campaign_invoice_value, v_campaign_invoice_buyers, v_campaign_invoice_count, NULL, 'customers and invoices', 'quarter', jsonb_build_object('period','this_quarter','has_revenue',true))
  ), v_watermark);

  v_rows := v_rows + app._metrics_v4_upsert_landing_kpis(p_tenant_id, 'customer_groups', 'this_quarter', v_quarter.period_start, jsonb_build_array(
    app.metrics_v4_kpi('active_groups', 'Active groups', v_active_groups, v_active_groups, NULL, v_grouped_buyers, 'assigned customers', 'now', jsonb_build_object('status','active')),
    app.metrics_v4_kpi('customers_assigned', 'Customers assigned to a group', v_grouped_buyers, v_grouped_buyers, NULL, COALESCE(v_now_summary.active_buyer_count,0), 'of total customers', 'now', jsonb_build_object('group','not_null')),
    app.metrics_v4_kpi('valuable_no_group', 'Valuable customers in no group', v_valuable_no_group, v_valuable_no_group, NULL, NULL, 'top revenue customers without group', 'quarter_now', jsonb_build_object('group','none','valuable_period','this_quarter')),
    app.metrics_v4_kpi('grouped_purchased', 'Grouped customers who purchased', v_grouped_purchased, v_grouped_purchased, NULL, NULL, 'groups with purchasing members', 'quarter', jsonb_build_object('member_purchased_period','this_quarter'))
  ), v_watermark);

  v_rows := v_rows + app._metrics_v4_upsert_landing_kpis(p_tenant_id, 'price_lists', 'now', (v_now AT TIME ZONE 'Asia/Kolkata')::date, jsonb_build_array(
    app.metrics_v4_kpi('custom_price_products', 'Products with custom prices', v_custom_price_products, v_custom_price_products, NULL, COALESCE(v_now_summary.active_product_count,0), 'of all products', 'now', jsonb_build_object('has_custom_price',true)),
    app.metrics_v4_kpi('custom_price_customers', 'Customers with custom pricing', v_custom_price_buyers, v_custom_price_buyers, NULL, COALESCE(v_now_summary.active_buyer_count,0), 'direct or cohort assignment', 'now', jsonb_build_object('has_custom_pricing',true)),
    app.metrics_v4_kpi('below_base_products', 'Products below base rate', v_below_base_products, v_below_base_products, NULL, NULL, 'active overrides below base', 'now', jsonb_build_object('price_below_base',true)),
    app.metrics_v4_kpi('expiring_7d', 'Price lists expiring in 7 days', v_expiring_price_lists, v_expiring_price_lists, NULL, NULL, 'active price lists', 'now', jsonb_build_object('expiry_lte_days',7))
  ), v_watermark);

  v_rows := v_rows + app._metrics_v4_upsert_landing_kpis(p_tenant_id, 'brands', 'this_month', v_period.period_start, jsonb_build_array(
    app.metrics_v4_kpi('active_brands', 'Active brands', v_active_brands, v_active_brands, NULL, COALESCE(v_now_summary.active_brand_count,0), 'of all brands', 'month', jsonb_build_object('sold_period','this_month')),
    app.metrics_v4_kpi('top80_brands', 'Top 80% brands', v_top80_brands, v_top80_brands, NULL, NULL, 'brands in revenue concentration set', 'month', jsonb_build_object('sort','invoice_value_desc','cutoff','top80')),
    app.metrics_v4_kpi('did_not_sell', 'Brands that did not sell', v_no_sale_brands, v_no_sale_brands, NULL, NULL, 'no selected-period sale', 'month', jsonb_build_object('not_sold_period','this_month')),
    app.metrics_v4_kpi('dormant_brands', 'Dormant brands', v_dormant_brands, v_dormant_brands, NULL, NULL, 'sold last month not this month', 'month', jsonb_build_object('sold_previous_period',true,'sold_current_period',false))
  ), v_watermark);

  v_rows := v_rows + app._metrics_v4_upsert_landing_kpis(p_tenant_id, 'locations', 'this_month', v_period.period_start, jsonb_build_array(
    app.metrics_v4_kpi('invoiced_sales', 'Invoiced Sales', COALESCE((SELECT SUM(invoice_value) FROM app.metrics_location_period_summary WHERE tenant_id = p_tenant_id AND grain = 'month' AND period_start = v_period.period_start AND deleted_at IS NULL),0), COALESCE((SELECT COUNT(*) FROM app.metrics_location_period_summary WHERE tenant_id = p_tenant_id AND grain = 'month' AND period_start = v_period.period_start AND invoice_value > 0 AND deleted_at IS NULL),0), COALESCE((SELECT SUM(invoice_count)::bigint FROM app.metrics_location_period_summary WHERE tenant_id = p_tenant_id AND grain = 'month' AND period_start = v_period.period_start AND deleted_at IS NULL),0), NULL, 'locations and invoices', 'month', jsonb_build_object('target','invoices','period','this_month')),
    app.metrics_v4_kpi('open_demand', 'Open demand', COALESCE(v_now_summary.open_estimate_value,0) + COALESCE(v_now_summary.open_order_value,0), COALESCE((SELECT COUNT(*) FROM app.metrics_location_now_summary WHERE tenant_id = p_tenant_id AND (open_estimate_count + open_order_count) > 0 AND deleted_at IS NULL),0), COALESCE(v_now_summary.open_estimate_count,0) + COALESCE(v_now_summary.open_order_count,0), NULL, 'locations and demand docs', 'now', jsonb_build_object('open_demand',true)),
    app.metrics_v4_kpi('overdue_receivables', 'Overdue receivables', COALESCE(v_now_summary.overdue_amount,0), COALESCE((SELECT COUNT(*) FROM app.metrics_location_now_summary WHERE tenant_id = p_tenant_id AND overdue_amount > 0 AND deleted_at IS NULL),0), COALESCE(v_now_summary.overdue_invoice_count,0), NULL, 'locations', 'now', jsonb_build_object('overdue',true)),
    app.metrics_v4_kpi('top80_locations', 'Top 80% locations', v_top80_locations, v_top80_locations, NULL, NULL, 'locations in revenue concentration set', 'month', jsonb_build_object('sort','invoice_value_desc','cutoff','top80'))
  ), v_watermark);

  v_rows := v_rows + app._metrics_v4_upsert_landing_kpis(p_tenant_id, 'warehouses', 'this_quarter', v_quarter.period_start, jsonb_build_array(
    app.metrics_v4_kpi('sellable_units', 'Sellable Units in stock', v_sellable_units, COALESCE(v_warehouse_skus,0), NULL, NULL, 'products in warehouses', 'now', jsonb_build_object('stock','sellable')),
    app.metrics_v4_kpi('unique_skus', 'Unique SKUs across warehouses', COALESCE(v_warehouse_skus,0), COALESCE(v_now_summary.active_warehouse_count,0), NULL, NULL, 'warehouses', 'now', jsonb_build_object('context','unique_skus')),
    app.metrics_v4_kpi('recently_sold_oos', 'Recently sold, now out of stock', COALESCE(v_warehouse_oos,0), COALESCE(v_warehouse_oos,0), NULL, NULL, 'warehouses with stockouts', 'quarter_now', jsonb_build_object('sold_period','this_quarter','stock','out')),
    app.metrics_v4_kpi('no_sales', 'No sales in period', v_warehouse_no_sales, v_warehouse_no_sales, NULL, NULL, 'stocked warehouses with no QTD sale', 'quarter_now', jsonb_build_object('not_sold_period','this_quarter','stock_gt',0))
  ), v_watermark);

  v_rows := v_rows + app._metrics_v4_upsert_landing_kpis(p_tenant_id, 'categories', 'this_quarter', v_quarter.period_start, jsonb_build_array(
    app.metrics_v4_kpi('categories_sold', 'Categories that sold', v_sold_categories, v_sold_categories, NULL, COALESCE(v_now_summary.active_category_count,0), 'of all categories', 'quarter', jsonb_build_object('sold_period','this_quarter')),
    app.metrics_v4_kpi('recently_sold_oos', 'Recently sold, now out of stock', v_oos_categories, v_oos_categories, NULL, NULL, 'sold QTD and stock is zero', 'quarter_now', jsonb_build_object('sold_period','this_quarter','stock','out')),
    app.metrics_v4_kpi('running_low', 'Categories running low', v_low_categories, v_low_categories, NULL, NULL, 'sold QTD and low stock', 'quarter_now', jsonb_build_object('sold_period','this_quarter','stock','low')),
    app.metrics_v4_kpi('did_not_sell', 'Categories that did not sell', v_no_sale_categories, v_no_sale_categories, NULL, NULL, 'no QTD sale', 'quarter_now', jsonb_build_object('not_sold_period','this_quarter','stock_gt',0))
  ), v_watermark);

  -- Selector-driven landing pages: materialize every supported selector period
  -- from period summaries so card reads stay O(1) after the frontend split.
  FOR v_period IN SELECT * FROM app.metrics_v4_period_windows(p_as_of)
  LOOP
    v_rows := v_rows + app._metrics_v4_upsert_landing_kpis(p_tenant_id, 'dashboard', v_period.period_key, v_period.period_start, jsonb_build_array(
      app.metrics_v4_kpi('invoiced_sales', 'Invoiced Sales', COALESCE((SELECT invoice_value FROM app.metrics_tenant_period_summary WHERE tenant_id = p_tenant_id AND grain = v_period.grain AND period_start = v_period.period_start AND deleted_at IS NULL),0), COALESCE((SELECT invoice_buyer_count FROM app.metrics_tenant_period_summary WHERE tenant_id = p_tenant_id AND grain = v_period.grain AND period_start = v_period.period_start AND deleted_at IS NULL),0), COALESCE((SELECT invoice_count FROM app.metrics_tenant_period_summary WHERE tenant_id = p_tenant_id AND grain = v_period.grain AND period_start = v_period.period_start AND deleted_at IS NULL),0), NULL, 'customers and invoices', v_period.grain, jsonb_build_object('target','invoices','date_period',v_period.period_key)),
      app.metrics_v4_kpi('demand', 'Demand', COALESCE((SELECT primary_demand_value FROM app.metrics_tenant_period_summary WHERE tenant_id = p_tenant_id AND grain = v_period.grain AND period_start = v_period.period_start AND deleted_at IS NULL),0), COALESCE((SELECT primary_demand_buyer_count FROM app.metrics_tenant_period_summary WHERE tenant_id = p_tenant_id AND grain = v_period.grain AND period_start = v_period.period_start AND deleted_at IS NULL),0), COALESCE((SELECT primary_demand_count FROM app.metrics_tenant_period_summary WHERE tenant_id = p_tenant_id AND grain = v_period.grain AND period_start = v_period.period_start AND deleted_at IS NULL),0), NULL, 'customers and demand documents', v_period.grain, jsonb_build_object('target', v_primary, 'date_period',v_period.period_key)),
      app.metrics_v4_kpi('outstanding_dues', 'Outstanding dues', COALESCE(v_now_summary.receivable_amount,0), COALESCE((SELECT COUNT(*) FROM app.metrics_buyer_now_summary WHERE tenant_id = p_tenant_id AND receivable_amount > 0 AND deleted_at IS NULL),0), COALESCE(v_now_summary.receivable_invoice_count,0), NULL, 'customers and invoices', 'now', jsonb_build_object('target','invoices','balance_gt',0)),
      app.metrics_v4_kpi('overdue_receivables', 'Overdue receivables', COALESCE(v_now_summary.overdue_amount,0), COALESCE((SELECT COUNT(*) FROM app.metrics_buyer_now_summary WHERE tenant_id = p_tenant_id AND overdue_amount > 0 AND deleted_at IS NULL),0), COALESCE(v_now_summary.overdue_invoice_count,0), NULL, 'customers and invoices', 'now', jsonb_build_object('target','invoices','overdue',true))
    ), v_watermark);

    v_rows := v_rows + app._metrics_v4_upsert_landing_kpis(p_tenant_id, 'estimates', v_period.period_key, v_period.period_start, jsonb_build_array(
      app.metrics_v4_kpi('estimate_value_created', 'Estimate value created', COALESCE((SELECT estimate_value FROM app.metrics_tenant_period_summary WHERE tenant_id = p_tenant_id AND grain = v_period.grain AND period_start = v_period.period_start AND deleted_at IS NULL),0), COALESCE((SELECT estimate_buyer_count FROM app.metrics_tenant_period_summary WHERE tenant_id = p_tenant_id AND grain = v_period.grain AND period_start = v_period.period_start AND deleted_at IS NULL),0), COALESCE((SELECT estimate_count FROM app.metrics_tenant_period_summary WHERE tenant_id = p_tenant_id AND grain = v_period.grain AND period_start = v_period.period_start AND deleted_at IS NULL),0), NULL, 'customers and estimates', v_period.grain, jsonb_build_object('date_period',v_period.period_key)),
      app.metrics_v4_kpi('open_estimates', 'Open estimates', COALESCE(v_now_summary.open_estimate_value,0), COALESCE((SELECT COUNT(DISTINCT buyer_id) FROM app.estimates WHERE tenant_id = p_tenant_id AND deleted_at IS NULL AND app.estimate_status_is_open(status)),0), COALESCE(v_now_summary.open_estimate_count,0), NULL, 'customers and estimates', 'now', jsonb_build_object('status','open')),
      app.metrics_v4_kpi('awaiting_action_3d', 'Awaiting action 3+ days', v_est_awaiting_value, v_est_awaiting_buyers, v_est_awaiting_count, NULL, 'customers and estimates', 'now', jsonb_build_object('status','sent','age_gte_days',3)),
      app.metrics_v4_kpi('expiring_7d', 'Expiring in 7 days', v_est_expiring_value, v_est_expiring_buyers, v_est_expiring_count, NULL, 'customers and estimates', 'now', jsonb_build_object('expiry_lte_days',7))
    ), v_watermark);

    v_rows := v_rows + app._metrics_v4_upsert_landing_kpis(p_tenant_id, 'orders', v_period.period_key, v_period.period_start, jsonb_build_array(
      app.metrics_v4_kpi('order_value_created', 'Order value created', COALESCE((SELECT order_value FROM app.metrics_tenant_period_summary WHERE tenant_id = p_tenant_id AND grain = v_period.grain AND period_start = v_period.period_start AND deleted_at IS NULL),0), COALESCE((SELECT order_buyer_count FROM app.metrics_tenant_period_summary WHERE tenant_id = p_tenant_id AND grain = v_period.grain AND period_start = v_period.period_start AND deleted_at IS NULL),0), COALESCE((SELECT order_count FROM app.metrics_tenant_period_summary WHERE tenant_id = p_tenant_id AND grain = v_period.grain AND period_start = v_period.period_start AND deleted_at IS NULL),0), NULL, 'customers and orders', v_period.grain, jsonb_build_object('date_period',v_period.period_key)),
      app.metrics_v4_kpi('open_orders', 'Open orders', COALESCE(v_now_summary.open_order_value,0), COALESCE((SELECT COUNT(DISTINCT buyer_id) FROM app.orders WHERE tenant_id = p_tenant_id AND deleted_at IS NULL AND app.order_status_is_open(status)),0), COALESCE(v_now_summary.open_order_count,0), NULL, 'customers and orders', 'now', jsonb_build_object('status','open')),
      app.metrics_v4_kpi('waiting_confirmation', 'Waiting for confirmation', v_ord_waiting_value, v_ord_waiting_buyers, v_ord_waiting_count, NULL, 'customers and orders', 'now', jsonb_build_object('status','received')),
      app.metrics_v4_kpi('awaiting_dispatch_3d', 'Awaiting dispatch 3+ days', v_ord_dispatch_value, v_ord_dispatch_buyers, v_ord_dispatch_count, NULL, 'customers and orders', 'now', jsonb_build_object('status','confirmed','age_gte_days',3))
    ), v_watermark);

    v_rows := v_rows + app._metrics_v4_upsert_landing_kpis(p_tenant_id, 'invoices', v_period.period_key, v_period.period_start, jsonb_build_array(
      app.metrics_v4_kpi('invoiced_sales', 'Invoiced Sales', COALESCE((SELECT invoice_value FROM app.metrics_tenant_period_summary WHERE tenant_id = p_tenant_id AND grain = v_period.grain AND period_start = v_period.period_start AND deleted_at IS NULL),0), COALESCE((SELECT invoice_buyer_count FROM app.metrics_tenant_period_summary WHERE tenant_id = p_tenant_id AND grain = v_period.grain AND period_start = v_period.period_start AND deleted_at IS NULL),0), COALESCE((SELECT invoice_count FROM app.metrics_tenant_period_summary WHERE tenant_id = p_tenant_id AND grain = v_period.grain AND period_start = v_period.period_start AND deleted_at IS NULL),0), NULL, 'customers and invoices', v_period.grain, jsonb_build_object('date_period',v_period.period_key)),
      app.metrics_v4_kpi('outstanding_dues', 'Outstanding dues', COALESCE(v_now_summary.receivable_amount,0), COALESCE((SELECT COUNT(*) FROM app.metrics_buyer_now_summary WHERE tenant_id = p_tenant_id AND receivable_amount > 0 AND deleted_at IS NULL),0), COALESCE(v_now_summary.receivable_invoice_count,0), NULL, 'customers and invoices', 'now', jsonb_build_object('balance_gt',0)),
      app.metrics_v4_kpi('overdue_receivables', 'Overdue receivables', COALESCE(v_now_summary.overdue_amount,0), COALESCE((SELECT COUNT(*) FROM app.metrics_buyer_now_summary WHERE tenant_id = p_tenant_id AND overdue_amount > 0 AND deleted_at IS NULL),0), COALESCE(v_now_summary.overdue_invoice_count,0), NULL, 'customers and invoices', 'now', jsonb_build_object('overdue',true)),
      app.metrics_v4_kpi('due_7d', 'Due in 7 days', v_due_7_value, v_due_7_buyers, v_due_7_count, NULL, 'customers and invoices', 'now', jsonb_build_object('due_lte_days',7))
    ), v_watermark);

    v_rows := v_rows + app._metrics_v4_upsert_landing_kpis(p_tenant_id, 'buyer_app', v_period.period_key, v_period.period_start, jsonb_build_array(
      app.metrics_v4_kpi('customers_with_access', 'Customers with app access', COALESCE(v_now_summary.enabled_buyer_count,0), COALESCE(v_now_summary.enabled_buyer_count,0), NULL, NULL, 'enabled customers', 'now', jsonb_build_object('buyer_app_enabled',true)),
      app.metrics_v4_kpi('customers_submitting_app_demand', 'Customers submitting App Demand', COALESCE((SELECT app_estimate_buyer_count + app_order_buyer_count FROM app.metrics_tenant_period_summary WHERE tenant_id = p_tenant_id AND grain = v_period.grain AND period_start = v_period.period_start AND deleted_at IS NULL),0), COALESCE((SELECT app_estimate_buyer_count + app_order_buyer_count FROM app.metrics_tenant_period_summary WHERE tenant_id = p_tenant_id AND grain = v_period.grain AND period_start = v_period.period_start AND deleted_at IS NULL),0), NULL, NULL, 'enabled customers with demand', v_period.grain, jsonb_build_object('source','buyer_app','period',v_period.period_key)),
      app.metrics_v4_kpi('app_sourced_demand', 'App-sourced Demand', COALESCE((SELECT app_estimate_value + app_order_value FROM app.metrics_tenant_period_summary WHERE tenant_id = p_tenant_id AND grain = v_period.grain AND period_start = v_period.period_start AND deleted_at IS NULL),0), COALESCE((SELECT app_estimate_buyer_count + app_order_buyer_count FROM app.metrics_tenant_period_summary WHERE tenant_id = p_tenant_id AND grain = v_period.grain AND period_start = v_period.period_start AND deleted_at IS NULL),0), COALESCE((SELECT app_estimate_count + app_order_count FROM app.metrics_tenant_period_summary WHERE tenant_id = p_tenant_id AND grain = v_period.grain AND period_start = v_period.period_start AND deleted_at IS NULL),0), NULL, 'customers and demand docs', v_period.grain, jsonb_build_object('source','buyer_app','period',v_period.period_key)),
      app.metrics_v4_kpi('repeat_app_customers', 'Repeat App Customers', COALESCE((SELECT COUNT(*) FROM app.metrics_buyer_period_summary WHERE tenant_id = p_tenant_id AND grain = 'quarter' AND period_start = v_quarter.period_start AND app_demand_count >= 2 AND deleted_at IS NULL),0), COALESCE((SELECT COUNT(*) FROM app.metrics_buyer_period_summary WHERE tenant_id = p_tenant_id AND grain = 'quarter' AND period_start = v_quarter.period_start AND app_demand_count >= 2 AND deleted_at IS NULL),0), NULL, NULL, 'two or more app demand docs', 'quarter', jsonb_build_object('source','buyer_app','demand_count_gte',2,'period','this_quarter'))
    ), v_watermark);

    IF v_period.grain IN ('month','quarter') THEN
      v_rows := v_rows + app._metrics_v4_upsert_landing_kpis(p_tenant_id, 'brands', v_period.period_key, v_period.period_start, jsonb_build_array(
        app.metrics_v4_kpi('active_brands', 'Active brands', COALESCE((SELECT COUNT(*) FROM app.metrics_brand_period_summary WHERE tenant_id = p_tenant_id AND grain = v_period.grain AND period_start = v_period.period_start AND deleted_at IS NULL),0), COALESCE((SELECT COUNT(*) FROM app.metrics_brand_period_summary WHERE tenant_id = p_tenant_id AND grain = v_period.grain AND period_start = v_period.period_start AND deleted_at IS NULL),0), NULL, COALESCE(v_now_summary.active_brand_count,0), 'of all brands', v_period.grain, jsonb_build_object('sold_period',v_period.period_key)),
        app.metrics_v4_kpi('top80_brands', 'Top 80% brands', COALESCE((SELECT COUNT(*) FROM (SELECT tenant_brand_id, SUM(invoice_value) OVER (ORDER BY invoice_value DESC) AS running, SUM(invoice_value) OVER () AS total FROM app.metrics_brand_period_summary WHERE tenant_id = p_tenant_id AND grain = v_period.grain AND period_start = v_period.period_start AND deleted_at IS NULL AND invoice_value > 0) ranked WHERE total > 0 AND running <= total * 0.8),0), COALESCE((SELECT COUNT(*) FROM (SELECT tenant_brand_id, SUM(invoice_value) OVER (ORDER BY invoice_value DESC) AS running, SUM(invoice_value) OVER () AS total FROM app.metrics_brand_period_summary WHERE tenant_id = p_tenant_id AND grain = v_period.grain AND period_start = v_period.period_start AND deleted_at IS NULL AND invoice_value > 0) ranked WHERE total > 0 AND running <= total * 0.8),0), NULL, NULL, 'brands in revenue concentration set', v_period.grain, jsonb_build_object('sort','invoice_value_desc','cutoff','top80')),
        app.metrics_v4_kpi('did_not_sell', 'Brands that did not sell', GREATEST(COALESCE(v_now_summary.active_brand_count,0) - COALESCE((SELECT COUNT(*) FROM app.metrics_brand_period_summary WHERE tenant_id = p_tenant_id AND grain = v_period.grain AND period_start = v_period.period_start AND deleted_at IS NULL),0), 0), GREATEST(COALESCE(v_now_summary.active_brand_count,0) - COALESCE((SELECT COUNT(*) FROM app.metrics_brand_period_summary WHERE tenant_id = p_tenant_id AND grain = v_period.grain AND period_start = v_period.period_start AND deleted_at IS NULL),0), 0), NULL, NULL, 'no selected-period sale', v_period.grain, jsonb_build_object('not_sold_period',v_period.period_key)),
        app.metrics_v4_kpi('dormant_brands', 'Dormant brands', COALESCE((SELECT COUNT(*) FROM app.metrics_brand_period_summary prev WHERE prev.tenant_id = p_tenant_id AND prev.grain = v_period.grain AND prev.period_start = CASE WHEN v_period.grain = 'month' THEN (v_period.period_start - interval '1 month')::date ELSE (v_period.period_start - interval '3 months')::date END AND prev.deleted_at IS NULL AND NOT EXISTS (SELECT 1 FROM app.metrics_brand_period_summary cur WHERE cur.tenant_id = p_tenant_id AND cur.tenant_brand_id = prev.tenant_brand_id AND cur.grain = v_period.grain AND cur.period_start = v_period.period_start AND cur.deleted_at IS NULL)),0), COALESCE((SELECT COUNT(*) FROM app.metrics_brand_period_summary prev WHERE prev.tenant_id = p_tenant_id AND prev.grain = v_period.grain AND prev.period_start = CASE WHEN v_period.grain = 'month' THEN (v_period.period_start - interval '1 month')::date ELSE (v_period.period_start - interval '3 months')::date END AND prev.deleted_at IS NULL AND NOT EXISTS (SELECT 1 FROM app.metrics_brand_period_summary cur WHERE cur.tenant_id = p_tenant_id AND cur.tenant_brand_id = prev.tenant_brand_id AND cur.grain = v_period.grain AND cur.period_start = v_period.period_start AND cur.deleted_at IS NULL)),0), NULL, NULL, 'sold prior period not selected period', v_period.grain, jsonb_build_object('sold_previous_period',true,'sold_current_period',false))
      ), v_watermark);

      v_rows := v_rows + app._metrics_v4_upsert_landing_kpis(p_tenant_id, 'locations', v_period.period_key, v_period.period_start, jsonb_build_array(
        app.metrics_v4_kpi('invoiced_sales', 'Invoiced Sales', COALESCE((SELECT SUM(invoice_value) FROM app.metrics_location_period_summary WHERE tenant_id = p_tenant_id AND grain = v_period.grain AND period_start = v_period.period_start AND deleted_at IS NULL),0), COALESCE((SELECT COUNT(*) FROM app.metrics_location_period_summary WHERE tenant_id = p_tenant_id AND grain = v_period.grain AND period_start = v_period.period_start AND invoice_value > 0 AND deleted_at IS NULL),0), COALESCE((SELECT SUM(invoice_count)::bigint FROM app.metrics_location_period_summary WHERE tenant_id = p_tenant_id AND grain = v_period.grain AND period_start = v_period.period_start AND deleted_at IS NULL),0), NULL, 'locations and invoices', v_period.grain, jsonb_build_object('target','invoices','period',v_period.period_key)),
        app.metrics_v4_kpi('open_demand', 'Open demand', COALESCE(v_now_summary.open_estimate_value,0) + COALESCE(v_now_summary.open_order_value,0), COALESCE((SELECT COUNT(*) FROM app.metrics_location_now_summary WHERE tenant_id = p_tenant_id AND (open_estimate_count + open_order_count) > 0 AND deleted_at IS NULL),0), COALESCE(v_now_summary.open_estimate_count,0) + COALESCE(v_now_summary.open_order_count,0), NULL, 'locations and demand docs', 'now', jsonb_build_object('open_demand',true)),
        app.metrics_v4_kpi('overdue_receivables', 'Overdue receivables', COALESCE(v_now_summary.overdue_amount,0), COALESCE((SELECT COUNT(*) FROM app.metrics_location_now_summary WHERE tenant_id = p_tenant_id AND overdue_amount > 0 AND deleted_at IS NULL),0), COALESCE(v_now_summary.overdue_invoice_count,0), NULL, 'locations', 'now', jsonb_build_object('overdue',true)),
        app.metrics_v4_kpi('top80_locations', 'Top 80% locations', COALESCE((SELECT COUNT(*) FROM (SELECT location_id, SUM(invoice_value) OVER (ORDER BY invoice_value DESC) AS running, SUM(invoice_value) OVER () AS total FROM app.metrics_location_period_summary WHERE tenant_id = p_tenant_id AND grain = v_period.grain AND period_start = v_period.period_start AND deleted_at IS NULL AND invoice_value > 0) ranked WHERE total > 0 AND running <= total * 0.8),0), COALESCE((SELECT COUNT(*) FROM (SELECT location_id, SUM(invoice_value) OVER (ORDER BY invoice_value DESC) AS running, SUM(invoice_value) OVER () AS total FROM app.metrics_location_period_summary WHERE tenant_id = p_tenant_id AND grain = v_period.grain AND period_start = v_period.period_start AND deleted_at IS NULL AND invoice_value > 0) ranked WHERE total > 0 AND running <= total * 0.8),0), NULL, NULL, 'locations in revenue concentration set', v_period.grain, jsonb_build_object('sort','invoice_value_desc','cutoff','top80'))
      ), v_watermark);
    END IF;
  END LOOP;

  RETURN v_rows;
END;
$$;

CREATE OR REPLACE FUNCTION app._metrics_v4_refresh_buyer_app_periods(
  p_tenant_id uuid,
  p_as_of timestamptz DEFAULT clock_timestamp()
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, app, pg_temp
AS $$
BEGIN
  RAISE EXCEPTION 'metrics_v4_buyer_app_periods_refresh_disabled: use metrics_mark_reconciliation + metrics_refresh_tick' USING ERRCODE = '55000';
END;
$$;

CREATE OR REPLACE FUNCTION app.metrics_v4_refresh_tenant(
  p_tenant_id uuid,
  p_as_of timestamptz DEFAULT clock_timestamp()
)
RETURNS TABLE (rows_written integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, app, pg_temp
AS $$
DECLARE
  v_rows integer := 0;
  v_bounds record;
  v_today date := (COALESCE(p_as_of, clock_timestamp()) AT TIME ZONE 'Asia/Kolkata')::date;
BEGIN
  IF p_tenant_id IS NULL THEN
    RAISE EXCEPTION 'metrics_v4_refresh_tenant_required' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_bounds FROM app.metrics_v4_period_bounds('this_quarter', p_as_of);
  PERFORM app.metrics_mark_reconciliation(p_tenant_id, 'commercial', v_bounds.period_start, v_today);
  PERFORM app.metrics_mark_reconciliation(p_tenant_id, 'inventory', v_bounds.period_start, v_today);
  PERFORM app.metrics_mark_reconciliation(p_tenant_id, 'buyer_app', v_bounds.period_start, v_today);
  PERFORM app.metrics_mark_reconciliation(p_tenant_id, 'setup', v_today, v_today);
  v_rows := v_rows + 4;
  v_rows := v_rows + app._metrics_v4_refresh_setup_now(p_tenant_id, p_as_of);
  RETURN QUERY SELECT v_rows;
END;
$$;

CREATE OR REPLACE FUNCTION app.get_landing_metrics_v4(
  p_tenant_id uuid,
  p_page_key text,
  p_period_key text DEFAULT 'this_month',
  p_scope_kind text DEFAULT 'tenant',
  p_scope_id uuid DEFAULT NULL,
  p_as_of timestamptz DEFAULT clock_timestamp()
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = pg_catalog, app, pg_temp
AS $$
DECLARE
  v_bounds record;
  v_row app.metrics_landing_kpi_snapshot%ROWTYPE;
BEGIN
  IF p_tenant_id IS NULL OR p_page_key IS NULL THEN
    RAISE EXCEPTION 'metrics_v4_landing_identity_required' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO v_bounds FROM app.metrics_v4_period_bounds(COALESCE(p_period_key, 'this_month'), p_as_of);
  IF v_bounds.period_start IS NULL THEN
    RAISE EXCEPTION 'metrics_v4_period_invalid:%', p_period_key USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_row
  FROM app.metrics_landing_kpi_snapshot s
  WHERE s.tenant_id = p_tenant_id
    AND s.page_key = p_page_key
    AND s.scope_kind = COALESCE(p_scope_kind, 'tenant')
    AND s.scope_id IS NOT DISTINCT FROM p_scope_id
    AND s.period_key = COALESCE(p_period_key, 'this_month')
    AND s.period_start = v_bounds.period_start
    AND s.deleted_at IS NULL
  LIMIT 1;

  RETURN jsonb_build_object(
    'page_key', p_page_key,
    'period', jsonb_build_object(
      'period_key', v_bounds.period_key,
      'grain', v_bounds.grain,
      'period_start', v_bounds.period_start,
      'period_end_exclusive', v_bounds.period_end_exclusive,
      'label', v_bounds.label
    ),
    'computed_at', v_row.computed_at,
    'source_watermark', v_row.source_watermark,
    'cards', COALESCE(v_row.kpis, '[]'::jsonb)
  );
END;
$$;

CREATE OR REPLACE FUNCTION app.get_buyer_home_metrics_v4(
  p_tenant_id uuid,
  p_buyer_id uuid,
  p_as_of timestamptz DEFAULT clock_timestamp()
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = pg_catalog, app, pg_temp
AS $$
DECLARE
  v_bounds record;
  v_primary text := app.metrics_v4_primary_demand_kind(p_tenant_id);
  v_period app.metrics_buyer_period_summary%ROWTYPE;
  v_snapshot app.metrics_buyer_now_summary%ROWTYPE;
BEGIN
  IF p_tenant_id IS NULL OR p_buyer_id IS NULL THEN
    RAISE EXCEPTION 'metrics_v4_buyer_home_identity_required' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO v_bounds FROM app.metrics_v4_period_bounds('this_quarter', p_as_of);
  SELECT * INTO v_period
  FROM app.metrics_buyer_period_summary
  WHERE tenant_id = p_tenant_id AND buyer_id = p_buyer_id
    AND grain = 'quarter' AND period_start = v_bounds.period_start AND deleted_at IS NULL
  LIMIT 1;
  SELECT * INTO v_snapshot
  FROM app.metrics_buyer_now_summary
  WHERE tenant_id = p_tenant_id AND buyer_id = p_buyer_id AND deleted_at IS NULL
  ORDER BY computed_at DESC
  LIMIT 1;

  RETURN jsonb_build_object(
    'period', jsonb_build_object('period_key', 'this_quarter', 'grain', 'quarter', 'period_start', v_bounds.period_start, 'period_end_exclusive', v_bounds.period_end_exclusive),
    'spend_qtd', COALESCE(v_period.invoice_value, 0),
    'invoice_count_qtd', COALESCE(v_period.invoice_count, 0),
    'demand_qtd', COALESCE(v_period.primary_demand_value, 0),
    'demand_document_count_qtd', COALESCE(v_period.primary_demand_count, 0),
    'demand_kind', v_primary,
    'credit_limit', COALESCE(v_snapshot.credit_limit, 0),
    'outstanding', COALESCE(v_snapshot.receivable_amount, 0),
    'overdue', COALESCE(v_snapshot.overdue_amount, 0),
    'available_credit', COALESCE(v_snapshot.credit_available, COALESCE(v_snapshot.credit_limit, 0) - COALESCE(v_snapshot.receivable_amount, 0)),
    'computed_at', COALESCE(v_period.computed_at, v_snapshot.computed_at)
  );
END;
$$;

CREATE OR REPLACE FUNCTION app.purge_metrics_dirty_work()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'app', 'pg_catalog'
AS $$
BEGIN
  DELETE FROM app.metrics_dirty_work
  WHERE state = 'completed'
    AND completed_at < now() - interval '1 hour';

  DELETE FROM app.metrics_dirty_work
  WHERE state = 'dead_letter'
    AND updated_at < now() - interval '3 days';
END;
$$;

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
BEGIN
  PERFORM app._metrics_assert_refresh_fence(p_owner_token, p_fencing_epoch, p_tenant_id, p_domain);

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
  CREATE TEMP TABLE IF NOT EXISTS pg_temp.metrics_v4_buyer_period_keys(buyer_id uuid NOT NULL, grain text NOT NULL, period_start date NOT NULL, period_end_exclusive date NOT NULL, PRIMARY KEY (buyer_id, grain, period_start)) ON COMMIT DROP;
  CREATE TEMP TABLE IF NOT EXISTS pg_temp.metrics_v4_product_period_keys(tenant_product_id uuid NOT NULL, grain text NOT NULL, period_start date NOT NULL, period_end_exclusive date NOT NULL, PRIMARY KEY (tenant_product_id, grain, period_start)) ON COMMIT DROP;
  CREATE TEMP TABLE IF NOT EXISTS pg_temp.metrics_v4_location_keys(location_id uuid PRIMARY KEY) ON COMMIT DROP;
  TRUNCATE pg_temp.metrics_v4_dirty_days, pg_temp.metrics_v4_period_keys, pg_temp.metrics_v4_buyer_period_keys, pg_temp.metrics_v4_product_period_keys, pg_temp.metrics_v4_location_keys;

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

  INSERT INTO pg_temp.metrics_v4_buyer_period_keys(buyer_id, grain, period_start, period_end_exclusive)
  SELECT buyer_id, grain, period_start, period_end_exclusive
  FROM (
    SELECT w.old_buyer_id AS buyer_id, p.grain, p.period_start, p.period_end_exclusive
    FROM app.metrics_dirty_work w CROSS JOIN pg_temp.metrics_v4_period_keys p
    WHERE w.lease_owner = p_owner_token AND w.claimed_version IS NOT NULL AND p.grain IN ('month','quarter')
    UNION
    SELECT w.new_buyer_id, p.grain, p.period_start, p.period_end_exclusive
    FROM app.metrics_dirty_work w CROSS JOIN pg_temp.metrics_v4_period_keys p
    WHERE w.lease_owner = p_owner_token AND w.claimed_version IS NOT NULL AND p.grain IN ('month','quarter')
    UNION
    SELECT e.buyer_id, p.grain, p.period_start, p.period_end_exclusive
    FROM app.estimates e JOIN pg_temp.metrics_v4_period_keys p ON p.grain IN ('month','quarter')
    WHERE e.tenant_id = p_tenant_id AND e.deleted_at IS NULL
      AND app.metric_day_ist(e.estimate_date, e.created_at) >= p.period_start
      AND app.metric_day_ist(e.estimate_date, e.created_at) < p.period_end_exclusive
      AND EXISTS (SELECT 1 FROM pg_temp.metrics_v4_dirty_days d WHERE d.day = app.metric_day_ist(e.estimate_date, e.created_at))
    UNION
    SELECT o.buyer_id, p.grain, p.period_start, p.period_end_exclusive
    FROM app.orders o JOIN pg_temp.metrics_v4_period_keys p ON p.grain IN ('month','quarter')
    WHERE o.tenant_id = p_tenant_id AND o.deleted_at IS NULL
      AND app.metric_day_ist(o.order_date, o.created_at) >= p.period_start
      AND app.metric_day_ist(o.order_date, o.created_at) < p.period_end_exclusive
      AND EXISTS (SELECT 1 FROM pg_temp.metrics_v4_dirty_days d WHERE d.day = app.metric_day_ist(o.order_date, o.created_at))
    UNION
    SELECT i.buyer_id, p.grain, p.period_start, p.period_end_exclusive
    FROM app.invoices i JOIN pg_temp.metrics_v4_period_keys p ON p.grain IN ('month','quarter')
    WHERE i.tenant_id = p_tenant_id AND i.deleted_at IS NULL
      AND app.metric_day_ist(i.invoice_date, i.created_at) >= p.period_start
      AND app.metric_day_ist(i.invoice_date, i.created_at) < p.period_end_exclusive
      AND EXISTS (SELECT 1 FROM pg_temp.metrics_v4_dirty_days d WHERE d.day = app.metric_day_ist(i.invoice_date, i.created_at))
  ) k
  WHERE buyer_id IS NOT NULL
  ORDER BY buyer_id, grain, period_start
  LIMIT 101
  ON CONFLICT DO NOTHING;
  SELECT COUNT(*) INTO v_buyer_key_count FROM pg_temp.metrics_v4_buyer_period_keys;
  IF v_buyer_key_count > 100 THEN
    RAISE EXCEPTION 'metrics_v4_buyer_key_budget_exceeded: split reconciliation/import dirty work into smaller windows';
  END IF;

  INSERT INTO pg_temp.metrics_v4_product_period_keys(tenant_product_id, grain, period_start, period_end_exclusive)
  SELECT tenant_product_id, grain, period_start, period_end_exclusive
  FROM (
    SELECT w.old_tenant_product_id AS tenant_product_id, p.grain, p.period_start, p.period_end_exclusive
    FROM app.metrics_dirty_work w CROSS JOIN pg_temp.metrics_v4_period_keys p
    WHERE w.lease_owner = p_owner_token AND w.claimed_version IS NOT NULL AND p.grain IN ('month','quarter')
    UNION
    SELECT w.new_tenant_product_id, p.grain, p.period_start, p.period_end_exclusive
    FROM app.metrics_dirty_work w CROSS JOIN pg_temp.metrics_v4_period_keys p
    WHERE w.lease_owner = p_owner_token AND w.claimed_version IS NOT NULL AND p.grain IN ('month','quarter')
    UNION
    SELECT ei.tenant_product_id, p.grain, p.period_start, p.period_end_exclusive
    FROM app.estimate_items ei JOIN app.estimates e ON e.id = ei.estimate_id AND e.tenant_id = p_tenant_id AND e.deleted_at IS NULL
    JOIN pg_temp.metrics_v4_period_keys p ON p.grain IN ('month','quarter')
    WHERE ei.deleted_at IS NULL
      AND app.metric_day_ist(e.estimate_date, e.created_at) >= p.period_start
      AND app.metric_day_ist(e.estimate_date, e.created_at) < p.period_end_exclusive
      AND EXISTS (SELECT 1 FROM pg_temp.metrics_v4_dirty_days d WHERE d.day = app.metric_day_ist(e.estimate_date, e.created_at))
    UNION
    SELECT oi.tenant_product_id, p.grain, p.period_start, p.period_end_exclusive
    FROM app.order_items oi JOIN app.orders o ON o.id = oi.order_id AND o.tenant_id = p_tenant_id AND o.deleted_at IS NULL
    JOIN pg_temp.metrics_v4_period_keys p ON p.grain IN ('month','quarter')
    WHERE oi.deleted_at IS NULL
      AND app.metric_day_ist(o.order_date, o.created_at) >= p.period_start
      AND app.metric_day_ist(o.order_date, o.created_at) < p.period_end_exclusive
      AND EXISTS (SELECT 1 FROM pg_temp.metrics_v4_dirty_days d WHERE d.day = app.metric_day_ist(o.order_date, o.created_at))
    UNION
    SELECT ii.tenant_product_id, p.grain, p.period_start, p.period_end_exclusive
    FROM app.invoice_items ii JOIN app.invoices i ON i.id = ii.invoice_id AND i.tenant_id = p_tenant_id AND i.deleted_at IS NULL
    JOIN pg_temp.metrics_v4_period_keys p ON p.grain IN ('month','quarter')
    WHERE ii.deleted_at IS NULL
      AND app.metric_day_ist(i.invoice_date, i.created_at) >= p.period_start
      AND app.metric_day_ist(i.invoice_date, i.created_at) < p.period_end_exclusive
      AND EXISTS (SELECT 1 FROM pg_temp.metrics_v4_dirty_days d WHERE d.day = app.metric_day_ist(i.invoice_date, i.created_at))
  ) k
  WHERE tenant_product_id IS NOT NULL
  ORDER BY tenant_product_id, grain, period_start
  LIMIT 101
  ON CONFLICT DO NOTHING;
  SELECT COUNT(*) INTO v_product_key_count FROM pg_temp.metrics_v4_product_period_keys;
  IF v_product_key_count > 100 THEN
    RAISE EXCEPTION 'metrics_v4_product_key_budget_exceeded: split reconciliation/import dirty work into smaller windows';
  END IF;

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
  LIMIT 101
  ON CONFLICT DO NOTHING;
  IF (SELECT COUNT(*) FROM pg_temp.metrics_v4_location_keys) > 100 THEN
    RAISE EXCEPTION 'metrics_v4_location_key_budget_exceeded: split reconciliation/import dirty work into smaller windows';
  END IF;

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
    SELECT COUNT(DISTINCT i.id) FILTER (WHERE app.invoice_status_gmv_included(i.status))::bigint AS invoice_count,
      COALESCE(SUM(i.total_amount) FILTER (WHERE app.invoice_status_gmv_included(i.status)),0)::numeric AS invoice_value,
      COALESCE(SUM(ii.qty) FILTER (WHERE app.invoice_status_gmv_included(i.status)),0)::numeric AS invoice_units,
      COUNT(DISTINCT i.buyer_id) FILTER (WHERE app.invoice_status_gmv_included(i.status))::bigint AS invoice_buyer_count,
      COUNT(DISTINCT ii.tenant_product_id) FILTER (WHERE app.invoice_status_gmv_included(i.status))::bigint AS invoice_product_count,
      MAX(GREATEST(i.updated_at, ii.updated_at)) AS watermark
    FROM app.invoices i LEFT JOIN app.invoice_items ii ON ii.invoice_id = i.id AND ii.deleted_at IS NULL
    WHERE i.tenant_id = p_tenant_id AND i.deleted_at IS NULL
      AND app.metric_day_ist(i.invoice_date, i.created_at) >= p.period_start
      AND app.metric_day_ist(i.invoice_date, i.created_at) < p.period_end_exclusive
  ) inv ON true
  LEFT JOIN LATERAL (
    SELECT COUNT(DISTINCT e.id) FILTER (WHERE app.estimate_status_is_open(e.status) OR e.status = 'accepted')::bigint AS estimate_count,
      COALESCE(SUM(e.total_amount) FILTER (WHERE app.estimate_status_is_open(e.status) OR e.status = 'accepted'),0)::numeric AS estimate_value,
      COALESCE(SUM(ei.qty) FILTER (WHERE app.estimate_status_is_open(e.status) OR e.status = 'accepted'),0)::numeric AS estimate_units,
      COUNT(DISTINCT e.buyer_id) FILTER (WHERE app.estimate_status_is_open(e.status) OR e.status = 'accepted')::bigint AS estimate_buyer_count,
      COUNT(DISTINCT ei.tenant_product_id) FILTER (WHERE app.estimate_status_is_open(e.status) OR e.status = 'accepted')::bigint AS estimate_product_count,
      COUNT(DISTINCT e.id) FILTER (WHERE e.is_buyer_app_estimate AND (app.estimate_status_is_open(e.status) OR e.status = 'accepted'))::bigint AS app_estimate_count,
      COALESCE(SUM(e.total_amount) FILTER (WHERE e.is_buyer_app_estimate AND (app.estimate_status_is_open(e.status) OR e.status = 'accepted')),0)::numeric AS app_estimate_value,
      COUNT(DISTINCT e.buyer_id) FILTER (WHERE e.is_buyer_app_estimate AND (app.estimate_status_is_open(e.status) OR e.status = 'accepted'))::bigint AS app_estimate_buyer_count,
      MAX(GREATEST(e.updated_at, ei.updated_at)) AS watermark
    FROM app.estimates e LEFT JOIN app.estimate_items ei ON ei.estimate_id = e.id AND ei.deleted_at IS NULL
    WHERE e.tenant_id = p_tenant_id AND e.deleted_at IS NULL
      AND app.metric_day_ist(e.estimate_date, e.created_at) >= p.period_start
      AND app.metric_day_ist(e.estimate_date, e.created_at) < p.period_end_exclusive
  ) est ON true
  LEFT JOIN LATERAL (
    SELECT COUNT(DISTINCT o.id) FILTER (WHERE app.order_status_in_flow(o.status))::bigint AS order_count,
      COALESCE(SUM(o.total_amount) FILTER (WHERE app.order_status_in_flow(o.status)),0)::numeric AS order_value,
      COALESCE(SUM(oi.qty) FILTER (WHERE app.order_status_in_flow(o.status)),0)::numeric AS order_units,
      COUNT(DISTINCT o.buyer_id) FILTER (WHERE app.order_status_in_flow(o.status))::bigint AS order_buyer_count,
      COUNT(DISTINCT oi.tenant_product_id) FILTER (WHERE app.order_status_in_flow(o.status))::bigint AS order_product_count,
      COUNT(DISTINCT o.id) FILTER (WHERE o.is_buyer_app_order AND app.order_status_in_flow(o.status))::bigint AS app_order_count,
      COALESCE(SUM(o.total_amount) FILTER (WHERE o.is_buyer_app_order AND app.order_status_in_flow(o.status)),0)::numeric AS app_order_value,
      COUNT(DISTINCT o.buyer_id) FILTER (WHERE o.is_buyer_app_order AND app.order_status_in_flow(o.status))::bigint AS app_order_buyer_count,
      MAX(GREATEST(o.updated_at, oi.updated_at)) AS watermark
    FROM app.orders o LEFT JOIN app.order_items oi ON oi.order_id = o.id AND oi.deleted_at IS NULL
    WHERE o.tenant_id = p_tenant_id AND o.deleted_at IS NULL
      AND app.metric_day_ist(o.order_date, o.created_at) >= p.period_start
      AND app.metric_day_ist(o.order_date, o.created_at) < p.period_end_exclusive
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
  LEFT JOIN LATERAL (
    SELECT COALESCE(SUM(ii.qty),0)::numeric AS units, COALESCE(SUM(ii.line_total),0)::numeric AS value, COUNT(DISTINCT i.id)::bigint AS count, COUNT(DISTINCT i.buyer_id)::bigint AS buyers, MAX(GREATEST(i.updated_at, ii.updated_at)) AS watermark
    FROM app.invoice_items ii JOIN app.invoices i ON i.id = ii.invoice_id AND i.tenant_id = p_tenant_id AND i.deleted_at IS NULL AND app.invoice_status_gmv_included(i.status)
    WHERE ii.tenant_product_id = k.tenant_product_id AND ii.deleted_at IS NULL AND app.metric_day_ist(i.invoice_date, i.created_at) >= k.period_start AND app.metric_day_ist(i.invoice_date, i.created_at) < k.period_end_exclusive
  ) inv ON true
  LEFT JOIN LATERAL (
    SELECT COALESCE(SUM(ei.qty),0)::numeric AS units, COALESCE(SUM(ei.line_total),0)::numeric AS value, COUNT(DISTINCT e.id)::bigint AS count, MAX(GREATEST(e.updated_at, ei.updated_at)) AS watermark
    FROM app.estimate_items ei JOIN app.estimates e ON e.id = ei.estimate_id AND e.tenant_id = p_tenant_id AND e.deleted_at IS NULL AND (app.estimate_status_is_open(e.status) OR e.status = 'accepted')
    WHERE ei.tenant_product_id = k.tenant_product_id AND ei.deleted_at IS NULL AND app.metric_day_ist(e.estimate_date, e.created_at) >= k.period_start AND app.metric_day_ist(e.estimate_date, e.created_at) < k.period_end_exclusive
  ) est ON true
  LEFT JOIN LATERAL (
    SELECT COALESCE(SUM(oi.qty),0)::numeric AS units, COALESCE(SUM(oi.line_total),0)::numeric AS value, COUNT(DISTINCT o.id)::bigint AS count, MAX(GREATEST(o.updated_at, oi.updated_at)) AS watermark
    FROM app.order_items oi JOIN app.orders o ON o.id = oi.order_id AND o.tenant_id = p_tenant_id AND o.deleted_at IS NULL AND app.order_status_in_flow(o.status)
    WHERE oi.tenant_product_id = k.tenant_product_id AND oi.deleted_at IS NULL AND app.metric_day_ist(o.order_date, o.created_at) >= k.period_start AND app.metric_day_ist(o.order_date, o.created_at) < k.period_end_exclusive
  ) ord ON true
  WHERE COALESCE(inv.count,0) > 0 OR COALESCE(est.count,0) > 0 OR COALESCE(ord.count,0) > 0
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
      SELECT 1 FROM app.invoice_items ii JOIN app.invoices i ON i.id = ii.invoice_id WHERE ii.tenant_product_id = k.tenant_product_id AND ii.deleted_at IS NULL AND i.tenant_id = p_tenant_id AND i.deleted_at IS NULL AND app.invoice_status_gmv_included(i.status) AND app.metric_day_ist(i.invoice_date, i.created_at) >= k.period_start AND app.metric_day_ist(i.invoice_date, i.created_at) < k.period_end_exclusive
      UNION ALL SELECT 1 FROM app.estimate_items ei JOIN app.estimates e ON e.id = ei.estimate_id WHERE ei.tenant_product_id = k.tenant_product_id AND ei.deleted_at IS NULL AND e.tenant_id = p_tenant_id AND e.deleted_at IS NULL AND (app.estimate_status_is_open(e.status) OR e.status = 'accepted') AND app.metric_day_ist(e.estimate_date, e.created_at) >= k.period_start AND app.metric_day_ist(e.estimate_date, e.created_at) < k.period_end_exclusive
      UNION ALL SELECT 1 FROM app.order_items oi JOIN app.orders o ON o.id = oi.order_id WHERE oi.tenant_product_id = k.tenant_product_id AND oi.deleted_at IS NULL AND o.tenant_id = p_tenant_id AND o.deleted_at IS NULL AND app.order_status_in_flow(o.status) AND app.metric_day_ist(o.order_date, o.created_at) >= k.period_start AND app.metric_day_ist(o.order_date, o.created_at) < k.period_end_exclusive
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

  RETURN QUERY SELECT v_rows, 5, COALESCE(v_watermark, v_now);
END;
$$;

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
  v_v4 record;
BEGIN
  SELECT * INTO v_v4 FROM app._metrics_v4_refresh_claimed_periods(p_owner_token, p_fencing_epoch, p_tenant_id, 'commercial');
  RETURN QUERY SELECT COALESCE(v_v4.rows_written, 0),
    COALESCE(v_v4.statement_groups, 0),
    v_v4.source_watermark;
END;
$$;

CREATE OR REPLACE FUNCTION app._metrics_refresh_inventory(
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
  v_v4 record;
BEGIN
  SELECT * INTO v_v4 FROM app._metrics_v4_refresh_claimed_periods(p_owner_token, p_fencing_epoch, p_tenant_id, 'inventory');
  RETURN QUERY SELECT COALESCE(v_v4.rows_written, 0),
    COALESCE(v_v4.statement_groups, 0),
    v_v4.source_watermark;
END;
$$;

CREATE OR REPLACE FUNCTION app._metrics_refresh_buyer_app(
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
  v_v4 record;
BEGIN
  SELECT * INTO v_v4 FROM app._metrics_v4_refresh_claimed_periods(p_owner_token, p_fencing_epoch, p_tenant_id, 'buyer_app');
  RETURN QUERY SELECT COALESCE(v_v4.rows_written, 0),
    COALESCE(v_v4.statement_groups, 0),
    v_v4.source_watermark;
END;
$$;

CREATE OR REPLACE FUNCTION app._metrics_refresh_setup(
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
  v_v4 record;
  v_now_rows integer := 0;
BEGIN
  SELECT * INTO v_v4 FROM app._metrics_v4_refresh_claimed_periods(p_owner_token, p_fencing_epoch, p_tenant_id, 'setup');
  v_now_rows := app._metrics_v4_refresh_setup_now(p_tenant_id);
  RETURN QUERY SELECT COALESCE(v_v4.rows_written, 0) + v_now_rows,
    COALESCE(v_v4.statement_groups, 0) + 1,
    v_v4.source_watermark;
END;
$$;

REVOKE ALL ON FUNCTION app.metrics_v4_period_bounds(text, timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.metrics_v4_primary_demand_kind(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.metrics_v4_period_windows(timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.metrics_v4_kpi(text, text, numeric, bigint, bigint, numeric, text, text, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION app._metrics_v4_upsert_landing_kpis(uuid, text, text, date, jsonb, timestamptz, text, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION app._metrics_v4_refresh_commercial_periods(uuid, timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION app._metrics_v4_refresh_entity_periods(uuid, timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION app._metrics_v4_refresh_campaign_periods(uuid, timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION app._metrics_v4_refresh_buyer_app_periods(uuid, timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION app._metrics_v4_refresh_setup_now(uuid, timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION app._metrics_v4_refresh_landing_kpis(uuid, timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.metrics_v4_refresh_tenant(uuid, timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.get_landing_metrics_v4(uuid, text, text, text, uuid, timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.get_buyer_home_metrics_v4(uuid, uuid, timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION app._metrics_v4_refresh_claimed_periods(uuid, bigint, uuid, text) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION app.metrics_v4_period_bounds(text, timestamptz) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION app.metrics_v4_primary_demand_kind(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION app.get_landing_metrics_v4(uuid, text, text, text, uuid, timestamptz) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION app.get_buyer_home_metrics_v4(uuid, uuid, timestamptz) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION app.metrics_v4_refresh_tenant(uuid, timestamptz) TO service_role;
GRANT EXECUTE ON FUNCTION app.metrics_v4_period_windows(timestamptz) TO service_role;
GRANT EXECUTE ON FUNCTION app.metrics_v4_kpi(text, text, numeric, bigint, bigint, numeric, text, text, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION app._metrics_v4_upsert_landing_kpis(uuid, text, text, date, jsonb, timestamptz, text, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION app._metrics_v4_refresh_commercial_periods(uuid, timestamptz) TO service_role;
GRANT EXECUTE ON FUNCTION app._metrics_v4_refresh_entity_periods(uuid, timestamptz) TO service_role;
GRANT EXECUTE ON FUNCTION app._metrics_v4_refresh_campaign_periods(uuid, timestamptz) TO service_role;
GRANT EXECUTE ON FUNCTION app._metrics_v4_refresh_buyer_app_periods(uuid, timestamptz) TO service_role;
GRANT EXECUTE ON FUNCTION app._metrics_v4_refresh_setup_now(uuid, timestamptz) TO service_role;
GRANT EXECUTE ON FUNCTION app._metrics_v4_refresh_landing_kpis(uuid, timestamptz) TO service_role;
GRANT EXECUTE ON FUNCTION app._metrics_v4_refresh_claimed_periods(uuid, bigint, uuid, text) TO service_role;
