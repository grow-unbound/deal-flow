import { describe, expect, it } from 'vitest';
import {
  PROFILE_CONFIGS,
  buildTrialArtifact,
  commandHelpText,
  resolvePhase1BProfile,
} from '../../../scripts/metrics-v2-phase1a-acceptance.mjs';

describe('Metrics V2 Phase 1B harness contracts', () => {
  it('freezes the normal-load profile without changing Phase 1A stress defaults', () => {
    expect(PROFILE_CONFIGS.phase1bNormalLoad).toMatchObject({
      name: 'phase1b-normal-load',
      rate: 10,
      vus: 100,
      sustainMs: 1_800_000,
      mode: 'mixed',
    });
    expect(PROFILE_CONFIGS.phase1aStress.name).toBe('phase1a-stress');
  });

  it('selects the read-surface profile explicitly', () => {
    expect(resolvePhase1BProfile('read-surfaces')).toMatchObject({
      name: 'phase1b-read-surfaces',
      mode: 'read-surfaces',
    });
  });

  it('builds Phase 1B artifacts with instrumentation-only I/C/B metadata', () => {
    const artifact = buildTrialArtifact({
      phase: 'phase1b-normal-load',
      trial: 1,
      runId: 'phase1b-normal-load-1',
      config: PROFILE_CONFIGS.phase1bNormalLoad,
      latencies: [10, 20, 30, 40],
      failures: [{ status: '500' }],
      maxInFlight: 4,
      syncResult: { status: '200', ok: true, latencyMs: 12 },
    });

    expect(artifact.workload.profile).toBe('phase1b-normal-load');
    expect(artifact.api.failures).toBe(1);
    expect(artifact.phase1b?.icbSampling).toMatchObject({
      status: 'instrumentation-only',
      thresholdGate: 'Phase 4',
    });
  });

  it('exposes Phase 1B commands in help text', () => {
    expect(commandHelpText()).toContain('phase1b-normal-load');
    expect(commandHelpText()).toContain('phase1b-read-surfaces');
    expect(commandHelpText()).toContain('phase1b-reconcile');
  });
});
