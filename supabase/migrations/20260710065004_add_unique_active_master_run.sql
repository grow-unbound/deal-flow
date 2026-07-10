-- Phase 1 of sync orchestration redesign: DB-enforced single-active-run.
--
-- Before this: findActiveMasterJob (SELECT) + createMasterJob (INSERT) in
-- integrations-sync/index.ts are two separate round trips with no constraint
-- backing the "one active master per tenant_integration" invariant — a TOCTOU
-- race (e.g. the 5am cron kickoff firing while a user clicks "sync now" in the
-- same window) can create two concurrent master+slave trees for one tenant
-- integration, doubling outbound Zoho API traffic.
--
-- Defensive step first: if any tenant_integration already has more than one
-- active master row (shouldn't happen today, but the index creation would
-- fail outright if it did), cancel all but the most-recently-created one so
-- this migration is safe to apply regardless of current data state.
UPDATE app.integration_sync_jobs j
SET status = 'cancelled',
    completed_at = now(),
    updated_at = now(),
    progress = jsonb_set(
      COALESCE(j.progress, '{}'::jsonb),
      '{meta,run_cancelled}',
      'true'::jsonb,
      true
    ),
    error_log = jsonb_build_object(
      'message', 'cancelled: superseded by a concurrent duplicate master run, resolved by add_unique_active_master_run migration',
      'timestamp', now()
    )
WHERE j.phase = 'sync_run'
  AND j.status IN ('pending', 'running', 'paused')
  AND j.id <> (
    SELECT j2.id
    FROM app.integration_sync_jobs j2
    WHERE j2.tenant_integration_id = j.tenant_integration_id
      AND j2.phase = 'sync_run'
      AND j2.status IN ('pending', 'running', 'paused')
    ORDER BY j2.created_at DESC
    LIMIT 1
  );

CREATE UNIQUE INDEX integration_sync_jobs_one_active_master_idx
  ON app.integration_sync_jobs (tenant_integration_id)
  WHERE phase = 'sync_run'
    AND status IN ('pending', 'running', 'paused')
    AND deleted_at IS NULL;

COMMENT ON INDEX app.integration_sync_jobs_one_active_master_idx IS
  'Enforces at most one active (pending/running/paused) master sync run per tenant_integration_id at the DB layer, closing the TOCTOU race between findActiveMasterJob and createMasterJob in integrations-sync/index.ts.';
