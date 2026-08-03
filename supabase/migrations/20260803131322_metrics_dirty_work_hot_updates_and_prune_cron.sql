-- metrics_dirty_work write-amplification + unbounded operational history.
--
-- Measured on the live project before this migration:
--   n_tup_upd = 948,704   n_tup_hot_upd = 0   (748 live rows)
--   autovacuum_count = 3,810
--   metrics_dirty_work_pending_claim_idx = 824 kB over 748 live rows
--   heap = 69 pages for what should fit in ~10
--
-- ZERO hot updates across nearly a million updates is the tell. A HOT update
-- requires that no indexed column changed AND that the new tuple fits on the
-- same page. `metrics_dirty_work_tenant_domain_updated_idx` indexed
-- `updated_at`, and every single UPDATE in this system sets
-- `updated_at = clock_timestamp()` -- so the first condition could never hold,
-- for any update, ever. Each one therefore wrote a fresh index tuple into all
-- seven indexes on the table.
--
-- The claim/acknowledge/fail updates change state/lease_owner/next_attempt_at/
-- claimed_version, which are genuinely indexed by the partial claim indexes, so
-- those remain non-HOT by nature -- that is inherent to a queue table and is
-- not what this fixes. What this fixes is the compute-stage cursor update
-- (cursor_kind/cursor_id/cursor_aux_id/cursor_day -- none of them indexed),
-- which was non-HOT solely because of `updated_at`.
--
-- The only consumer of the dropped index is app.metrics_inspect, which filters
-- and groups on (tenant_id, domain) and never orders by updated_at, so the
-- narrowed index serves it identically.

DROP INDEX IF EXISTS app.metrics_dirty_work_tenant_domain_updated_idx;

CREATE INDEX IF NOT EXISTS metrics_dirty_work_tenant_domain_idx
  ON app.metrics_dirty_work (tenant_id, domain);

-- fillfactor leaves free space on each page so a HOT update has somewhere to
-- go; at the default 100 even a HOT-eligible update falls back to a new page
-- (and thus new index tuples) once the page is full. Queue tables are the
-- textbook case for this.
ALTER TABLE app.metrics_dirty_work SET (
  fillfactor = 70,
  autovacuum_vacuum_scale_factor = 0.0,
  autovacuum_vacuum_threshold = 50,
  autovacuum_analyze_scale_factor = 0.0,
  autovacuum_analyze_threshold = 50
);

-- Same treatment for the other hot-update tables in the tick path.
-- metrics_refresh_leases already achieves ~100% HOT (232,514 of 232,518) so it
-- only needs the headroom preserved; the period summaries and the landing
-- snapshot are rewritten every tick and benefit from it.
ALTER TABLE app.metrics_refresh_leases SET (
  fillfactor = 70,
  autovacuum_vacuum_scale_factor = 0.0,
  autovacuum_vacuum_threshold = 50
);

ALTER TABLE app.metrics_landing_kpi_snapshot SET (fillfactor = 80);
ALTER TABLE app.metrics_buyer_period_summary SET (fillfactor = 80);
ALTER TABLE app.metrics_product_period_summary SET (fillfactor = 80);
ALTER TABLE app.metrics_buyer_now_summary SET (fillfactor = 80);

-- app.metrics_prune_operational_history has existed since the v2 foundation but
-- was never scheduled, so app.metrics_execution_history grew without bound
-- (26,470 rows / 11 MB at the time of writing).
--
-- The function is deliberately self-limiting (LEAST(GREATEST(p_limit,1),1000)
-- with FOR UPDATE SKIP LOCKED), so an hourly run trims at most 1000 rows of
-- each kind and never contends with the tick.
CREATE OR REPLACE FUNCTION app.ensure_metrics_prune_history_cron_scheduled()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'app'
AS $fn$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_extension WHERE extname = 'pg_cron') THEN
    RETURN;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'metrics-prune-operational-history') THEN
    PERFORM cron.schedule(
      'metrics-prune-operational-history',
      '7 * * * *',
      'SELECT app.metrics_prune_operational_history(now() - interval ''1 hour'', now() - interval ''7 days'', 1000)'
    );
  END IF;
END;
$fn$;

SELECT app.ensure_metrics_prune_history_cron_scheduled();
