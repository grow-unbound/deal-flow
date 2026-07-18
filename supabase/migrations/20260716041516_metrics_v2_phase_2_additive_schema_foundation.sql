-- Metrics V2 Phase 2: additive schema foundation only.
-- This migration creates unused/default-off read-model and coordination objects.
-- It intentionally adds no capture triggers, dispatcher cron, refresh kernel, or app consumer switch.

CREATE TABLE IF NOT EXISTS app.metrics_tenant_commercial_snapshot (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES app.tenants(id) ON DELETE RESTRICT,
  external_ref text NOT NULL,
  calendar_month date NOT NULL,
  current_month_estimate_count bigint DEFAULT 0 NOT NULL,
  current_month_estimate_value numeric(14,2) DEFAULT 0 NOT NULL,
  current_month_order_count bigint DEFAULT 0 NOT NULL,
  current_month_order_value numeric(14,2) DEFAULT 0 NOT NULL,
  current_month_invoice_count bigint DEFAULT 0 NOT NULL,
  current_month_invoice_value numeric(14,2) DEFAULT 0 NOT NULL,
  open_estimate_count bigint DEFAULT 0 NOT NULL,
  open_estimate_value numeric(14,2) DEFAULT 0 NOT NULL,
  open_order_count bigint DEFAULT 0 NOT NULL,
  open_order_value numeric(14,2) DEFAULT 0 NOT NULL,
  receivable_invoice_count bigint DEFAULT 0 NOT NULL,
  receivable_amount numeric(14,2) DEFAULT 0 NOT NULL,
  overdue_invoice_count bigint DEFAULT 0 NOT NULL,
  overdue_amount numeric(14,2) DEFAULT 0 NOT NULL,
  purchasing_buyers_90d bigint DEFAULT 0 NOT NULL,
  source_watermark timestamptz,
  computed_at timestamptz DEFAULT now() NOT NULL,
  calculation_version integer DEFAULT 1 NOT NULL,
  generation_id uuid DEFAULT gen_random_uuid() NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL,
  created_by uuid REFERENCES auth.users(id) ON DELETE RESTRICT,
  updated_by uuid REFERENCES auth.users(id) ON DELETE RESTRICT,
  deleted_at timestamptz,
  CONSTRAINT metrics_tenant_commercial_snapshot_month_start CHECK (calendar_month = date_trunc('month', calendar_month)::date)
);

CREATE TABLE IF NOT EXISTS app.metrics_tenant_inventory_snapshot (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES app.tenants(id) ON DELETE RESTRICT,
  external_ref text NOT NULL,
  active_product_count bigint DEFAULT 0 NOT NULL,
  stocked_product_count bigint DEFAULT 0 NOT NULL,
  low_stock_product_count bigint DEFAULT 0 NOT NULL,
  out_of_stock_product_count bigint DEFAULT 0 NOT NULL,
  sellable_units numeric(14,3) DEFAULT 0 NOT NULL,
  recent_invoice_stockout_count bigint DEFAULT 0 NOT NULL,
  source_watermark timestamptz,
  computed_at timestamptz DEFAULT now() NOT NULL,
  calculation_version integer DEFAULT 1 NOT NULL,
  generation_id uuid DEFAULT gen_random_uuid() NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL,
  created_by uuid REFERENCES auth.users(id) ON DELETE RESTRICT,
  updated_by uuid REFERENCES auth.users(id) ON DELETE RESTRICT,
  deleted_at timestamptz
);

CREATE TABLE IF NOT EXISTS app.metrics_tenant_buyer_app_snapshot (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES app.tenants(id) ON DELETE RESTRICT,
  external_ref text NOT NULL,
  enabled_buyer_count bigint DEFAULT 0 NOT NULL,
  active_buyer_count_90d bigint DEFAULT 0 NOT NULL,
  repeat_buyer_count_90d bigint DEFAULT 0 NOT NULL,
  app_estimate_count_90d bigint DEFAULT 0 NOT NULL,
  app_estimate_value_90d numeric(14,2) DEFAULT 0 NOT NULL,
  app_order_count_90d bigint DEFAULT 0 NOT NULL,
  app_order_value_90d numeric(14,2) DEFAULT 0 NOT NULL,
  app_invoice_count_90d bigint DEFAULT 0 NOT NULL,
  app_invoice_value_90d numeric(14,2) DEFAULT 0 NOT NULL,
  assisted_invoice_count_90d bigint DEFAULT 0 NOT NULL,
  assisted_invoice_value_90d numeric(14,2) DEFAULT 0 NOT NULL,
  source_watermark timestamptz,
  computed_at timestamptz DEFAULT now() NOT NULL,
  calculation_version integer DEFAULT 1 NOT NULL,
  generation_id uuid DEFAULT gen_random_uuid() NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL,
  created_by uuid REFERENCES auth.users(id) ON DELETE RESTRICT,
  updated_by uuid REFERENCES auth.users(id) ON DELETE RESTRICT,
  deleted_at timestamptz
);

