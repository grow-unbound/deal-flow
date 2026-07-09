-- Zoho webhook refactor: move from one tenant-level webhook row to
-- entity-scoped inbound webhook registrations with runtime audit trails.

-- ── integration_webhooks: entity-scoped metadata ──────────────────────────
ALTER TABLE app.integration_webhooks
  ADD COLUMN IF NOT EXISTS provider text NOT NULL DEFAULT 'zoho',
  ADD COLUMN IF NOT EXISTS entity_type text,
  ADD COLUMN IF NOT EXISTS remote_webhook_id text,
  ADD COLUMN IF NOT EXISTS secret text,
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS webhook_config jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS last_verified_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_received_at timestamptz;

ALTER TABLE app.integration_webhooks
  DROP CONSTRAINT IF EXISTS integration_webhooks_status_check;
ALTER TABLE app.integration_webhooks
  ADD CONSTRAINT integration_webhooks_status_check CHECK (
    status IN ('pending', 'active', 'failed', 'disabled')
  );

CREATE UNIQUE INDEX IF NOT EXISTS integration_webhooks_tenant_integration_entity_unique
  ON app.integration_webhooks (tenant_integration_id, provider, entity_type)
  WHERE deleted_at IS NULL AND entity_type IS NOT NULL;

CREATE INDEX IF NOT EXISTS integration_webhooks_lookup_idx
  ON app.integration_webhooks (tenant_id, tenant_integration_id, provider, entity_type)
  WHERE deleted_at IS NULL;

-- ── webhook event audit tables ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS app.integration_webhook_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES app.tenants(id) ON DELETE RESTRICT,
  tenant_integration_id uuid NOT NULL REFERENCES app.tenant_integrations(id) ON DELETE RESTRICT,
  integration_webhook_id uuid REFERENCES app.integration_webhooks(id) ON DELETE RESTRICT,
  provider text NOT NULL DEFAULT 'zoho',
  entity_type text NOT NULL,
  event_type text,
  external_entity_id text,
  remote_webhook_id text,
  request_headers jsonb NOT NULL DEFAULT '{}'::jsonb,
  request_query jsonb NOT NULL DEFAULT '{}'::jsonb,
  raw_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  normalized_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  processing_status text NOT NULL DEFAULT 'received',
  source_created_at timestamptz,
  source_updated_at timestamptz,
  received_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz,
  replay_count integer NOT NULL DEFAULT 0,
  replay_of_event_id uuid REFERENCES app.integration_webhook_events(id) ON DELETE RESTRICT,
  runtime_meta jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id),
  updated_by uuid REFERENCES auth.users(id),
  deleted_at timestamptz,
  external_ref text,
  CONSTRAINT integration_webhook_events_status_check CHECK (
    processing_status IN ('received', 'processing', 'processed', 'failed', 'ignored')
  )
);

CREATE INDEX IF NOT EXISTS idx_integration_webhook_events_tenant_received_at
  ON app.integration_webhook_events (tenant_id, received_at DESC)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_integration_webhook_events_lookup
  ON app.integration_webhook_events (tenant_integration_id, integration_webhook_id, entity_type, event_type)
  WHERE deleted_at IS NULL;

DROP TRIGGER IF EXISTS integration_webhook_events_updated_at ON app.integration_webhook_events;
CREATE TRIGGER integration_webhook_events_updated_at
  BEFORE UPDATE ON app.integration_webhook_events
  FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();

CREATE TABLE IF NOT EXISTS app.integration_webhook_event_changes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES app.tenants(id) ON DELETE RESTRICT,
  tenant_integration_id uuid NOT NULL REFERENCES app.tenant_integrations(id) ON DELETE RESTRICT,
  integration_webhook_event_id uuid NOT NULL REFERENCES app.integration_webhook_events(id) ON DELETE RESTRICT,
  entity_type text NOT NULL,
  target_table text NOT NULL,
  target_entity_type text NOT NULL,
  target_row_id uuid,
  operation text NOT NULL,
  merge_decision text,
  before_state jsonb NOT NULL DEFAULT '{}'::jsonb,
  after_state jsonb NOT NULL DEFAULT '{}'::jsonb,
  delta jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id),
  updated_by uuid REFERENCES auth.users(id),
  deleted_at timestamptz,
  external_ref text,
  CONSTRAINT integration_webhook_event_changes_operation_check CHECK (
    operation IN ('create', 'update', 'soft_delete', 'skip', 'conflict')
  )
);

CREATE INDEX IF NOT EXISTS idx_integration_webhook_event_changes_event
  ON app.integration_webhook_event_changes (integration_webhook_event_id, created_at)
  WHERE deleted_at IS NULL;

DROP TRIGGER IF EXISTS integration_webhook_event_changes_updated_at ON app.integration_webhook_event_changes;
CREATE TRIGGER integration_webhook_event_changes_updated_at
  BEFORE UPDATE ON app.integration_webhook_event_changes
  FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();

