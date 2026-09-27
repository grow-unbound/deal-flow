-- Fix the cohort self-triggering refresh loop and pace membership-automatic-refresh-tick.
--
-- ROOT CAUSE (yukti-prod incident 2026-09-17..19): app.refresh_cohort_by_id() finishes with
--   UPDATE app.cohorts SET cached_member_count = ..., last_refreshed_at = now()
-- and trg_membership_cohort_target_dirty (AFTER INSERT OR UPDATE OR DELETE, FOR EACH ROW) had
-- no column guard, so that bookkeeping UPDATE re-queued the very cohort just refreshed
-- ('cohorts_update'). membership_mark_dirty only dedupes against PENDING rows, and the row being
-- processed is 'claimed', so a fresh pending row was inserted every cycle: refresh -> update ->
-- dirty -> refresh ... forever. Each pass scans every buyer in the tenant (~11.7k for Wine Yard)
-- with per-buyer scalar subqueries, and one tick could chain up to 25 of them (2-8 min runs on a
-- 60s cron), starving the whole instance (SSL drops, cron "job startup timeout", OTP writes lost).
--
-- FIX: a cohort UPDATE only re-queues the cohort when a column that can change its membership
-- actually changed (rules, membership_mode, deleted_at). Bookkeeping writes (cached_member_count,
-- last_refreshed_at, updated_at/updated_by, search_vector, name/description edits) no longer
-- trigger a full re-evaluation. INSERT/DELETE and the price_lists / campaigns branches are
-- unchanged. Buyer-level changes already flow through the per-buyer delta path
-- (buyer_candidate -> evaluate_buyer_for_cohorts_v2), and quarter-boundary drift through the
-- daily membership-time-boundary-refresh / membership-daily-reconciliation jobs, so a full-scope
-- cohort refresh now only happens when someone edits the cohort's rules.
--
-- Comparing via to_jsonb(OLD/NEW) keeps this one shared trigger function safe for the
-- price_lists/campaigns tables (no cohort-only column reference is resolved for them).

CREATE OR REPLACE FUNCTION app.trg_membership_target_dirty()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
DECLARE
  v_row jsonb;
  v_old jsonb;
  v_tenant_id uuid;
  v_entity_id uuid;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_row := to_jsonb(OLD);
  ELSE
    v_row := to_jsonb(NEW);
  END IF;

  v_tenant_id := (v_row ->> 'tenant_id')::uuid;
  v_entity_id := (v_row ->> 'id')::uuid;

  IF TG_TABLE_NAME = 'cohorts' THEN
    IF TG_OP = 'UPDATE' THEN
      v_old := to_jsonb(OLD);
      IF (v_old -> 'rules') IS NOT DISTINCT FROM (v_row -> 'rules')
         AND (v_old -> 'membership_mode') IS NOT DISTINCT FROM (v_row -> 'membership_mode')
         AND (v_old -> 'deleted_at') IS NOT DISTINCT FROM (v_row -> 'deleted_at') THEN
        RETURN NEW;
      END IF;
    END IF;

    IF v_row ->> 'membership_mode' = 'automatic' THEN
      PERFORM app.membership_mark_dirty(
        v_tenant_id,
        'cohort',
        v_entity_id,
        TG_TABLE_NAME || '_' || lower(TG_OP)
      );
    END IF;
  ELSIF TG_TABLE_NAME = 'price_lists' THEN
    IF v_row ->> 'membership_mode' = 'automatic' THEN
      PERFORM app.membership_mark_dirty(
        v_tenant_id,
        'price_list',
        v_entity_id,
        TG_TABLE_NAME || '_' || lower(TG_OP)
      );
    END IF;
  ELSIF TG_TABLE_NAME = 'campaigns' THEN
    IF v_row ->> 'buyer_target_mode' = 'automatic' THEN
      PERFORM app.membership_mark_dirty(
        v_tenant_id,
        'campaign_buyers',
        v_entity_id,
        TG_TABLE_NAME || '_buyer_' || lower(TG_OP)
      );
    END IF;

    IF v_row ->> 'product_membership_mode' = 'automatic' THEN
      PERFORM app.membership_mark_dirty(
        v_tenant_id,
        'campaign_products',
        v_entity_id,
        TG_TABLE_NAME || '_product_' || lower(TG_OP)
      );
    END IF;
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

-- Pace the membership tick to every 4 hours. Captures the hand-applied yukti-prod change
-- (cron.alter_job on 2026-09-19) so dev/prod/fresh environments match. With the loop fixed the
-- tick only has real deltas to process; tighten (e.g. */15 * * * *) once verified healthy.
DO $$
DECLARE
  v_jobid bigint;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_extension WHERE extname = 'pg_cron') THEN
    RETURN;
  END IF;

  SELECT jobid INTO v_jobid FROM cron.job WHERE jobname = 'membership-automatic-refresh-tick';
  IF v_jobid IS NOT NULL THEN
    PERFORM cron.alter_job(job_id := v_jobid, schedule := '0 */4 * * *');
  END IF;
END
$$;
