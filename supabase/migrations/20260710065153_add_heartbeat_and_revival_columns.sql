-- Phase 1 of sync orchestration redesign: heartbeat/lease-based staleness +
-- bounded revival columns. Additive only — nothing reads or writes these yet
-- until the Phase 2/3 coordinator work lands; this migration just makes the
-- columns exist so later app-code changes don't need a migration of their own.
--
-- heartbeat_at: touched by a running phase worker (per-page + per Zoho-retry-
-- attempt) so staleness detection can distinguish "genuinely stuck" from
-- "slow but alive" — replaces relying on updated_at, which is only written at
-- page boundaries and can legitimately go quiet for ~150s during a Zoho
-- 429-backoff retry sequence (3 attempts x 30s timeout + 2x30s backoff).
--
-- attempt_count / next_retry_eligible_at: bounded, exponential-backoff
-- revival — caps how many times the coordinator will resurrect a stale/lost
-- job before giving up permanently. This is the direct fix for the incident
-- where an old tight-cadence reaper kept blindly re-triggering a failing job
-- with no stop-clause and burned the tenant's Zoho API rate limit.
--
-- coordinator_lease_until: mutual-exclusion for the coordinator tick. Needed
-- because net.http_post (pg_net) is async — a SELECT ... FOR UPDATE SKIP
-- LOCKED row lock releases at transaction commit, well before the actual
-- coordinator HTTP invocation finishes, so the lease is the real guard against
-- two overlapping ticks both deciding on the same run.

ALTER TABLE app.integration_sync_jobs
  ADD COLUMN heartbeat_at timestamptz,
  ADD COLUMN attempt_count integer NOT NULL DEFAULT 0,
  ADD COLUMN next_retry_eligible_at timestamptz,
  ADD COLUMN coordinator_lease_until timestamptz;

COMMENT ON COLUMN app.integration_sync_jobs.heartbeat_at IS
  'Last time an actively-running worker proved it is alive (per-page + per-retry-attempt). Staleness must be judged against this, not updated_at.';
COMMENT ON COLUMN app.integration_sync_jobs.attempt_count IS
  'Number of times the coordinator has revived this job after finding it stale/lost. Capped (see app.tick_sync_coordinator) — once the cap is hit the job is marked permanently failed and never auto-revived again.';
COMMENT ON COLUMN app.integration_sync_jobs.next_retry_eligible_at IS
  'Exponential-backoff gate: the coordinator will not attempt another revival of this job before this timestamp.';
COMMENT ON COLUMN app.integration_sync_jobs.coordinator_lease_until IS
  'Mutual-exclusion lease for the sync coordinator tick — a run is only eligible to be claimed and advanced by a tick when this is NULL or in the past.';
