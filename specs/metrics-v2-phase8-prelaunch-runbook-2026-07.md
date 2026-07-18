# Metrics V2 Phase 8 Pre-launch Runbook — July 2026

Status: readiness artifact; execution requires explicit approval and green validation gates.

## Preconditions

- Confirm no customer writes are live. If any tenant has live customer writes, stop and write a live-migration amendment before applying Phase 8 actions.
- Phase 4/5 staging activation evidence must be green: full sync, normal-load `I/C/B`, overload safety, paused-dispatch, crash/recovery, p50/p95/p99 API/write latency, CPU, pool, lock, WAL, and freshness gates.
- Phase 7 validation must be green: selected detail RPC `EXPLAIN (ANALYZE, BUFFERS)`, API timeout evidence, and desktop visual matrix at 1280px/1440px/1920px.
- Remote commands must target hosted `yukti-dev` (`euhzgherjvjopjrpoqjr`) until a separate production authorization names the exact production action.

## Staging Cutover Rehearsal

1. Verify linked project ref equals `euhzgherjvjopjrpoqjr`.
2. Run `npx supabase migration list --linked` and `npx supabase db push --linked --dry-run`; confirm the pending set is only reviewed Metrics V2 migrations.
3. Apply migrations only after explicit approval.
4. Enable capture and the bounded dispatcher using the database-local dispatch switch; do not add a runtime Metrics V2 feature flag.
5. Perform bounded initial backfill by tenant/domain. Keep each run inside Phase 3/4 tick budgets.
6. Reconcile selected metrics to canonical raw data, including sparse tenants and multi-location tenants.
7. Verify no dead letters, stale domains, or pending dirty age above 15 minutes.
8. Run the code-revert test against the stable target API response contract.

## Rollback Path A: Presentation-only

Use this for UI defects after target APIs and snapshots reconcile.

1. Leave capture, dispatcher, and target read models in place.
2. Revert only the presentation artifact or route component that renders the bad UI.
3. Keep server routes reading the target API contract.
4. Re-run focused UI/component tests and one target API contract test.

## Rollback Path B: Server/Data Recovery

Use this for target RPC, snapshot, semantic, or data defects before opening customer access.

1. Block affected customer writes at the application/API layer.
2. Pause dispatch with the database-local kill switch while leaving dirty capture enabled.
3. Rebuild retained legacy read families from canonical raw data in bounded tenant/domain/date batches.
4. Reconcile legacy read families to canonical raw data.
5. Deploy old server routes only after reconciliation proves the legacy reads are current.
6. Re-enable legacy writers, then unblock affected writes.

Never point old server routes at stale legacy tables. Never edit an applied migration to reverse production.

## Observation Window

- Monitor dispatch tick duration, dirty backlog age, retries, dead letters, freshness, CPU, pool utilization, lock waits, WAL, row-write deltas, and API/write p50/p95/p99.
- Run daily raw-data reconciliation for selected launch metrics.
- Keep old V1 tables/functions physically present but with expensive writers stopped.
- Retire Buyer App ranked JSON, buyer daily, and product daily writers only after the observation gate and usage proof.
- Drop obsolete high-cardinality tables only in a later CLI-created migration after backup.
