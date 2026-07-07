import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const orchestratorPath = path.join(
  process.cwd(),
  'supabase/functions/integrations-sync/index.ts',
);
const orchestratorSource = readFileSync(orchestratorPath, 'utf8');

describe('integrations-sync self-chain orchestrator', () => {
  it('dispatches continuations via waitUntil instead of relying on cron resume', () => {
    expect(orchestratorSource).toContain('dispatchContinuation');
    expect(orchestratorSource).toContain('waitUntil');
    expect(orchestratorSource).toContain('buildContinuationPayload');
    expect(orchestratorSource).not.toContain('setIntegrationStatus');
    expect(orchestratorSource).not.toContain("status: 'syncing'");
  });

  it('creates continuation slaves when a phase reports has_more', () => {
    expect(orchestratorSource).toContain('selfChain');
    expect(orchestratorSource).toContain('continuation_of');
    expect(orchestratorSource).not.toContain('totalSynced > 0');
  });

  it('gates analysis on isRunReadyForAnalysis', () => {
    expect(orchestratorSource).toContain('isRunReadyForAnalysis');
    expect(orchestratorSource).toContain("phase: ANALYSIS_PHASE");
  });

  it('uses master sync_run mutex instead of tenant_integrations claim', () => {
    expect(orchestratorSource).toContain('findActiveMasterJob');
    expect(orchestratorSource).toContain("phase: MASTER_PHASE");
    expect(orchestratorSource).toContain('SYNC_ACTIVE');
  });
});
