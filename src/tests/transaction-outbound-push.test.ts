import { beforeEach, describe, expect, it, vi } from 'vitest';

const dbMock = vi.hoisted(() => ({
  schema: vi.fn(),
}));

vi.mock('@/lib/supabase', () => ({
  supabaseAdmin: dbMock,
  supabase: dbMock,
}));

import { tenantDefersTransactionNumber } from '@/lib/server/transaction-outbound-push';

function mockIntegrationsQuery(data: unknown) {
  return {
    select: vi.fn(() => ({
      eq: vi.fn(() => ({
        in: vi.fn(() => ({
          is: vi.fn(async () => ({ data, error: null })),
        })),
      })),
    })),
  };
}

function mockIntegrationTypesQuery(data: unknown) {
  return {
    select: vi.fn(() => ({
      in: vi.fn(() => ({
        eq: vi.fn(async () => ({ data, error: null })),
      })),
    })),
  };
}

describe('tenantDefersTransactionNumber', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns false when tenant has no connected integrations', async () => {
    dbMock.schema.mockReturnValue({
      from: vi.fn(() => mockIntegrationsQuery([])),
    });

    await expect(tenantDefersTransactionNumber('tenant-1', 'estimates')).resolves.toBe(false);
  });

  it('returns true when a connected integration supports outbound estimates', async () => {
    dbMock.schema.mockImplementation((schema: string) => ({
      from: vi.fn((table: string) => {
        if (schema === 'app' && table === 'tenant_integrations') {
          return mockIntegrationsQuery([{ integration_type_id: 'zoho_books' }]);
        }
        if (schema === 'catalog' && table === 'integration_types') {
          return mockIntegrationTypesQuery([{
            id: 'zoho_books',
            capabilities: {
              outbound_transactional: ['orders', 'estimates'],
            },
          }]);
        }
        return mockIntegrationsQuery([]);
      }),
    }));

    await expect(tenantDefersTransactionNumber('tenant-1', 'estimates')).resolves.toBe(true);
    await expect(tenantDefersTransactionNumber('tenant-1', 'orders')).resolves.toBe(true);
  });

  it('returns true when a syncing integration supports outbound estimates', async () => {
    dbMock.schema.mockImplementation((schema: string) => ({
      from: vi.fn((table: string) => {
        if (schema === 'app' && table === 'tenant_integrations') {
          return mockIntegrationsQuery([{ integration_type_id: 'zoho_books', status: 'syncing' }]);
        }
        if (schema === 'catalog' && table === 'integration_types') {
          return mockIntegrationTypesQuery([{
            id: 'zoho_books',
            capabilities: {
              outbound_transactional: ['estimates'],
            },
          }]);
        }
        return mockIntegrationsQuery([]);
      }),
    }));

    await expect(tenantDefersTransactionNumber('tenant-1', 'estimates')).resolves.toBe(true);
  });

  it('returns true when a legacy sync_failed integration supports outbound estimates', async () => {
    dbMock.schema.mockImplementation((schema: string) => ({
      from: vi.fn((table: string) => {
        if (schema === 'app' && table === 'tenant_integrations') {
          return mockIntegrationsQuery([{ integration_type_id: 'zoho_books', status: 'sync_failed' }]);
        }
        if (schema === 'catalog' && table === 'integration_types') {
          return mockIntegrationTypesQuery([{
            id: 'zoho_books',
            capabilities: {
              outbound_transactional: ['estimates'],
            },
          }]);
        }
        return mockIntegrationsQuery([]);
      }),
    }));

    await expect(tenantDefersTransactionNumber('tenant-1', 'estimates')).resolves.toBe(true);
  });
});
