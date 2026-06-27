import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const getVerifiedClaimsMock = vi.fn();
const disconnectTenantIntegrationMock = vi.fn();

vi.mock('@/lib/auth', () => ({
  getVerifiedClaims: (...args: unknown[]) => getVerifiedClaimsMock(...args),
}));

vi.mock('@/lib/integrations/server', () => ({
  disconnectTenantIntegration: (...args: unknown[]) => disconnectTenantIntegrationMock(...args),
}));

import { POST } from '../../../app/api/settings/integrations/disconnect/route';

describe('POST /api/settings/integrations/disconnect', () => {
  beforeEach(() => {
    getVerifiedClaimsMock.mockReset();
    disconnectTenantIntegrationMock.mockReset();
  });

  it('requires a seller admin', async () => {
    getVerifiedClaimsMock.mockResolvedValue({
      tenant_id: 'tenant-1',
      sub: 'user-1',
      role: 'seller_assistant',
    });

    const response = await POST(new NextRequest('http://localhost/api/settings/integrations/disconnect', {
      method: 'POST',
      body: JSON.stringify({ tenant_integration_id: 'integration-1' }),
    }));

    expect(response.status).toBe(403);
    expect(disconnectTenantIntegrationMock).not.toHaveBeenCalled();
  });

  it('forwards the tenant, actor, request body, and auth header to the server action', async () => {
    getVerifiedClaimsMock.mockResolvedValue({
      tenant_id: 'tenant-1',
      sub: 'user-1',
      role: 'seller_admin',
    });
    disconnectTenantIntegrationMock.mockResolvedValue({
      integrations: [],
      available_integrations: [],
    });

    const response = await POST(new NextRequest('http://localhost/api/settings/integrations/disconnect', {
      method: 'POST',
      headers: {
        authorization: 'Bearer test-token',
        'content-type': 'application/json',
      },
      body: JSON.stringify({ tenant_integration_id: 'integration-1' }),
    }));

    expect(response.status).toBe(200);
    expect(disconnectTenantIntegrationMock).toHaveBeenCalledWith(
      'tenant-1',
      'user-1',
      { tenant_integration_id: 'integration-1' },
      'Bearer test-token',
    );
  });
});
