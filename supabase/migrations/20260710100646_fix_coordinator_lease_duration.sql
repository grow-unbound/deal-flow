-- Fix: coordinator_lease_until was set to only 30 seconds, but a single
-- dispatch (sync-coordinator awaiting one sync-{phase} invocation) can
-- legitimately run up to TIME_BUDGET_MS (110s, the internal page-loop
-- cutoff checked BEFORE fetching the next page — so actual wall time can
-- exceed 110s by however long the last page's fetch+persist takes) plus
-- per-page N+1 detail-lookup overhead for entities like products/customers
-- (batched at concurrency 5, but still real wall-clock time on top of the
-- base page work). At realistic production volumes (tens of thousands of
-- records, tens of pages per phase), 30s is routinely exceeded, meaning the
-- very next 15s tick re-claims and re-dispatches the SAME run while the
-- first dispatch is still in flight — exactly the double-dispatch problem
-- this whole design is meant to prevent.
--
-- Widened to 4 minutes: comfortably covers the 110s internal budget plus
-- realistic persist/enrichment overhead, while staying below the reaper's
-- 5-minute stale-running threshold so the two mechanisms don't fight each
-- other over the same job.
--
-- Known residual gap (not fixed here): this is a fixed upfront lease, not a
-- renewed one — the SQL tick fires the HTTP dispatch async and moves on, it
-- doesn't (and structurally can't, from plpgsql) stay attached to watch the
-- edge function's actual progress. A dispatch that runs unusually long
-- (near or past 4 minutes) can still be double-claimed. A more robust fix
-- would have the edge function periodically renew its own lease the same
-- way it renews heartbeat_at — worth doing if 4 minutes proves insufficient
-- in practice, not done now to avoid over-engineering mid-incident.

CREATE OR REPLACE FUNCTION "app"."tick_sync_coordinator"() RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'app'
    AS $$
DECLARE
  v_base_url text := 'https://hrqpnkgnjtsbgyrzvkrk.supabase.co/functions/v1';
  v_secret   text := current_setting('app.integrations_dispatch_secret', true);
  v_lease    interval := interval '4 minutes';
  v_run      record;
BEGIN
  FOR v_run IN
    SELECT id
    FROM app.integration_sync_jobs
    WHERE phase = 'sync_run'
      AND status IN ('running', 'paused')
      AND deleted_at IS NULL
      AND (coordinator_lease_until IS NULL OR coordinator_lease_until < now())
    ORDER BY updated_at ASC
    LIMIT 20
    FOR UPDATE SKIP LOCKED
  LOOP
    UPDATE app.integration_sync_jobs
    SET coordinator_lease_until = now() + v_lease
    WHERE id = v_run.id;

    PERFORM net.http_post(
      url := v_base_url || '/sync-coordinator',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-integrations-dispatch-secret', COALESCE(v_secret, '')
      ),
      body := jsonb_build_object('master_job_id', v_run.id)
    );
  END LOOP;
END;
$$;
