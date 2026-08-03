-- A too-slow tick retried forever and left no trace anywhere in app.*
--
-- Observed on 2026-08-03: 201 consecutive cron runs failed with
-- metrics_tick_wall_budget_exceeded and the queue stalled for about an hour,
-- yet app.metrics_dirty_work showed the affected rows as plain 'pending' with
-- attempts = 0 and last_error = NULL, and nothing ever reached 'dead_letter'.
-- The only evidence was cron.job_run_details. Two independent bugs in the tick
-- job body combined to produce that:
--
-- 1. `EXCEPTION WHEN OTHERS` never caught the wall-budget abort at all.
--    app.metrics_refresh_tick raises metrics_tick_wall_budget_exceeded with
--    ERRCODE '57014' (query_canceled), and PL/pgSQL deliberately excludes
--    query_canceled and assert_failure from WHEN OTHERS -- Postgres will not
--    let a cancellation be swallowed by a catch-all. So the 'fail' stage was
--    never reached for the one error that was actually occurring.
--    app._metrics_v4_backfill_driver already learned this and carries its own
--    explicit query_canceled handler; the cron job body never got the same fix.
--
-- 2. Even for errors WHEN OTHERS did catch, the trailing bare `RAISE;`
--    re-threw after the 'fail'/'release' stages had run. Re-raising out of the
--    DO block aborts the whole transaction, so the very bookkeeping those
--    stages had just written -- attempts + 1, state = 'retry'/'dead_letter',
--    last_error, the execution_history row -- was rolled back with it. The
--    claim itself was written before the inner BEGIN, so it was discarded too,
--    returning the rows to 'pending' with their counters untouched.
--
-- Net effect: a tick that was merely too slow could never make progress and
-- could never be diagnosed from the queue. A livelock that is silent by
-- construction.
--
-- Fix, mirroring the backfill driver:
--   * handle query_canceled explicitly so the wall-budget abort is caught and
--     routed through the 'fail' stage like any other failure;
--   * drop the bare `RAISE;` so the transaction commits and the failure
--     bookkeeping survives. Diagnosis now lives in app.metrics_dirty_work
--     (attempts / state / last_error) and app.metrics_execution_history
--     (status = 'failed'), which is where it is actually useful.
--
-- Trade-off, deliberate: cron.job_run_details will now record these runs as
-- 'succeeded' rather than 'failed', because the DO block no longer propagates
-- the error. RAISE WARNING still emits to the Postgres log. Durable, queryable
-- failure state in app.* is worth more than the cron row's status flag -- and
-- it is exactly what was missing during the incident.
--
-- Note: the retry/backoff/dead_letter machinery in the 'fail' stage has been
-- effectively dead code until now. Expect rows to begin reaching 'dead_letter'
-- after 3 attempts, which is the intended design and should be monitored.

CREATE OR REPLACE FUNCTION app.ensure_metrics_refresh_tick_cron_scheduled()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'app'
AS $function$
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
        EXCEPTION
          -- query_canceled MUST be listed explicitly: PL/pgSQL excludes it from
          -- WHEN OTHERS, and the wall-budget guard raises with SQLSTATE 57014.
          -- Without this the dominant failure mode bypassed the fail stage.
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

            -- Deliberately NOT `RAISE;`. Re-raising aborts the transaction and
            -- discards the claim plus the fail-stage bookkeeping written just
            -- above -- which is what made this failure mode invisible.
            RAISE WARNING 'metrics_tick_failed tenant=% domain=%: %',
              v_tenant_id, v_domain, SQLERRM;
        END;
      END
      $job$;
    $cron$
  );
END;
$function$;

SELECT app.ensure_metrics_refresh_tick_cron_scheduled();
