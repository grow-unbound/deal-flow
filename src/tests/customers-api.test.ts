import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const getVerifiedClaimsMock = vi.fn();
const getFlagMock = vi.fn();
const captureMock = vi.fn();

type QueryResult = {
  data?: unknown;
  error?: unknown;
};

type CallRecord = {
  payload?: Record<string, unknown>;
  filters: Array<[string, unknown, 'eq' | 'is' | 'neq' | 'in' | 'or' | 'order' | 'gte' | 'lt']>;
};

const dbResponses: Record<string, QueryResult[]> = {};
const dbCalls: Record<string, CallRecord> = {};

function nextResult(key: string): QueryResult {
  const queue = dbResponses[key] ?? [];
  if (queue.length <= 1) return queue[0] ?? {};
  return queue.shift() ?? {};
}

function createChain(key: string) {
  const record = (dbCalls[key] ??= { filters: [] });
  const chain: any = {
    eq: vi.fn((column: string, value: unknown) => {
      record.filters.push([column, value, 'eq']);
      return chain;
    }),
    is: vi.fn((column: string, value: unknown) => {
      record.filters.push([column, value, 'is']);
      return chain;
    }),
    neq: vi.fn((column: string, value: unknown) => {
      record.filters.push([column, value, 'neq']);
      return chain;
    }),
    in: vi.fn((column: string, value: unknown) => {
      record.filters.push([column, value, 'in']);
      return chain;
    }),
    or: vi.fn((value: unknown) => {
      record.filters.push(['or', value, 'or']);
      return chain;
    }),
    order: vi.fn((column: string, value: unknown) => {
      record.filters.push([column, value, 'order']);
      return chain;
    }),
    gte: vi.fn((column: string, value: unknown) => {
      record.filters.push([column, value, 'gte']);
      return chain;
    }),
    lt: vi.fn((column: string, value: unknown) => {
      record.filters.push([column, value, 'lt']);
      return chain;
    }),
    select: vi.fn(() => chain),
    single: vi.fn(async () => {
      const result = nextResult(key);
      return { data: result.data ?? null, error: result.error ?? null };
    }),
    maybeSingle: vi.fn(async () => {
      const result = nextResult(key);
      return { data: result.data ?? null, error: result.error ?? null };
    }),
    then: (onFulfilled: (value: { data: unknown; error: unknown }) => unknown) => {
      const result = nextResult(key);
      return Promise.resolve(onFulfilled({ data: result.data ?? null, error: result.error ?? null }));
    },
  };

  return { chain, record };
}

const schemaMock = vi.fn((schemaName: string) => ({
  from: vi.fn((tableName: string) => {
    const key = `${schemaName}.${tableName}`;
    return {
      select: vi.fn(() => createChain(`${key}:select`).chain),
      insert: vi.fn((payload: Record<string, unknown>) => {
        dbCalls[`${key}:insert`] = { payload, filters: [] };
        return createChain(`${key}:insert`).chain;
      }),
      update: vi.fn((payload: Record<string, unknown>) => {
        dbCalls[`${key}:update`] = { payload, filters: [] };
        return createChain(`${key}:update`).chain;
      }),
    };
  }),
}));

vi.mock('@/lib/auth', () => ({
  getVerifiedClaims: (...args: unknown[]) => getVerifiedClaimsMock(...args),
}));

vi.mock('@/lib/flags', () => ({
  getFlag: (...args: unknown[]) => getFlagMock(...args),
}));

vi.mock('@/lib/posthog-server', () => ({
  getPostHogClient: () => ({ capture: captureMock }),
}));

vi.mock('@/lib/supabase', () => ({
  supabaseAdmin: {
    schema: (...args: unknown[]) => schemaMock(...args),
  },
}));

import { POST } from '../../app/api/customers/route';
import { PUT } from '../../app/api/customers/[id]/route';

function resetDbState() {
  for (const key of Object.keys(dbResponses)) delete dbResponses[key];
  for (const key of Object.keys(dbCalls)) delete dbCalls[key];
}

