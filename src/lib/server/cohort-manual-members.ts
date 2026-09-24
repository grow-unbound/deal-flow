import { fetchAllRows } from '@/lib/server/fetch-all-rows';
import { POSTGREST_IN_CHUNK_SIZE, chunkArray } from '@/lib/server/warehouse-data';

// Manual (static) customer-group membership sync. Written to stay correct for lists of
// thousands of buyers: PostgREST caps plain selects at 1000 rows and serializes `.in()`
// filters into the URL, so every read is paginated and every id-list filter is chunked.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type DbClient = any;

const INSERT_BATCH_SIZE = 1000;
const LOOKUP_CONCURRENCY = 8;

export type ManualMembersPlan = {
  toAdd: string[];
  toClose: string[];
  invalidBuyerIds: string[];
};

async function findBuyerIdsInTenant(db: DbClient, tenantId: string, buyerIds: string[]): Promise<Set<string>> {
  const found = new Set<string>();
  const chunks = chunkArray(buyerIds, POSTGREST_IN_CHUNK_SIZE);

  for (let index = 0; index < chunks.length; index += LOOKUP_CONCURRENCY) {
    const wave = chunks.slice(index, index + LOOKUP_CONCURRENCY);
    const results = await Promise.all(
      wave.map((chunk) =>
        db
          .schema('app')
          .from('buyers')
          .select('id')
          .eq('tenant_id', tenantId)
          .is('deleted_at', null)
          .in('id', chunk),
      ),
    );
    for (const { data, error } of results) {
      if (error) throw new Error('Failed to validate selected buyers');
      for (const row of (data ?? []) as Array<{ id: string }>) found.add(row.id);
    }
  }

  return found;
}

/**
 * Diffs the submitted selection against the cohort's active members and checks that every
 * *newly added* buyer belongs to the tenant. Buyers that are already members are never
 * re-validated, so a member who has since been deactivated can't block saving other edits.
 * Pass `cohortId: null` for a cohort that doesn't exist yet (all submitted buyers are new).
 */
export async function planManualCohortMembers(
  db: DbClient,
  tenantId: string,
  cohortId: string | null,
  selectedBuyerIds: string[],
): Promise<ManualMembersPlan> {
  const nextIds = Array.from(new Set(selectedBuyerIds));

  let currentlyActive = new Set<string>();
  if (cohortId) {
    const rows = await fetchAllRows<{ buyer_id: string }>((from, to) =>
      db
        .schema('app')
        .from('cohort_members_active')
        .select('buyer_id')
        .eq('cohort_id', cohortId)
        .order('buyer_id')
        .range(from, to),
    );
    currentlyActive = new Set(rows.map((row) => row.buyer_id));
  }

  const nextSet = new Set(nextIds);
  const toAdd = nextIds.filter((buyerId) => !currentlyActive.has(buyerId));
  const toClose = [...currentlyActive].filter((buyerId) => !nextSet.has(buyerId));

  const validNew = await findBuyerIdsInTenant(db, tenantId, toAdd);
  const invalidBuyerIds = toAdd.filter((buyerId) => !validNew.has(buyerId));

  return { toAdd, toClose, invalidBuyerIds };
}

/**
 * Applies a plan from planManualCohortMembers and refreshes cached_member_count from the
 * live active count. Inserts run before closes so a mid-way failure leaves a superset of the
 * intended membership rather than an emptied group. Returns the resulting active count.
 */
export async function applyManualCohortMembersPlan(
  db: DbClient,
  tenantId: string,
  cohortId: string,
  plan: Pick<ManualMembersPlan, 'toAdd' | 'toClose'>,
): Promise<number> {
  for (const batch of chunkArray(plan.toAdd, INSERT_BATCH_SIZE)) {
    const rows = batch.map((buyerId) => ({ cohort_id: cohortId, buyer_id: buyerId }));
    const { error } = await db.schema('app').from('cohort_members').insert(rows);
    if (error) throw new Error(`Failed to save selected buyers: ${error.message}`);
  }

  const closedAt = new Date().toISOString();
  for (const batch of chunkArray(plan.toClose, POSTGREST_IN_CHUNK_SIZE)) {
    const { error } = await db
      .schema('app')
      .from('cohort_members')
      .update({ valid_until: closedAt })
      .eq('cohort_id', cohortId)
      .in('buyer_id', batch)
      .is('valid_until', null);
    if (error) throw new Error(`Failed to update selected buyers: ${error.message}`);
  }

  const { count, error: countError } = await db
    .schema('app')
    .from('cohort_members_active')
    .select('*', { count: 'exact', head: true })
    .eq('cohort_id', cohortId);
  if (countError) throw new Error('Failed to count cohort members');

  const memberCount = count ?? 0;
  await db
    .schema('app')
    .from('cohorts')
    .update({ cached_member_count: memberCount, updated_at: new Date().toISOString() })
    .eq('id', cohortId)
    .eq('tenant_id', tenantId);

  return memberCount;
}
