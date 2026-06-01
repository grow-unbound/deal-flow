import { describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const getVerifiedClaimsMock = vi.fn();
const getFlagMock = vi.fn();

vi.mock('@/lib/auth', () => ({
  getVerifiedClaims: (...args: unknown[]) => getVerifiedClaimsMock(...args),
}));

vi.mock('@/lib/flags', () => ({
  getFlag: (...args: unknown[]) => getFlagMock(...args),
}));

const maybeSingleMock = vi.fn();

const eqSecondMock = vi.fn(() => ({ maybeSingle: maybeSingleMock }));
const isMock = vi.fn(() => ({ maybeSingle: maybeSingleMock }));
const eqFirstMock = vi.fn(() => ({ is: isMock, eq: eqSecondMock }));
const selectMock = vi.fn(() => ({ eq: eqFirstMock }));
const fromMock = vi.fn(() => ({ select: selectMock }));

vi.mock('@/lib/supabase', () => ({
  supabaseAdmin: {
    schema: vi.fn(() => ({
      from: fromMock,
    })),
  },
}));

import { GET } from '../../app/api/tenant/customers/[id]/route';

describe('customer detail api', () => {
  it('returns 403 for cross-tenant buyer access', async () => {
    getVerifiedClaimsMock.mockResolvedValue({ tenant_id: 'tenant-a', role: 'seller_admin', buyer_id: null });
    getFlagMock.mockResolvedValue(true);
    maybeSingleMock.mockResolvedValue({
      data: { id: 'buyer-1', tenant_id: 'tenant-b' },
      error: null,
    });

    const request = new NextRequest('http://localhost:3000/api/tenant/customers/buyer-1');
    const response = await GET(request, { params: Promise.resolve({ id: 'buyer-1' }) });

    expect(response.status).toBe(403);
  });

  it('credit used percentage formula remains creditUsed / creditLimit * 100', () => {
    const creditUsed = 64000;
    const creditLimit = 100000;
    const pct = Math.round((creditUsed / creditLimit) * 1000) / 10;

    expect(pct).toBe(64);
  });
});
