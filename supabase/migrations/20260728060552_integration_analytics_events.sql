CREATE TABLE IF NOT EXISTS app.integration_analytics_events (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  tenant_id uuid NOT NULL,
  tenant_integration_id uuid NOT NULL,
  provider text DEFAULT 'zoho'::text NOT NULL,
  entity_type text NOT NULL,
  external_id text NOT NULL,
  internal_id uuid NOT NULL,
  event_key text NOT NULL,
  event_name text NOT NULL,
  emit_status text DEFAULT 'pending'::text NOT NULL,
  attempt_count integer DEFAULT 0 NOT NULL,
  last_attempted_at timestamptz,
  sent_at timestamptz,
  last_error text,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT integration_analytics_events_pkey PRIMARY KEY (id),
  CONSTRAINT integration_analytics_events_event_key_key UNIQUE (event_key),
  CONSTRAINT integration_analytics_events_status_check CHECK (
    emit_status = ANY (ARRAY['pending'::text, 'sent'::text, 'failed'::text, 'skipped'::text])
  ),
  CONSTRAINT integration_analytics_events_entity_type_check CHECK (
    entity_type = ANY (ARRAY['customers'::text, 'estimates'::text, 'orders'::text, 'invoices'::text])
  )
);

ALTER TABLE app.integration_analytics_events ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_integration_analytics_events_status
  ON app.integration_analytics_events (emit_status, created_at)
  WHERE emit_status IN ('pending', 'failed');

CREATE INDEX IF NOT EXISTS idx_integration_analytics_events_tenant_created
  ON app.integration_analytics_events (tenant_id, created_at DESC);

ALTER TABLE ONLY app.integration_analytics_events
  ADD CONSTRAINT integration_analytics_events_tenant_id_fkey
  FOREIGN KEY (tenant_id) REFERENCES app.tenants(id) ON DELETE RESTRICT;

ALTER TABLE ONLY app.integration_analytics_events
  ADD CONSTRAINT integration_analytics_events_tenant_integration_id_fkey
  FOREIGN KEY (tenant_integration_id) REFERENCES app.tenant_integrations(id) ON DELETE RESTRICT;

ALTER TABLE ONLY app.integration_analytics_events
  ADD CONSTRAINT integration_analytics_events_tenant_integration_tenant_fkey
  FOREIGN KEY (tenant_integration_id, tenant_id) REFERENCES app.tenant_integrations(id, tenant_id) ON DELETE RESTRICT;

CREATE TRIGGER integration_analytics_events_updated_at
  BEFORE UPDATE ON app.integration_analytics_events
  FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();

CREATE POLICY integration_analytics_events_select ON app.integration_analytics_events
  FOR SELECT
  USING (app.is_seller() AND tenant_id = app.jwt_tenant_id());

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE app.integration_analytics_events TO service_role;

CREATE OR REPLACE FUNCTION app.purge_integration_analytics_events()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'app', 'pg_catalog'
AS $$
BEGIN
  DELETE FROM app.integration_analytics_events
  WHERE emit_status IN ('sent', 'skipped', 'failed')
    AND created_at < now() - interval '2 days';
END;
$$;

CREATE OR REPLACE FUNCTION app.run_storage_maintenance()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'app', 'pg_catalog'
AS $$
BEGIN
  PERFORM app.purge_cron_job_run_details();
  PERFORM app.purge_metrics_dirty_work();
  PERFORM app.purge_integration_webhook_events();
  PERFORM app.purge_integration_analytics_events();
  PERFORM app.purge_net_http_response();
  PERFORM app.purge_supabase_hooks();
  PERFORM app.purge_otp_sessions();
END;
$$;
