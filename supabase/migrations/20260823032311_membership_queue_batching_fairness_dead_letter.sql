-- Problem 3 (queue starvation fix): app.membership_dirty_work's tick claimed exactly
-- one row per 30s invocation in strict global created_at FIFO across ALL tenants and
-- entity types, with no requeue path once a row hit attempts >= 4 ('failed' was a true
-- dead end). Live symptom: a tenant's `campaign_buyers` backfill row sat pending,
-- attempts=0, for over an hour behind an unrelated, still-growing backlog of
-- `product_candidate` rows from the SAME tenant, because insertion order alone decided
-- claim order.
--
-- Fix (reusing the proven shape from app.metrics_dirty_work's dead-letter fix,
-- 20260809070025_metrics_v4_dead_letter_requeue_and_range_chunking.sql, scaled down --
-- no lease/fencing/key-budget machinery needed since 20260823032310 made every
-- refresh_*_by_id call cheap/idempotent):
--   1. Batch + fairness: pick the oldest-due (tenant_id, entity_type) pair first, then
--      claim up to v_batch_size rows for that pair -- stops one backlog from starving
--      another tenant's/type's newer job purely by created_at ordering.
--   2. dead_letter state (replacing the permanent 'failed' dead end) + a periodic
--      requeue sweep, so a stuck row is always eventually retried, never silently lost.
--   3. Explicit `WHEN query_canceled` handling before `WHEN OTHERS`, matching the fix
--      in 20260803170133_fix_tick_failure_bookkeeping_lost_on_rollback.sql, so a
--      statement_timeout cancellation still records failure bookkeeping.

ALTER TABLE app.membership_dirty_work DROP CONSTRAINT membership_dirty_work_state_check;
UPDATE app.membership_dirty_work SET state = 'dead_letter' WHERE state = 'failed';
ALTER TABLE app.membership_dirty_work
  ADD CONSTRAINT membership_dirty_work_state_check
  CHECK (state = ANY (ARRAY['pending'::text, 'claimed'::text, 'done'::text, 'dead_letter'::text]));

CREATE OR REPLACE FUNCTION app.membership_refresh_tick()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'app', 'public'
AS $function$
DECLARE
  v_candidate record;
  v_row record;
  v_owner uuid := gen_random_uuid();
  v_batch_size int := 25;
BEGIN
  SELECT tenant_id, entity_type
  INTO v_candidate
  FROM app.membership_dirty_work
  WHERE state = 'pending' AND next_attempt_at <= now()
  GROUP BY tenant_id, entity_type
  ORDER BY MIN(next_attempt_at), MIN(created_at)
  LIMIT 1;

  IF v_candidate.tenant_id IS NULL THEN
    RETURN;
  END IF;

  FOR v_row IN
    SELECT *
    FROM app.membership_dirty_work
    WHERE tenant_id = v_candidate.tenant_id
      AND entity_type = v_candidate.entity_type
      AND state = 'pending'
      AND next_attempt_at <= now()
    ORDER BY created_at
    LIMIT v_batch_size
    FOR UPDATE SKIP LOCKED
  LOOP
    UPDATE app.membership_dirty_work
    SET state = 'claimed', lease_owner = v_owner, lease_until = now() + interval '2 minutes', updated_at = now()
    WHERE id = v_row.id;

    BEGIN
      IF v_row.entity_type = 'cohort' THEN
        PERFORM app.refresh_cohort_by_id(v_row.entity_id);
      ELSIF v_row.entity_type = 'price_list' THEN
        PERFORM app.refresh_price_list_by_id(v_row.entity_id);
      ELSIF v_row.entity_type = 'campaign_buyers' THEN
        PERFORM app.refresh_campaign_buyers_by_id(v_row.entity_id);
      ELSIF v_row.entity_type = 'campaign_products' THEN
        PERFORM app.refresh_campaign_products_by_id(v_row.entity_id);
      ELSIF v_row.entity_type = 'buyer_candidate' THEN
        PERFORM app.evaluate_buyer_for_cohorts_v2(v_row.entity_id);
        PERFORM app.evaluate_buyer_for_campaign_buyers(v_row.entity_id);
      ELSIF v_row.entity_type = 'product_candidate' THEN
        PERFORM app.evaluate_product_for_price_lists_v2(v_row.entity_id);
        PERFORM app.evaluate_product_for_campaigns_v2(v_row.entity_id);
      END IF;

      UPDATE app.membership_dirty_work
      SET state = 'done', updated_at = now()
      WHERE id = v_row.id;
    EXCEPTION
      WHEN query_canceled THEN
        UPDATE app.membership_dirty_work
        SET state = CASE WHEN attempts >= 4 THEN 'dead_letter' ELSE 'pending' END,
            attempts = attempts + 1,
            next_attempt_at = now() + (interval '30 seconds' * (attempts + 1)),
            last_error = 'query_canceled: statement_timeout',
            lease_owner = NULL, lease_until = NULL, updated_at = now()
        WHERE id = v_row.id;
      WHEN OTHERS THEN
        UPDATE app.membership_dirty_work
        SET state = CASE WHEN attempts >= 4 THEN 'dead_letter' ELSE 'pending' END,
            attempts = attempts + 1,
            next_attempt_at = now() + (interval '30 seconds' * (attempts + 1)),
            last_error = SQLERRM,
            lease_owner = NULL, lease_until = NULL, updated_at = now()
        WHERE id = v_row.id;
    END;
  END LOOP;
END;
$function$;

CREATE OR REPLACE FUNCTION app.membership_requeue_dead_letters(p_min_age interval DEFAULT interval '15 minutes')
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'app', 'public'
AS $function$
DECLARE
  v_count integer;
BEGIN
  UPDATE app.membership_dirty_work
  SET state = 'pending', attempts = 0, next_attempt_at = now(),
      lease_owner = NULL, lease_until = NULL, last_error = NULL, updated_at = now()
  WHERE state = 'dead_letter' AND updated_at <= now() - p_min_age;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$function$;

REVOKE EXECUTE ON FUNCTION app.membership_requeue_dead_letters(interval) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION app.membership_requeue_dead_letters(interval) TO service_role;

-- Extend the existing idempotent cron-registration function (mirrors
-- app.ensure_metrics_refresh_tick_cron_scheduled's pattern) with the new sweep.
CREATE OR REPLACE FUNCTION app.ensure_membership_refresh_tick_cron_scheduled()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'app'
AS $function$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_extension WHERE extname = 'pg_cron') THEN
    RETURN;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'membership-automatic-refresh-tick') THEN
    PERFORM cron.schedule('membership-automatic-refresh-tick', '30 seconds', $cron$SELECT app.membership_refresh_tick();$cron$);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'membership-time-boundary-refresh') THEN
    PERFORM cron.schedule('membership-time-boundary-refresh', '5 0 * * *', $cron$SELECT app.membership_enqueue_time_boundary_refresh('scheduled_time_boundary');$cron$);
  END IF;

  -- Near-instant/"never silently lose" requirement: requeue dead-lettered rows every
  -- 15 minutes rather than folding into the (24h-cadence) daily reconciliation sweep.
  IF NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'membership-dead-letter-requeue') THEN
    PERFORM cron.schedule('membership-dead-letter-requeue', '*/15 * * * *', $cron$SELECT app.membership_requeue_dead_letters();$cron$);
  END IF;
END;
$function$;

ALTER FUNCTION app.ensure_membership_refresh_tick_cron_scheduled() OWNER TO postgres;

SELECT app.ensure_membership_refresh_tick_cron_scheduled();
