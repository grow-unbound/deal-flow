-- Prune landing KPI snapshot rows that can never be read again.
--
-- app.metrics_landing_kpi_snapshot's unique key includes period_start, and
-- app.get_landing_metrics_v4 selects with
--   AND s.period_start = v_bounds.period_start
-- where v_bounds comes from app.metrics_v4_period_bounds(period_key, p_as_of),
-- i.e. it is recomputed from the clock on every read.
--
-- For relative period keys ('today', 'this_week', 'last_week', 'now') the
-- period_start moves as time passes. Each rollover therefore INSERTs a new row
-- and strands the previous one: it is never updated again (the upsert targets
-- the new period_start), never read again (the read pins the current
-- period_start), and nothing deletes it. Pure accumulation.
--
-- Measured before this migration on the live tenant:
--   today       65 rows -> 25 reachable, 40 orphaned
--   this_week   45 rows -> 25 reachable, 20 orphaned
--   last_week   45 rows -> 25 reachable, 20 orphaned
--   now         13 rows ->  5 reachable,  8 orphaned
--   this_month / last_month / this_quarter / last_quarter: 0 orphaned
--     (their period_start is stable within the period, so they upsert in place)
--
-- 88 of 335 rows (26%) were already unreachable, growing ~5-10/day.
--
-- Note this is a HARD delete, unlike the soft-delete convention for business
-- data. These are derived snapshots, fully rebuildable from the period
-- summaries, and the active unique index is partial on `deleted_at IS NULL` --
-- soft-deleting would leave the rows in the heap forever and defeat the point.
--
-- Bounded per call (LIMIT, FOR UPDATE SKIP LOCKED) so it can never contend
-- with the refresh tick, matching app.metrics_prune_operational_history.

CREATE OR REPLACE FUNCTION app.metrics_prune_landing_kpi_snapshots(
  p_as_of timestamptz DEFAULT clock_timestamp(),
  p_limit integer DEFAULT 1000
)
RETURNS integer
LANGUAGE plpgsql
SET search_path TO 'pg_catalog', 'app', 'pg_temp'
AS $fn$
DECLARE
  v_deleted integer;
BEGIN
  WITH doomed AS (
    SELECT s.id
    FROM app.metrics_landing_kpi_snapshot s
    CROSS JOIN LATERAL app.metrics_v4_period_bounds(s.period_key, p_as_of) b
    WHERE s.deleted_at IS NULL
      -- b.period_start IS NULL means the period_key is not one this build
      -- understands; leave those alone rather than deleting on ignorance.
      AND b.period_start IS NOT NULL
      AND s.period_start <> b.period_start
    ORDER BY s.period_start
    LIMIT LEAST(GREATEST(p_limit, 1), 5000)
    FOR UPDATE SKIP LOCKED
  )
  DELETE FROM app.metrics_landing_kpi_snapshot t
  USING doomed d
  WHERE t.id = d.id;

  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted;
END;
$fn$;

CREATE OR REPLACE FUNCTION app.ensure_metrics_prune_landing_cron_scheduled()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'app'
AS $fn$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_extension WHERE extname = 'pg_cron') THEN
    RETURN;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'metrics-prune-landing-snapshots') THEN
    -- Offset from the :07 operational-history prune so the two never overlap.
    PERFORM cron.schedule(
      'metrics-prune-landing-snapshots',
      '23 * * * *',
      'SELECT app.metrics_prune_landing_kpi_snapshots()'
    );
  END IF;
END;
$fn$;

SELECT app.ensure_metrics_prune_landing_cron_scheduled();