CREATE TABLE IF NOT EXISTS app.metrics_tenant_setup_snapshot (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES app.tenants(id) ON DELETE RESTRICT,
  external_ref text NOT NULL,
  active_buyer_count bigint DEFAULT 0 NOT NULL,
  active_product_count bigint DEFAULT 0 NOT NULL,
  active_brand_count bigint DEFAULT 0 NOT NULL,
  active_category_count bigint DEFAULT 0 NOT NULL,
  active_location_count bigint DEFAULT 0 NOT NULL,
  active_warehouse_count bigint DEFAULT 0 NOT NULL,
  active_campaign_count bigint DEFAULT 0 NOT NULL,
  active_cohort_count bigint DEFAULT 0 NOT NULL,
  active_price_list_count bigint DEFAULT 0 NOT NULL,
  source_watermark timestamptz,
  computed_at timestamptz DEFAULT now() NOT NULL,
  calculation_version integer DEFAULT 1 NOT NULL,
  generation_id uuid DEFAULT gen_random_uuid() NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL,
  created_by uuid REFERENCES auth.users(id) ON DELETE RESTRICT,
  updated_by uuid REFERENCES auth.users(id) ON DELETE RESTRICT,
  deleted_at timestamptz
);

CREATE TABLE IF NOT EXISTS app.metrics_location_snapshot (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES app.tenants(id) ON DELETE RESTRICT,
  location_id uuid NOT NULL REFERENCES app.locations(id) ON DELETE RESTRICT,
  external_ref text NOT NULL,
  invoice_count_90d bigint DEFAULT 0 NOT NULL,
  invoice_value_90d numeric(14,2) DEFAULT 0 NOT NULL,
  purchasing_buyers_90d bigint DEFAULT 0 NOT NULL,
  open_estimate_count bigint DEFAULT 0 NOT NULL,
  open_estimate_value numeric(14,2) DEFAULT 0 NOT NULL,
  open_order_count bigint DEFAULT 0 NOT NULL,
  open_order_value numeric(14,2) DEFAULT 0 NOT NULL,
  receivable_amount numeric(14,2) DEFAULT 0 NOT NULL,   -- FEEDBACK: missing receivable_invoice_count
  overdue_amount numeric(14,2) DEFAULT 0 NOT NULL,      -- FEEDBACK: missing overdue_invoice_count
  linked_warehouse_count bigint DEFAULT 0 NOT NULL,
  stocked_product_count bigint DEFAULT 0 NOT NULL,
  low_stock_product_count bigint DEFAULT 0 NOT NULL,
  out_of_stock_product_count bigint DEFAULT 0 NOT NULL,
  source_watermark timestamptz,
  computed_at timestamptz DEFAULT now() NOT NULL,
  calculation_version integer DEFAULT 1 NOT NULL,
  generation_id uuid DEFAULT gen_random_uuid() NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL,
  created_by uuid REFERENCES auth.users(id) ON DELETE RESTRICT,
  updated_by uuid REFERENCES auth.users(id) ON DELETE RESTRICT,
  deleted_at timestamptz
);

CREATE TABLE IF NOT EXISTS app.metrics_buyer_snapshot (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES app.tenants(id) ON DELETE RESTRICT,
  buyer_id uuid NOT NULL REFERENCES app.buyers(id) ON DELETE RESTRICT,
  external_ref text NOT NULL,
  invoice_count_90d bigint DEFAULT 0 NOT NULL,
  invoice_value_90d numeric(14,2) DEFAULT 0 NOT NULL,
  prior_year_invoice_value_90d numeric(14,2) DEFAULT 0 NOT NULL,
  estimate_count_90d bigint DEFAULT 0 NOT NULL,
  estimate_value_90d numeric(14,2) DEFAULT 0 NOT NULL,
  order_count_90d bigint DEFAULT 0 NOT NULL,
  order_value_90d numeric(14,2) DEFAULT 0 NOT NULL,
  last_invoice_at timestamptz,
  last_estimate_at timestamptz,
  last_order_at timestamptz,
  last_buyer_app_activity_at timestamptz,
  receivable_amount numeric(14,2) DEFAULT 0 NOT NULL,
  overdue_amount numeric(14,2) DEFAULT 0 NOT NULL,
  oldest_due_at timestamptz,
  credit_limit numeric(14,2) DEFAULT 0 NOT NULL,
  credit_available numeric(14,2),
  buyer_app_enabled boolean DEFAULT false NOT NULL,
  has_active_price_list boolean DEFAULT false NOT NULL,
  has_active_cohort boolean DEFAULT false NOT NULL,
  health_reason text,
  app_invoice_value_90d numeric(14,2) DEFAULT 0 NOT NULL,
  assisted_invoice_value_90d numeric(14,2) DEFAULT 0 NOT NULL,
  source_watermark timestamptz,
  computed_at timestamptz DEFAULT now() NOT NULL,
  calculation_version integer DEFAULT 1 NOT NULL,
  generation_id uuid DEFAULT gen_random_uuid() NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL,
  created_by uuid REFERENCES auth.users(id) ON DELETE RESTRICT,
  updated_by uuid REFERENCES auth.users(id) ON DELETE RESTRICT,
  deleted_at timestamptz,
  CONSTRAINT metrics_buyer_snapshot_health_reason_check CHECK (
    health_reason IS NULL
    OR health_reason = ANY (ARRAY['healthy', 'inactive', 'overdue', 'credit_exceeded', 'no_app_access', 'insufficient_history'])
  )
);

