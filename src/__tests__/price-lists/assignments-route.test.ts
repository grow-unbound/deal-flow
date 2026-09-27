import { describe, expect, it, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const getVerifiedClaimsMock = vi.fn();
const getFlagMock = vi.fn();
const insertPayloads: Record<string, unknown[]> = {};
const updatePayloads: Record<string, unknown[]> = {};

vi.mock('@/lib/auth', () => ({
  getVerifiedClaims: (...args: unknown[]) => getVerifiedClaimsMock(...args),
}));

vi.mock('@/lib/flags', () => ({
  getFlag: (...args: unknown[]) => getFlagMock(...args),
}));

function priceListQuery() {
  const query = {
    eq: vi.fn(),
    is: vi.fn(),
    maybeSingle: vi.fn().mockResolvedValue({ data: { id: 'pl-1' }, error: null }),
    limit: vi.fn().mockResolvedValue({ data: [{ id: 'pl-old' }, { id: 'pl-1' }], error: null }),
  };
  query.eq.mockReturnValue(query);
  query.is.mockReturnValue(query);
  return query;
}

function assignmentUpdate(tableName: string, payload: unknown) {
  updatePayloads[tableName] = [...(updatePayloads[tableName] ?? []), payload];
  const query = {
    eq: vi.fn(),
    is: vi.fn(),
    in: vi.fn().mockResolvedValue({ data: null, error: null }),
  };
  query.eq.mockReturnValue(query);
  query.is.mockReturnValue(query);
  return query;
}

function assignmentInsert(tableName: string, payload: unknown) {
  insertPayloads[tableName] = [...(insertPayloads[tableName] ?? []), payload];

  if (tableName === 'audit_log') {
    return Promise.resolve({ data: null, error: null });
  }

  return {
    select: () => ({
      single: () => Promise.resolve({
        data: {
          id: 'assignment-1',
          ...(payload as Record<string, unknown>),
        },
        error: null,
      }),
    }),
  };
}

vi.mock('@/lib/supabase', () => ({
  supabaseAdmin: {
    schema: () => ({
      from: (tableName: string) => {
        if (tableName === 'price_lists') {
          return { select: () => priceListQuery() };
        }
        return {
          insert: (payload: unknown) => assignmentInsert(tableName, payload),
          update: (payload: unknown) => assignmentUpdate(tableName, payload),
        };
      },
    }),
  },
}));

import { POST as addPriceListAssignment } from '../../../app/api/price-lists/[id]/assignments/route';

describe('price list assignments route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    for (const key of Object.keys(insertPayloads)) delete insertPayloads[key];
    for (const key of Object.keys(updatePayloads)) delete updatePayloads[key];
    getVerifiedClaimsMock.mockResolvedValue({
      tenant_id: 'tenant-1',
      role: 'seller_admin',
      sub: 'user-1',
    });
    getFlagMock.mockResolvedValue(true);
  });

  it('persists all-buyer assignments with a null target id', async () => {
    const request = new NextRequest('http://localhost/api/price-lists/pl-1/assignments', {
      method: 'POST',
      body: JSON.stringify({ target_type: 'all_buyers' }),
    });

    const response = await addPriceListAssignment(request, {
      params: Promise.resolve({ id: 'pl-1' }),
    });
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body.assignment).toMatchObject({
      price_list_id: 'pl-1',
      target_type: 'all_buyers',
      target_id: null,
    });
    expect(updatePayloads.price_list_assignments?.[0]).toMatchObject({
      deleted_at: expect.any(String),
      updated_at: expect.any(String),
      updated_by: 'user-1',
    });
    expect(insertPayloads.price_list_assignments?.[0]).toMatchObject({
      price_list_id: 'pl-1',
      target_type: 'all_buyers',
      target_id: null,
      created_by: 'user-1',
      updated_by: 'user-1',
    });
  });
});
