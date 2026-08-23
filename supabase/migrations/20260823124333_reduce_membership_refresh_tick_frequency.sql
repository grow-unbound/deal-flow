-- Perf: reduce the membership-automatic-refresh-tick cron cadence 30s -> 60s.
-- This job (job_id 40) was already at 30s and was never touched by the
-- earlier metrics-tick cadence migration -- halving it now matches the same
-- mitigation already applied to job 79 (metrics-v2-refresh-tick,
-- 20260823100017_reduce_metrics_refresh_tick_frequency.sql).
--
-- Same DB instance, same contention class: pg_stat_statements shows
-- membership_refresh_tick at 78,411 calls / ~3.0M ms cumulative execution
-- (mean 38ms, worst 4.7s) over the same window job 79 was measured in. This
-- job was not reviewed by the original perf audit -- found live this session
-- via a fresh cron.job query. 11,666 buyers / 62 cohort_members is not
-- 30s-freshness-critical data; halving cadence is the same free mitigation,
-- same tradeoff (less contention, up to 60s staler membership recompute).

-- pg_cron's sub-minute '<N> seconds' shorthand only accepts N < 60; exactly
-- one minute uses standard cron syntax instead.
SELECT cron.alter_job(job_id := 40, schedule := '* * * * *');
