-- app.metrics_claim_dirty_work ran a lease UPSERT + release UPDATE (two writes) on every
-- 15s cron tick even when app.metrics_dirty_work had zero pending/retry rows -- 27.5% of
-- total DB time in pg_stat_statements. Add an idle fast path before touching any lease.
-- metrics_dirty_work_fair_claim_idx (partial, state IN pending/retry) makes the check
-- near-instant.
CREATE OR REPLACE FUNCTION app.metrics_claim_dirty_work(p_owner_token uuid)
 RETURNS TABLE(status text, owner_token uuid, fencing_epoch bigint, tenant_id uuid, domain text, dirty_sources integer, refresh_keys integer, statement_groups integer, has_more boolean, lease_until timestamp with time zone, error_text text)
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'app', 'pg_temp'
AS $function$
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

  -- Idle fast path: skip lease UPSERT/release churn entirely when the queue is empty.
  IF NOT EXISTS (
    SELECT 1 FROM app.metrics_dirty_work mdw
    WHERE mdw.state = ANY (ARRAY['pending', 'retry'])
      AND mdw.next_attempt_at <= clock_timestamp()
  ) THEN
    RETURN QUERY SELECT 'idle', p_owner_token, NULL::bigint, NULL::uuid, NULL::text,
      0, 0, 0, false, NULL::timestamptz, NULL::text;
    RETURN;
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
EXCEPTION
  WHEN lock_not_available THEN
    RETURN QUERY SELECT 'busy', p_owner_token, NULL::bigint, NULL::uuid, NULL::text,
      0, 0, 0, true, NULL::timestamptz, 'metrics_claim_lock_busy'::text;
END;
$function$;
