-- Phase 2 of the yukti-prod DB recovery (see specs/db-perf-recovery-2026-09-20.md).
--
-- 1. Replay-safe cron registration for the two refresh ticks.
--    app.ensure_metrics_refresh_tick_cron_scheduled() used cron.schedule(name, '15 seconds', ...),
--    which on an existing job OVERWRITES the schedule (verified on dev: schedule reset, active flag
--    preserved). Any migration replay or fresh environment therefore silently put the metrics tick
--    back on a 15s cadence -- the cadence that contributed to the 2026-09-17..19 incident -- and a
--    later re-enable would start at 15s. Both ensure_* functions now only CREATE a missing job,
--    never touch an existing one, and create it INACTIVE at the conservative production cadence.
--    Enabling a tick is a deliberate act (specs/db-perf-recovery-2026-09-20.md, phase 8).
--
-- 2. Membership kill switch (metrics already has app.metrics_runtime_control.dispatch_enabled).
--    app.membership_runtime_control + a first-statement guard in app.membership_refresh_tick() so the
--    tick can be paused/resumed with one UPDATE and no cron edit. Missing row = enabled (fail-open),
--    so behaviour is unchanged until someone sets dispatch_enabled = false.
--
-- Idempotent. Does not change any existing cron job.

-- ---------------------------------------------------------------------------------------------
-- 1a. metrics tick: create-if-absent, inactive, 15-minute cadence (matches 20260919023950)
-- ---------------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.ensure_metrics_refresh_tick_cron_scheduled()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app
AS $$
DECLARE
  v_jobid bigint;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_extension WHERE extname = 'pg_cron') THEN
    RETURN;
  END IF;

  -- Never modify an existing job: cron.schedule() on an existing name overwrites its schedule.
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'metrics-v2-refresh-tick') THEN
    RETURN;
  END IF;

  v_jobid := cron.schedule(
    'metrics-v2-refresh-tick',
    '*/15 * * * *',
    $cron$
      DO $job$
      DECLARE
        v_owner_token uuid := gen_random_uuid();
        v_claim_owner uuid;
        v_fencing_epoch bigint;
        v_tenant_id uuid;
        v_domain text;
      BEGIN
        SELECT owner_token, fencing_epoch, tenant_id, domain
        INTO v_claim_owner, v_fencing_epoch, v_tenant_id, v_domain
        FROM app.metrics_refresh_tick('claim', v_owner_token, NULL, NULL, NULL);

        IF v_fencing_epoch IS NULL OR v_tenant_id IS NULL OR v_domain IS NULL THEN
          RETURN;
        END IF;

        BEGIN
          PERFORM 1
          FROM app.metrics_refresh_tick(
            'compute',
            COALESCE(v_claim_owner, v_owner_token),
            v_fencing_epoch,
            v_tenant_id,
            v_domain
          );

          PERFORM 1
          FROM app.metrics_refresh_tick(
            'acknowledge',
            COALESCE(v_claim_owner, v_owner_token),
            v_fencing_epoch,
            v_tenant_id,
            v_domain
          );
        EXCEPTION
          -- query_canceled MUST be listed explicitly: PL/pgSQL excludes it from
          -- WHEN OTHERS, and the wall-budget guard raises with SQLSTATE 57014.
          WHEN query_canceled OR OTHERS THEN
            BEGIN
              PERFORM 1
              FROM app.metrics_refresh_tick(
                'fail',
                COALESCE(v_claim_owner, v_owner_token),
                v_fencing_epoch,
                v_tenant_id,
                v_domain
              );
            EXCEPTION WHEN OTHERS THEN
              NULL;
            END;

            BEGIN
              PERFORM 1
              FROM app.metrics_refresh_tick(
                'release',
                COALESCE(v_claim_owner, v_owner_token),
                v_fencing_epoch,
                v_tenant_id,
                v_domain
              );
            EXCEPTION WHEN OTHERS THEN
              NULL;
            END;

            -- Deliberately NOT `RAISE;` (would discard the fail-stage bookkeeping above).
            RAISE WARNING 'metrics_tick_failed tenant=% domain=%: %',
              v_tenant_id, v_domain, SQLERRM;
        END;
      END
      $job$;
    $cron$
  );

  PERFORM cron.alter_job(job_id := v_jobid, active := false);