CREATE TABLE IF NOT EXISTS app.metrics_buyer_location_snapshot (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES app.tenants(id) ON DELETE RESTRICT,
  location_id uuid NOT NULL REFERENCES app.locations(id) ON DELETE RESTRICT,
  buyer_id uuid NOT NULL REFERENCES app.buyers(id) ON DELETE RESTRICT,
  external_ref text NOT NULL,
  invoice_count_90d bigint DEFAULT 0 NOT NULL,
  invoice_value_90d numeric(14,2) DEFAULT 0 NOT NULL,
  estimate_count_90d bigint DEFAULT 0 NOT NULL,
  estimate_value_90d numeric(14,2) DEFAULT 0 NOT NULL,
  order_count_90d bigint DEFAULT 0 NOT NULL,
  order_value_90d numeric(14,2) DEFAULT 0 NOT NULL,
  receivable_amount numeric(14,2) DEFAULT 0 NOT NULL,
  overdue_amount numeric(14,2) DEFAULT 0 NOT NULL,
  last_invoice_at timestamptz,
  last_estimate_at timestamptz,
  last_order_at timestamptz,
  source_watermark timestamptz,
  computed_at timestamptz DEFAULT now() NOT NULL,
  calculation_version integer DEFAULT 1 NOT NULL,
  generation_id uuid DEFAULT gen_random_uuid() NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL,
  created_by uuid REFERENCES auth.users(id) ON DELETE RESTRICT,
  updated_by uuid REFERENCES auth.users(id) ON DELETE RESTRICT,
  deleted_at timestamptz
);

CREATE TABLE IF NOT EXISTS app.metrics_product_snapshot (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES app.tenants(id) ON DELETE RESTRICT,
  tenant_product_id uuid NOT NULL REFERENCES app.tenant_products(id) ON DELETE RESTRICT,
  external_ref text NOT NULL,
  on_hand numeric(14,3) DEFAULT 0 NOT NULL,
  reserved numeric(14,3) DEFAULT 0 NOT NULL,
  available numeric(14,3) DEFAULT 0 NOT NULL,
  low_stock boolean DEFAULT false NOT NULL,
  out_of_stock boolean DEFAULT false NOT NULL,
  invoice_units_90d numeric(14,3) DEFAULT 0 NOT NULL,
  invoice_value_90d numeric(14,2) DEFAULT 0 NOT NULL,
  purchasing_buyers_90d bigint DEFAULT 0 NOT NULL,
  last_invoice_at timestamptz,
  no_sale_since date,
  days_cover numeric(12,2),
  is_active boolean DEFAULT true NOT NULL,
  is_published boolean DEFAULT false NOT NULL,
  price_complete boolean DEFAULT false NOT NULL,
  source_watermark timestamptz,
  computed_at timestamptz DEFAULT now() NOT NULL,
  calculation_version integer DEFAULT 1 NOT NULL,
  generation_id uuid DEFAULT gen_random_uuid() NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL,
  created_by uuid REFERENCES auth.users(id) ON DELETE RESTRICT,
  updated_by uuid REFERENCES auth.users(id) ON DELETE RESTRICT,
  deleted_at timestamptz
);

