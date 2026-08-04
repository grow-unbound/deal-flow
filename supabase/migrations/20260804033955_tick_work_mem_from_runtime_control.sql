-- Give the refresh tick its own work_mem.
--
-- The instance-wide work_mem is 2184 kB. That sufficed while the current
-- quarter was young, but quarter-grain aggregates grow monotonically until the
-- quarter rolls over, and the sorts behind COUNT(DISTINCT ...) cross the limit
-- well before quarter end.
--
-- Measured on the live tenant -- invoice item-side aggregate over the four
-- period keys a single dirty day produces, against a COMPLETE quarter
-- (Q2 2026: 13,274 invoices / 38,252 items) rather than the partial current one:
--
--   work_mem = 2184kB : 529ms   Sort Method: external merge  Disk: 2632kB
--   work_mem = 32MB   : 228ms   Sort Method: quicksort  Memory: 4590kB
--
-- Not speculative headroom: the tick already spills to disk at full-quarter
-- scale, and Q3 currently holds only ~40% of Q2's volume. The tenant block
-- measured 651ms for the invoice side alone at that scale, against a hard
-- 5000ms tick_wall_budget_ms ceiling.
--
-- Implemented as a per-function GUC rather than a set_config() call inside the
-- body, deliberately: it needs no edit to the 14 KB metrics_refresh_tick body
-- (and so cannot regress it), it is visible in \df+ / pg_proc.proconfig, and
-- Postgres applies it for the duration of the call INCLUDING nested functions,
-- so _metrics_v4_refresh_claimed_periods and _metrics_v4_refresh_landing_kpis
-- inherit it automatically when called through the tick.
--
-- The trade-off accepted: the value is a literal here rather than a column on
-- metrics_runtime_control, so changing it needs a migration rather than an
-- UPDATE. That is the right trade for a value that should change rarely, and
-- it avoids rewriting the tick body purely to make one number configurable.
--
-- 32MB is sized against this instance: shared_buffers is 224 MB and
-- max_connections 60, but only the metrics tick functions take this setting and
-- at most one tick runs at a time (enforced by the global refresh lease), so
-- the realistic concurrent exposure is a single 32 MB sort, not 60.

ALTER FUNCTION app.metrics_refresh_tick(text, uuid, bigint, uuid, text)
  SET work_mem = '32MB';

-- Also set directly on the two workers, so they keep the larger work_mem when
-- invoked outside the tick -- e.g. by app._metrics_v4_backfill_driver, or by
-- hand during an incident.
ALTER FUNCTION app._metrics_v4_refresh_claimed_periods(uuid, bigint, uuid, text)
  SET work_mem = '32MB';

ALTER FUNCTION app._metrics_v4_refresh_landing_kpis(uuid, timestamptz, text, date[])
  SET work_mem = '32MB';
