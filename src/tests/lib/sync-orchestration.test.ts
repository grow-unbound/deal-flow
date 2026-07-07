import { describe, expect, it } from 'vitest';
import {
  buildContinuationPayload,
  buildSyncRunContext,
  dailySinceDateIst,
  isRunReadyForAnalysis,
  resolveFailurePolicy,
  sinceForPhase,
  shouldHaltOnFailure,
} from '@/lib/integrations/sync-orchestration';

describe('sync-orchestration', () => {
  it('sinceForPhase returns null for reference phases on full refresh', () => {
    const ctx = buildSyncRunContext({
      masterJobId: 'master-1',
      profile: 'full_refresh',
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
      { id: '3', phase: 'pricelists', status: 'completed', progress: {} },
      { id: '4', phase: 'customers', status: 'completed', progress: {} },
      { id: '5', phase: 'estimates', status: 'completed', progress: {} },
      { id: '6', phase: 'orders', status: 'completed', progress: {} },
      { id: '7', phase: 'invoices', status: 'running', progress: {} },
      { id: '8', phase: 'transaction_line_items', status: 'pending', progress: {} },
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
});
