import { readFileSync } from 'fs';
import { describe, expect, it } from 'vitest';

/**
 * Source-contract tests for sync-pricelists Zoho / standalone invocation.
 * Keeps the independent CTA path from drifting away from the orchestrated
 * dispatch contract (secret header + optional job_id).
 */
describe('sync-pricelists standalone / Zoho CTA contract', () => {
  const source = readFileSync('supabase/functions/sync-pricelists/index.ts', 'utf8');
  const dispatchSource = readFileSync('supabase/functions/_shared/sync-coordinator-actions.ts', 'utf8');
  const orchestrationSource = readFileSync('src/lib/integrations/sync-orchestration.ts', 'utf8');

  it('still sits in the orchestrated reference phase group as sync-pricelists', () => {
    expect(orchestrationSource).toContain("'pricelists'");
    expect(orchestrationSource).toContain('REFERENCE_PHASES');
    // Default template: sync-${phase} — pricelists has no PHASE_FUNCTION_NAMES override.
    expect(dispatchSource).toContain('const functionName = PHASE_FUNCTION_NAMES[opts.phase] ?? `sync-${opts.phase}`');
    expect(dispatchSource).toContain("'x-integrations-dispatch-secret': secret");
  });

  it('gates on INTEGRATIONS_DISPATCH_SECRET when configured', () => {
    expect(source).toContain('getDispatchSecret()');
    expect(source).toContain('isAuthorizedInternal(req)');
    expect(source).toContain("x-integrations-dispatch-secret: $INTEGRATIONS_DISPATCH_SECRET");
  });

  it('creates a standalone no-master job when job_id is omitted (Zoho CTA)', () => {
    expect(source).toContain('createStandalonePricelistJob');
    expect(source).toContain("job_type: 'manual'");
    expect(source).toContain("run_kind: 'manual_phase'");
    expect(source).toContain("phase: PHASE");
    expect(source).toContain("trigger: 'standalone'");
    // Orchestrated path: use coordinator-supplied job_id; only create when omitted.
    expect(source).toContain('jobId = input.job_id ?? await createStandalonePricelistJob(admin, {');
  });

  it('returns job_id and remains a single-invocation phase', () => {
    expect(source).toContain('job_id: jobId');
    expect(source).toContain('has_more: false');
    expect(source).toContain("phase: PHASE");
  });
});
