-- membership_requeue_dead_letters has been failing 100% of runs on yukti-prod
-- (62/62 in cron.job_run_details): the requeue UPDATE flips a dead_letter row
-- back to 'pending', but membership_dirty_work_pending_uk is a partial unique
-- index on (tenant_id, entity_type, entity_id) WHERE state = 'pending'. If the
-- same entity was re-enqueued (fresh pending row inserted) while the old copy
-- was still sitting in dead_letter, the UPDATE collides and the whole
-- statement (all rows in the batch) fails -- so the dead_letter backlog never
-- drains, silently, every 15 minutes.
--
-- Fix: refresh_*_by_id calls are already idempotent (per
-- 20260823032311's own comment) -- a fresh pending row for the same entity
-- already covers the same work the dead_letter row was for, so the
-- dead_letter duplicate is redundant, not requeue-able. Delete the redundant
-- duplicates first, then requeue the rest; no more collision is possible.
CREATE OR REPLACE FUNCTION app.membership_requeue_dead_letters(p_min_age interval DEFAULT interval '15 minutes')
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'app', 'public'
AS $function$
DECLARE
  v_count integer;
BEGIN
  DELETE FROM app.membership_dirty_work dl
  WHERE dl.state = 'dead_letter'
    AND dl.updated_at <= now() - p_min_age
    AND EXISTS (
      SELECT 1 FROM app.membership_dirty_work p
      WHERE p.state = 'pending'
        AND p.tenant_id = dl.tenant_id
        AND p.entity_type = dl.entity_type
        AND p.entity_id = dl.entity_id
    );

  UPDATE app.membership_dirty_work
  SET state = 'pending', attempts = 0, next_attempt_at = now(),
      lease_owner = NULL, lease_until = NULL, last_error = NULL, updated_at = now()
  WHERE state = 'dead_letter' AND updated_at <= now() - p_min_age;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$function$;

-- membership_dirty_work has no cleanup path for 'done' rows at all -- unlike
-- app.metrics_dirty_work (pruned hourly via metrics_prune_operational_history),
-- completed membership rows accumulate forever. 84k+ done rows in the first
-- 24h on yukti-prod. Mirrors metrics_dirty_work's prune shape: batched,
-- FOR UPDATE SKIP LOCKED, short retention -- a done row has no value past
-- short-term debugging.
CREATE OR REPLACE FUNCTION app.prune_membership_dirty_work_done(
  p_done_before timestamptz,
  p_limit integer DEFAULT 1000
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'app', 'public'
AS $function$
DECLARE
  v_deleted integer;
BEGIN
  WITH doomed AS (
    SELECT id FROM app.membership_dirty_work
    WHERE state = 'done' AND updated_at < p_done_before
    ORDER BY updated_at LIMIT LEAST(GREATEST(p_limit, 1), 5000)
    FOR UPDATE SKIP LOCKED
  ) DELETE FROM app.membership_dirty_work w USING doomed d WHERE w.id = d.id;
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted;
END;
$function$;

REVOKE EXECUTE ON FUNCTION app.prune_membership_dirty_work_done(timestamptz, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION app.prune_membership_dirty_work_done(timestamptz, integer) TO service_role;

-- Cadence: every 3 hours, 6-hour retention. Done rows are pure churn (no
-- debugging value once processed -- same reasoning as metrics_dirty_work's
-- 1-hour cutoff), and this tenant produces very high done-row volume
-- (84k+/24h from cohort/product_candidate membership evaluation), so a short
-- window + a large batch (5000, vs the app's usual 1000) keeps the table from
-- ever re-accumulating a multi-day backlog like cron.job_run_details did.
DO $cron$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'membership-prune-done-rows') THEN
    PERFORM cron.schedule(
      'membership-prune-done-rows',
      '0 */3 * * *',
      $sql$SELECT app.prune_membership_dirty_work_done(now() - interval '6 hours', 5000)$sql$
    );
  END IF;
END;
$cron$;