describe('customers api', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetDbState();

    getVerifiedClaimsMock.mockResolvedValue({
      tenant_id: 'tenant-1',
      role: 'seller_admin',
      sub: 'user-1',
      location_ids: null,
    });
    getFlagMock.mockResolvedValue(true);
  });

  it('creates a buyer without tier/external_ref and assigns the default pricelist', async () => {
    dbResponses['app.buyers:select'] = [{ data: null }, { data: null }];
    dbResponses['app.price_lists:select'] = [{ data: { id: '550e8400-e29b-41d4-a716-446655440000' } }];
    dbResponses['app.buyers:insert'] = [{
      data: {
        id: 'buyer-1',
        business_name: 'Lean Traders',
        phone: '9876543210',
      },
    }];
    dbResponses['app.price_list_assignments:update'] = [{ data: [] }];
    dbResponses['app.price_list_assignments:insert'] = [{
      data: {
        id: 'assign-1',
        price_list_id: 'pl-1',
        target_type: 'buyer',
        target_id: 'buyer-1',
      },
    }];

    const request = new NextRequest('http://localhost:3000/api/customers', {
      method: 'POST',
      body: JSON.stringify({
        business_name: 'Lean Traders',
        phone: '9876543210',
        tier: 'A',
        external_ref: 'LT-1',
        default_price_list_id: '550e8400-e29b-41d4-a716-446655440000',
      }),
    });

    const response = await POST(request);
    expect(response.status).toBe(201);

    const insertPayload = dbCalls['app.buyers:insert']?.payload ?? {};
    expect(insertPayload).not.toHaveProperty('tier');
    expect(insertPayload).not.toHaveProperty('external_ref');
    expect(insertPayload.buyer_app_enabled).toBe(false);

    const assignmentInsertPayload = dbCalls['app.price_list_assignments:insert']?.payload ?? {};
    expect(assignmentInsertPayload.price_list_id).toBe('550e8400-e29b-41d4-a716-446655440000');
    expect(assignmentInsertPayload.target_type).toBe('buyer');
    expect(assignmentInsertPayload.target_id).toBe('buyer-1');
    expect(dbCalls['app.price_list_assignments:update']?.filters).toEqual([
      ['target_type', 'buyer', 'eq'],
      ['target_id', 'buyer-1', 'eq'],
      ['deleted_at', null, 'is'],
    ]);
  });

  it('updates a buyer without tier/external_ref and replaces the buyer default pricelist', async () => {
    dbResponses['app.buyers:select'] = [
      { data: { id: 'buyer-1' } },
      { data: null },
    ];
    dbResponses['app.price_lists:select'] = [{ data: { id: '550e8400-e29b-41d4-a716-446655440001' } }];
    dbResponses['app.buyers:update'] = [{
      data: { id: 'buyer-1', business_name: 'Lean Traders Updated' },
    }];
    dbResponses['app.price_list_assignments:update'] = [{ data: [] }, { data: [] }];
    dbResponses['app.price_list_assignments:insert'] = [{
      data: {
        id: 'assign-2',
        price_list_id: 'pl-2',
        target_type: 'buyer',
        target_id: 'buyer-1',
      },
    }];

    const request = new NextRequest('http://localhost:3000/api/customers/buyer-1', {
      method: 'PUT',
      body: JSON.stringify({
        business_name: 'Lean Traders Updated',
        phone: '9876543210',
        tier: 'B',
        external_ref: 'LT-2',
        default_price_list_id: '550e8400-e29b-41d4-a716-446655440001',
      }),
    });

    const response = await PUT(request, { params: Promise.resolve({ id: 'buyer-1' }) });
    expect(response.status).toBe(200);

    const updatePayload = dbCalls['app.buyers:update']?.payload ?? {};
    expect(updatePayload).not.toHaveProperty('tier');
    expect(updatePayload).not.toHaveProperty('external_ref');
    expect(updatePayload).not.toHaveProperty('default_price_list_id');

    const assignmentInsertPayload = dbCalls['app.price_list_assignments:insert']?.payload ?? {};
    expect(assignmentInsertPayload.price_list_id).toBe('550e8400-e29b-41d4-a716-446655440001');
    expect(assignmentInsertPayload.target_type).toBe('buyer');
    expect(assignmentInsertPayload.target_id).toBe('buyer-1');
    expect(dbCalls['app.price_list_assignments:update']?.filters?.[0]).toEqual(['target_type', 'buyer', 'eq']);
  });
});
