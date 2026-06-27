import type { SupabaseClient } from '@supabase/supabase-js';

type BuyerCohortRow = {
  id: string;
  allowed_tenant_brand_ids: string[] | null;
};

export async function resolveBuyerAllowedTenantBrandIds(
  db: SupabaseClient,
  tenantId: string,
  buyerId: string,
): Promise<string[] | null> {
  const [buyerRes, membershipsRes] = await Promise.all([
    db
      .schema('app')
      .from('buyers')
      .select('default_cohort_id')
      .eq('id', buyerId)
      .eq('tenant_id', tenantId)
      .maybeSingle(),
    db
      .schema('app')
      .from('cohort_members')
      .select('cohort_id')
      .eq('buyer_id', buyerId),
  ]);

  if (buyerRes.error) throw new Error(buyerRes.error.message);
  if (membershipsRes.error) throw new Error(membershipsRes.error.message);

  const cohortIds = new Set<string>(
    ((membershipsRes.data ?? []) as Array<{ cohort_id: string }>).map((row) => row.cohort_id),
  );
  const defaultCohortId = (buyerRes.data as { default_cohort_id?: string | null } | null)?.default_cohort_id ?? null;
  if (defaultCohortId) cohortIds.add(defaultCohortId);

  if (cohortIds.size === 0) return null;

  const { data: cohorts, error: cohortsError } = await db
    .schema('app')
    .from('cohorts')
    .select('id, allowed_tenant_brand_ids')
    .eq('tenant_id', tenantId)
    .is('deleted_at', null)
    .in('id', Array.from(cohortIds));

  if (cohortsError) throw new Error(cohortsError.message);

  const rows = (cohorts ?? []) as BuyerCohortRow[];
  if (rows.length === 0) return null;
  if (rows.some((row) => row.allowed_tenant_brand_ids == null)) return null;

  return Array.from(
    new Set(
      rows.flatMap((row) => row.allowed_tenant_brand_ids ?? []),
    ),
  );
}
