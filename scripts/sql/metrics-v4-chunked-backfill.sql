-- Metrics V4 chunked backfill / first-time-refresh driver.
--
-- Why this exists: app.metrics_v4_refresh_tenant() only marks reconciliation
-- dirty work and refreshes the NOW-summary synchronously -- the actual period
-- summary rows only materialize once app.metrics_refresh_tick() drains that
-- dirty work (normally the 15s cron). For a brand-new tenant, or a historical
-- backfill after cutover, waiting on cron increments is slow and gives no
-- visibility into progress or failures. This script IS a manual tick worker:
-- it marks reconciliation in small day-chunks (default 1 day; see below for
-- why) and then drains the queue using the exact same claim/compute/
-- acknowledge stage machine cron uses, so every write stays inside the same
-- budget (app.metrics_runtime_control, control_scope='global',
-- max_refresh_keys_per_tick -- one common number, no per-tenant override)
-- that steady-state ticks are bounded by. There is no separate unbounded
-- full-tenant-scan path -- that path was dead code and has been removed
-- from the migration.
--
-- Why 1-day chunks by default, not something bigger: app.metrics_claim_dirty_work
-- (v2) charges ANY reconciliation-style dirty_work row (one with dirty_from/
-- dirty_to set) the FULL per-tick budget as its claim cost, regardless of how
-- many days it actually spans. That means claim() only ever pulls ONE
-- reconciliation chunk per tick either way -- a 1-day chunk and a 90-day
-- chunk cost the same in throughput. But a wide chunk's ACTUAL distinct-
-- buyer/product/location footprint (computed downstream in
-- _metrics_v4_refresh_claimed_periods, unioned across every day in the
-- chunk) grows with the window -- for a busy tenant a 90-day chunk can
-- union 1000+ distinct buyers and blow even a generous budget, while most
-- single days stay comfortably under it. Smaller chunks are free in
-- throughput and safer in correctness -- there's no tradeoff, so 1 day is
-- the right default. Bump p_chunk_days only for tenants you've confirmed
-- are low-volume enough that it doesn't matter (see the per-day distinct-
-- buyer query in the usage notes below to check before assuming).
--
-- Implemented as a PROCEDURE (not a DO block or function) specifically so it
-- can COMMIT periodically. A DO block runs as one single transaction with no
-- COMMIT support -- for a backfill that may take thousands of drain
-- iterations across many tenants, that means: no progress is durable (and
-- invisible to concurrent cron workers) until the entire run finishes, every
-- lock is held for the full duration, and one error anywhere unwinds
-- everything already done. CALL supports COMMIT mid-run; DO does not.
--
-- Usage:
--   psql -f scripts/sql/metrics-v4-chunked-backfill.sql
--   -- or paste into the Supabase SQL editor and run the CALL at the bottom
--   -- with whatever arguments you need (see parameter docs below).
--
-- Safe to re-run: marking reconciliation and the claim/compute/acknowledge
-- stages are all idempotent (ON CONFLICT DO UPDATE upserts, dirty_work rows
-- collapse via dirty_version). If it's interrupted partway, just run it
-- again -- it picks up wherever the dirty-work queue left off.
--
-- After running, check app.metrics_inspect() for dead_letter_count > 0 --
-- those need root-causing, not blind re-runs -- then spot-check with the
-- recon scripts in scripts/sql/metrics-v2-reconciliation/raw-vs-v4-*.sql.

CREATE OR REPLACE PROCEDURE app._metrics_v4_backfill_driver(
  p_tenant_ids uuid[] DEFAULT NULL,          -- NULL = all non-deleted tenants
  p_backfill_start date DEFAULT NULL,        -- NULL = 1 year back from today
  p_chunk_days integer DEFAULT 1,            -- see header comment: free in throughput, safer in correctness
  p_max_drain_iterations integer DEFAULT 20000,
  p_commit_every integer DEFAULT 25          -- drain iterations per COMMIT
)
LANGUAGE plpgsql
AS $$
DECLARE
  v_today date := (clock_timestamp() AT TIME ZONE 'Asia/Kolkata')::date;
  v_backfill_start date := COALESCE(p_backfill_start, v_today - interval '1 year');
  v_domains text[] := ARRAY['commercial', 'inventory', 'buyer_app', 'setup'];
  v_max_consecutive_idle integer := 3;

  v_tenant record;
  v_chunk_start date;
  v_chunk_end date;
  v_domain text;
  v_marked integer := 0;
  v_iter integer := 0;
  v_since_commit integer := 0;
  v_idle_streak integer := 0;
  v_owner uuid;
  v_claim record;
  v_compute record;
