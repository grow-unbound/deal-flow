-- Metrics V2 Phase 3: manual refresh kernel.
--
-- This migration is deliberately inert after application:
--   * dispatch remains default-off;
--   * no business-row capture trigger is installed;
--   * no Cron job or Realtime publication is added;
--   * all mutation/dispatcher RPCs are service-role only.

ALTER TABLE app.metrics_tenant_commercial_snapshot ADD COLUMN IF NOT EXISTS fencing_epoch bigint DEFAULT 0 NOT NULL;
ALTER TABLE app.metrics_tenant_inventory_snapshot ADD COLUMN IF NOT EXISTS fencing_epoch bigint DEFAULT 0 NOT NULL;
ALTER TABLE app.metrics_tenant_buyer_app_snapshot ADD COLUMN IF NOT EXISTS fencing_epoch bigint DEFAULT 0 NOT NULL;
ALTER TABLE app.metrics_tenant_setup_snapshot ADD COLUMN IF NOT EXISTS fencing_epoch bigint DEFAULT 0 NOT NULL;
ALTER TABLE app.metrics_location_snapshot ADD COLUMN IF NOT EXISTS fencing_epoch bigint DEFAULT 0 NOT NULL;
ALTER TABLE app.metrics_buyer_snapshot ADD COLUMN IF NOT EXISTS fencing_epoch bigint DEFAULT 0 NOT NULL;
ALTER TABLE app.metrics_buyer_location_snapshot ADD COLUMN IF NOT EXISTS fencing_epoch bigint DEFAULT 0 NOT NULL;
ALTER TABLE app.metrics_product_snapshot ADD COLUMN IF NOT EXISTS fencing_epoch bigint DEFAULT 0 NOT NULL;
ALTER TABLE app.metrics_product_location_snapshot ADD COLUMN IF NOT EXISTS fencing_epoch bigint DEFAULT 0 NOT NULL;
ALTER TABLE app.metrics_tenant_daily ADD COLUMN IF NOT EXISTS fencing_epoch bigint DEFAULT 0 NOT NULL;
ALTER TABLE app.metrics_location_daily ADD COLUMN IF NOT EXISTS fencing_epoch bigint DEFAULT 0 NOT NULL;

ALTER TABLE app.metrics_dirty_work
  ADD COLUMN IF NOT EXISTS cursor_kind text,
  ADD COLUMN IF NOT EXISTS cursor_day date,
  ADD COLUMN IF NOT EXISTS cursor_id uuid,
  ADD COLUMN IF NOT EXISTS cursor_aux_id uuid;

ALTER TABLE app.metrics_dirty_work
  DROP CONSTRAINT IF EXISTS metrics_dirty_work_cursor_kind_check;
ALTER TABLE app.metrics_dirty_work
  ADD CONSTRAINT metrics_dirty_work_cursor_kind_check CHECK (
    cursor_kind IS NULL OR cursor_kind = ANY (
      ARRAY['buyer', 'product', 'product_location', 'location', 'day', 'location_day', 'done']
    )
  );

-- These indexes are the exact canonical-date and inventory join paths used by
-- the bounded Phase 3 refresh statements. They avoid falling back to created_at
-- or scanning every warehouse inventory row for one location.
CREATE INDEX IF NOT EXISTS estimates_metrics_tenant_day_idx
  ON app.estimates (tenant_id, (app.metric_day_ist(estimate_date, created_at)), id)
  WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS orders_metrics_tenant_day_idx
  ON app.orders (tenant_id, (app.metric_day_ist(order_date, created_at)), id)
  WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS invoices_metrics_tenant_day_idx
  ON app.invoices (tenant_id, (app.metric_day_ist(invoice_date, created_at)), id)
  WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS tenant_inventory_metrics_warehouse_product_idx
  ON app.tenant_inventory (warehouse_id, tenant_product_id)
  WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS metrics_dirty_work_fair_claim_idx
  ON app.metrics_dirty_work (next_attempt_at, created_at, tenant_id, domain, id)
  WHERE state = ANY (ARRAY['pending', 'retry']);

CREATE OR REPLACE FUNCTION app.metrics_source_type_valid(
  p_domain text,
  p_source_type text
)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SECURITY INVOKER
SET search_path = pg_catalog, app, pg_temp
AS $$
  SELECT CASE p_domain
    WHEN 'commercial' THEN p_source_type = ANY (ARRAY[
      'estimate', 'estimate_item', 'order', 'order_item', 'invoice', 'invoice_item',
      'sync_job', 'month_rollover', 'age_out', 'reconciliation', 'repair'
    ])
    WHEN 'inventory' THEN p_source_type = ANY (ARRAY[
      'inventory', 'tenant_product', 'warehouse', 'location', 'sync_job',
      'age_out', 'reconciliation', 'repair'
    ])
    WHEN 'buyer_app' THEN p_source_type = ANY (ARRAY[
      'buyer_app_activity', 'buyer_access', 'estimate', 'order', 'invoice',
      'sync_job', 'age_out', 'reconciliation', 'repair'
    ])
    WHEN 'setup' THEN p_source_type = ANY (ARRAY[
      'buyer', 'buyer_access', 'tenant_product', 'brand', 'category', 'location',
      'warehouse', 'cohort', 'price_list', 'campaign', 'module_setting',
      'sync_job', 'reconciliation', 'repair'
    ])
    ELSE false
  END;
$$;

CREATE OR REPLACE FUNCTION app.metrics_dispatch_enabled(p_tenant_id uuid, p_domain text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = pg_catalog, app, pg_temp
AS $$
  SELECT
    COALESCE((
      SELECT c.dispatch_enabled
      FROM app.metrics_runtime_control c
      WHERE c.control_scope = 'global'
      LIMIT 1
    ), false)
    AND COALESCE((
      SELECT bool_and(c.dispatch_enabled)
      FROM app.metrics_runtime_control c
      WHERE c.control_scope = 'tenant'
        AND c.tenant_id = p_tenant_id
        AND (c.domain IS NULL OR c.domain = p_domain)
    ), true);
$$;

CREATE OR REPLACE FUNCTION app.metrics_mark_dirty(
  p_tenant_id uuid,
  p_domain text,
  p_source_type text,
  p_source_id uuid,
  p_old_buyer_id uuid DEFAULT NULL,
  p_new_buyer_id uuid DEFAULT NULL,
  p_old_tenant_product_id uuid DEFAULT NULL,
  p_new_tenant_product_id uuid DEFAULT NULL,
  p_old_location_id uuid DEFAULT NULL,
  p_new_location_id uuid DEFAULT NULL,
  p_old_day date DEFAULT NULL,
  p_new_day date DEFAULT NULL,
  p_dirty_from date DEFAULT NULL,
  p_dirty_to date DEFAULT NULL
)
RETURNS TABLE (work_id uuid, dirty_version bigint)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, app, pg_temp
AS $$
BEGIN
  IF p_tenant_id IS NULL OR p_source_id IS NULL THEN
    RAISE EXCEPTION 'metrics_dirty_identity_required' USING ERRCODE = '22023';
  END IF;
  IF NOT app.metrics_source_type_valid(p_domain, p_source_type) THEN
    RAISE EXCEPTION 'metrics_dirty_source_invalid:%/%', p_domain, p_source_type USING ERRCODE = '22023';
  END IF;
  IF p_dirty_from IS NOT NULL AND p_dirty_to IS NOT NULL AND p_dirty_from > p_dirty_to THEN
    RAISE EXCEPTION 'metrics_dirty_range_invalid' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM app.tenants t WHERE t.id = p_tenant_id AND t.deleted_at IS NULL) THEN
    RAISE EXCEPTION 'metrics_tenant_not_found' USING ERRCODE = 'P0002';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM (VALUES (p_old_buyer_id), (p_new_buyer_id)) AS ids(id)
    WHERE ids.id IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM app.buyers b
        WHERE b.id = ids.id AND b.tenant_id = p_tenant_id
      )
  ) THEN
    RAISE EXCEPTION 'metrics_buyer_tenant_mismatch' USING ERRCODE = '42501';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM (VALUES (p_old_tenant_product_id), (p_new_tenant_product_id)) AS ids(id)
    WHERE ids.id IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM app.tenant_products tp
        WHERE tp.id = ids.id AND tp.tenant_id = p_tenant_id
      )
  ) THEN
    RAISE EXCEPTION 'metrics_product_tenant_mismatch' USING ERRCODE = '42501';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM (VALUES (p_old_location_id), (p_new_location_id)) AS ids(id)
    WHERE ids.id IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM app.locations l
        WHERE l.id = ids.id AND l.tenant_id = p_tenant_id
      )
  ) THEN
    RAISE EXCEPTION 'metrics_location_tenant_mismatch' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  INSERT INTO app.metrics_dirty_work (
    tenant_id, domain, source_type, source_id,
    old_buyer_id, new_buyer_id,
    old_tenant_product_id, new_tenant_product_id,
    old_location_id, new_location_id,
    old_day, new_day, dirty_from, dirty_to,
    dirty_version, state, attempts, next_attempt_at,
    lease_owner, lease_until, claimed_version, last_error,
    cursor_kind, cursor_day, cursor_id, cursor_aux_id, updated_at, completed_at
  ) VALUES (
    p_tenant_id, p_domain, p_source_type, p_source_id,
    p_old_buyer_id, p_new_buyer_id,
    p_old_tenant_product_id, p_new_tenant_product_id,
    p_old_location_id, p_new_location_id,
    p_old_day, p_new_day, p_dirty_from, p_dirty_to,
    1, 'pending', 0, clock_timestamp(),
    NULL, NULL, NULL, NULL,
    NULL, NULL, NULL, NULL, clock_timestamp(), NULL
  )
  ON CONFLICT (tenant_id, domain, source_type, source_id)
    WHERE state = ANY (ARRAY['pending', 'claimed', 'retry'])
  DO UPDATE SET
    old_buyer_id = COALESCE(app.metrics_dirty_work.old_buyer_id, EXCLUDED.old_buyer_id),
    new_buyer_id = COALESCE(EXCLUDED.new_buyer_id, app.metrics_dirty_work.new_buyer_id),
    old_tenant_product_id = COALESCE(app.metrics_dirty_work.old_tenant_product_id, EXCLUDED.old_tenant_product_id),
    new_tenant_product_id = COALESCE(EXCLUDED.new_tenant_product_id, app.metrics_dirty_work.new_tenant_product_id),
    old_location_id = COALESCE(app.metrics_dirty_work.old_location_id, EXCLUDED.old_location_id),
    new_location_id = COALESCE(EXCLUDED.new_location_id, app.metrics_dirty_work.new_location_id),
    old_day = COALESCE(app.metrics_dirty_work.old_day, EXCLUDED.old_day),
    new_day = COALESCE(EXCLUDED.new_day, app.metrics_dirty_work.new_day),
    dirty_from = CASE
      WHEN app.metrics_dirty_work.dirty_from IS NULL THEN EXCLUDED.dirty_from
      WHEN EXCLUDED.dirty_from IS NULL THEN app.metrics_dirty_work.dirty_from
      ELSE LEAST(app.metrics_dirty_work.dirty_from, EXCLUDED.dirty_from)
    END,
    dirty_to = CASE
      WHEN app.metrics_dirty_work.dirty_to IS NULL THEN EXCLUDED.dirty_to
      WHEN EXCLUDED.dirty_to IS NULL THEN app.metrics_dirty_work.dirty_to
      ELSE GREATEST(app.metrics_dirty_work.dirty_to, EXCLUDED.dirty_to)
    END,
    dirty_version = app.metrics_dirty_work.dirty_version + 1,
    claimed_version = NULL,
    state = 'pending',
    attempts = 0,
    next_attempt_at = clock_timestamp(),
    lease_owner = NULL,
    lease_until = NULL,
    last_error = NULL,
    cursor_kind = NULL,
    cursor_day = NULL,
    cursor_id = NULL, cursor_aux_id = NULL,
    updated_at = clock_timestamp(),
    completed_at = NULL
  RETURNING app.metrics_dirty_work.id, app.metrics_dirty_work.dirty_version;
