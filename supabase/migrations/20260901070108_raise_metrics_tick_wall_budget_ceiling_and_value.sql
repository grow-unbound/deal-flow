-- metrics_runtime_control_budget_check hard-capped tick_wall_budget_ms at 5000ms.
-- Wine Yard's commercial-domain compute measured 4.8-9.4s per weekly dirty-work
-- range (metrics_execution_history, 2026-08-31) -- anything over 5s aborted with
-- zero partial progress (no checkpointing inside one compute call), retried the
-- identical range, and eventually dead-lettered. Raising the ceiling to 15000
-- and the global default to 12000 gives headroom above the measured max (9.4s)
-- while keeping a bound on worst-case tick duration.
alter table app.metrics_runtime_control drop constraint metrics_runtime_control_budget_check;
alter table app.metrics_runtime_control add constraint metrics_runtime_control_budget_check CHECK (
  (max_dirty_sources_per_tick >= 1) AND (max_dirty_sources_per_tick <= 100)
  AND (max_refresh_keys_per_tick >= 1) AND (max_refresh_keys_per_tick <= 500)
  AND (max_statement_groups_per_tick >= 1) AND (max_statement_groups_per_tick <= 25)
  AND (lock_timeout_ms >= 1) AND (lock_timeout_ms <= 100)
  AND (statement_timeout_ms >= 1) AND (statement_timeout_ms <= 3000)
  AND (tick_wall_budget_ms >= 1) AND (tick_wall_budget_ms <= 15000)
  AND (lease_ttl_seconds >= 5) AND (lease_ttl_seconds <= 60)
);

update app.metrics_runtime_control
set tick_wall_budget_ms = 12000, updated_at = now()
where control_scope = 'global';
