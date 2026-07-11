import { readFileSync } from 'fs';

import { describe, expect, it } from 'vitest';
import {
  buildContinuationPayload,
  buildSyncRunContext,
  CIRCUIT_BREAKER_FAILURE_THRESHOLD,
  type CoordinatorMasterRow,
  type CoordinatorSlaveRow,
  dailySinceDateIst,
  decideCircuitBreaker,
  decideCoordinatorAction,
  decideRevival,
  deriveRunKind,
  enrichmentModeForEntity,
  FULL_SYNC_PHASES,
  isDegraded,
  isRunKind,
  isRunReadyForAnalysis,
  MAX_REVIVAL_ATTEMPTS,
  resolveFailurePolicy,
  resolveFailurePolicyForRunKind,
  resolvePhasesForPolicy,
  resolveSyncEnrichmentPolicy,
  revivalBackoffMs,
  sinceForPhase,
  shouldHaltOnFailure,
  STALE_RUNNING_LEASE_MS,
} from '@/lib/integrations/sync-orchestration';

function master(overrides: Partial<CoordinatorMasterRow> = {}): CoordinatorMasterRow {
  return {
    id: 'master-1',
    status: 'running',
    run_kind: 'manual_full',
    progress: { phases_in_run: ['locations', 'products', 'estimates'] },
    ...overrides,
  };
}

function slave(overrides: Partial<CoordinatorSlaveRow> = {}): CoordinatorSlaveRow {
  return {
    id: 'slave-1',
    phase: 'locations',
    status: 'completed',
    progress: {},
    ...overrides,
  };
}