CREATE TABLE IF NOT EXISTS app.metrics_product_location_snapshot (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES app.tenants(id) ON DELETE RESTRICT,
  location_id uuid NOT NULL REFERENCES app.locations(id) ON DELETE RESTRICT,
  tenant_product_id uuid NOT NULL REFERENCES app.tenant_products(id) ON DELETE RESTRICT,
  external_ref text NOT NULL,
  on_hand numeric(14,3) DEFAULT 0 NOT NULL,
  reserved numeric(14,3) DEFAULT 0 NOT NULL,
  available numeric(14,3) DEFAULT 0 NOT NULL,
  low_stock boolean DEFAULT false NOT NULL,
  out_of_stock boolean DEFAULT false NOT NULL,
  invoice_units_90d numeric(14,3) DEFAULT 0 NOT NULL,
  invoice_value_90d numeric(14,2) DEFAULT 0 NOT NULL,
  last_invoice_at timestamptz,
  source_watermark timestamptz,
  computed_at timestamptz DEFAULT now() NOT NULL,
  calculation_version integer DEFAULT 1 NOT NULL,
  generation_id uuid DEFAULT gen_random_uuid() NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL,
  created_by uuid REFERENCES auth.users(id) ON DELETE RESTRICT,
  updated_by uuid REFERENCES auth.users(id) ON DELETE RESTRICT,
  deleted_at timestamptz
);

CREATE TABLE IF NOT EXISTS app.metrics_tenant_daily (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES app.tenants(id) ON DELETE RESTRICT,
  external_ref text NOT NULL,
  day date NOT NULL,
  invoice_count bigint DEFAULT 0 NOT NULL,
  invoice_value numeric(14,2) DEFAULT 0 NOT NULL,
  invoice_units numeric(14,3) DEFAULT 0 NOT NULL,
  estimate_count bigint DEFAULT 0 NOT NULL,
  estimate_value numeric(14,2) DEFAULT 0 NOT NULL,
  estimate_units numeric(14,3) DEFAULT 0 NOT NULL,
  order_count bigint DEFAULT 0 NOT NULL,
  order_value numeric(14,2) DEFAULT 0 NOT NULL,
  order_units numeric(14,3) DEFAULT 0 NOT NULL,
  app_invoice_count bigint DEFAULT 0 NOT NULL,
  app_invoice_value numeric(14,2) DEFAULT 0 NOT NULL,
  app_estimate_count bigint DEFAULT 0 NOT NULL,
  app_estimate_value numeric(14,2) DEFAULT 0 NOT NULL,
  app_order_count bigint DEFAULT 0 NOT NULL,
  app_order_value numeric(14,2) DEFAULT 0 NOT NULL,
  source_watermark timestamptz,
  computed_at timestamptz DEFAULT now() NOT NULL,
  calculation_version integer DEFAULT 1 NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL,
  created_by uuid REFERENCES auth.users(id) ON DELETE RESTRICT,
  updated_by uuid REFERENCES auth.users(id) ON DELETE RESTRICT,
  deleted_at timestamptz
);

CREATE TABLE IF NOT EXISTS app.metrics_location_daily (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES app.tenants(id) ON DELETE RESTRICT,
  location_id uuid NOT NULL REFERENCES app.locations(id) ON DELETE RESTRICT,
  external_ref text NOT NULL,
  day date NOT NULL,
  invoice_count bigint DEFAULT 0 NOT NULL,
  invoice_value numeric(14,2) DEFAULT 0 NOT NULL,
  invoice_units numeric(14,3) DEFAULT 0 NOT NULL,
  estimate_count bigint DEFAULT 0 NOT NULL,
  estimate_value numeric(14,2) DEFAULT 0 NOT NULL,
  estimate_units numeric(14,3) DEFAULT 0 NOT NULL,
  order_count bigint DEFAULT 0 NOT NULL,
  order_value numeric(14,2) DEFAULT 0 NOT NULL,
  order_units numeric(14,3) DEFAULT 0 NOT NULL,
  app_invoice_count bigint DEFAULT 0 NOT NULL,
  app_invoice_value numeric(14,2) DEFAULT 0 NOT NULL,
  app_estimate_count bigint DEFAULT 0 NOT NULL,
  app_estimate_value numeric(14,2) DEFAULT 0 NOT NULL,
  app_order_count bigint DEFAULT 0 NOT NULL,
  app_order_value numeric(14,2) DEFAULT 0 NOT NULL,
  source_watermark timestamptz,
  computed_at timestamptz DEFAULT now() NOT NULL,
  calculation_version integer DEFAULT 1 NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL,
  created_by uuid REFERENCES auth.users(id) ON DELETE RESTRICT,
  updated_by uuid REFERENCES auth.users(id) ON DELETE RESTRICT,
  deleted_at timestamptz
);

