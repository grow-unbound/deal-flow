import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const orchestratorPath = path.join(
  process.cwd(),
  'supabase/functions/integrations-sync/index.ts',
);
const orchestratorSource = readFileSync(orchestratorPath, 'utf8');

// createSlaveJob/updateMasterJob/findActiveMasterJob and the MASTER_PHASE /
// ANALYSIS_PHASE / continuation_of literals they use now live in
// sync-coordinator-actions.ts, shared with sync-inventory and other slave
// dispatch — integrations-sync/index.ts only calls into them.
const dispatchActionsPath = path.join(
  process.cwd(),
  'supabase/functions/_shared/sync-coordinator-actions.ts',
);
const dispatchActionsSource = readFileSync(dispatchActionsPath, 'utf8');

const coordinatorPath = path.join(
  process.cwd(),
  'supabase/functions/sync-coordinator/index.ts',
);
const coordinatorSource = readFileSync(coordinatorPath, 'utf8');

// integrations-sync used to self-dispatch phases and chain continuations via
// fire-and-forget POSTs back to itself (selfChain/finishOrAdvance/
// dispatchContinuation). Once SYNC_COORDINATOR_LIVE went live, that ran
// concurrently with sync-coordinator's own tick-based driver — two
// uncoordinated actors racing to advance the same run, each creating its own
// slave rows for the same phase transitions. Removed: integrations-sync now
// only creates the master run and returns; sync-coordinator's 15s tick is the
// sole driver from phase 1 to completion.
//
// It also used to precreate one slave row per phase up front. That was safe
// with a single writer, but was still unnecessary surface area — and was the
// other half of the dual-writer race above: whichever actor's dispatch lost
// the race to flip a precreated row out of 'pending' found nothing and
// created a duplicate instead, orphaning the original. Removed too:
// sync-coordinator's dispatch_next_phase creates each phase's slave row
// lazily, one at a time, right before dispatching it — the only creation
// path left, so there's nothing to race over.
describe('integrations-sync creates a run and hands off to sync-coordinator', () => {
  it('does not self-dispatch or chain continuations', () => {
    expect(orchestratorSource).not.toContain('dispatchContinuation');
    expect(orchestratorSource).not.toContain('selfChain');
    expect(orchestratorSource).not.toContain('buildContinuationPayload');
    expect(orchestratorSource).not.toContain('finishOrAdvance');
    expect(orchestratorSource).not.toContain('runOrchestratorStep');
    expect(orchestratorSource).not.toContain('OrchestratorState');
    expect(orchestratorSource).not.toContain('waitUntil');
    expect(orchestratorSource).not.toContain('dispatchPhase');
    expect(orchestratorSource).not.toContain('setIntegrationStatus');
    expect(orchestratorSource).not.toContain("status: 'syncing'");
  });

  it('does not precreate slave jobs — only sync-coordinator creates them, lazily', () => {
    expect(orchestratorSource).not.toContain('createSlaveJob');
    expect(orchestratorSource).not.toContain('sinceForPhase');
    expect(dispatchActionsSource).toContain('continuation_of');
  });

  it('marks the master running immediately and kicks the coordinator so phase 1 starts without waiting for cron', () => {
    expect(orchestratorSource).toContain('createMasterJob');
    expect(orchestratorSource).toContain("status: 'running'");
    expect(orchestratorSource).toContain("rpc('tick_sync_coordinator')");
  });

  it('uses master sync_run mutex instead of tenant_integrations claim', () => {
    expect(orchestratorSource).toContain('findActiveMasterJob');
    expect(dispatchActionsSource).toContain("phase: MASTER_PHASE");
    expect(orchestratorSource).toContain('SYNC_ACTIVE');
  });

  it('sync-coordinator is the sole driver of phase progression and analysis', () => {
    expect(coordinatorSource).toContain('decideCoordinatorAction');
    expect(coordinatorSource).toContain('executeAction');
    expect(dispatchActionsSource).toContain("phase: ANALYSIS_PHASE");
  });
});
