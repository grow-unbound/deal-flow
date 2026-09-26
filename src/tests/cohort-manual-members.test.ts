import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { createFakePostgrestDb } from './helpers/fake-postgrest-db';

const getVerifiedClaimsMock = vi.fn();
const getFlagMock = vi.fn();
let fake = createFakePostgrestDb({});

vi.mock('@/lib/auth', () => ({
  getVerifiedClaims: (...args: unknown[]) => getVerifiedClaimsMock(...args),
}));
vi.mock('@/lib/flags', () => ({
  getFlag: (...args: unknown[]) => getFlagMock(...args),
}));
vi.mock('@/lib/posthog-server', () => ({ getPostHogClient: () => null }));
vi.mock('@/lib/server/auth-user-directory', () => ({ getAuthUserEmailMap: vi.fn() }));
vi.mock('@/lib/server/cohort-composer', () => ({
  buildCohortMemberBuyerRows: vi.fn(),
  resolveAllBuyerIdsForRules: vi.fn(),
}));
vi.mock('@/lib/supabase', () => ({
  get supabaseAdmin() {
    return fake.db;
  },
}));

import { PATCH } from '../../app/api/cohorts/[id]/route';
import { POST } from '../../app/api/cohorts/route';

const TENANT = 'tenant-1';
const COHORT = '00000000-0000-4000-8000-00000000c001';

function uuid(prefix: number, index: number) {
  return `${prefix.toString(16).padStart(8, '0')}-0000-4000-8000-${index.toString(16).padStart(12, '0')}`;
}
const buyerId = (index: number) => uuid(1, index);
const buyerIds = (from: number, to: number) => Array.from({ length: to - from + 1 }, (_, i) => buyerId(from + i));

function seedDb(options: { buyers: number; members: string[]; foreignBuyers?: string[] }) {
  fake = createFakePostgrestDb({
    'app.cohorts': [
      {
        id: COHORT,
        tenant_id: TENANT,
        name: 'Custom List',
        is_static: true,
        membership_mode: 'manual',
        rules: null,
        cached_member_count: options.members.length,
        deleted_at: null,
      },
    ],
    'app.buyers': [
      ...buyerIds(1, options.buyers).map((id) => ({ id, tenant_id: TENANT, deleted_at: null })),
      ...(options.foreignBuyers ?? []).map((id) => ({ id, tenant_id: 'other-tenant', deleted_at: null })),
    ],
    'app.cohort_members': options.members.map((id) => ({ cohort_id: COHORT, buyer_id: id, valid_until: null })),
  });
}

const activeMembers = () =>
  fake.tables['app.cohort_members'].filter((row) => row.valid_until == null).map((row) => row.buyer_id as string);
const cohortRow = () => fake.tables['app.cohorts'][0];

function patch(body: Record<string, unknown>) {
  return PATCH(
    new NextRequest(`http://localhost/api/cohorts/${COHORT}`, { method: 'PATCH', body: JSON.stringify(body) }),
    { params: Promise.resolve({ id: COHORT }) },
  );
}

const manualBody = (ids: string[], extra: Record<string, unknown> = {}) => ({
  form_mode: 'simple',
  name: 'Custom List',
  membership_mode: 'manual',
  selected_buyer_ids: ids,
  ...extra,
});

