-- Fix app.trg_post_sync_rebuild's broken skip-guard — this was causing real
-- production failures (statement_timeout on phase-completion UPDATEs).
--
-- Root cause: the guard checked NEW.progress->'meta'->>'sync_run_id' /
-- master_job_id (JSONB path) to detect "this is an orchestrated slave row,
-- skip the redundant per-phase rebuild". But updatePhaseJob's buildProgress()
-- (supabase/functions/_shared/sync-utils.ts) builds a fresh progress object
-- with no `meta` key at all on every page/completion write, so by the time a
-- phase reaches 'completed' its progress.meta has already been stripped.
-- The guard's condition was therefore always false for ordinary phase
-- completions, so EVERY phase completion (not just the dedicated analysis
-- phase) synchronously ran a full post_sync_rebuild() inside the UPDATE
-- statement — sometimes long enough to exceed the 2-minute statement_timeout
-- and fail the phase (which, under manual_full's halt_on_reference_failure
-- policy, fails the whole run).
--
-- The table already has a real master_job_id COLUMN (not JSONB) for exactly
-- this purpose (added by add_master_job_id_to_sync_jobs.sql) — checking that
-- directly is immune to whatever any app code does to the progress blob.
-- Also fixes the known double-fire on the analysis phase: runAnalysisPhase
-- writes master_job_id on its own row (it's a slave row like any other) and
-- explicitly calls post_sync_rebuild itself right before marking the row
-- completed, but the old guard's `NEW.phase IS DISTINCT FROM 'analysis'`
-- clause excluded analysis from the skip, causing a second, redundant
-- rebuild call every run.

CREATE OR REPLACE FUNCTION app.trg_post_sync_rebuild()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'app'
SET statement_timeout TO '0'
AS $function$
DECLARE
  v_days int;
BEGIN
  IF OLD.status IS DISTINCT FROM 'completed' AND NEW.status = 'completed' THEN
    -- Any row that belongs to an orchestrated run (master_job_id set) is
    -- handled by the orchestrator itself (runAnalysisPhase calls
    -- post_sync_rebuild explicitly for the one designated analysis phase) —
    -- skip unconditionally, including for phase = 'analysis'.
    IF NEW.master_job_id IS NOT NULL THEN
      RETURN NEW;
    END IF;

    IF NEW.job_type = 'initial_transactional'
       AND NEW.phase IN ('estimates', 'orders', 'invoices') THEN
      RETURN NEW;
    END IF;

    v_days := app.sync_job_rebuild_days(NEW.job_type, NEW.since_date, 2);

    BEGIN
      PERFORM app.post_sync_rebuild(NEW.tenant_id, v_days);

      UPDATE app.integration_sync_jobs
      SET
        error_log = NULL,
        progress = jsonb_set(
          jsonb_set(COALESCE(progress, '{}'::jsonb), '{meta,post_sync_rebuild_failed}', 'false'::jsonb, true),
          '{meta,post_sync_rebuild_days}',
          to_jsonb(v_days),
          true
        ),
        updated_at = now()
      WHERE id = NEW.id;
    EXCEPTION WHEN others THEN
      UPDATE app.integration_sync_jobs
      SET
        error_log = jsonb_build_object(
          'message', SQLERRM,
          'stage', 'post_sync_rebuild',
          'timestamp', now(),
          'days', v_days
        ),
        progress = jsonb_set(
          jsonb_set(COALESCE(progress, '{}'::jsonb), '{meta,post_sync_rebuild_failed}', 'true'::jsonb, true),
          '{meta,post_sync_rebuild_days}',
          to_jsonb(v_days),
          true
        ),
        updated_at = now()
      WHERE id = NEW.id;

      RAISE WARNING '[trg_post_sync_rebuild] post_sync_rebuild failed for job % (phase=%, type=%): %',
        NEW.id, NEW.phase, NEW.job_type, SQLERRM;
    END;
  END IF;
  RETURN NEW;
END;
$function$;
