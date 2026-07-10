-- Phase 1 of sync orchestration redesign: circuit breaker for automatic syncs.
--
-- Direct fix for the incident where a tight-cadence reaper kept blindly
-- re-triggering a failing/incomplete job with no stop-clause and burned the
-- tenant's entire Zoho API rate limit. Once wired in Phase 3, the coordinator
-- increments consecutive_run_failures whenever a master run ends in failure
-- and resets it on completed/degraded; at the threshold (3), automatic
-- (cron-triggered) syncs stop for that tenant integration while manual syncs
-- from Settings remain allowed — the human-acknowledgment path.
--
-- Additive only — nothing sets these yet; Phase 3 wires the coordinator and
-- run_zoho_orchestrator_cron's dispatch predicate to read/write them.

ALTER TABLE app.tenant_integrations
  ADD COLUMN sync_suspended boolean NOT NULL DEFAULT false,
  ADD COLUMN sync_suspended_reason text,
  ADD COLUMN sync_suspended_at timestamptz,
  ADD COLUMN consecutive_run_failures integer NOT NULL DEFAULT 0;

COMMENT ON COLUMN app.tenant_integrations.sync_suspended IS
  'When true, automatic (cron-triggered) syncs are skipped for this tenant integration. Manual syncs from Settings are still allowed. Cleared only via app.acknowledge_sync_suspension, never auto-cleared.';
COMMENT ON COLUMN app.tenant_integrations.consecutive_run_failures IS
  'Consecutive fully-failed master sync runs for this tenant integration. Reset to 0 on any completed/degraded run. At the coordinator''s threshold (3), trips sync_suspended.';