BEGIN
  -- Phase 1: mark reconciliation for every tenant x domain x date-chunk.
  -- Commit after each tenant so a failure partway through a large tenant
  -- list doesn't lose marking work already done for earlier tenants.
  FOR v_tenant IN
    SELECT id FROM app.tenants
    WHERE deleted_at IS NULL
      AND (p_tenant_ids IS NULL OR id = ANY (p_tenant_ids))
  LOOP
    RAISE NOTICE 'metrics_v4_backfill: marking tenant %', v_tenant.id;

    -- setup_now is cheap and synchronous -- do it directly so active_*_count
    -- / receivables / stock counters are correct immediately, not just after
    -- the setup domain's next tick.
    PERFORM app._metrics_v4_refresh_setup_now(v_tenant.id);

    FOREACH v_domain IN ARRAY v_domains LOOP
      v_chunk_start := v_backfill_start;
      WHILE v_chunk_start <= v_today LOOP
        v_chunk_end := LEAST(v_chunk_start + (p_chunk_days - 1), v_today);
        PERFORM app.metrics_mark_reconciliation(v_tenant.id, v_domain, v_chunk_start, v_chunk_end);
        v_marked := v_marked + 1;
        v_chunk_start := v_chunk_end + 1;
      END LOOP;
    END LOOP;

    COMMIT;
  END LOOP;

  RAISE NOTICE 'metrics_v4_backfill: marked % (tenant x domain x chunk) reconciliation windows, draining queue', v_marked;

  -- Phase 2: drain the dirty-work queue using the real tick stage machine.
  -- This is intentionally the SAME entrypoint cron uses (app.metrics_refresh_tick)
  -- so backfill writes obey the identical per-claim budgets and fencing/lease
  -- semantics as steady-state refresh -- no bypass, no unbounded scan. Note
  -- claim_dirty_work has no tenant/domain filter -- it drains whatever is
  -- queued, which may include unrelated cron-marked work already in flight;
  -- that's fine, this loop is just acting as an extra tick worker.
  WHILE v_iter < p_max_drain_iterations AND v_idle_streak < v_max_consecutive_idle LOOP
    v_iter := v_iter + 1;
    v_owner := gen_random_uuid();

    BEGIN
      SELECT * INTO v_claim FROM app.metrics_refresh_tick('claim', v_owner);
    EXCEPTION
      WHEN query_canceled THEN
        RAISE WARNING 'metrics_v4_backfill: claim itself hit its own wall/statement budget: %', SQLERRM;
        v_idle_streak := v_idle_streak + 1;
        CONTINUE;
      WHEN OTHERS THEN
        RAISE WARNING 'metrics_v4_backfill: claim itself failed: %', SQLERRM;
        v_idle_streak := v_idle_streak + 1;
        CONTINUE;
    END;

    IF v_claim.status = 'idle' THEN
      v_idle_streak := v_idle_streak + 1;
      CONTINUE;
    END IF;

    IF v_claim.status = 'busy' OR v_claim.status = 'disabled' THEN
      -- Another worker (likely cron) holds the lease, or dispatch is paused
      -- for this tenant/domain. Not an error -- just move on.
      v_idle_streak := 0;
      CONTINUE;
    END IF;

    v_idle_streak := 0;

    BEGIN
      SELECT * INTO v_compute FROM app.metrics_refresh_tick(
        'compute', v_owner, v_claim.fencing_epoch, v_claim.tenant_id, v_claim.domain
      );
      PERFORM app.metrics_refresh_tick(
        'acknowledge', v_owner, v_claim.fencing_epoch, v_claim.tenant_id, v_claim.domain
      );
      RAISE NOTICE 'metrics_v4_backfill: drained tenant=% domain=% rows=% groups=%',
        v_claim.tenant_id, v_claim.domain, v_compute.dirty_sources, v_compute.statement_groups;
    EXCEPTION
      -- PL/pgSQL's WHEN OTHERS deliberately does NOT catch query_canceled or
      -- assert_failure (Postgres won't let a cancellation be silently
      -- swallowed). metrics_refresh_tick's wall-budget guard reuses
      -- SQLSTATE 57014 (query_canceled) for its own RAISE, so it needs its
      -- own explicit handler -- WHEN OTHERS alone let it escape uncaught
      -- and killed the entire backfill run on the first slow tick.
      WHEN query_canceled THEN
        RAISE WARNING 'metrics_v4_backfill: compute hit tick_wall_budget_ms for tenant=% domain=% (writes rolled back, dirty_work stays pending/retry for a future claim): %',
          v_claim.tenant_id, v_claim.domain, SQLERRM;
      WHEN OTHERS THEN
        -- Let the tick's own retry/dead-letter bookkeeping handle it (that's
        -- what 'fail' stage is for) rather than aborting the whole backfill.
        RAISE WARNING 'metrics_v4_backfill: compute failed for tenant=% domain=%: %',
          v_claim.tenant_id, v_claim.domain, SQLERRM;
        -- The 'fail' call itself can legitimately throw too (e.g. the lease
        -- was already reclaimed by real cron by the time we get here) --
        -- must not be allowed to abort the whole run if so.
        BEGIN
          PERFORM app.metrics_refresh_tick(
            'fail', v_owner, v_claim.fencing_epoch, v_claim.tenant_id, v_claim.domain
          );
        EXCEPTION WHEN OTHERS THEN
          RAISE WARNING 'metrics_v4_backfill: fail-stage cleanup also failed for tenant=% domain=% (lease likely already reclaimed, safe to ignore): %',
            v_claim.tenant_id, v_claim.domain, SQLERRM;
        END;
    END;

    v_since_commit := v_since_commit + 1;
    IF v_since_commit >= p_commit_every THEN
      COMMIT;
      v_since_commit := 0;
    END IF;
  END LOOP;

  COMMIT;

  IF v_iter >= p_max_drain_iterations THEN
    RAISE WARNING 'metrics_v4_backfill: hit max_drain_iterations (%) -- queue may not be fully drained, re-run this procedure', p_max_drain_iterations;
  ELSE
    RAISE NOTICE 'metrics_v4_backfill: queue idle after % iterations', v_iter;
  END IF;