describe('sync-orchestration', () => {
  it('sinceForPhase returns null for reference phases on full refresh', () => {
    const ctx = buildSyncRunContext({
      masterJobId: 'master-1',
      profile: 'full_refresh',
      runKind: 'manual_full',
      jobType: 'manual',
      transactionSince: '2026-07-01',
      referenceSince: null,
    });

    expect(sinceForPhase('locations', ctx)).toBeNull();
    expect(sinceForPhase('products', ctx)).toBeNull();
    expect(sinceForPhase('invoices', ctx)).toBe('2026-07-01');
  });

  it('resolveFailurePolicy halts reference failures only on full refresh', () => {
    expect(resolveFailurePolicy('full_refresh')).toBe('halt_on_reference_failure');
    expect(resolveFailurePolicy('incremental_daily')).toBe('skip_failed_phases');
  });

  it('shouldHaltOnFailure respects phase group and profile', () => {
    const ctx = buildSyncRunContext({
      masterJobId: 'master-1',
      profile: 'full_refresh',
      runKind: 'manual_full',
      jobType: 'manual',
      transactionSince: '2026-07-01',
      referenceSince: null,
    });

    expect(shouldHaltOnFailure('customers', ctx)).toBe(true);
    expect(shouldHaltOnFailure('invoices', ctx)).toBe(false);
  });

  it('isRunReadyForAnalysis requires both reference and transactional terminals', () => {
    const slaves = [
      { id: '1', phase: 'locations', status: 'completed', progress: {} },
      { id: '2', phase: 'products', status: 'completed', progress: {} },
      { id: '3', phase: 'inventory', status: 'completed', progress: {} },
      { id: '4', phase: 'pricelists', status: 'completed', progress: {} },
      { id: '5', phase: 'customers', status: 'completed', progress: {} },
      { id: '6', phase: 'contact_persons', status: 'completed', progress: {} },
      { id: '7', phase: 'estimates', status: 'completed', progress: {} },
      { id: '8', phase: 'orders', status: 'completed', progress: {} },
      { id: '9', phase: 'invoices', status: 'running', progress: {} },
      { id: '10', phase: 'transaction_line_items', status: 'pending', progress: {} },
    ];

    expect(isRunReadyForAnalysis(slaves)).toBe(false);

    const done = slaves.map((s) => (
      s.phase === 'invoices' || s.phase === 'transaction_line_items'
        ? { ...s, status: 'completed' }
        : s
    ));
    expect(isRunReadyForAnalysis(done)).toBe(true);
  });

  it('buildContinuationPayload carries master and sync run ids', () => {
    const ctx = buildSyncRunContext({
      masterJobId: 'master-abc',
      profile: 'continuation',
      runKind: 'manual_full',
      jobType: 'manual',
      transactionSince: '2026-07-01',
      referenceSince: null,
    });

    const payload = buildContinuationPayload({
      tenantIntegrationId: 'ti-1',
      ctx,
      phase: 'products',
      pageFrom: 3,
      jobId: 'slave-9',
    });

    expect(payload).toMatchObject({
      tenant_integration_id: 'ti-1',
      master_job_id: 'master-abc',
      sync_run_id: 'master-abc',
      phase: 'products',
      page_from: 3,
      job_id: 'slave-9',
      continuation: true,
    });
  });

  it('dailySinceDateIst returns previous IST calendar date', () => {
    const istMorning = new Date('2026-07-07T00:30:00.000Z'); // 06:00 IST Jul 7
    expect(dailySinceDateIst(istMorning)).toBe('2026-07-06');
  });

  it('resolveSyncEnrichmentPolicy distinguishes incremental from full sync', () => {
    expect(resolveSyncEnrichmentPolicy('incremental')).toBe('incremental');
    expect(resolveSyncEnrichmentPolicy('manual')).toBe('full_sync');
    expect(resolveSyncEnrichmentPolicy('initial_reference')).toBe('full_sync');
  });

  it('resolvePhasesForPolicy omits transaction_line_items on every manual path, only ever includes it for incremental', () => {
    expect(resolvePhasesForPolicy({
      requestedPhase: null,
      enrichmentPolicy: 'full_sync',
    })).toEqual(FULL_SYNC_PHASES);
    expect(resolvePhasesForPolicy({
      requestedPhase: null,
      enrichmentPolicy: 'incremental',
    })).toContain('transaction_line_items');
    // Even an explicit single-phase request for it is cut under a non-incremental
    // policy — it's reachable ONLY through the automatic daily incremental sync,
    // never through any manual trigger (full sync, group, or explicit phase).
    expect(resolvePhasesForPolicy({
      requestedPhase: 'transaction_line_items',
      enrichmentPolicy: 'full_sync',
    })).toEqual([]);
    expect(resolvePhasesForPolicy({
      requestedPhase: 'transaction_line_items',
      enrichmentPolicy: 'incremental',
    })).toEqual(['transaction_line_items']);
    // A manual 'transactional' group request still gets every other
    // transactional phase, just not the line-item hydration sweep.
    expect(resolvePhasesForPolicy({
      requestedPhase: 'transactional',
      enrichmentPolicy: 'full_sync',
    })).toEqual(['estimates', 'orders', 'invoices']);
  });

  it('enrichmentModeForEntity applies list_only to customers on full sync', () => {
    expect(enrichmentModeForEntity('full_sync', 'customers')).toBe('list_only');
    expect(enrichmentModeForEntity('incremental', 'customers')).toBe('detail_when_needed');
    expect(enrichmentModeForEntity('full_sync', 'products')).toBe('keep_current');
    expect(enrichmentModeForEntity('full_sync', 'estimates')).toBe('list_only');
  });

  it('isRunReadyForAnalysis completes full sync without transaction_line_items', () => {
    const fullSyncPhases = [...FULL_SYNC_PHASES];
    const slaves = fullSyncPhases.map((phase, index) => ({
      id: String(index + 1),
      phase,
      status: 'completed',
      progress: {},
    }));
    expect(isRunReadyForAnalysis(slaves, fullSyncPhases)).toBe(true);
  });

  it('transaction line items edge function defaults batch size to 50', () => {
    const source = readFileSync('supabase/functions/sync-transaction-line-items/index.ts', 'utf8');
    expect(source).toContain('const DEFAULT_BATCH_SIZE = 50');
  });

  it('deriveRunKind maps job_type + requestedPhase to the correct run_kind', () => {
    expect(deriveRunKind({ jobType: 'initial_reference', requestedPhase: null })).toBe('initial_sync');
    expect(deriveRunKind({ jobType: 'initial_transactional', requestedPhase: null })).toBe('initial_sync');
    expect(deriveRunKind({ jobType: 'incremental', requestedPhase: null })).toBe('daily_incremental');
    expect(deriveRunKind({ jobType: 'manual', requestedPhase: null })).toBe('manual_full');
    expect(deriveRunKind({ jobType: 'manual', requestedPhase: 'products' })).toBe('manual_phase');
  });

  it('isRunKind validates against the four canonical values only', () => {
    expect(isRunKind('initial_sync')).toBe(true);
    expect(isRunKind('manual_full')).toBe(true);
    expect(isRunKind('manual_phase')).toBe(true);
    expect(isRunKind('daily_incremental')).toBe(true);
    expect(isRunKind('incremental')).toBe(false);
    expect(isRunKind(null)).toBe(false);
    expect(isRunKind(undefined)).toBe(false);
  });

  it('resolveFailurePolicyForRunKind: initial_sync and manual_full halt on reference failure', () => {
    expect(resolveFailurePolicyForRunKind('initial_sync')).toBe('halt_on_reference_failure');
    expect(resolveFailurePolicyForRunKind('manual_full')).toBe('halt_on_reference_failure');
  });

  it('resolveFailurePolicyForRunKind: manual_phase and daily_incremental skip failed phases', () => {
    expect(resolveFailurePolicyForRunKind('manual_phase')).toBe('skip_failed_phases');
    expect(resolveFailurePolicyForRunKind('daily_incremental')).toBe('skip_failed_phases');
  });

  it('buildSyncRunContext derives failurePolicy from runKind, not just profile', () => {
    // A plain manual full sync used to resolve to profile 'pickup' -> skip_failed_phases.
    // Under run_kind-based policy, manual_full now correctly halts on reference failure.
    const ctx = buildSyncRunContext({
      masterJobId: 'master-1',
      profile: 'pickup',
      runKind: 'manual_full',
      jobType: 'manual',
      transactionSince: null,
      referenceSince: null,
    });
    expect(ctx.failurePolicy).toBe('halt_on_reference_failure');
  });

  it('isDegraded is true iff at least one phase result failed', () => {
    expect(isDegraded([{ ok: true }, { ok: true }])).toBe(false);
    expect(isDegraded([{ ok: true }, { ok: false }])).toBe(true);
    expect(isDegraded([])).toBe(false);
  });

  describe('decideCoordinatorAction', () => {
    it('reports noop/aborted when the master was cancelled', () => {
      const m = master({ progress: { phases_in_run: ['locations'], meta: { run_cancelled: true } } });
      expect(decideCoordinatorAction(m, [])).toEqual({ type: 'noop', reason: 'aborted' });
    });

    it('reports noop/aborted when the master was halted', () => {
      const m = master({ progress: { phases_in_run: ['locations'], meta: { run_halted: true } } });
      expect(decideCoordinatorAction(m, [])).toEqual({ type: 'noop', reason: 'aborted' });
    });

    it('dispatches the first phase when no slave exists for it yet', () => {
      const m = master({ progress: { phases_in_run: ['locations', 'products'] } });
      expect(decideCoordinatorAction(m, [])).toEqual({ type: 'dispatch_next_phase', phase: 'locations' });
    });

    it('dispatches the next phase once the current one is completed', () => {
      const m = master({ progress: { phases_in_run: ['locations', 'products'] } });
      const slaves = [slave({ id: 's1', phase: 'locations', status: 'completed' })];
      expect(decideCoordinatorAction(m, slaves)).toEqual({ type: 'dispatch_next_phase', phase: 'products' });
    });

    it('dispatches the next page for a paused (has_more) slave', () => {
      const m = master({ progress: { phases_in_run: ['locations'] } });
      const slaves = [slave({ id: 's1', phase: 'locations', status: 'paused', progress: { next_cursor: { page: 4 } } })];
      expect(decideCoordinatorAction(m, slaves)).toEqual({
        type: 'dispatch_next_page',
        phase: 'locations',
        slaveId: 's1',
        pageFrom: 4,
      });
    });

    it('dispatches a pending/queued slave (lost or not-yet-started dispatch)', () => {
      const m = master({ progress: { phases_in_run: ['locations'] } });
      const slaves = [slave({ id: 's1', phase: 'locations', status: 'pending' })];
      expect(decideCoordinatorAction(m, slaves)).toEqual({ type: 'dispatch_next_phase', phase: 'locations' });
    });

    it('is a noop while a running slave is within its heartbeat lease', () => {
      const m = master({ progress: { phases_in_run: ['locations'] } });
      const slaves = [slave({ id: 's1', phase: 'locations', status: 'running', heartbeat_at: new Date().toISOString() })];
      expect(decideCoordinatorAction(m, slaves)).toEqual({ type: 'noop', reason: 'nothing_to_do' });
    });

    it('detects a running slave whose heartbeat is past the stale lease', () => {
      const m = master({ progress: { phases_in_run: ['locations'] } });
      const staleHeartbeat = new Date(Date.now() - STALE_RUNNING_LEASE_MS - 1000).toISOString();
      const slaves = [slave({ id: 's1', phase: 'locations', status: 'running', heartbeat_at: staleHeartbeat })];
      expect(decideCoordinatorAction(m, slaves)).toEqual({ type: 'stale_detected', phase: 'locations', slaveId: 's1' });
    });

    it('halts on a failed reference phase for manual_full (halt_on_reference_failure)', () => {
      const m = master({ run_kind: 'manual_full', progress: { phases_in_run: ['locations', 'products'] } });
      const slaves = [slave({ id: 's1', phase: 'locations', status: 'failed' })];
      expect(decideCoordinatorAction(m, slaves)).toEqual({ type: 'halt_failed', phase: 'locations' });
    });

    it('skips a failed phase and continues for daily_incremental (skip_failed_phases)', () => {
      const m = master({ run_kind: 'daily_incremental', progress: { phases_in_run: ['locations', 'products'] } });
      const slaves = [slave({ id: 's1', phase: 'locations', status: 'failed' })];
      expect(decideCoordinatorAction(m, slaves)).toEqual({ type: 'dispatch_next_phase', phase: 'products' });
    });

    it('does not halt on a failed transactional phase even under halt_on_reference_failure', () => {
      const m = master({ run_kind: 'manual_full', progress: { phases_in_run: ['estimates', 'orders'] } });
      const slaves = [slave({ id: 's1', phase: 'estimates', status: 'failed' })];
      expect(decideCoordinatorAction(m, slaves)).toEqual({ type: 'dispatch_next_phase', phase: 'orders' });
    });

    // Regression: inventory IS a reference phase (isReferencePhase('inventory')
    // is true) AND a deferred phase — this branch used to check only
    // isReferencePhase, so a deferred phase's failure (e.g. sync-inventory's
    // dispatch timing out on a large catalog) halted an otherwise
    // fully-synced run, contradicting DEFERRED_PHASES' whole purpose.
    it('does not halt on a failed deferred phase (inventory) even under halt_on_reference_failure', () => {
      const m = master({ run_kind: 'manual_full', progress: { phases_in_run: ['inventory', 'estimates'] } });
      const slaves = [slave({ id: 's1', phase: 'inventory', status: 'failed' })];
      expect(decideCoordinatorAction(m, slaves)).toEqual({ type: 'dispatch_next_phase', phase: 'estimates' });
    });

    it('runs analysis once all phases are terminal and reference+transactional are both present', () => {
      const m = master({ progress: { phases_in_run: ['locations', 'estimates'] } });
      const slaves = [
        slave({ id: 's1', phase: 'locations', status: 'completed' }),
        slave({ id: 's2', phase: 'estimates', status: 'completed' }),
      ];
      expect(decideCoordinatorAction(m, slaves)).toEqual({ type: 'run_analysis' });
    });

    it('marks the run complete (not degraded) once analysis has already run', () => {
      const m = master({ progress: { phases_in_run: ['locations', 'estimates'] } });
      const slaves = [
        slave({ id: 's1', phase: 'locations', status: 'completed' }),
        slave({ id: 's2', phase: 'estimates', status: 'completed' }),
        slave({ id: 's3', phase: 'analysis', status: 'completed' }),
      ];
      expect(decideCoordinatorAction(m, slaves)).toEqual({ type: 'mark_complete', degraded: false });
    });

    it('marks the run complete as degraded when a skipped phase failed', () => {
      const m = master({ run_kind: 'daily_incremental', progress: { phases_in_run: ['locations', 'estimates'] } });
      const slaves = [
        slave({ id: 's1', phase: 'locations', status: 'failed' }),
        slave({ id: 's2', phase: 'estimates', status: 'completed' }),
        slave({ id: 's3', phase: 'analysis', status: 'completed' }),
      ];
      expect(decideCoordinatorAction(m, slaves)).toEqual({ type: 'mark_complete', degraded: true });
    });

    it('does not redispatch a pending slave still inside its backoff window', () => {
      const m = master({ progress: { phases_in_run: ['locations'] } });
      const futureRetry = new Date(Date.now() + 60_000).toISOString();
      const slaves = [slave({ id: 's1', phase: 'locations', status: 'pending', next_retry_eligible_at: futureRetry })];
      expect(decideCoordinatorAction(m, slaves)).toEqual({ type: 'noop', reason: 'nothing_to_do' });
    });

    it('redispatches a pending slave once its backoff window has elapsed', () => {
      const m = master({ progress: { phases_in_run: ['locations'] } });
      const pastRetry = new Date(Date.now() - 1000).toISOString();
      const slaves = [slave({ id: 's1', phase: 'locations', status: 'pending', next_retry_eligible_at: pastRetry })];
      expect(decideCoordinatorAction(m, slaves)).toEqual({ type: 'dispatch_next_phase', phase: 'locations' });
    });
  });

  describe('decideRevival', () => {
    it('revives attempts 1 through MAX_REVIVAL_ATTEMPTS with exponential backoff', () => {
      const now = new Date('2026-07-10T00:00:00.000Z');
      expect(revivalBackoffMs(1)).toBe(30_000);
      expect(revivalBackoffMs(2)).toBe(90_000);
      expect(revivalBackoffMs(3)).toBe(270_000);

      const d1 = decideRevival({ currentAttemptCount: 0, now });
      expect(d1).toEqual({ type: 'revive', nextAttemptCount: 1, nextRetryEligibleAt: '2026-07-10T00:00:30.000Z' });

      const d2 = decideRevival({ currentAttemptCount: 1, now });
      expect(d2).toEqual({ type: 'revive', nextAttemptCount: 2, nextRetryEligibleAt: '2026-07-10T00:01:30.000Z' });

      const d3 = decideRevival({ currentAttemptCount: 2, now });
      expect(d3).toEqual({ type: 'revive', nextAttemptCount: 3, nextRetryEligibleAt: '2026-07-10T00:04:30.000Z' });
    });

    it('permanently fails once the revival cap is exceeded — never auto-retries again', () => {
      expect(MAX_REVIVAL_ATTEMPTS).toBe(3);
      const decision = decideRevival({ currentAttemptCount: 3 });
      expect(decision).toEqual({ type: 'permanently_fail', nextAttemptCount: 4 });
    });
  });

  describe('decideCircuitBreaker', () => {
    it('increments consecutive failures and does not suspend below threshold', () => {
      expect(CIRCUIT_BREAKER_FAILURE_THRESHOLD).toBe(3);
      expect(decideCircuitBreaker({ consecutiveRunFailures: 0, runOutcome: 'failed' }))
        .toEqual({ consecutiveRunFailures: 1, shouldSuspend: false });
      expect(decideCircuitBreaker({ consecutiveRunFailures: 1, runOutcome: 'failed' }))
        .toEqual({ consecutiveRunFailures: 2, shouldSuspend: false });
    });

    it('suspends once consecutive failures reach the threshold', () => {
      expect(decideCircuitBreaker({ consecutiveRunFailures: 2, runOutcome: 'failed' }))
        .toEqual({ consecutiveRunFailures: 3, shouldSuspend: true });
    });

    it('resets to zero on a completed or degraded run, never suspending', () => {
      expect(decideCircuitBreaker({ consecutiveRunFailures: 2, runOutcome: 'completed' }))
        .toEqual({ consecutiveRunFailures: 0, shouldSuspend: false });
      expect(decideCircuitBreaker({ consecutiveRunFailures: 5, runOutcome: 'degraded' }))
        .toEqual({ consecutiveRunFailures: 0, shouldSuspend: false });
    });
  });
});