END;
$$;

-- ---------------------------------------------------------------------------------------------
-- 1b. membership tick: create-if-absent, inactive, 4-hourly (matches 20260919023952);
--     the daily time-boundary job stays active (cheap, enqueue-only).
-- ---------------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.ensure_membership_refresh_tick_cron_scheduled()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app
AS $$
DECLARE
  v_jobid bigint;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_extension WHERE extname = 'pg_cron') THEN
    RETURN;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'membership-automatic-refresh-tick') THEN
    v_jobid := cron.schedule(
      'membership-automatic-refresh-tick',
      '0 */4 * * *',
      $cron$SELECT app.membership_refresh_tick();$cron$
    );
    PERFORM cron.alter_job(job_id := v_jobid, active := false);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'membership-time-boundary-refresh') THEN
    PERFORM cron.schedule(
      'membership-time-boundary-refresh',
      '5 0 * * *',
      $cron$SELECT app.membership_enqueue_time_boundary_refresh('scheduled_time_boundary');$cron$
    );
  END IF;
END;
$$;

-- ---------------------------------------------------------------------------------------------
-- 2. Membership kill switch
-- ---------------------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS app.membership_runtime_control (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  control_scope    text        NOT NULL DEFAULT 'global' CHECK (control_scope = 'global'),
  dispatch_enabled boolean     NOT NULL DEFAULT true,
  pause_reason     text,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  created_by       uuid,
  updated_by       uuid,
  deleted_at       timestamptz
);

COMMENT ON TABLE app.membership_runtime_control IS
  'Singleton runtime control for app.membership_refresh_tick(): set dispatch_enabled=false (with pause_reason) to pause the tick without editing cron.';

CREATE UNIQUE INDEX IF NOT EXISTS membership_runtime_control_singleton_idx
  ON app.membership_runtime_control (control_scope) WHERE deleted_at IS NULL;

ALTER TABLE app.membership_runtime_control ENABLE ROW LEVEL SECURITY;
-- No policies: only service_role / postgres (which bypass RLS) may read or change it.
REVOKE ALL ON TABLE app.membership_runtime_control FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE app.membership_runtime_control TO service_role;

DROP TRIGGER IF EXISTS membership_runtime_control_updated_at ON app.membership_runtime_control;
CREATE TRIGGER membership_runtime_control_updated_at
  BEFORE UPDATE ON app.membership_runtime_control
  FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();

INSERT INTO app.membership_runtime_control (control_scope, dispatch_enabled)
SELECT 'global', true
WHERE NOT EXISTS (
  SELECT 1 FROM app.membership_runtime_control WHERE control_scope = 'global' AND deleted_at IS NULL
);

-- Guard added as the first statement; the remainder is the body currently live in production
-- (batch of 25, per 20260919023952) and is rewritten in phase 3.
CREATE OR REPLACE FUNCTION app.membership_refresh_tick()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
DECLARE
  v_candidate record;
  v_row record;
  v_owner uuid := gen_random_uuid();
  v_batch_size int := 25;
BEGIN
  IF NOT COALESCE((
    SELECT c.dispatch_enabled
    FROM app.membership_runtime_control c
    WHERE c.control_scope = 'global' AND c.deleted_at IS NULL
    LIMIT 1
  ), true) THEN
    RETURN;
  END IF;

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
$$;

-- Register missing tick jobs (inactive) on fresh environments; no-op where they already exist.
SELECT app.ensure_metrics_refresh_tick_cron_scheduled();
SELECT app.ensure_membership_refresh_tick_cron_scheduled();
