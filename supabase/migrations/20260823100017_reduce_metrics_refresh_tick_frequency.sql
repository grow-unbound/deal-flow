-- Perf: reduce the metrics-v2-refresh-tick cron cadence from 15s to 30s.
--
-- Root cause of the multi-second latency spikes observed on otherwise-fast
-- (37-81ms) v4 metrics functions: this project's Supabase compute is the
-- smallest paid tier ("Micro" -- confirmed via pg_settings: shared_buffers
-- 224MB, max_connections 60), shared between this 15s-cadence refresh tick,
-- Supabase Realtime, and all foreground application traffic. pg_stat_statements
-- showed the refresh tick's DO block and Realtime's list_changes together
-- accounting for ~36.5M ms of cumulative execution over a ~27-day window --
-- real, ongoing contention on a small instance.
--
-- Chosen fix: halve tick frequency (free, immediate) rather than upgrade the
-- compute tier (real monthly cost, a separate decision for the user). This
-- is a mitigation, not a full fix -- it reduces how often the refresh burst
-- competes with foreground queries, at the cost of metrics being up to 15s
-- less fresh on average. If contention persists after this, the compute
-- tier is the next lever (tracked in the spec log, not actioned here).

SELECT cron.alter_job(job_id := 79, schedule := '30 seconds');