CREATE TABLE IF NOT EXISTS app.integration_webhook_errors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES app.tenants(id) ON DELETE RESTRICT,
  tenant_integration_id uuid NOT NULL REFERENCES app.tenant_integrations(id) ON DELETE RESTRICT,
  integration_webhook_event_id uuid REFERENCES app.integration_webhook_events(id) ON DELETE RESTRICT,
  integration_webhook_id uuid REFERENCES app.integration_webhooks(id) ON DELETE RESTRICT,
  provider text NOT NULL DEFAULT 'zoho',
  entity_type text,
  event_type text,
  stage text NOT NULL,
  reason_code text,
  message text NOT NULL,
  retryable boolean NOT NULL DEFAULT false,
  debug_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id),
  updated_by uuid REFERENCES auth.users(id),
  deleted_at timestamptz,
  external_ref text
);

CREATE INDEX IF NOT EXISTS idx_integration_webhook_errors_event
  ON app.integration_webhook_errors (integration_webhook_event_id, created_at DESC)
  WHERE deleted_at IS NULL;

DROP TRIGGER IF EXISTS integration_webhook_errors_updated_at ON app.integration_webhook_errors;
CREATE TRIGGER integration_webhook_errors_updated_at
  BEFORE UPDATE ON app.integration_webhook_errors
  FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();

CREATE TABLE IF NOT EXISTS app.integration_webhook_echo_guards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES app.tenants(id) ON DELETE RESTRICT,
  tenant_integration_id uuid NOT NULL REFERENCES app.tenant_integrations(id) ON DELETE RESTRICT,
  entity_type text NOT NULL,
  local_entity_id uuid,
  external_entity_id text,
  protected_fields text[] NOT NULL DEFAULT '{}'::text[],
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id),
  updated_by uuid REFERENCES auth.users(id),
  deleted_at timestamptz,
  external_ref text
);

CREATE INDEX IF NOT EXISTS idx_integration_webhook_echo_guards_active
  ON app.integration_webhook_echo_guards (tenant_integration_id, entity_type, external_entity_id, expires_at)
  WHERE deleted_at IS NULL AND consumed_at IS NULL;

DROP TRIGGER IF EXISTS integration_webhook_echo_guards_updated_at ON app.integration_webhook_echo_guards;
CREATE TRIGGER integration_webhook_echo_guards_updated_at
  BEFORE UPDATE ON app.integration_webhook_echo_guards
  FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();

-- ── RLS and consistency ────────────────────────────────────────────────────
ALTER TABLE app.integration_webhook_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.integration_webhook_event_changes ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.integration_webhook_errors ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.integration_webhook_echo_guards ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS integration_webhook_events_select ON app.integration_webhook_events;
CREATE POLICY integration_webhook_events_select ON app.integration_webhook_events
  FOR SELECT USING (app.is_seller() AND tenant_id = app.jwt_tenant_id());

DROP POLICY IF EXISTS integration_webhook_event_changes_select ON app.integration_webhook_event_changes;
CREATE POLICY integration_webhook_event_changes_select ON app.integration_webhook_event_changes
  FOR SELECT USING (app.is_seller() AND tenant_id = app.jwt_tenant_id());

DROP POLICY IF EXISTS integration_webhook_errors_select ON app.integration_webhook_errors;
CREATE POLICY integration_webhook_errors_select ON app.integration_webhook_errors
  FOR SELECT USING (app.is_seller() AND tenant_id = app.jwt_tenant_id());

DROP POLICY IF EXISTS integration_webhook_echo_guards_select ON app.integration_webhook_echo_guards;
CREATE POLICY integration_webhook_echo_guards_select ON app.integration_webhook_echo_guards
  FOR SELECT USING (app.is_seller() AND tenant_id = app.jwt_tenant_id());

DROP TRIGGER IF EXISTS integration_webhook_events_tenant_consistency ON app.integration_webhook_events;
CREATE TRIGGER integration_webhook_events_tenant_consistency
  BEFORE INSERT OR UPDATE ON app.integration_webhook_events
  FOR EACH ROW EXECUTE FUNCTION app._assert_integration_child_tenant_consistency();

DROP TRIGGER IF EXISTS integration_webhook_event_changes_tenant_consistency ON app.integration_webhook_event_changes;
CREATE TRIGGER integration_webhook_event_changes_tenant_consistency
  BEFORE INSERT OR UPDATE ON app.integration_webhook_event_changes
  FOR EACH ROW EXECUTE FUNCTION app._assert_integration_child_tenant_consistency();

DROP TRIGGER IF EXISTS integration_webhook_errors_tenant_consistency ON app.integration_webhook_errors;
CREATE TRIGGER integration_webhook_errors_tenant_consistency
  BEFORE INSERT OR UPDATE ON app.integration_webhook_errors
  FOR EACH ROW EXECUTE FUNCTION app._assert_integration_child_tenant_consistency();

DROP TRIGGER IF EXISTS integration_webhook_echo_guards_tenant_consistency ON app.integration_webhook_echo_guards;
CREATE TRIGGER integration_webhook_echo_guards_tenant_consistency
  BEFORE INSERT OR UPDATE ON app.integration_webhook_echo_guards
  FOR EACH ROW EXECUTE FUNCTION app._assert_integration_child_tenant_consistency();
