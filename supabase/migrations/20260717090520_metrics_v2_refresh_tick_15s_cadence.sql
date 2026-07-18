-- Metrics V2: reschedule metrics-v2-refresh-tick from every 60s to every 15s.
--
-- Root cause of the observed low per-tick throughput (~14 dirty source rows /
-- ~14-98 refresh keys per invocation, well under the 100-row/100-key budget):
-- app.metrics_claim_dirty_work claims exactly ONE (tenant, domain) pair per
-- invocation (see 20260716050114_metrics_v2_phase_3_manual_refresh_kernel.sql:397-421),
-- by design -- "at most one active lease per tenant/domain" and global
-- concurrency 1. With multiple tenants/domains needing refresh, only one
-- pair advances per tick, so aggregate and per-tenant freshness is bounded by
-- tick frequency, not by the per-tick row/key budget.
--
-- app.metrics_runtime_control.lease_ttl_seconds is already set to 15 (not
-- 60) -- the schema was evidently tuned for a 15-second cadence from the
-- start; the original 20260717081442 migration scheduled it at 60s instead,
-- a mismatch against that existing default rather than a deliberate choice.
-- This migration only changes tick FREQUENCY. It does not touch the claim
-- budgets, does not loop within a single tick, and does not increase how
-- many tenant/domain pairs one invocation processes -- so it doesn't
-- conflict with the plan's "no same-tick drain loop / no automatic
-- concurrency increase" guardrail (specs/metrics-v2-implementation-plan-2026-07.md
-- sec 2.2). It mirrors the sync-coordinator's own already-proven 15-second
-- pg_cron pattern in this codebase (20260710071310_add_sync_coordinator_tick.sql),
-- confirmed supported by the installed pg_cron 1.6.4.
--
-- cron.schedule(...) upserts by jobname (safe to re-run), so this replaces
-- the existing 'metrics-v2-refresh-tick' job's schedule in place.

CREATE OR REPLACE FUNCTION app.ensure_metrics_refresh_tick_cron_scheduled() RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app
AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_extension WHERE extname = 'pg_cron') THEN
    RETURN;
  END IF;

  PERFORM cron.schedule(
    'metrics-v2-refresh-tick',
    '15 seconds',
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
END;
$$;

ALTER FUNCTION app.ensure_metrics_refresh_tick_cron_scheduled() OWNER TO postgres;

SELECT app.ensure_metrics_refresh_tick_cron_scheduled();