END;
$$;

REVOKE ALL ON PROCEDURE app._metrics_v4_backfill_driver(uuid[], date, integer, integer, integer) FROM PUBLIC;
GRANT EXECUTE ON PROCEDURE app._metrics_v4_backfill_driver(uuid[], date, integer, integer, integer) TO service_role;

-- Run it. Edit the arguments before running against production:
--   p_tenant_ids     -- e.g. ARRAY['<uuid>']::uuid[] to scope to one tenant
--                        (recommended for the first run after this fix ships)
--   p_backfill_start -- how far back to reconcile; NULL defaults to 1 year
--   p_chunk_days     -- default 1 (see header). Only raise per-call after
--                        checking real volume for that tenant, e.g.:
--   SELECT max(daily_buyers) FROM (
--     SELECT app.metric_day_ist(i.invoice_date, i.created_at) AS d, count(DISTINCT i.buyer_id) AS daily_buyers
--     FROM app.invoices i WHERE i.tenant_id = '<uuid>' AND i.deleted_at IS NULL
--     GROUP BY 1
--   ) x;  -- keep chunk_days * (this number) comfortably under max_refresh_keys_per_tick
CALL app._metrics_v4_backfill_driver(
  p_tenant_ids => NULL,
  p_backfill_start => NULL
);

-- Drop the procedure once you're done backfilling, if you don't want it
-- lingering as a permanent schema object:
--   DROP PROCEDURE IF EXISTS app._metrics_v4_backfill_driver(uuid[], date, integer, integer, integer);

-- Post-backfill checks -- run these manually, don't just trust "no error":
--   SELECT * FROM app.metrics_inspect();  -- look for dead_letter_count > 0
--   \i scripts/sql/metrics-v2-reconciliation/raw-vs-v4-now-summaries.sql
--   \i scripts/sql/metrics-v2-reconciliation/raw-vs-v4-commercial-periods.sql
--   \i scripts/sql/metrics-v2-reconciliation/raw-vs-v4-campaign-periods.sql
--   \i scripts/sql/metrics-v2-reconciliation/raw-vs-v4-landing-kpis.sql