END;
$$;

CREATE OR REPLACE FUNCTION app.metrics_set_dispatch_enabled(
  p_enabled boolean,
  p_tenant_id uuid DEFAULT NULL,
  p_domain text DEFAULT NULL,
  p_pause_reason text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, app, pg_temp
AS $$
BEGIN
  IF p_domain IS NOT NULL AND p_domain <> ALL (ARRAY['commercial', 'inventory', 'buyer_app', 'setup']) THEN
    RAISE EXCEPTION 'metrics_domain_invalid' USING ERRCODE = '22023';
  END IF;
  IF p_tenant_id IS NULL AND p_domain IS NOT NULL THEN
    RAISE EXCEPTION 'global_domain_control_not_supported' USING ERRCODE = '22023';
  END IF;

  IF p_tenant_id IS NULL THEN
    INSERT INTO app.metrics_runtime_control (
      control_scope, tenant_id, domain, dispatch_enabled, pause_reason, updated_at
    ) VALUES ('global', NULL, NULL, p_enabled,
      CASE WHEN p_enabled THEN NULL ELSE p_pause_reason END, clock_timestamp())
    ON CONFLICT (control_scope) WHERE control_scope = 'global'
    DO UPDATE SET dispatch_enabled = EXCLUDED.dispatch_enabled,
      pause_reason = EXCLUDED.pause_reason, updated_at = EXCLUDED.updated_at;
  ELSE
    INSERT INTO app.metrics_runtime_control (
      control_scope, tenant_id, domain, dispatch_enabled, pause_reason, updated_at
    ) VALUES ('tenant', p_tenant_id, p_domain, p_enabled,
      CASE WHEN p_enabled THEN NULL ELSE p_pause_reason END, clock_timestamp())
    ON CONFLICT (tenant_id, COALESCE(domain, 'all')) WHERE control_scope = 'tenant'
    DO UPDATE SET dispatch_enabled = EXCLUDED.dispatch_enabled,
      pause_reason = EXCLUDED.pause_reason, updated_at = EXCLUDED.updated_at;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION app.metrics_release_expired_leases(p_limit integer DEFAULT 100)
RETURNS integer
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, app, pg_temp
AS $$
DECLARE
  v_count integer;
BEGIN
  WITH expired AS (
    SELECT mdw.id
    FROM app.metrics_dirty_work mdw
    WHERE mdw.state = 'claimed'
      AND mdw.lease_until < clock_timestamp()
    ORDER BY mdw.lease_until, mdw.id
    LIMIT LEAST(GREATEST(p_limit, 1), 100)
    FOR UPDATE SKIP LOCKED
  )
  UPDATE app.metrics_dirty_work mdw
  SET state = 'pending', lease_owner = NULL, lease_until = NULL,
      claimed_version = NULL, next_attempt_at = clock_timestamp(), updated_at = clock_timestamp()
  FROM expired e
  WHERE mdw.id = e.id;
  GET DIAGNOSTICS v_count = ROW_COUNT;

  UPDATE app.metrics_refresh_leases l
  SET owner_token = NULL, lease_until = NULL, heartbeat_at = NULL, updated_at = clock_timestamp()
  WHERE l.lease_until < clock_timestamp()
    AND NOT EXISTS (
      SELECT 1 FROM app.metrics_dirty_work w
      WHERE w.lease_owner = l.owner_token AND w.state = 'claimed'
    );
  RETURN v_count;
END;
$$;

CREATE OR REPLACE FUNCTION app.metrics_claim_dirty_work(p_owner_token uuid)
RETURNS TABLE (
  status text,
  owner_token uuid,
  fencing_epoch bigint,
  tenant_id uuid,
  domain text,
  dirty_sources integer,
  refresh_keys integer,
  statement_groups integer,
  has_more boolean,
  lease_until timestamptz,
  error_text text
)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, app, pg_temp
AS $$
#variable_conflict use_column
DECLARE
  v_control app.metrics_runtime_control%ROWTYPE;
  v_candidate record;
  v_global app.metrics_refresh_leases%ROWTYPE;
  v_tenant_lease app.metrics_refresh_leases%ROWTYPE;
  v_sources integer := 0;
  v_keys integer := 0;
BEGIN
  IF p_owner_token IS NULL THEN
    RAISE EXCEPTION 'metrics_owner_token_required' USING ERRCODE = '22023';
  END IF;

  PERFORM set_config('lock_timeout', '100ms', true);
  PERFORM set_config('statement_timeout', '3000ms', true);
  PERFORM app.metrics_release_expired_leases(100);

  SELECT * INTO v_control
  FROM app.metrics_runtime_control c
  WHERE c.control_scope = 'global'
  LIMIT 1;
  IF NOT FOUND OR NOT v_control.dispatch_enabled THEN
    RETURN QUERY SELECT 'disabled', p_owner_token, NULL::bigint, NULL::uuid, NULL::text,
      0, 0, 0, false, NULL::timestamptz, v_control.pause_reason;
    RETURN;
  END IF;

  INSERT INTO app.metrics_refresh_leases (
    lease_scope, owner_token, fencing_epoch, lease_until, heartbeat_at, updated_at
  ) VALUES (
    'global', p_owner_token, 1,
    clock_timestamp() + make_interval(secs => v_control.lease_ttl_seconds),
    clock_timestamp(), clock_timestamp()
  )
  ON CONFLICT (lease_scope) WHERE lease_scope = 'global'
  DO UPDATE SET
    owner_token = EXCLUDED.owner_token,
    fencing_epoch = app.metrics_refresh_leases.fencing_epoch +
      CASE WHEN app.metrics_refresh_leases.owner_token IS DISTINCT FROM EXCLUDED.owner_token THEN 1 ELSE 0 END,
    lease_until = EXCLUDED.lease_until,
    heartbeat_at = EXCLUDED.heartbeat_at,
    updated_at = EXCLUDED.updated_at
  WHERE app.metrics_refresh_leases.owner_token = EXCLUDED.owner_token
     OR app.metrics_refresh_leases.lease_until IS NULL
     OR app.metrics_refresh_leases.lease_until <= clock_timestamp()
  RETURNING * INTO v_global;

  IF v_global.owner_token IS NULL THEN
    RETURN QUERY SELECT 'busy', p_owner_token, NULL::bigint, NULL::uuid, NULL::text,
      0, 0, 0, true, NULL::timestamptz, NULL::text;
    RETURN;
  END IF;

  SELECT mdw.tenant_id, mdw.domain, MIN(mdw.next_attempt_at) AS due_at, MIN(mdw.created_at) AS oldest_at
  INTO v_candidate
  FROM app.metrics_dirty_work mdw
  WHERE mdw.state = ANY (ARRAY['pending', 'retry'])
    AND mdw.next_attempt_at <= clock_timestamp()
    AND app.metrics_dispatch_enabled(mdw.tenant_id, mdw.domain)
    AND NOT EXISTS (
      SELECT 1 FROM app.integration_sync_jobs j
      WHERE j.tenant_id = mdw.tenant_id
        AND j.phase = 'sync_run'
        AND j.status = ANY (ARRAY['pending', 'queued', 'running', 'paused'])
        AND j.deleted_at IS NULL
    )
  GROUP BY mdw.tenant_id, mdw.domain
  ORDER BY MIN(mdw.next_attempt_at), MIN(mdw.created_at), mdw.tenant_id, mdw.domain
  LIMIT 1;

  IF v_candidate.tenant_id IS NULL THEN
    UPDATE app.metrics_refresh_leases
    SET owner_token = NULL, lease_until = NULL, heartbeat_at = NULL, updated_at = clock_timestamp()
    WHERE lease_scope = 'global' AND owner_token = p_owner_token AND fencing_epoch = v_global.fencing_epoch;
    RETURN QUERY SELECT 'idle', p_owner_token, v_global.fencing_epoch, NULL::uuid, NULL::text,
      0, 0, 0, false, NULL::timestamptz, NULL::text;
    RETURN;
  END IF;

  INSERT INTO app.metrics_refresh_leases (
    lease_scope, tenant_id, domain, owner_token, fencing_epoch, lease_until, heartbeat_at, updated_at
  ) VALUES (
    'tenant_domain', v_candidate.tenant_id, v_candidate.domain, p_owner_token, v_global.fencing_epoch,
    v_global.lease_until, clock_timestamp(), clock_timestamp()
  )
  ON CONFLICT (tenant_id, domain) WHERE lease_scope = 'tenant_domain'
  DO UPDATE SET
    owner_token = EXCLUDED.owner_token,
    fencing_epoch = EXCLUDED.fencing_epoch,
    lease_until = EXCLUDED.lease_until,
    heartbeat_at = EXCLUDED.heartbeat_at,
    updated_at = EXCLUDED.updated_at
  WHERE app.metrics_refresh_leases.owner_token = EXCLUDED.owner_token
     OR app.metrics_refresh_leases.lease_until IS NULL
     OR app.metrics_refresh_leases.lease_until <= clock_timestamp()
  RETURNING * INTO v_tenant_lease;

  IF v_tenant_lease.owner_token IS NULL THEN
    UPDATE app.metrics_refresh_leases
    SET owner_token = NULL, lease_until = NULL, heartbeat_at = NULL, updated_at = clock_timestamp()
    WHERE lease_scope = 'global' AND owner_token = p_owner_token AND fencing_epoch = v_global.fencing_epoch;
    RETURN QUERY SELECT 'busy', p_owner_token, v_global.fencing_epoch,
      v_candidate.tenant_id, v_candidate.domain, 0, 0, 0, true, NULL::timestamptz, NULL::text;
    RETURN;
  END IF;

  WITH locked_candidates AS MATERIALIZED (
    SELECT mdw.*
    FROM app.metrics_dirty_work mdw
    WHERE mdw.tenant_id = v_candidate.tenant_id
      AND mdw.domain = v_candidate.domain
      AND mdw.state = ANY (ARRAY['pending', 'retry'])
      AND mdw.next_attempt_at <= clock_timestamp()
    ORDER BY mdw.next_attempt_at, mdw.created_at, mdw.id
    LIMIT v_control.max_dirty_sources_per_tick
    FOR UPDATE SKIP LOCKED
  ), candidates AS (
    SELECT mdw.id,
      CASE
        WHEN mdw.dirty_from IS NOT NULL OR mdw.dirty_to IS NOT NULL THEN v_control.max_refresh_keys_per_tick
        ELSE 1
          + (mdw.old_buyer_id IS NOT NULL)::integer + (mdw.new_buyer_id IS NOT NULL)::integer
          + (mdw.old_tenant_product_id IS NOT NULL)::integer + (mdw.new_tenant_product_id IS NOT NULL)::integer
          + (mdw.old_location_id IS NOT NULL)::integer + (mdw.new_location_id IS NOT NULL)::integer
          + (mdw.old_day IS NOT NULL)::integer + (mdw.new_day IS NOT NULL)::integer
      END AS key_cost,
      ROW_NUMBER() OVER (ORDER BY mdw.next_attempt_at, mdw.created_at, mdw.id) AS source_n
    FROM locked_candidates mdw
  ), budgeted AS (
    SELECT c.id, c.key_cost,
      SUM(c.key_cost) OVER (ORDER BY c.source_n) AS cumulative_keys
    FROM candidates c
  ), claimed AS (
    UPDATE app.metrics_dirty_work mdw
    SET state = 'claimed', claimed_version = mdw.dirty_version,
        lease_owner = p_owner_token, lease_until = v_global.lease_until,
        updated_at = clock_timestamp()
    FROM budgeted b
    WHERE mdw.id = b.id
      AND b.cumulative_keys <= v_control.max_refresh_keys_per_tick
    RETURNING b.key_cost
  )
  SELECT COUNT(*)::integer, COALESCE(SUM(key_cost), 0)::integer
  INTO v_sources, v_keys
  FROM claimed;

  IF v_sources = 0 THEN
    UPDATE app.metrics_refresh_leases
    SET owner_token = NULL, lease_until = NULL, heartbeat_at = NULL, updated_at = clock_timestamp()
    WHERE lease_scope = 'tenant_domain' AND tenant_id = v_candidate.tenant_id
      AND domain = v_candidate.domain AND owner_token = p_owner_token
      AND fencing_epoch = v_global.fencing_epoch;
    UPDATE app.metrics_refresh_leases
    SET owner_token = NULL, lease_until = NULL, heartbeat_at = NULL, updated_at = clock_timestamp()
    WHERE lease_scope = 'global' AND owner_token = p_owner_token
      AND fencing_epoch = v_global.fencing_epoch;
    RETURN QUERY SELECT 'idle', p_owner_token, v_global.fencing_epoch,
      v_candidate.tenant_id, v_candidate.domain, 0, 0, 0, true, v_global.lease_until, NULL::text;
    RETURN;
  END IF;

  INSERT INTO app.metrics_refresh_state (
    tenant_id, domain, last_claimed_version, freshness_state, stale_after, updated_at
  )
  SELECT v_candidate.tenant_id, v_candidate.domain,
    MAX(mdw.claimed_version), 'stale', clock_timestamp() + interval '15 minutes', clock_timestamp()
  FROM app.metrics_dirty_work mdw
  WHERE mdw.lease_owner = p_owner_token AND mdw.state = 'claimed'
  ON CONFLICT (tenant_id, domain) DO UPDATE SET
    last_claimed_version = GREATEST(app.metrics_refresh_state.last_claimed_version, EXCLUDED.last_claimed_version),
    freshness_state = 'stale', stale_after = EXCLUDED.stale_after, updated_at = EXCLUDED.updated_at;

  INSERT INTO app.metrics_execution_history (
    tenant_id, domain, run_kind, status, owner_token, fencing_epoch,
    dirty_sources_claimed, refresh_keys_planned, statement_groups_executed
  ) VALUES (
    v_candidate.tenant_id, v_candidate.domain, 'manual', 'started', p_owner_token,
    v_global.fencing_epoch, v_sources, v_keys, 0
  );

  RETURN QUERY SELECT 'claimed', p_owner_token, v_global.fencing_epoch,
    v_candidate.tenant_id, v_candidate.domain, v_sources, v_keys, 0, true,
    v_global.lease_until, NULL::text;
END;
$$;

CREATE OR REPLACE FUNCTION app._metrics_assert_refresh_fence(
  p_owner_token uuid,
  p_fencing_epoch bigint,
  p_tenant_id uuid,
  p_domain text
)
RETURNS timestamptz
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, app, pg_temp
AS $$
DECLARE
  v_global app.metrics_refresh_leases%ROWTYPE;
  v_tenant app.metrics_refresh_leases%ROWTYPE;
BEGIN
  -- Consistent global -> tenant/domain order is mandatory for every compute,
  -- acknowledge, fail, and release transaction.
  SELECT * INTO v_global
  FROM app.metrics_refresh_leases l
  WHERE l.lease_scope = 'global'
  FOR UPDATE NOWAIT;

  IF v_global.owner_token IS DISTINCT FROM p_owner_token
     OR v_global.fencing_epoch IS DISTINCT FROM p_fencing_epoch
     OR v_global.lease_until IS NULL
     OR v_global.lease_until <= clock_timestamp() THEN
    RAISE EXCEPTION 'metrics_stale_global_fence' USING ERRCODE = '55000';
  END IF;

  SELECT * INTO v_tenant
  FROM app.metrics_refresh_leases l
  WHERE l.lease_scope = 'tenant_domain'
    AND l.tenant_id = p_tenant_id
    AND l.domain = p_domain
  FOR UPDATE NOWAIT;

  IF v_tenant.owner_token IS DISTINCT FROM p_owner_token
     OR v_tenant.fencing_epoch IS DISTINCT FROM p_fencing_epoch
     OR v_tenant.lease_until IS NULL
     OR v_tenant.lease_until <= clock_timestamp() THEN
    RAISE EXCEPTION 'metrics_stale_tenant_fence' USING ERRCODE = '55000';
  END IF;

  RETURN LEAST(v_global.lease_until, v_tenant.lease_until);
END;
$$;

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
            SELECT 1 FROM app.cohort_members cm WHERE cm.cohort_id = pla.target_id AND cm.buyer_id = b.id
          )))
    ),
    EXISTS (
      SELECT 1 FROM app.cohort_members cm JOIN app.cohorts c ON c.id = cm.cohort_id
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
  v_now timestamptz := clock_timestamp();
  v_today date := (clock_timestamp() AT TIME ZONE 'Asia/Kolkata')::date;
  v_rows integer := 0;
  v_count integer;
  v_location_groups integer := 0;
  v_watermark timestamptz;
BEGIN
  PERFORM app._metrics_assert_refresh_fence(p_owner_token, p_fencing_epoch, p_tenant_id, 'inventory');

  SELECT r.rows_written, r.statement_groups INTO v_count, v_location_groups
  FROM app._metrics_refresh_location_scopes(p_owner_token, p_fencing_epoch, p_tenant_id) r;
  v_rows := v_rows + COALESCE(v_count, 0);

  SELECT GREATEST(MAX(tp.updated_at), MAX(ti.updated_at), MAX(w.updated_at)) INTO v_watermark
  FROM app.tenant_products tp
  LEFT JOIN app.tenant_inventory ti ON ti.tenant_product_id = tp.id
  LEFT JOIN app.warehouses w ON w.id = ti.warehouse_id AND w.tenant_id = tp.tenant_id
  WHERE tp.tenant_id = p_tenant_id;

  INSERT INTO app.metrics_tenant_inventory_snapshot (
    tenant_id, external_ref, active_product_count, stocked_product_count,
    low_stock_product_count, out_of_stock_product_count, sellable_units,
    recent_invoice_stockout_count, source_watermark, computed_at,
    calculation_version, generation_id, updated_at, deleted_at, fencing_epoch
  )
  WITH product_inventory AS (
    SELECT tp.id,
      COALESCE(SUM(COALESCE(ti.qty_available, 0) - COALESCE(ti.qty_reserved, 0))
        FILTER (WHERE w.id IS NOT NULL), 0) AS sellable,
      COALESCE(MAX(ti.reorder_point) FILTER (WHERE w.id IS NOT NULL), 0) AS reorder_point
    FROM app.tenant_products tp
    LEFT JOIN app.tenant_inventory ti ON ti.tenant_product_id = tp.id AND ti.deleted_at IS NULL
    LEFT JOIN app.warehouses w ON w.id = ti.warehouse_id
      AND w.tenant_id = tp.tenant_id AND w.deleted_at IS NULL AND w.status = 'active'
    WHERE tp.tenant_id = p_tenant_id AND tp.deleted_at IS NULL AND tp.is_active
    GROUP BY tp.id
  ), invoice_products AS (
    SELECT DISTINCT ii.tenant_product_id
    FROM app.invoice_items ii
    JOIN app.invoices i ON i.id = ii.invoice_id
    WHERE i.tenant_id = p_tenant_id AND i.deleted_at IS NULL AND ii.deleted_at IS NULL
      AND app.invoice_status_gmv_included(i.status)
      AND app.metric_day_ist(i.invoice_date, i.created_at) >= v_today - 89
  )
  SELECT p_tenant_id, 'metrics:tenant:inventory:' || p_tenant_id::text,
    COUNT(*), COUNT(*) FILTER (WHERE pi.sellable > 0),
    COUNT(*) FILTER (WHERE pi.sellable > 0 AND pi.sellable <= pi.reorder_point),
    COUNT(*) FILTER (WHERE pi.sellable <= 0), COALESCE(SUM(pi.sellable), 0),
    COUNT(*) FILTER (WHERE pi.sellable <= 0 AND ip.tenant_product_id IS NOT NULL),
    v_watermark, v_now, 1, gen_random_uuid(), v_now, NULL, p_fencing_epoch
  FROM product_inventory pi
  LEFT JOIN invoice_products ip ON ip.tenant_product_id = pi.id
  ON CONFLICT (tenant_id) WHERE deleted_at IS NULL DO UPDATE SET
    active_product_count = EXCLUDED.active_product_count,
    stocked_product_count = EXCLUDED.stocked_product_count,
    low_stock_product_count = EXCLUDED.low_stock_product_count,
    out_of_stock_product_count = EXCLUDED.out_of_stock_product_count,
    sellable_units = EXCLUDED.sellable_units,
    recent_invoice_stockout_count = EXCLUDED.recent_invoice_stockout_count,
    source_watermark = EXCLUDED.source_watermark,
    computed_at = EXCLUDED.computed_at,
    generation_id = EXCLUDED.generation_id,
    updated_at = EXCLUDED.updated_at,
    fencing_epoch = EXCLUDED.fencing_epoch
  WHERE ROW(
    app.metrics_tenant_inventory_snapshot.active_product_count,
    app.metrics_tenant_inventory_snapshot.stocked_product_count,
    app.metrics_tenant_inventory_snapshot.low_stock_product_count,
    app.metrics_tenant_inventory_snapshot.out_of_stock_product_count,
    app.metrics_tenant_inventory_snapshot.sellable_units,
    app.metrics_tenant_inventory_snapshot.recent_invoice_stockout_count,
    app.metrics_tenant_inventory_snapshot.source_watermark
  ) IS DISTINCT FROM ROW(
    EXCLUDED.active_product_count, EXCLUDED.stocked_product_count,
    EXCLUDED.low_stock_product_count, EXCLUDED.out_of_stock_product_count,
    EXCLUDED.sellable_units, EXCLUDED.recent_invoice_stockout_count, EXCLUDED.source_watermark
  );
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_rows := v_rows + v_count;

  CREATE TEMP TABLE IF NOT EXISTS pg_temp.metrics_product_keys (id uuid PRIMARY KEY) ON COMMIT DROP;
  TRUNCATE pg_temp.metrics_product_keys;
  INSERT INTO pg_temp.metrics_product_keys(id)
  SELECT id FROM (
    SELECT mdw.old_tenant_product_id AS id FROM app.metrics_dirty_work mdw
      WHERE mdw.lease_owner = p_owner_token AND mdw.claimed_version IS NOT NULL
    UNION SELECT mdw.new_tenant_product_id FROM app.metrics_dirty_work mdw
      WHERE mdw.lease_owner = p_owner_token AND mdw.claimed_version IS NOT NULL
    UNION SELECT tp.id FROM app.tenant_products tp JOIN app.metrics_dirty_work w
      ON w.lease_owner = p_owner_token AND w.dirty_from IS NOT NULL
        AND current_setting('app.metrics_cursor_stage', true) = 'product'
      WHERE tp.tenant_id = p_tenant_id AND tp.updated_at::date BETWEEN w.dirty_from AND COALESCE(w.dirty_to, w.dirty_from)
        AND (w.cursor_id IS NULL OR tp.id > w.cursor_id)
    UNION SELECT ti.tenant_product_id FROM app.tenant_inventory ti
      JOIN app.tenant_products tp ON tp.id = ti.tenant_product_id
      JOIN app.metrics_dirty_work w ON w.lease_owner = p_owner_token AND w.dirty_from IS NOT NULL
        AND current_setting('app.metrics_cursor_stage', true) = 'product'
      WHERE tp.tenant_id = p_tenant_id AND ti.updated_at::date BETWEEN w.dirty_from AND COALESCE(w.dirty_to, w.dirty_from)
        AND (w.cursor_id IS NULL OR ti.tenant_product_id > w.cursor_id)
    UNION SELECT ii.tenant_product_id FROM app.invoice_items ii JOIN app.invoices i ON i.id = ii.invoice_id
      JOIN app.metrics_dirty_work w ON w.lease_owner = p_owner_token AND w.dirty_from IS NOT NULL
        AND current_setting('app.metrics_cursor_stage', true) = 'product'
      WHERE i.tenant_id = p_tenant_id AND ii.deleted_at IS NULL AND i.deleted_at IS NULL
        AND app.metric_day_ist(i.invoice_date, i.created_at) BETWEEN w.dirty_from AND COALESCE(w.dirty_to, w.dirty_from)
        AND (w.cursor_id IS NULL OR ii.tenant_product_id > w.cursor_id)
    UNION SELECT s.tenant_product_id FROM app.metrics_product_snapshot s JOIN app.metrics_dirty_work w
      ON w.lease_owner = p_owner_token AND w.dirty_from IS NOT NULL
        AND current_setting('app.metrics_cursor_stage', true) = 'product'
      WHERE s.tenant_id = p_tenant_id AND s.deleted_at IS NULL
        AND (w.cursor_id IS NULL OR s.tenant_product_id > w.cursor_id)
  ) keys WHERE id IS NOT NULL ORDER BY id LIMIT 100
  ON CONFLICT DO NOTHING;

  UPDATE app.metrics_dirty_work w
  SET cursor_id = CASE WHEN (SELECT COUNT(*) FROM pg_temp.metrics_product_keys) >= 100
      THEN (SELECT id FROM pg_temp.metrics_product_keys ORDER BY id DESC LIMIT 1) ELSE NULL END,
    cursor_kind = CASE WHEN (SELECT COUNT(*) FROM pg_temp.metrics_product_keys) >= 100
      THEN 'product' ELSE 'product_location' END,
    updated_at = clock_timestamp()
  WHERE w.lease_owner = p_owner_token AND w.state = 'claimed'
    AND w.claimed_version = w.dirty_version AND w.dirty_from IS NOT NULL
    AND current_setting('app.metrics_cursor_stage', true) = 'product';

  UPDATE app.metrics_product_snapshot s
  SET deleted_at = v_now, updated_at = v_now, computed_at = v_now,
      generation_id = gen_random_uuid(), fencing_epoch = p_fencing_epoch
  FROM app.tenant_products tp
  JOIN pg_temp.metrics_product_keys k ON k.id = tp.id
  WHERE s.tenant_id = p_tenant_id AND s.tenant_product_id = tp.id
    AND s.deleted_at IS NULL AND tp.tenant_id = p_tenant_id AND tp.deleted_at IS NOT NULL;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_rows := v_rows + v_count;

  INSERT INTO app.metrics_product_snapshot (
    tenant_id, tenant_product_id, external_ref, on_hand, reserved, available,
    low_stock, out_of_stock, invoice_units_90d, invoice_value_90d,
    purchasing_buyers_90d, last_invoice_at, no_sale_since, days_cover,
    is_active, is_published, price_complete, source_watermark, computed_at,
    calculation_version, generation_id, updated_at, deleted_at, fencing_epoch
  )
  SELECT tp.tenant_id, tp.id, 'metrics:product:' || tp.id::text,
    COALESCE(inv.on_hand, 0), COALESCE(inv.reserved, 0),
    COALESCE(inv.on_hand, 0) - COALESCE(inv.reserved, 0),
    COALESCE(inv.on_hand, 0) - COALESCE(inv.reserved, 0) > 0
      AND COALESCE(inv.on_hand, 0) - COALESCE(inv.reserved, 0) <= COALESCE(inv.reorder_point, 0),
    COALESCE(inv.on_hand, 0) - COALESCE(inv.reserved, 0) <= 0,
    COALESCE(sales.units90, 0), COALESCE(sales.value90, 0), COALESCE(sales.buyers90, 0),
    sales.last_at,
    CASE WHEN sales.last_at IS NULL THEN NULL ELSE sales.last_at::date END,
    CASE WHEN COALESCE(sales.units90, 0) > 0
      THEN ROUND((COALESCE(inv.on_hand, 0) / (sales.units90 / 90.0))::numeric, 2)
      ELSE NULL END,
    tp.deleted_at IS NULL AND tp.is_active,
    EXISTS (
      SELECT 1 FROM app.campaign_items ci JOIN app.campaigns c ON c.id = ci.campaign_id
      WHERE ci.tenant_product_id = tp.id AND ci.deleted_at IS NULL
        AND c.tenant_id = tp.tenant_id AND c.deleted_at IS NULL AND c.status = 'published'
    ),
    tp.base_selling_price IS NOT NULL,
    GREATEST(tp.updated_at, inv.watermark, sales.watermark), v_now, 1,
    gen_random_uuid(), v_now, tp.deleted_at, p_fencing_epoch
  FROM app.tenant_products tp
  JOIN pg_temp.metrics_product_keys k ON k.id = tp.id
  LEFT JOIN LATERAL (
    SELECT SUM(ti.qty_available) AS on_hand, SUM(ti.qty_reserved) AS reserved,
      MAX(ti.reorder_point) AS reorder_point, MAX(ti.updated_at) AS watermark
    FROM app.tenant_inventory ti JOIN app.warehouses w ON w.id = ti.warehouse_id
    WHERE ti.tenant_product_id = tp.id AND ti.deleted_at IS NULL
      AND w.tenant_id = p_tenant_id AND w.deleted_at IS NULL AND w.status = 'active'
  ) inv ON true
  LEFT JOIN LATERAL (
    SELECT SUM(ii.qty) AS units90, SUM(COALESCE(ii.line_total, ii.qty * ii.unit_price)) AS value90,
      COUNT(DISTINCT i.buyer_id) AS buyers90,
      MAX(app.metric_day_ist(i.invoice_date, i.created_at)::timestamp AT TIME ZONE 'Asia/Kolkata') AS last_at,
      MAX(GREATEST(i.updated_at, ii.updated_at)) AS watermark
    FROM app.invoice_items ii JOIN app.invoices i ON i.id = ii.invoice_id
    WHERE ii.tenant_product_id = tp.id AND ii.deleted_at IS NULL
      AND i.tenant_id = p_tenant_id AND i.deleted_at IS NULL
      AND app.invoice_status_gmv_included(i.status)
      AND app.metric_day_ist(i.invoice_date, i.created_at) >= v_today - 89
  ) sales ON true
  WHERE tp.tenant_id = p_tenant_id AND tp.deleted_at IS NULL
  ON CONFLICT (tenant_id, tenant_product_id) WHERE deleted_at IS NULL DO UPDATE SET
    on_hand = EXCLUDED.on_hand, reserved = EXCLUDED.reserved, available = EXCLUDED.available,
    low_stock = EXCLUDED.low_stock, out_of_stock = EXCLUDED.out_of_stock,
    invoice_units_90d = EXCLUDED.invoice_units_90d, invoice_value_90d = EXCLUDED.invoice_value_90d,
    purchasing_buyers_90d = EXCLUDED.purchasing_buyers_90d, last_invoice_at = EXCLUDED.last_invoice_at,
    no_sale_since = EXCLUDED.no_sale_since, days_cover = EXCLUDED.days_cover,
    is_active = EXCLUDED.is_active, is_published = EXCLUDED.is_published,
    price_complete = EXCLUDED.price_complete, source_watermark = EXCLUDED.source_watermark,
    computed_at = EXCLUDED.computed_at, generation_id = EXCLUDED.generation_id,
    updated_at = EXCLUDED.updated_at, fencing_epoch = EXCLUDED.fencing_epoch
  WHERE ROW(
    app.metrics_product_snapshot.on_hand, app.metrics_product_snapshot.reserved,
    app.metrics_product_snapshot.available, app.metrics_product_snapshot.low_stock,
    app.metrics_product_snapshot.out_of_stock, app.metrics_product_snapshot.invoice_units_90d,
    app.metrics_product_snapshot.invoice_value_90d, app.metrics_product_snapshot.purchasing_buyers_90d,
    app.metrics_product_snapshot.last_invoice_at, app.metrics_product_snapshot.no_sale_since,
    app.metrics_product_snapshot.days_cover, app.metrics_product_snapshot.is_active,
    app.metrics_product_snapshot.is_published, app.metrics_product_snapshot.price_complete,
    app.metrics_product_snapshot.source_watermark
  ) IS DISTINCT FROM ROW(
    EXCLUDED.on_hand, EXCLUDED.reserved, EXCLUDED.available, EXCLUDED.low_stock,
    EXCLUDED.out_of_stock, EXCLUDED.invoice_units_90d, EXCLUDED.invoice_value_90d,
    EXCLUDED.purchasing_buyers_90d, EXCLUDED.last_invoice_at, EXCLUDED.no_sale_since,
    EXCLUDED.days_cover, EXCLUDED.is_active, EXCLUDED.is_published,
    EXCLUDED.price_complete, EXCLUDED.source_watermark
  );
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_rows := v_rows + v_count;

  IF current_setting('app.metrics_cursor_stage', true) = '' THEN
    SELECT r.rows_written INTO v_count
    FROM app._metrics_refresh_location_scopes(p_owner_token, p_fencing_epoch, p_tenant_id) r;
    v_rows := v_rows + COALESCE(v_count, 0);
    v_location_groups := v_location_groups + 6;
  END IF;

  RETURN QUERY SELECT v_rows, 2 + v_location_groups, v_watermark;
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
  v_now timestamptz := clock_timestamp();
  v_today date := (clock_timestamp() AT TIME ZONE 'Asia/Kolkata')::date;
  v_rows integer;
  v_watermark timestamptz;
BEGIN
  PERFORM app._metrics_assert_refresh_fence(p_owner_token, p_fencing_epoch, p_tenant_id, 'buyer_app');
  SELECT MAX(x.updated_at) INTO v_watermark FROM (
    SELECT MAX(a.updated_at) AS updated_at FROM app.buyer_app_activity a WHERE a.tenant_id = p_tenant_id
    UNION ALL SELECT MAX(b.updated_at) FROM app.buyers b WHERE b.tenant_id = p_tenant_id
    UNION ALL SELECT MAX(e.updated_at) FROM app.estimates e WHERE e.tenant_id = p_tenant_id AND e.is_buyer_app_estimate
    UNION ALL SELECT MAX(o.updated_at) FROM app.orders o WHERE o.tenant_id = p_tenant_id AND o.is_buyer_app_order
    UNION ALL SELECT MAX(i.updated_at) FROM app.invoices i WHERE i.tenant_id = p_tenant_id AND i.is_buyer_app_invoice
  ) x;

  INSERT INTO app.metrics_tenant_buyer_app_snapshot (
    tenant_id, external_ref, enabled_buyer_count, active_buyer_count_90d,
    repeat_buyer_count_90d, app_estimate_count_90d, app_estimate_value_90d,
    app_order_count_90d, app_order_value_90d, app_invoice_count_90d,
    app_invoice_value_90d, assisted_invoice_count_90d, assisted_invoice_value_90d,
    source_watermark, computed_at, calculation_version, generation_id,
    updated_at, deleted_at, fencing_epoch
  )
  WITH activity AS (
    SELECT COUNT(DISTINCT a.buyer_id) AS active_count,
      COUNT(DISTINCT a.buyer_id) FILTER (WHERE x.events >= 2) AS repeat_count
    FROM app.buyer_app_activity a
    JOIN (
      SELECT buyer_id, COUNT(*) AS events FROM app.buyer_app_activity
      WHERE tenant_id = p_tenant_id AND deleted_at IS NULL AND qualifies_for_engagement
        AND occurred_day >= v_today - 89 GROUP BY buyer_id
    ) x ON x.buyer_id = a.buyer_id
    WHERE a.tenant_id = p_tenant_id AND a.deleted_at IS NULL AND a.occurred_day >= v_today - 89
  ), estimates_rollup AS (
    SELECT COUNT(*) AS cnt, COALESCE(SUM(total_amount), 0) AS value
    FROM app.estimates WHERE tenant_id = p_tenant_id AND deleted_at IS NULL
      AND is_buyer_app_estimate AND app.metric_day_ist(estimate_date, created_at) >= v_today - 89
  ), orders_rollup AS (
    SELECT COUNT(*) FILTER (WHERE app.order_status_in_flow(status)) AS cnt,
      COALESCE(SUM(total_amount) FILTER (WHERE app.order_status_in_flow(status)), 0) AS value
    FROM app.orders WHERE tenant_id = p_tenant_id AND deleted_at IS NULL
      AND is_buyer_app_order AND app.metric_day_ist(order_date, created_at) >= v_today - 89
  ), invoices_rollup AS (
    SELECT COUNT(*) FILTER (WHERE i.is_buyer_app_invoice AND app.invoice_status_gmv_included(i.status)) AS app_cnt,
      COALESCE(SUM(i.total_amount) FILTER (WHERE i.is_buyer_app_invoice AND app.invoice_status_gmv_included(i.status)), 0) AS app_value,
      COUNT(*) FILTER (WHERE NOT i.is_buyer_app_invoice AND app.invoice_status_gmv_included(i.status)
        AND EXISTS (SELECT 1 FROM app.orders o WHERE o.id = i.order_id AND o.is_buyer_app_order)) AS assisted_cnt,
      COALESCE(SUM(i.total_amount) FILTER (WHERE NOT i.is_buyer_app_invoice AND app.invoice_status_gmv_included(i.status)
        AND EXISTS (SELECT 1 FROM app.orders o WHERE o.id = i.order_id AND o.is_buyer_app_order)), 0) AS assisted_value
    FROM app.invoices i WHERE i.tenant_id = p_tenant_id AND i.deleted_at IS NULL
      AND app.metric_day_ist(i.invoice_date, i.created_at) >= v_today - 89
  )
  SELECT p_tenant_id, 'metrics:tenant:buyer-app:' || p_tenant_id::text,
    (SELECT COUNT(*) FROM app.buyers b WHERE b.tenant_id = p_tenant_id AND b.deleted_at IS NULL AND b.is_active AND b.buyer_app_enabled),
    a.active_count, a.repeat_count, er.cnt, er.value, orx.cnt, orx.value,
    ir.app_cnt, ir.app_value, ir.assisted_cnt, ir.assisted_value,
    v_watermark, v_now, 1, gen_random_uuid(), v_now, NULL, p_fencing_epoch
  FROM activity a CROSS JOIN estimates_rollup er CROSS JOIN orders_rollup orx CROSS JOIN invoices_rollup ir
  ON CONFLICT (tenant_id) WHERE deleted_at IS NULL DO UPDATE SET
    enabled_buyer_count = EXCLUDED.enabled_buyer_count,
    active_buyer_count_90d = EXCLUDED.active_buyer_count_90d,
    repeat_buyer_count_90d = EXCLUDED.repeat_buyer_count_90d,
    app_estimate_count_90d = EXCLUDED.app_estimate_count_90d,
    app_estimate_value_90d = EXCLUDED.app_estimate_value_90d,
    app_order_count_90d = EXCLUDED.app_order_count_90d,
    app_order_value_90d = EXCLUDED.app_order_value_90d,
    app_invoice_count_90d = EXCLUDED.app_invoice_count_90d,
    app_invoice_value_90d = EXCLUDED.app_invoice_value_90d,
    assisted_invoice_count_90d = EXCLUDED.assisted_invoice_count_90d,
    assisted_invoice_value_90d = EXCLUDED.assisted_invoice_value_90d,
    source_watermark = EXCLUDED.source_watermark, computed_at = EXCLUDED.computed_at,
    generation_id = EXCLUDED.generation_id, updated_at = EXCLUDED.updated_at,
    fencing_epoch = EXCLUDED.fencing_epoch
  WHERE ROW(
    app.metrics_tenant_buyer_app_snapshot.enabled_buyer_count,
    app.metrics_tenant_buyer_app_snapshot.active_buyer_count_90d,
    app.metrics_tenant_buyer_app_snapshot.repeat_buyer_count_90d,
    app.metrics_tenant_buyer_app_snapshot.app_estimate_count_90d,
    app.metrics_tenant_buyer_app_snapshot.app_estimate_value_90d,
    app.metrics_tenant_buyer_app_snapshot.app_order_count_90d,
    app.metrics_tenant_buyer_app_snapshot.app_order_value_90d,
    app.metrics_tenant_buyer_app_snapshot.app_invoice_count_90d,
    app.metrics_tenant_buyer_app_snapshot.app_invoice_value_90d,
    app.metrics_tenant_buyer_app_snapshot.assisted_invoice_count_90d,
    app.metrics_tenant_buyer_app_snapshot.assisted_invoice_value_90d,
    app.metrics_tenant_buyer_app_snapshot.source_watermark
  ) IS DISTINCT FROM ROW(
    EXCLUDED.enabled_buyer_count, EXCLUDED.active_buyer_count_90d, EXCLUDED.repeat_buyer_count_90d,
    EXCLUDED.app_estimate_count_90d, EXCLUDED.app_estimate_value_90d,
    EXCLUDED.app_order_count_90d, EXCLUDED.app_order_value_90d,
    EXCLUDED.app_invoice_count_90d, EXCLUDED.app_invoice_value_90d,
    EXCLUDED.assisted_invoice_count_90d, EXCLUDED.assisted_invoice_value_90d,
    EXCLUDED.source_watermark
  );
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  RETURN QUERY SELECT v_rows, 1, v_watermark;
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
  v_now timestamptz := clock_timestamp();
  v_rows integer;
  v_watermark timestamptz;
BEGIN
  PERFORM app._metrics_assert_refresh_fence(p_owner_token, p_fencing_epoch, p_tenant_id, 'setup');
  SELECT MAX(x.updated_at) INTO v_watermark FROM (
    SELECT MAX(updated_at) AS updated_at FROM app.buyers WHERE tenant_id = p_tenant_id
    UNION ALL SELECT MAX(updated_at) FROM app.tenant_products WHERE tenant_id = p_tenant_id
    UNION ALL SELECT MAX(updated_at) FROM app.tenant_brands WHERE tenant_id = p_tenant_id
    UNION ALL SELECT MAX(updated_at) FROM app.tenant_categories WHERE tenant_id = p_tenant_id
    UNION ALL SELECT MAX(updated_at) FROM app.locations WHERE tenant_id = p_tenant_id
    UNION ALL SELECT MAX(updated_at) FROM app.warehouses WHERE tenant_id = p_tenant_id
    UNION ALL SELECT MAX(updated_at) FROM app.campaigns WHERE tenant_id = p_tenant_id
    UNION ALL SELECT MAX(updated_at) FROM app.cohorts WHERE tenant_id = p_tenant_id
    UNION ALL SELECT MAX(updated_at) FROM app.price_lists WHERE tenant_id = p_tenant_id
  ) x;

  INSERT INTO app.metrics_tenant_setup_snapshot (
    tenant_id, external_ref, active_buyer_count, active_product_count,
    active_brand_count, active_category_count, active_location_count,
    active_warehouse_count, active_campaign_count, active_cohort_count,
    active_price_list_count, source_watermark, computed_at, calculation_version,
    generation_id, updated_at, deleted_at, fencing_epoch
  ) VALUES (
    p_tenant_id, 'metrics:tenant:setup:' || p_tenant_id::text,
    (SELECT COUNT(*) FROM app.buyers WHERE tenant_id = p_tenant_id AND deleted_at IS NULL AND is_active),
    (SELECT COUNT(*) FROM app.tenant_products WHERE tenant_id = p_tenant_id AND deleted_at IS NULL AND is_active),
    (SELECT COUNT(*) FROM app.tenant_brands WHERE tenant_id = p_tenant_id AND deleted_at IS NULL AND is_active),
    (SELECT COUNT(*) FROM app.tenant_categories WHERE tenant_id = p_tenant_id AND deleted_at IS NULL AND is_active),
    (SELECT COUNT(*) FROM app.locations WHERE tenant_id = p_tenant_id AND deleted_at IS NULL AND status = 'active'),
    (SELECT COUNT(*) FROM app.warehouses WHERE tenant_id = p_tenant_id AND deleted_at IS NULL AND status = 'active'),
    (SELECT COUNT(*) FROM app.campaigns WHERE tenant_id = p_tenant_id AND deleted_at IS NULL AND status = 'published'),
    (SELECT COUNT(*) FROM app.cohorts WHERE tenant_id = p_tenant_id AND deleted_at IS NULL),
    (SELECT COUNT(*) FROM app.price_lists WHERE tenant_id = p_tenant_id AND deleted_at IS NULL AND is_active
      AND valid_from <= v_now AND (valid_to IS NULL OR valid_to >= v_now)),
    v_watermark, v_now, 1, gen_random_uuid(), v_now, NULL, p_fencing_epoch
  )
  ON CONFLICT (tenant_id) WHERE deleted_at IS NULL DO UPDATE SET
    active_buyer_count = EXCLUDED.active_buyer_count,
    active_product_count = EXCLUDED.active_product_count,
    active_brand_count = EXCLUDED.active_brand_count,
    active_category_count = EXCLUDED.active_category_count,
    active_location_count = EXCLUDED.active_location_count,
    active_warehouse_count = EXCLUDED.active_warehouse_count,
    active_campaign_count = EXCLUDED.active_campaign_count,
    active_cohort_count = EXCLUDED.active_cohort_count,
    active_price_list_count = EXCLUDED.active_price_list_count,
    source_watermark = EXCLUDED.source_watermark, computed_at = EXCLUDED.computed_at,
    generation_id = EXCLUDED.generation_id, updated_at = EXCLUDED.updated_at,
    fencing_epoch = EXCLUDED.fencing_epoch
  WHERE ROW(
    app.metrics_tenant_setup_snapshot.active_buyer_count,
    app.metrics_tenant_setup_snapshot.active_product_count,
    app.metrics_tenant_setup_snapshot.active_brand_count,
    app.metrics_tenant_setup_snapshot.active_category_count,
    app.metrics_tenant_setup_snapshot.active_location_count,
    app.metrics_tenant_setup_snapshot.active_warehouse_count,
    app.metrics_tenant_setup_snapshot.active_campaign_count,
    app.metrics_tenant_setup_snapshot.active_cohort_count,
    app.metrics_tenant_setup_snapshot.active_price_list_count,
    app.metrics_tenant_setup_snapshot.source_watermark
  ) IS DISTINCT FROM ROW(
    EXCLUDED.active_buyer_count, EXCLUDED.active_product_count, EXCLUDED.active_brand_count,
    EXCLUDED.active_category_count, EXCLUDED.active_location_count, EXCLUDED.active_warehouse_count,
    EXCLUDED.active_campaign_count, EXCLUDED.active_cohort_count, EXCLUDED.active_price_list_count,
    EXCLUDED.source_watermark
  );
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  RETURN QUERY SELECT v_rows, 1, v_watermark;
END;
$$;

CREATE OR REPLACE FUNCTION app.metrics_refresh_tick(
  p_stage text,
  p_owner_token uuid,
  p_fencing_epoch bigint DEFAULT NULL,
  p_tenant_id uuid DEFAULT NULL,
  p_domain text DEFAULT NULL
)
RETURNS TABLE (
  status text,
  owner_token uuid,
  fencing_epoch bigint,
  tenant_id uuid,
  domain text,
  dirty_sources integer,
  refresh_keys integer,
  statement_groups integer,
  has_more boolean,
  lease_until timestamptz,
  error_text text
)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, app, pg_temp
AS $$
#variable_conflict use_column
DECLARE
  v_started timestamptz := clock_timestamp();
  v_rows integer := 0;
  v_groups integer := 0;
  v_sources integer := 0;
  v_keys integer := 0;
  v_has_more boolean := false;
  v_watermark timestamptz;
  v_lease_until timestamptz;
  v_dead integer := 0;
BEGIN
  IF p_stage = 'claim' THEN
    RETURN QUERY SELECT * FROM app.metrics_claim_dirty_work(p_owner_token);
    RETURN;
  END IF;

  IF p_stage <> ALL (ARRAY['compute', 'acknowledge', 'fail', 'release']) THEN
    RAISE EXCEPTION 'metrics_tick_stage_invalid:%', p_stage USING ERRCODE = '22023';
  END IF;
  IF p_fencing_epoch IS NULL OR p_tenant_id IS NULL OR p_domain IS NULL THEN
    RAISE EXCEPTION 'metrics_claim_identity_required' USING ERRCODE = '22023';
  END IF;

  PERFORM set_config('lock_timeout', '100ms', true);
  PERFORM set_config('statement_timeout', '3000ms', true);

  IF p_stage = 'compute' THEN
    v_lease_until := app._metrics_assert_refresh_fence(
      p_owner_token, p_fencing_epoch, p_tenant_id, p_domain
    );
    UPDATE app.metrics_dirty_work w
    SET cursor_kind = CASE p_domain
          WHEN 'commercial' THEN 'buyer'
          WHEN 'inventory' THEN 'product'
          ELSE 'done'
        END,
        cursor_id = NULL, cursor_aux_id = NULL, cursor_day = NULL, updated_at = clock_timestamp()
    WHERE w.lease_owner = p_owner_token AND w.state = 'claimed'
      AND w.claimed_version = w.dirty_version
      AND w.dirty_from IS NOT NULL AND w.cursor_kind IS NULL;
    PERFORM set_config('app.metrics_cursor_stage', COALESCE((
      SELECT w.cursor_kind FROM app.metrics_dirty_work w
      WHERE w.lease_owner = p_owner_token AND w.state = 'claimed' AND w.dirty_from IS NOT NULL
      ORDER BY w.created_at, w.id LIMIT 1
    ), ''), true);
    SELECT COUNT(*)::integer,
      COALESCE(SUM(
        1 + (old_buyer_id IS NOT NULL)::integer + (new_buyer_id IS NOT NULL)::integer
          + (old_tenant_product_id IS NOT NULL)::integer + (new_tenant_product_id IS NOT NULL)::integer
          + (old_location_id IS NOT NULL)::integer + (new_location_id IS NOT NULL)::integer
          + (old_day IS NOT NULL)::integer + (new_day IS NOT NULL)::integer
      ), 0)::integer
    INTO v_sources, v_keys
    FROM app.metrics_dirty_work
    WHERE lease_owner = p_owner_token AND state = 'claimed' AND claimed_version IS NOT NULL;

    IF p_domain = 'commercial' THEN
      SELECT r.rows_written, r.statement_groups, r.source_watermark
      INTO v_rows, v_groups, v_watermark
      FROM app._metrics_refresh_commercial(p_owner_token, p_fencing_epoch, p_tenant_id) r;
    ELSIF p_domain = 'inventory' THEN
      SELECT r.rows_written, r.statement_groups, r.source_watermark
      INTO v_rows, v_groups, v_watermark
      FROM app._metrics_refresh_inventory(p_owner_token, p_fencing_epoch, p_tenant_id) r;
    ELSIF p_domain = 'buyer_app' THEN
      SELECT r.rows_written, r.statement_groups, r.source_watermark
      INTO v_rows, v_groups, v_watermark
      FROM app._metrics_refresh_buyer_app(p_owner_token, p_fencing_epoch, p_tenant_id) r;
    ELSIF p_domain = 'setup' THEN
      SELECT r.rows_written, r.statement_groups, r.source_watermark
      INTO v_rows, v_groups, v_watermark
      FROM app._metrics_refresh_setup(p_owner_token, p_fencing_epoch, p_tenant_id) r;
    ELSE
      RAISE EXCEPTION 'metrics_domain_invalid' USING ERRCODE = '22023';
    END IF;

    IF v_groups > 25 THEN
      RAISE EXCEPTION 'metrics_statement_group_budget_exceeded' USING ERRCODE = '54000';
    END IF;
    IF EXTRACT(epoch FROM (clock_timestamp() - v_started)) * 1000 > 5000 THEN
      RAISE EXCEPTION 'metrics_tick_wall_budget_exceeded' USING ERRCODE = '57014';
    END IF;

    UPDATE app.metrics_execution_history h
    SET statement_groups_executed = v_groups,
        snapshot_rows_updated = v_rows
    WHERE h.id = (
      SELECT id FROM app.metrics_execution_history
      WHERE owner_token = p_owner_token AND status = 'started'
      ORDER BY started_at DESC LIMIT 1
      FOR UPDATE
    );

    RETURN QUERY SELECT 'computed', p_owner_token, p_fencing_epoch, p_tenant_id, p_domain,
      v_sources, v_keys, v_groups, true, v_lease_until, NULL::text;
    RETURN;
  END IF;

  IF p_stage = 'acknowledge' THEN
    v_lease_until := app._metrics_assert_refresh_fence(
      p_owner_token, p_fencing_epoch, p_tenant_id, p_domain
    );

    WITH acknowledged AS (
      UPDATE app.metrics_dirty_work w
      SET
        state = CASE
          WHEN w.dirty_version <> w.claimed_version THEN 'pending'
          WHEN w.dirty_from IS NOT NULL AND w.cursor_kind IS DISTINCT FROM 'done' THEN 'pending'
          ELSE 'completed'
        END,
        cursor_kind = CASE WHEN w.dirty_version = w.claimed_version
          AND (w.dirty_from IS NULL OR w.cursor_kind = 'done') THEN NULL ELSE w.cursor_kind END,
        cursor_id = CASE WHEN w.dirty_version = w.claimed_version
          AND (w.dirty_from IS NULL OR w.cursor_kind = 'done') THEN NULL ELSE w.cursor_id END,
        cursor_aux_id = CASE WHEN w.dirty_version = w.claimed_version
          AND (w.dirty_from IS NULL OR w.cursor_kind = 'done') THEN NULL ELSE w.cursor_aux_id END,
        cursor_day = CASE WHEN w.dirty_version = w.claimed_version
          AND (w.dirty_from IS NULL OR w.cursor_kind = 'done') THEN NULL ELSE w.cursor_day END,
        attempts = CASE WHEN w.dirty_version <> w.claimed_version THEN 0 ELSE w.attempts END,
        next_attempt_at = clock_timestamp(),
        lease_owner = NULL,
        lease_until = NULL,
        claimed_version = NULL,
        last_error = NULL,
        completed_at = CASE
          WHEN w.dirty_version = w.claimed_version
            AND (w.dirty_from IS NULL OR w.cursor_kind = 'done')
          THEN clock_timestamp() ELSE NULL END,
        updated_at = clock_timestamp()
      WHERE w.lease_owner = p_owner_token
        AND w.tenant_id = p_tenant_id
        AND w.domain = p_domain
        AND w.state = 'claimed'
      RETURNING state, dirty_version
    )
    SELECT COUNT(*)::integer, COALESCE(bool_or(state <> 'completed'), false)
    INTO v_sources, v_has_more
    FROM acknowledged;

    SELECT v_has_more OR EXISTS (
      SELECT 1 FROM app.metrics_dirty_work pending
      WHERE pending.tenant_id = p_tenant_id
        AND pending.domain = p_domain
        AND pending.state = ANY (ARRAY['pending', 'retry', 'claimed'])
    ) INTO v_has_more;

    UPDATE app.metrics_refresh_state s
    SET last_completed_version = GREATEST(s.last_completed_version, COALESCE((
          SELECT MAX(w.dirty_version) FROM app.metrics_dirty_work w
          WHERE w.tenant_id = p_tenant_id AND w.domain = p_domain AND w.state = 'completed'
        ), s.last_completed_version)),
        source_watermark = COALESCE((
          SELECT MAX(x.source_watermark) FROM (
            SELECT source_watermark FROM app.metrics_tenant_commercial_snapshot WHERE tenant_id = p_tenant_id AND p_domain = 'commercial'
            UNION ALL SELECT source_watermark FROM app.metrics_tenant_inventory_snapshot WHERE tenant_id = p_tenant_id AND p_domain = 'inventory'
            UNION ALL SELECT source_watermark FROM app.metrics_tenant_buyer_app_snapshot WHERE tenant_id = p_tenant_id AND p_domain = 'buyer_app'
            UNION ALL SELECT source_watermark FROM app.metrics_tenant_setup_snapshot WHERE tenant_id = p_tenant_id AND p_domain = 'setup'
          ) x
        ), s.source_watermark),
        last_successful_computation_at = clock_timestamp(),
        last_duration_ms = ROUND(EXTRACT(epoch FROM (clock_timestamp() - v_started)) * 1000)::integer,
        freshness_state = CASE WHEN v_has_more THEN 'stale' ELSE 'fresh' END,
        stale_after = CASE WHEN v_has_more THEN clock_timestamp() ELSE clock_timestamp() + interval '15 minutes' END,
        last_error = NULL,
        updated_at = clock_timestamp()
    WHERE s.tenant_id = p_tenant_id AND s.domain = p_domain;

    UPDATE app.metrics_execution_history h
    SET status = 'success', finished_at = clock_timestamp(),
        duration_ms = ROUND(EXTRACT(epoch FROM (clock_timestamp() - h.started_at)) * 1000)::integer
    WHERE h.id = (
      SELECT id FROM app.metrics_execution_history
      WHERE owner_token = p_owner_token AND status = 'started'
      ORDER BY started_at DESC LIMIT 1 FOR UPDATE
    );

    UPDATE app.metrics_refresh_leases
    SET owner_token = NULL, lease_until = NULL, heartbeat_at = NULL, updated_at = clock_timestamp()
    WHERE lease_scope = 'tenant_domain' AND tenant_id = p_tenant_id AND domain = p_domain
      AND owner_token = p_owner_token AND fencing_epoch = p_fencing_epoch;
    UPDATE app.metrics_refresh_leases
    SET owner_token = NULL, lease_until = NULL, heartbeat_at = NULL, updated_at = clock_timestamp()
    WHERE lease_scope = 'global' AND owner_token = p_owner_token AND fencing_epoch = p_fencing_epoch;

    RETURN QUERY SELECT 'acknowledged', p_owner_token, p_fencing_epoch, p_tenant_id, p_domain,
      v_sources, 0, 0, v_has_more, v_lease_until, NULL::text;
    RETURN;
  END IF;

  IF p_stage = 'fail' THEN
    -- A failure is version-scoped. A newer dirty version is immediately reset
    -- to pending and never inherits an older version's attempts/backoff.
    WITH failed AS (
      UPDATE app.metrics_dirty_work w
      SET attempts = CASE WHEN w.dirty_version = w.claimed_version THEN w.attempts + 1 ELSE 0 END,
        state = CASE
          WHEN w.dirty_version <> w.claimed_version THEN 'pending'
          WHEN w.attempts + 1 >= 3 THEN 'dead_letter'
          ELSE 'retry'
        END,
        next_attempt_at = CASE
          WHEN w.dirty_version <> w.claimed_version THEN clock_timestamp()
          ELSE clock_timestamp()
            + make_interval(secs => LEAST(300, (2 ^ LEAST(w.attempts + 1, 8))::integer))
            + make_interval(secs => floor(random() * 3)::integer)
        END,
        lease_owner = NULL, lease_until = NULL, claimed_version = NULL,
        last_error = CASE WHEN w.dirty_version = w.claimed_version THEN 'metrics_compute_failed' ELSE NULL END,
        updated_at = clock_timestamp()
      WHERE w.lease_owner = p_owner_token AND w.tenant_id = p_tenant_id
        AND w.domain = p_domain AND w.state = 'claimed'
      RETURNING state
    )
    SELECT COUNT(*)::integer, COUNT(*) FILTER (WHERE state = 'dead_letter')::integer
    INTO v_sources, v_dead FROM failed;

    UPDATE app.metrics_refresh_state
    SET freshness_state = CASE WHEN v_dead > 0 THEN 'error' ELSE 'stale' END,
        last_error = 'metrics_compute_failed', updated_at = clock_timestamp()
    WHERE tenant_id = p_tenant_id AND domain = p_domain;
    UPDATE app.metrics_execution_history h
    SET status = CASE WHEN v_dead > 0 THEN 'dead_letter' ELSE 'failed' END,
        dead_letter_count = v_dead, error_text = 'metrics_compute_failed',
        finished_at = clock_timestamp(),
        duration_ms = ROUND(EXTRACT(epoch FROM (clock_timestamp() - h.started_at)) * 1000)::integer
    WHERE h.id = (
      SELECT id FROM app.metrics_execution_history
      WHERE owner_token = p_owner_token AND status = 'started'
      ORDER BY started_at DESC LIMIT 1 FOR UPDATE
    );

    RETURN QUERY SELECT CASE WHEN v_dead > 0 THEN 'dead_letter' ELSE 'retry' END,
      p_owner_token, p_fencing_epoch, p_tenant_id, p_domain,
      v_sources, 0, 0, true, NULL::timestamptz, 'metrics_compute_failed'::text;
    RETURN;
  END IF;

  -- release is compare-and-release only; it never acknowledges dirty work.
  UPDATE app.metrics_refresh_leases
  SET owner_token = NULL, lease_until = NULL, heartbeat_at = NULL, updated_at = clock_timestamp()
  WHERE lease_scope = 'tenant_domain' AND tenant_id = p_tenant_id AND domain = p_domain
    AND owner_token = p_owner_token AND fencing_epoch = p_fencing_epoch;
  UPDATE app.metrics_refresh_leases
  SET owner_token = NULL, lease_until = NULL, heartbeat_at = NULL, updated_at = clock_timestamp()
  WHERE lease_scope = 'global' AND owner_token = p_owner_token AND fencing_epoch = p_fencing_epoch;
  RETURN QUERY SELECT 'released', p_owner_token, p_fencing_epoch, p_tenant_id, p_domain,
    0, 0, 0, true, NULL::timestamptz, NULL::text;
END;
$$;

CREATE OR REPLACE FUNCTION app.metrics_mark_month_rollover(
  p_tenant_id uuid,
  p_month date DEFAULT date_trunc('month', clock_timestamp() AT TIME ZONE 'Asia/Kolkata')::date
)
RETURNS TABLE (work_id uuid, dirty_version bigint)
LANGUAGE sql
SECURITY INVOKER
SET search_path = pg_catalog, app, pg_temp
AS $$
  SELECT * FROM app.metrics_mark_dirty(
    p_tenant_id, 'commercial', 'month_rollover', p_tenant_id,
    p_dirty_from => date_trunc('month', p_month)::date,
    p_dirty_to => (date_trunc('month', p_month) + interval '1 month - 1 day')::date
  );
$$;

CREATE OR REPLACE FUNCTION app.metrics_mark_age_out(
  p_tenant_id uuid,
  p_domain text,
  p_boundary_days integer,
  p_as_of date DEFAULT (clock_timestamp() AT TIME ZONE 'Asia/Kolkata')::date
)
RETURNS TABLE (work_id uuid, dirty_version bigint)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, app, pg_temp
AS $$
BEGIN
  IF p_boundary_days <> ALL (ARRAY[30, 90, 365]) THEN
    RAISE EXCEPTION 'metrics_age_out_boundary_invalid' USING ERRCODE = '22023';
  END IF;
  IF p_domain <> ALL (ARRAY['commercial', 'inventory', 'buyer_app']) THEN
    RAISE EXCEPTION 'metrics_age_out_domain_invalid' USING ERRCODE = '22023';
  END IF;
  RETURN QUERY SELECT * FROM app.metrics_mark_dirty(
    p_tenant_id, p_domain, 'age_out', p_tenant_id,
    p_dirty_from => CASE WHEN p_boundary_days = 365 THEN p_as_of - 455 ELSE p_as_of - p_boundary_days END,
    p_dirty_to => p_as_of - p_boundary_days
  );
END;
$$;

CREATE OR REPLACE FUNCTION app.metrics_mark_reconciliation(
  p_tenant_id uuid,
  p_domain text,
  p_from date,
  p_to date,
  p_source_id uuid DEFAULT gen_random_uuid()
)
RETURNS TABLE (work_id uuid, dirty_version bigint)
LANGUAGE sql
SECURITY INVOKER
SET search_path = pg_catalog, app, pg_temp
AS $$
  SELECT * FROM app.metrics_mark_dirty(
    p_tenant_id, p_domain, 'reconciliation', p_source_id,
    p_dirty_from => p_from, p_dirty_to => p_to
  );
$$;

CREATE OR REPLACE FUNCTION app.metrics_inspect(
  p_tenant_id uuid DEFAULT NULL,
  p_domain text DEFAULT NULL
)
RETURNS TABLE (
  tenant_id uuid, domain text, pending_count bigint, retry_count bigint,
  dead_letter_count bigint, oldest_pending_at timestamptz,
  freshness_state text, last_successful_computation_at timestamptz,
  dispatch_enabled boolean
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = pg_catalog, app, pg_temp
AS $$
  SELECT w.tenant_id, w.domain,
    COUNT(*) FILTER (WHERE w.state = 'pending'),
    COUNT(*) FILTER (WHERE w.state = 'retry'),
    COUNT(*) FILTER (WHERE w.state = 'dead_letter'),
    MIN(w.created_at) FILTER (WHERE w.state = ANY (ARRAY['pending', 'retry'])),
    s.freshness_state, s.last_successful_computation_at,
    app.metrics_dispatch_enabled(w.tenant_id, w.domain)
  FROM app.metrics_dirty_work w
  LEFT JOIN app.metrics_refresh_state s ON s.tenant_id = w.tenant_id AND s.domain = w.domain
  WHERE (p_tenant_id IS NULL OR w.tenant_id = p_tenant_id)
    AND (p_domain IS NULL OR w.domain = p_domain)
  GROUP BY w.tenant_id, w.domain, s.freshness_state, s.last_successful_computation_at;
$$;

CREATE OR REPLACE FUNCTION app.metrics_prune_operational_history(
  p_completed_before timestamptz,
  p_history_before timestamptz,
  p_limit integer DEFAULT 1000
)
RETURNS TABLE (dirty_deleted integer, history_deleted integer)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, app, pg_temp
AS $$
DECLARE v_dirty integer; v_history integer;
BEGIN
  WITH doomed AS (
    SELECT id FROM app.metrics_dirty_work
    WHERE state = 'completed' AND completed_at < p_completed_before
    ORDER BY completed_at LIMIT LEAST(GREATEST(p_limit, 1), 1000)
    FOR UPDATE SKIP LOCKED
  ) DELETE FROM app.metrics_dirty_work w USING doomed d WHERE w.id = d.id;
  GET DIAGNOSTICS v_dirty = ROW_COUNT;
  WITH doomed AS (
    SELECT id FROM app.metrics_execution_history
    WHERE finished_at < p_history_before
    ORDER BY finished_at LIMIT LEAST(GREATEST(p_limit, 1), 1000)
    FOR UPDATE SKIP LOCKED
  ) DELETE FROM app.metrics_execution_history h USING doomed d WHERE h.id = d.id;
  GET DIAGNOSTICS v_history = ROW_COUNT;
  RETURN QUERY SELECT v_dirty, v_history;
END;
$$;

CREATE OR REPLACE FUNCTION app.metrics_mark_sync_completion(
  p_job_id uuid,
  p_tenant_id uuid,
  p_phase text,
  p_since_date timestamptz,
  p_completed_at timestamptz DEFAULT clock_timestamp()
)
RETURNS integer
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, app, pg_temp
AS $$
DECLARE
  v_from date := COALESCE(
    (p_since_date AT TIME ZONE 'Asia/Kolkata')::date,
    (p_completed_at AT TIME ZONE 'Asia/Kolkata')::date - 89
  );
  v_to date := (p_completed_at AT TIME ZONE 'Asia/Kolkata')::date;
  v_count integer := 0;
BEGIN
  -- One distributed source row per affected tenant/domain/range. The sync's
  -- row-trigger bypass remains untouched and there is no per-record marking.
  IF p_phase = ANY (ARRAY['estimates', 'orders', 'invoices', 'transaction_line_items']) THEN
    PERFORM app.metrics_mark_dirty(
      p_tenant_id, 'commercial', 'sync_job', p_job_id,
      p_dirty_from => v_from, p_dirty_to => v_to
    );
    v_count := v_count + 1;
  END IF;
  IF p_phase = 'transaction_line_items' THEN
    PERFORM app.metrics_mark_dirty(
      p_tenant_id, 'inventory', 'sync_job', p_job_id,
      p_dirty_from => v_from, p_dirty_to => v_to
    );
    v_count := v_count + 1;
  END IF;
  IF p_phase = ANY (ARRAY['inventory', 'products', 'locations']) THEN
    PERFORM app.metrics_mark_dirty(
      p_tenant_id, 'inventory', 'sync_job', p_job_id,
      p_dirty_from => v_from, p_dirty_to => v_to
    );
    v_count := v_count + 1;
  END IF;
  IF p_phase = ANY (ARRAY['customers', 'estimates', 'orders', 'invoices']) THEN
    PERFORM app.metrics_mark_dirty(
      p_tenant_id, 'buyer_app', 'sync_job', p_job_id,
      p_dirty_from => v_from, p_dirty_to => v_to
    );
    v_count := v_count + 1;
  END IF;
  IF p_phase = ANY (ARRAY['locations', 'products', 'pricelists', 'customers', 'contact_persons']) THEN
    PERFORM app.metrics_mark_dirty(
      p_tenant_id, 'setup', 'sync_job', p_job_id,
      p_dirty_from => v_from, p_dirty_to => v_to
    );
    v_count := v_count + 1;
  END IF;
  RETURN v_count;
END;
$$;

-- Preserve the Phase 0A V1 deferred-rebuild behavior exactly while adding the
-- tiny Phase 3 sync-completion marker before the child/master distinction.
CREATE OR REPLACE FUNCTION app.trg_post_sync_rebuild()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, app, pg_temp
SET statement_timeout = '3s'
AS $$
DECLARE
  v_days integer;
BEGIN
  IF OLD.status IS DISTINCT FROM 'completed' AND NEW.status = 'completed' THEN
    IF NEW.phase <> ALL (ARRAY['sync_run', 'analysis']) THEN
      PERFORM app.metrics_mark_sync_completion(
        NEW.id, NEW.tenant_id, NEW.phase, NEW.since_date, COALESCE(NEW.completed_at, clock_timestamp())
      );
    END IF;

    IF NEW.master_job_id IS NOT NULL THEN
      RETURN NEW;
    END IF;

    IF NEW.job_type = 'initial_transactional'
       AND NEW.phase IN ('estimates', 'orders', 'invoices') THEN
      UPDATE app.integration_sync_jobs
      SET progress = COALESCE(progress, '{}'::jsonb) || jsonb_build_object(
            'meta', COALESCE(progress->'meta', '{}'::jsonb) || jsonb_build_object(
              'post_sync_rebuild_deferred', false,
              'post_sync_rebuild_skipped_reason', 'initial_transactional_waiting_for_line_items'
            )
          ),
          updated_at = clock_timestamp()
      WHERE id = NEW.id;
      RETURN NEW;
    END IF;

    v_days := app.sync_job_rebuild_days(NEW.job_type, NEW.since_date, 2);
    UPDATE app.integration_sync_jobs
    SET error_log = NULL,
        progress = COALESCE(progress, '{}'::jsonb) || jsonb_build_object(
          'meta', COALESCE(progress->'meta', '{}'::jsonb) || jsonb_build_object(
            'post_sync_rebuild_deferred', true,
            'post_sync_rebuild_days', v_days,
            'post_sync_rebuild_deferred_at', clock_timestamp()
          )
        ),
        updated_at = clock_timestamp()
    WHERE id = NEW.id;
  END IF;
  RETURN NEW;
END;
$$;

-- No function in this kernel is directly callable by application roles.
REVOKE ALL ON FUNCTION app.metrics_source_type_valid(text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.metrics_dispatch_enabled(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.metrics_mark_dirty(uuid, text, text, uuid, uuid, uuid, uuid, uuid, uuid, uuid, date, date, date, date) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.metrics_set_dispatch_enabled(boolean, uuid, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.metrics_release_expired_leases(integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.metrics_claim_dirty_work(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION app._metrics_assert_refresh_fence(uuid, bigint, uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION app._metrics_refresh_commercial(uuid, bigint, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION app._metrics_refresh_location_scopes(uuid, bigint, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION app._metrics_refresh_inventory(uuid, bigint, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION app._metrics_refresh_buyer_app(uuid, bigint, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION app._metrics_refresh_setup(uuid, bigint, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.metrics_refresh_tick(text, uuid, bigint, uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.metrics_mark_month_rollover(uuid, date) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.metrics_mark_age_out(uuid, text, integer, date) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.metrics_mark_reconciliation(uuid, text, date, date, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.metrics_inspect(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.metrics_prune_operational_history(timestamptz, timestamptz, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.metrics_mark_sync_completion(uuid, uuid, text, timestamptz, timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.trg_post_sync_rebuild() FROM PUBLIC;

GRANT EXECUTE ON FUNCTION app.metrics_source_type_valid(text, text) TO service_role;
GRANT EXECUTE ON FUNCTION app.metrics_dispatch_enabled(uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION app.metrics_mark_dirty(uuid, text, text, uuid, uuid, uuid, uuid, uuid, uuid, uuid, date, date, date, date) TO service_role;
GRANT EXECUTE ON FUNCTION app.metrics_set_dispatch_enabled(boolean, uuid, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION app.metrics_release_expired_leases(integer) TO service_role;
GRANT EXECUTE ON FUNCTION app.metrics_claim_dirty_work(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION app._metrics_assert_refresh_fence(uuid, bigint, uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION app._metrics_refresh_commercial(uuid, bigint, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION app._metrics_refresh_location_scopes(uuid, bigint, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION app._metrics_refresh_inventory(uuid, bigint, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION app._metrics_refresh_buyer_app(uuid, bigint, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION app._metrics_refresh_setup(uuid, bigint, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION app.metrics_refresh_tick(text, uuid, bigint, uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION app.metrics_mark_month_rollover(uuid, date) TO service_role;
GRANT EXECUTE ON FUNCTION app.metrics_mark_age_out(uuid, text, integer, date) TO service_role;
GRANT EXECUTE ON FUNCTION app.metrics_mark_reconciliation(uuid, text, date, date, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION app.metrics_inspect(uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION app.metrics_prune_operational_history(timestamptz, timestamptz, integer) TO service_role;
GRANT EXECUTE ON FUNCTION app.metrics_mark_sync_completion(uuid, uuid, text, timestamptz, timestamptz) TO service_role;
GRANT EXECUTE ON FUNCTION app.trg_post_sync_rebuild() TO service_role;

COMMENT ON FUNCTION app.metrics_refresh_tick(text, uuid, bigint, uuid, text) IS
  'Phase 3 manual-only state machine. Each stage is one committed RPC transaction; no recursive drain or parallel work.';
