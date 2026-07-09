import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const getVerifiedClaimsMock = vi.fn();
const repairIntegrationAggregatesMock = vi.fn();
const runIntegrationAnalysisMock = vi.fn();

vi.mock('@/lib/auth', () => ({
  getVerifiedClaims: (...args: unknown[]) => getVerifiedClaimsMock(...args),
}));

vi.mock('@/lib/integrations/server', () => ({
  repairIntegrationAggregates: (...args: unknown[]) => repairIntegrationAggregatesMock(...args),
  runIntegrationAnalysis: (...args: unknown[]) => runIntegrationAnalysisMock(...args),
}));

import { POST as repairAggregatesPost } from '../../../app/api/settings/integrations/repair-aggregates/route';
import { POST as runAnalysisPost } from '../../../app/api/settings/integrations/run-analysis/route';

describe('POST /api/settings/integrations/repair-aggregates', () => {
  beforeEach(() => {
    getVerifiedClaimsMock.mockReset();
    repairIntegrationAggregatesMock.mockReset();
  });

  it('requires a seller admin', async () => {
    getVerifiedClaimsMock.mockResolvedValue({
      tenant_id: 'tenant-1',
      sub: 'user-1',
      role: 'seller_assistant',
    });

    const response = await repairAggregatesPost(
      new NextRequest('http://localhost/api/settings/integrations/repair-aggregates', {
        method: 'POST',
        body: JSON.stringify({
          tenant_integration_id: '11111111-1111-4111-8111-111111111111',
          start_date: '2026-04-11',
          end_date: '2026-07-09',
        }),
      }),
    );

    expect(response.status).toBe(403);
    expect(repairIntegrationAggregatesMock).not.toHaveBeenCalled();
  });

  it('forwards the repair payload with tenant and actor intact', async () => {
    getVerifiedClaimsMock.mockResolvedValue({
      tenant_id: 'tenant-1',
      sub: 'user-1',
      role: 'seller_admin',
    });
    repairIntegrationAggregatesMock.mockResolvedValue({ ok: true });

    const response = await repairAggregatesPost(
      new NextRequest('http://localhost/api/settings/integrations/repair-aggregates', {
        method: 'POST',
        body: JSON.stringify({
          tenant_integration_id: '11111111-1111-4111-8111-111111111111',
          start_date: '2026-04-11',
          end_date: '2026-07-09',
          include_snapshots: true,
          include_kpis: true,
        }),
      }),
    );

    expect(response.status).toBe(200);
    expect(repairIntegrationAggregatesMock).toHaveBeenCalledWith(
      'tenant-1',
      'user-1',
      {
        tenant_integration_id: '11111111-1111-4111-8111-111111111111',
        start_date: '2026-04-11',
        end_date: '2026-07-09',
        include_snapshots: true,
        include_kpis: true,
      },
    );
  });
});

describe('POST /api/settings/integrations/run-analysis', () => {
  beforeEach(() => {
    getVerifiedClaimsMock.mockReset();
    runIntegrationAnalysisMock.mockReset();
  });

  it('requires a seller admin', async () => {
    getVerifiedClaimsMock.mockResolvedValue({
      tenant_id: 'tenant-1',
      sub: 'user-1',
      role: 'seller_assistant',
    });

    const response = await runAnalysisPost(
      new NextRequest('http://localhost/api/settings/integrations/run-analysis', {
        method: 'POST',
        body: JSON.stringify({
          tenant_integration_id: '11111111-1111-4111-8111-111111111111',
          days: 90,
        }),
      }),
    );

    expect(response.status).toBe(403);
    expect(runIntegrationAnalysisMock).not.toHaveBeenCalled();
  });

  it('forwards the ad hoc analysis payload to the dedicated Phase 7 RPC path', async () => {
    getVerifiedClaimsMock.mockResolvedValue({
      tenant_id: 'tenant-1',
      sub: 'user-1',
      role: 'seller_admin',
    });
    runIntegrationAnalysisMock.mockResolvedValue({ ok: true });

    const response = await runAnalysisPost(
      new NextRequest('http://localhost/api/settings/integrations/run-analysis', {
        method: 'POST',
        body: JSON.stringify({
          tenant_integration_id: '11111111-1111-4111-8111-111111111111',
          days: 90,
        }),
      }),
    );

    expect(response.status).toBe(200);
    expect(runIntegrationAnalysisMock).toHaveBeenCalledWith(
      'tenant-1',
      'user-1',
      {
        tenant_integration_id: '11111111-1111-4111-8111-111111111111',
        days: 90,
      },
    );
  });
});
