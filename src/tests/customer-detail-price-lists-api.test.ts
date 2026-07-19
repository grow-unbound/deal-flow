import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const getVerifiedClaimsMock = vi.fn();

vi.mock('@/lib/auth', () => ({
  getVerifiedClaims: (...args: unknown[]) => getVerifiedClaimsMock(...args),
}));

type QueryResult = { data?: unknown; error?: unknown };

const dbResponses: Record<string, QueryResult[]> = {};

function nextResult(key: string): QueryResult {
  const queue = dbResponses[key] ?? [];
  if (queue.length <= 1) return queue[0] ?? {};
  return queue.shift() ?? {};
}

function createQuery(key: string) {
  const query = {
    eq: vi.fn(),
    is: vi.fn(),
    in: vi.fn(),
    or: vi.fn(),
    maybeSingle: vi.fn(),
    then: (onFulfilled: (value: { data: unknown; error: unknown }) => unknown) => {
      const result = nextResult(key);
      return Promise.resolve(onFulfilled({ data: result.data ?? null, error: result.error ?? null }));
    },
  };

  query.eq.mockReturnValue(query);
  query.is.mockReturnValue(query);
  query.in.mockReturnValue(query);
  query.or.mockReturnValue(query);
  query.maybeSingle.mockImplementation(async () => {
    const result = nextResult(key);
    return { data: result.data ?? null, error: result.error ?? null };
  });

  return query;
}

const schemaMock = vi.fn((schemaName: string) => ({
  from: vi.fn((tableName: string) => ({
    select: vi.fn(() => createQuery(`${schemaName}.${tableName}`)),
  })),
}));

vi.mock('@/lib/supabase', () => ({
  supabaseAdmin: {
    schema: (...args: unknown[]) => schemaMock(...args),
  },
}));

import { GET } from '../../app/api/tenant/customers/[id]/price-lists/route';

describe('customer detail price-lists route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    for (const key of Object.keys(dbResponses)) delete dbResponses[key];

    getVerifiedClaimsMock.mockResolvedValue({
      tenant_id: 'tenant-1',
      role: 'seller_admin',
      buyer_id: null,
      location_ids: null,
    });

    dbResponses['app.buyers'] = [
      {
        data: { id: 'buyer-1', business_name: 'Singh Hospitality' },
      },
    ];
    dbResponses['app.cohort_members'] = [
      {
        data: [
          {
            cohort_id: 'cohort-1',
            cohorts: { name: 'Premium', deleted_at: null },
          },
        ],
      },
    ];
    dbResponses['app.price_list_assignments'] = [
      {
        data: [
          {
            price_list_id: 'pl-buyer',
            target_type: 'buyer',
            target_id: 'buyer-1',
            created_at: '2026-06-01T00:00:00Z',
          },
          {
            price_list_id: 'pl-cohort',
            target_type: 'cohort',
            target_id: 'cohort-1',
            created_at: '2026-06-02T00:00:00Z',
          },
          {
            price_list_id: 'pl-all',
            target_type: 'all_buyers',
            target_id: null,
            created_at: '2026-06-03T00:00:00Z',
          },
        ],
      },
    ];
    dbResponses['app.price_lists'] = [
      {
        data: [
          {
            id: 'pl-buyer',
            name: 'Buyer Special',
            valid_from: '2026-06-01T00:00:00Z',
            valid_to: '2026-06-30T00:00:00Z',
            is_active: true,
            priority: 50,
          },
          {
            id: 'pl-cohort',
            name: 'Premium Cohort',
            valid_from: '2026-07-20T00:00:00Z',
            valid_to: '2026-07-31T00:00:00Z',
            is_active: true,
            priority: 20,
          },
          {
            id: 'pl-all',
            name: 'Fallback Base',
            valid_from: '2026-04-01T00:00:00Z',
            valid_to: '2026-05-01T00:00:00Z',
            is_active: true,
            priority: 5,
          },
        ],
      },
    ];
  });

  it('returns assigned price lists with source labels and priority', async () => {
    const response = await GET(
      new NextRequest('http://localhost:3000/api/tenant/customers/buyer-1/price-lists'),
      { params: Promise.resolve({ id: '550e8400-e29b-41d4-a716-446655440000' }) },
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.total).toBe(3);
    expect(body.assigned).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'pl-buyer',
          name: 'Buyer Special',
          target_label: 'Buyer specific · Singh Hospitality',
          priority: 50,
        }),
        expect.objectContaining({
          id: 'pl-cohort',
          target_label: 'Cohort · Premium',
        }),
        expect.objectContaining({
          id: 'pl-all',
          target_label: 'All buyers',
        }),
      ]),
    );
  });

  it('derives active, draft, and expired statuses from validity windows', async () => {
    vi.setSystemTime(new Date('2026-07-19T00:00:00Z'));

    const response = await GET(
      new NextRequest('http://localhost:3000/api/tenant/customers/buyer-1/price-lists'),
      { params: Promise.resolve({ id: '550e8400-e29b-41d4-a716-446655440000' }) },
    );
    const body = await response.json();

    const statuses = new Map(body.assigned.map((row: { id: string; status: string }) => [row.id, row.status]));
    expect(statuses.get('pl-buyer')).toBe('expired');
    expect(statuses.get('pl-cohort')).toBe('draft');
    expect(statuses.get('pl-all')).toBe('expired');
  });
});
