-- Phase 1 of sync orchestration redesign: first-class run_kind.
--
-- job_type today is a fuzzy 4-value enum (initial_reference, initial_transactional
-- [never actually set], incremental, manual) that conflates "why this run started"
-- with fields used elsewhere for rebuild-window sizing and UI labels. run_kind is a
-- clean, additive tag purely for orchestration policy (failure handling, circuit
-- breaker eligibility). It does NOT replace job_type — job_type stays load-bearing
-- for app.sync_job_rebuild_days() and resolveSyncEnrichmentPolicy().
--
-- Only meaningful on master rows (phase = 'sync_run'); left NULL on slave/analysis
-- rows. Nullable for now — a later migration makes it NOT NULL (scoped to master
-- rows) once every call site is confirmed to send it explicitly.

ALTER TABLE app.integration_sync_jobs
  ADD COLUMN run_kind text;

ALTER TABLE app.integration_sync_jobs
  ADD CONSTRAINT integration_sync_jobs_run_kind_check
  CHECK (run_kind IS NULL OR run_kind = ANY (ARRAY[
    'initial_sync'::text,
    'manual_full'::text,
    'manual_phase'::text,
    'daily_incremental'::text
  ]));

-- Backfill existing master rows from job_type + phases_in_run heuristics.
-- manual_full vs manual_phase is distinguished by how many phases the run
-- covers (single-phase manual syncs narrow phases_in_run to exactly one entry
-- in the app code today, see resolvePhasesForPolicy/resolvePhasesToRun).
UPDATE app.integration_sync_jobs
SET run_kind = CASE
  WHEN job_type IN ('initial_reference', 'initial_transactional') THEN 'initial_sync'
  WHEN job_type = 'incremental' THEN 'daily_incremental'
  WHEN job_type = 'manual' AND jsonb_typeof(progress -> 'phases_in_run') = 'array'
    AND jsonb_array_length(progress -> 'phases_in_run') = 1 THEN 'manual_phase'
  WHEN job_type = 'manual' THEN 'manual_full'
  ELSE NULL
END
WHERE phase = 'sync_run'
  AND run_kind IS NULL;

COMMENT ON COLUMN app.integration_sync_jobs.run_kind IS
  'Orchestration-policy tag for master (phase=sync_run) rows: initial_sync | manual_full | manual_phase | daily_incremental. Additive alongside job_type, not a replacement.';