CREATE TABLE IF NOT EXISTS app.metrics_dirty_work (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES app.tenants(id) ON DELETE RESTRICT,
  domain text NOT NULL,
  source_type text NOT NULL,
  source_id uuid NOT NULL,
  old_buyer_id uuid,
  new_buyer_id uuid,
  old_tenant_product_id uuid,
  new_tenant_product_id uuid,
  old_location_id uuid,
  new_location_id uuid,
  old_day date,
  new_day date,
  dirty_from date,
  dirty_to date,
  dirty_version bigint DEFAULT 1 NOT NULL,
  claimed_version bigint,
  state text DEFAULT 'pending' NOT NULL,
  attempts integer DEFAULT 0 NOT NULL,
  next_attempt_at timestamptz DEFAULT now() NOT NULL,
  lease_owner uuid,
  lease_until timestamptz,
  last_error text,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL,
  completed_at timestamptz,
  CONSTRAINT metrics_dirty_work_domain_check CHECK (domain = ANY (ARRAY['commercial', 'inventory', 'buyer_app', 'setup'])),
  CONSTRAINT metrics_dirty_work_state_check CHECK (state = ANY (ARRAY['pending', 'claimed', 'retry', 'dead_letter', 'completed'])),
  CONSTRAINT metrics_dirty_work_attempts_check CHECK (attempts >= 0),
  CONSTRAINT metrics_dirty_work_dirty_version_check CHECK (dirty_version > 0),
  CONSTRAINT metrics_dirty_work_claimed_version_check CHECK (claimed_version IS NULL OR claimed_version <= dirty_version),
  CONSTRAINT metrics_dirty_work_range_check CHECK (dirty_from IS NULL OR dirty_to IS NULL OR dirty_from <= dirty_to)
);

CREATE TABLE IF NOT EXISTS app.metrics_runtime_control (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  control_scope text NOT NULL,
  tenant_id uuid REFERENCES app.tenants(id) ON DELETE RESTRICT,
  domain text,
  dispatch_enabled boolean DEFAULT false NOT NULL,
  pause_reason text,
  max_dirty_sources_per_tick integer DEFAULT 100 NOT NULL,
  max_refresh_keys_per_tick integer DEFAULT 100 NOT NULL,
  max_statement_groups_per_tick integer DEFAULT 25 NOT NULL,
  lock_timeout_ms integer DEFAULT 100 NOT NULL,
  statement_timeout_ms integer DEFAULT 3000 NOT NULL,
  tick_wall_budget_ms integer DEFAULT 5000 NOT NULL,
  lease_ttl_seconds integer DEFAULT 15 NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT metrics_runtime_control_scope_check CHECK (control_scope = ANY (ARRAY['global', 'tenant'])),
  CONSTRAINT metrics_runtime_control_domain_check CHECK (domain IS NULL OR domain = ANY (ARRAY['commercial', 'inventory', 'buyer_app', 'setup'])),
  CONSTRAINT metrics_runtime_control_scope_tenant_check CHECK (
    (control_scope = 'global' AND tenant_id IS NULL AND domain IS NULL)
    OR (control_scope = 'tenant' AND tenant_id IS NOT NULL)
  ),
  CONSTRAINT metrics_runtime_control_budget_check CHECK (
    max_dirty_sources_per_tick BETWEEN 1 AND 100
    AND max_refresh_keys_per_tick BETWEEN 1 AND 100
    AND max_statement_groups_per_tick BETWEEN 1 AND 25
    AND lock_timeout_ms BETWEEN 1 AND 100
    AND statement_timeout_ms BETWEEN 1 AND 3000
    AND tick_wall_budget_ms BETWEEN 1 AND 5000
    AND lease_ttl_seconds BETWEEN 5 AND 60
  )
);

CREATE TABLE IF NOT EXISTS app.metrics_refresh_state (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES app.tenants(id) ON DELETE RESTRICT,
  domain text NOT NULL,
  source_watermark timestamptz,
  last_successful_computation_at timestamptz,
  last_claimed_version bigint DEFAULT 0 NOT NULL,
  last_completed_version bigint DEFAULT 0 NOT NULL,
  last_duration_ms integer,
  freshness_state text DEFAULT 'stale' NOT NULL,
  stale_after timestamptz,
  last_error text,
  updated_at timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT metrics_refresh_state_domain_check CHECK (domain = ANY (ARRAY['commercial', 'inventory', 'buyer_app', 'setup'])),
  CONSTRAINT metrics_refresh_state_freshness_check CHECK (freshness_state = ANY (ARRAY['fresh', 'stale', 'paused', 'error', 'unavailable'])),
  CONSTRAINT metrics_refresh_state_version_check CHECK (last_claimed_version >= 0 AND last_completed_version >= 0)
);

CREATE TABLE IF NOT EXISTS app.metrics_refresh_leases (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  lease_scope text NOT NULL,
  tenant_id uuid REFERENCES app.tenants(id) ON DELETE RESTRICT,
  domain text,
  owner_token uuid,
  fencing_epoch bigint DEFAULT 0 NOT NULL,
  lease_until timestamptz,
  heartbeat_at timestamptz,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT metrics_refresh_leases_scope_check CHECK (lease_scope = ANY (ARRAY['global', 'tenant_domain'])),
  CONSTRAINT metrics_refresh_leases_domain_check CHECK (domain IS NULL OR domain = ANY (ARRAY['commercial', 'inventory', 'buyer_app', 'setup'])),
  CONSTRAINT metrics_refresh_leases_scope_tenant_check CHECK (
    (lease_scope = 'global' AND tenant_id IS NULL AND domain IS NULL)
    OR (lease_scope = 'tenant_domain' AND tenant_id IS NOT NULL AND domain IS NOT NULL)
  ),
  CONSTRAINT metrics_refresh_leases_epoch_check CHECK (fencing_epoch >= 0)
);