describe('PATCH /api/cohorts/[id] manual membership', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getVerifiedClaimsMock.mockResolvedValue({ tenant_id: TENANT, role: 'seller_admin', sub: 'user-1' });
    getFlagMock.mockResolvedValue(true);
  });

  it('keeps existing members when the group is re-saved (regression: edit used to empty the group)', async () => {
    seedDb({ buyers: 5, members: [buyerId(1)] });

    const res = await patch(manualBody([buyerId(1)], { name: 'Custom List renamed' }));

    expect(res.status).toBe(200);
    expect(activeMembers()).toEqual([buyerId(1)]);
    expect(cohortRow().cached_member_count).toBe(1);
  });

  it('adds and removes members by diff', async () => {
    seedDb({ buyers: 10, members: buyerIds(1, 3) });

    const res = await patch(manualBody([buyerId(2), buyerId(3), buyerId(4), buyerId(5)]));

    expect(res.status).toBe(200);
    expect(activeMembers().sort()).toEqual(buyerIds(2, 5).sort());
    expect(cohortRow().cached_member_count).toBe(4);
    // Removed buyer is end-dated, never deleted (SCD2).
    const closed = fake.tables['app.cohort_members'].find((row) => row.buyer_id === buyerId(1));
    expect(closed?.valid_until).toBeTruthy();
  });

  it('handles a large list: >1000 existing members and >1000 selected, no row-cap or URL-length failures', async () => {
    seedDb({ buyers: 3000, members: buyerIds(1, 1500) });

    // Keep 1001..1500, drop 1..1000, add 1501..2600.
    const res = await patch(manualBody(buyerIds(1001, 2600)));

    expect(res.status).toBe(200);
    expect(activeMembers()).toHaveLength(1600);
    expect(new Set(activeMembers())).toEqual(new Set(buyerIds(1001, 2600)));
    expect(cohortRow().cached_member_count).toBe(1600);
  });

  it('rejects newly added buyers from another tenant and leaves the group untouched', async () => {
    const foreign = uuid(2, 1);
    seedDb({ buyers: 3, members: [buyerId(1)], foreignBuyers: [foreign] });

    const res = await patch(manualBody([buyerId(1), foreign]));

    expect(res.status).toBe(422);
    expect(activeMembers()).toEqual([buyerId(1)]);
    expect(fake.writes).toHaveLength(0);
  });

  it('does not block a save because an existing member was since deleted', async () => {
    seedDb({ buyers: 3, members: [buyerId(1), buyerId(2)] });
    fake.tables['app.buyers'][0].deleted_at = '2026-09-01T00:00:00Z';

    const res = await patch(manualBody([buyerId(1), buyerId(2), buyerId(3)]));

    expect(res.status).toBe(200);
    expect(activeMembers().sort()).toEqual([buyerId(1), buyerId(2), buyerId(3)].sort());
  });

  it('does not touch membership for automatic groups', async () => {
    seedDb({ buyers: 3, members: [buyerId(1)] });
    const rpc = vi.fn().mockResolvedValue({ error: null });
    const originalSchema = fake.db.schema;
    fake.db.schema = (name: string) => ({ ...originalSchema(name), rpc }) as ReturnType<typeof originalSchema>;

    const res = await patch({
      form_mode: 'simple',
      name: 'Custom List',
      membership_mode: 'automatic',
      selected_buyer_ids: [],
      rules: { quick_filters: ['buying_qtr'] },
    });

    expect(res.status).toBe(200);
    expect(rpc).toHaveBeenCalledWith('refresh_cohort_by_id', { p_cohort_id: COHORT });
    expect(fake.writes.filter((write) => write.table === 'app.cohort_members')).toHaveLength(0);
  });
});

describe('POST /api/cohorts manual membership', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getVerifiedClaimsMock.mockResolvedValue({ tenant_id: TENANT, role: 'seller_admin', sub: 'user-1' });
    getFlagMock.mockResolvedValue(true);
  });

  function post(body: Record<string, unknown>) {
    return POST(new NextRequest('http://localhost/api/cohorts', { method: 'POST', body: JSON.stringify(body) }));
  }

  it('creates a group with a large selection', async () => {
    seedDb({ buyers: 2500, members: [] });
    fake.tables['app.cohorts'].length = 0;

    const res = await post({ ...manualBody(buyerIds(1, 2500)), name: 'Everyone' });

    expect(res.status).toBe(201);
    expect(activeMembers()).toHaveLength(2500);
    expect(fake.tables['app.cohorts'][0].cached_member_count).toBe(2500);
  });

  it('rejects other-tenant buyers before creating the group', async () => {
    const foreign = uuid(2, 1);
    seedDb({ buyers: 2, members: [], foreignBuyers: [foreign] });
    fake.tables['app.cohorts'].length = 0;

    const res = await post({ ...manualBody([buyerId(1), foreign]), name: 'Sneaky' });

    expect(res.status).toBe(422);
    expect(fake.tables['app.cohorts']).toHaveLength(0);
    expect(fake.tables['app.cohort_members']).toHaveLength(0);
  });
});
