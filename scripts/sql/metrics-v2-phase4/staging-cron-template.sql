-- Metrics V2 Phase 4 staging-only dispatcher Cron.
--
-- Generated and applied only by:
--   node scripts/metrics-v2-phase1a-acceptance.mjs phase4-schedule-cron
--
-- The harness verifies the linked Supabase project ref before applying this
-- file and requires PHASE4_ALLOW_CRON=1. Do not run this against production.
--
-- This staging job runs the bounded claim → compute → acknowledge pipeline
-- directly inside Postgres. That keeps the acceptance path independent from
-- Edge-function transport behavior while preserving the Phase 3 runtime-control
-- and lease/fencing semantics.

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'metrics-v2-refresh-tick') THEN
    PERFORM cron.unschedule('metrics-v2-refresh-tick');
  END IF;

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
END $$;
