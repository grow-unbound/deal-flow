-- Metrics V2: schedule the refresh kernel (app.metrics_refresh_tick) for real,
-- every 60 seconds, using this repo's standing idempotent-cron idiom
-- (app.ensure_*_cron_scheduled(), see app.ensure_buyer_metric_snapshot_cron_scheduled
-- / app.ensure_zoho_sync_cron_scheduled in 20260709000001_prod_bootstrap.sql).
--
-- The claim -> compute -> acknowledge/fail/release pipeline below is the same
-- logic already validated in scripts/sql/metrics-v2-phase4/staging-cron-template.sql
-- (Phase 4 acceptance). That script is explicitly staging-only, non-idempotent
-- (unconditional unschedule+reschedule), and gated by PHASE4_ALLOW_CRON=1 --
-- it is not itself a migration. This migration wraps the same tested pipeline
-- in the guard-function pattern so it's safe to re-run and matches how every
-- other standing cron job in this repo is scheduled.
--
-- Defining the guard function is not enough on its own -- it must also be
-- invoked (the zoho-sync-daily job was defined in bootstrap but not actually
-- scheduled until 20260714024953_reconcile_standing_cron_jobs.sql called it).
-- This migration both defines and invokes it.

CREATE OR REPLACE FUNCTION app.ensure_metrics_refresh_tick_cron_scheduled() RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app
AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_extension WHERE extname = 'pg_cron') THEN
    RETURN;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'metrics-v2-refresh-tick') THEN
    PERFORM cron.schedule(
      'metrics-v2-refresh-tick',
      '* * * * *',
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
          EXCEPTION WHEN OTHERS THEN
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

            RAISE;
          END;
        END
        $job$;
      $cron$
    );
  END IF;
END;
$$;

ALTER FUNCTION app.ensure_metrics_refresh_tick_cron_scheduled() OWNER TO postgres;

SELECT app.ensure_metrics_refresh_tick_cron_scheduled();
