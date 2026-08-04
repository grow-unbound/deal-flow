-- Top-80%-of-revenue concentration cards (Customers/Brands/Locations) are
-- window-function ranking scans over the full buyer/brand/location period
-- summary tables, currently recomputed live on every 15s tick regardless of
-- what actually changed. Revenue concentration doesn't meaningfully shift in
-- 15 seconds, so these move to a once-daily batch job
-- (app.metrics_v4_refresh_top80_daily, see next migration) that writes into
-- this cache table; app._metrics_v4_refresh_landing_kpis reads from here
-- instead of recomputing the ranking live on every tick.
CREATE TABLE IF NOT EXISTS app.metrics_tenant_top80_cache (
  tenant_id uuid NOT NULL REFERENCES app.tenants(id) ON DELETE RESTRICT,
  entity_kind text NOT NULL,
  grain text NOT NULL,
  period_start date NOT NULL,
  top80_count bigint DEFAULT 0 NOT NULL,
  computed_at timestamptz DEFAULT now() NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT metrics_tenant_top80_cache_entity_kind_check CHECK (entity_kind = ANY (ARRAY['customers','brands','locations'])),
  PRIMARY KEY (tenant_id, entity_kind, grain, period_start)
);

ALTER TABLE app.metrics_tenant_top80_cache ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS metrics_tenant_top80_cache_tenant_select ON app.metrics_tenant_top80_cache;
CREATE POLICY metrics_tenant_top80_cache_tenant_select ON app.metrics_tenant_top80_cache
  FOR SELECT USING (tenant_id = app.jwt_tenant_id());

GRANT SELECT ON app.metrics_tenant_top80_cache TO authenticated;
GRANT ALL ON app.metrics_tenant_top80_cache TO service_role;