CREATE TABLE IF NOT EXISTS app.metrics_execution_history (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id uuid REFERENCES app.tenants(id) ON DELETE RESTRICT,
  domain text,
  run_kind text NOT NULL,
  status text NOT NULL,
  owner_token uuid,
  fencing_epoch bigint,
  started_at timestamptz DEFAULT now() NOT NULL,
  finished_at timestamptz,
  duration_ms integer,
  dirty_sources_claimed integer DEFAULT 0 NOT NULL,
  refresh_keys_planned integer DEFAULT 0 NOT NULL,
  statement_groups_executed integer DEFAULT 0 NOT NULL,
  snapshot_rows_inserted integer DEFAULT 0 NOT NULL,
  snapshot_rows_updated integer DEFAULT 0 NOT NULL,
  snapshot_rows_unchanged integer DEFAULT 0 NOT NULL,
  dead_letter_count integer DEFAULT 0 NOT NULL,
  error_text text,
  CONSTRAINT metrics_execution_history_domain_check CHECK (domain IS NULL OR domain = ANY (ARRAY['commercial', 'inventory', 'buyer_app', 'setup'])),
  CONSTRAINT metrics_execution_history_run_kind_check CHECK (run_kind = ANY (ARRAY['manual', 'routine', 'reconciliation', 'repair', 'age_out', 'month_rollover'])),
  CONSTRAINT metrics_execution_history_status_check CHECK (status = ANY (ARRAY['started', 'success', 'skipped', 'failed', 'dead_letter'])),
  CONSTRAINT metrics_execution_history_counts_check CHECK (
    dirty_sources_claimed >= 0
    AND refresh_keys_planned >= 0
    AND statement_groups_executed >= 0
    AND snapshot_rows_inserted >= 0
    AND snapshot_rows_updated >= 0
    AND snapshot_rows_unchanged >= 0
    AND dead_letter_count >= 0
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS metrics_tenant_commercial_snapshot_tenant_key ON app.metrics_tenant_commercial_snapshot (tenant_id) WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS metrics_tenant_inventory_snapshot_tenant_key ON app.metrics_tenant_inventory_snapshot (tenant_id) WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS metrics_tenant_buyer_app_snapshot_tenant_key ON app.metrics_tenant_buyer_app_snapshot (tenant_id) WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS metrics_tenant_setup_snapshot_tenant_key ON app.metrics_tenant_setup_snapshot (tenant_id) WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS metrics_location_snapshot_grain_key ON app.metrics_location_snapshot (tenant_id, location_id) WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS metrics_buyer_snapshot_grain_key ON app.metrics_buyer_snapshot (tenant_id, buyer_id) WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS metrics_buyer_location_snapshot_grain_key ON app.metrics_buyer_location_snapshot (tenant_id, location_id, buyer_id) WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS metrics_product_snapshot_grain_key ON app.metrics_product_snapshot (tenant_id, tenant_product_id) WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS metrics_product_location_snapshot_grain_key ON app.metrics_product_location_snapshot (tenant_id, location_id, tenant_product_id) WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS metrics_tenant_daily_grain_key ON app.metrics_tenant_daily (tenant_id, day) WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS metrics_location_daily_grain_key ON app.metrics_location_daily (tenant_id, location_id, day) WHERE deleted_at IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS metrics_tenant_commercial_snapshot_external_ref_key ON app.metrics_tenant_commercial_snapshot (tenant_id, external_ref) WHERE external_ref IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS metrics_tenant_inventory_snapshot_external_ref_key ON app.metrics_tenant_inventory_snapshot (tenant_id, external_ref) WHERE external_ref IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS metrics_tenant_buyer_app_snapshot_external_ref_key ON app.metrics_tenant_buyer_app_snapshot (tenant_id, external_ref) WHERE external_ref IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS metrics_tenant_setup_snapshot_external_ref_key ON app.metrics_tenant_setup_snapshot (tenant_id, external_ref) WHERE external_ref IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS metrics_location_snapshot_external_ref_key ON app.metrics_location_snapshot (tenant_id, external_ref) WHERE external_ref IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS metrics_buyer_snapshot_external_ref_key ON app.metrics_buyer_snapshot (tenant_id, external_ref) WHERE external_ref IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS metrics_buyer_location_snapshot_external_ref_key ON app.metrics_buyer_location_snapshot (tenant_id, external_ref) WHERE external_ref IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS metrics_product_snapshot_external_ref_key ON app.metrics_product_snapshot (tenant_id, external_ref) WHERE external_ref IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS metrics_product_location_snapshot_external_ref_key ON app.metrics_product_location_snapshot (tenant_id, external_ref) WHERE external_ref IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS metrics_tenant_daily_external_ref_key ON app.metrics_tenant_daily (tenant_id, external_ref) WHERE external_ref IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS metrics_location_daily_external_ref_key ON app.metrics_location_daily (tenant_id, external_ref) WHERE external_ref IS NOT NULL;

CREATE INDEX IF NOT EXISTS metrics_buyer_snapshot_overdue_idx ON app.metrics_buyer_snapshot (tenant_id, overdue_amount DESC, buyer_id) WHERE deleted_at IS NULL AND overdue_amount > 0;
CREATE INDEX IF NOT EXISTS metrics_buyer_snapshot_last_demand_idx ON app.metrics_buyer_snapshot (tenant_id, last_invoice_at DESC NULLS LAST, buyer_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS metrics_product_snapshot_availability_idx ON app.metrics_product_snapshot (tenant_id, out_of_stock DESC, low_stock DESC, invoice_value_90d DESC, tenant_product_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS metrics_location_snapshot_overdue_idx ON app.metrics_location_snapshot (tenant_id, overdue_amount DESC, location_id) WHERE deleted_at IS NULL AND overdue_amount > 0;
CREATE INDEX IF NOT EXISTS metrics_tenant_daily_tenant_day_idx ON app.metrics_tenant_daily (tenant_id, day DESC) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS metrics_location_daily_tenant_location_day_idx ON app.metrics_location_daily (tenant_id, location_id, day DESC) WHERE deleted_at IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS metrics_dirty_work_active_source_key
  ON app.metrics_dirty_work (tenant_id, domain, source_type, source_id)
  WHERE state = ANY (ARRAY['pending', 'claimed', 'retry']);
CREATE INDEX IF NOT EXISTS metrics_dirty_work_pending_claim_idx
  ON app.metrics_dirty_work (state, next_attempt_at, lease_until, tenant_id, domain, source_type, source_id)
  WHERE state = ANY (ARRAY['pending', 'retry']);
CREATE INDEX IF NOT EXISTS metrics_dirty_work_tenant_domain_updated_idx
  ON app.metrics_dirty_work (tenant_id, domain, updated_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS metrics_runtime_control_global_key
  ON app.metrics_runtime_control (control_scope)
  WHERE control_scope = 'global';
CREATE UNIQUE INDEX IF NOT EXISTS metrics_runtime_control_tenant_domain_key
  ON app.metrics_runtime_control (tenant_id, COALESCE(domain, 'all'))
  WHERE control_scope = 'tenant';
CREATE UNIQUE INDEX IF NOT EXISTS metrics_refresh_state_tenant_domain_key
  ON app.metrics_refresh_state (tenant_id, domain);
CREATE UNIQUE INDEX IF NOT EXISTS metrics_refresh_leases_global_key
  ON app.metrics_refresh_leases (lease_scope)
  WHERE lease_scope = 'global';
CREATE UNIQUE INDEX IF NOT EXISTS metrics_refresh_leases_tenant_domain_key
  ON app.metrics_refresh_leases (tenant_id, domain)
  WHERE lease_scope = 'tenant_domain';
CREATE INDEX IF NOT EXISTS metrics_execution_history_started_idx
  ON app.metrics_execution_history (started_at DESC, tenant_id, domain);

ALTER TABLE app.metrics_tenant_commercial_snapshot ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.metrics_tenant_inventory_snapshot ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.metrics_tenant_buyer_app_snapshot ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.metrics_tenant_setup_snapshot ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.metrics_location_snapshot ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.metrics_buyer_snapshot ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.metrics_buyer_location_snapshot ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.metrics_product_snapshot ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.metrics_product_location_snapshot ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.metrics_tenant_daily ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.metrics_location_daily ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.metrics_dirty_work ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.metrics_runtime_control ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.metrics_refresh_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.metrics_refresh_leases ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.metrics_execution_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "seller members can read metrics_tenant_commercial_snapshot" ON app.metrics_tenant_commercial_snapshot FOR SELECT TO authenticated USING (app.is_seller() AND tenant_id = app.jwt_tenant_id());
CREATE POLICY "seller members can read metrics_tenant_inventory_snapshot" ON app.metrics_tenant_inventory_snapshot FOR SELECT TO authenticated USING (app.is_seller() AND tenant_id = app.jwt_tenant_id());
CREATE POLICY "seller members can read metrics_tenant_buyer_app_snapshot" ON app.metrics_tenant_buyer_app_snapshot FOR SELECT TO authenticated USING (app.is_seller() AND tenant_id = app.jwt_tenant_id());
CREATE POLICY "seller members can read metrics_tenant_setup_snapshot" ON app.metrics_tenant_setup_snapshot FOR SELECT TO authenticated USING (app.is_seller() AND tenant_id = app.jwt_tenant_id());
CREATE POLICY "seller members can read metrics_location_snapshot" ON app.metrics_location_snapshot FOR SELECT TO authenticated USING (app.is_seller() AND tenant_id = app.jwt_tenant_id());
CREATE POLICY "seller members can read metrics_buyer_snapshot" ON app.metrics_buyer_snapshot FOR SELECT TO authenticated USING (app.is_seller() AND tenant_id = app.jwt_tenant_id());
CREATE POLICY "seller members can read metrics_buyer_location_snapshot" ON app.metrics_buyer_location_snapshot FOR SELECT TO authenticated USING (app.is_seller() AND tenant_id = app.jwt_tenant_id());
CREATE POLICY "seller members can read metrics_product_snapshot" ON app.metrics_product_snapshot FOR SELECT TO authenticated USING (app.is_seller() AND tenant_id = app.jwt_tenant_id());
CREATE POLICY "seller members can read metrics_product_location_snapshot" ON app.metrics_product_location_snapshot FOR SELECT TO authenticated USING (app.is_seller() AND tenant_id = app.jwt_tenant_id());
CREATE POLICY "seller members can read metrics_tenant_daily" ON app.metrics_tenant_daily FOR SELECT TO authenticated USING (app.is_seller() AND tenant_id = app.jwt_tenant_id());
CREATE POLICY "seller members can read metrics_location_daily" ON app.metrics_location_daily FOR SELECT TO authenticated USING (app.is_seller() AND tenant_id = app.jwt_tenant_id());
CREATE POLICY "seller members can read metrics_runtime_control" ON app.metrics_runtime_control FOR SELECT TO authenticated USING (control_scope = 'global' OR (tenant_id = app.jwt_tenant_id() AND app.is_seller()));
CREATE POLICY "seller members can read metrics_refresh_state" ON app.metrics_refresh_state FOR SELECT TO authenticated USING (app.is_seller() AND tenant_id = app.jwt_tenant_id());
CREATE POLICY "seller members can read metrics_execution_history" ON app.metrics_execution_history FOR SELECT TO authenticated USING (tenant_id IS NULL OR (app.is_seller() AND tenant_id = app.jwt_tenant_id()));

GRANT SELECT ON TABLE
  app.metrics_tenant_commercial_snapshot,
  app.metrics_tenant_inventory_snapshot,
  app.metrics_tenant_buyer_app_snapshot,
  app.metrics_tenant_setup_snapshot,
  app.metrics_location_snapshot,
  app.metrics_buyer_snapshot,
  app.metrics_buyer_location_snapshot,
  app.metrics_product_snapshot,
  app.metrics_product_location_snapshot,
  app.metrics_tenant_daily,
  app.metrics_location_daily,
  app.metrics_runtime_control,
  app.metrics_refresh_state,
  app.metrics_execution_history
TO authenticated;

GRANT ALL ON TABLE
  app.metrics_tenant_commercial_snapshot,
  app.metrics_tenant_inventory_snapshot,
  app.metrics_tenant_buyer_app_snapshot,
  app.metrics_tenant_setup_snapshot,
  app.metrics_location_snapshot,
  app.metrics_buyer_snapshot,
  app.metrics_buyer_location_snapshot,
  app.metrics_product_snapshot,
  app.metrics_product_location_snapshot,
  app.metrics_tenant_daily,
  app.metrics_location_daily,
  app.metrics_dirty_work,
  app.metrics_runtime_control,
  app.metrics_refresh_state,
  app.metrics_refresh_leases,
  app.metrics_execution_history
TO service_role;

CREATE OR REPLACE FUNCTION app.metrics_dispatch_enabled(p_tenant_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = app, pg_temp
AS $$
  SELECT
    COALESCE((
      SELECT mrc.dispatch_enabled
      FROM app.metrics_runtime_control mrc
      WHERE mrc.control_scope = 'global'
      LIMIT 1
    ), false)
    AND
    COALESCE((
      SELECT bool_and(mrc.dispatch_enabled)
      FROM app.metrics_runtime_control mrc
      WHERE mrc.control_scope = 'tenant'
        AND mrc.tenant_id = p_tenant_id
    ), true);
$$;

REVOKE ALL ON FUNCTION app.metrics_dispatch_enabled(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.metrics_dispatch_enabled(uuid) TO authenticated, service_role;
