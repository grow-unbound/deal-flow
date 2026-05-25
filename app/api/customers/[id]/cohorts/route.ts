import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { getVerifiedClaims } from '@/lib/auth';
import { getFlag } from '@/lib/flags';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const claims = await getVerifiedClaims(request);

  if (!claims.tenant_id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (!claims.role?.startsWith('seller_')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const flagEnabled = await getFlag('df_customer_master', claims.tenant_id);
  if (!flagEnabled) {
    return NextResponse.json({ error: 'Feature not enabled' }, { status: 403 });
  }

  if (!supabaseAdmin) {
    return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
  }

  const db = supabaseAdmin as any;

  // Fetch buyer details (needed for dynamic cohort evaluation)
  let buyer: { tier?: string; geography?: { state?: string } } | null = null;
  try {
    const { data, error } = await db
      .schema('app')
      .from('buyers')
      .select('id, tier, geography')
      .eq('id', id)
      .eq('tenant_id', claims.tenant_id)
      .is('deleted_at', null)
      .maybeSingle();

    if (error || !data) {
      return NextResponse.json({ error: 'Customer not found' }, { status: 404 });
    }
    buyer = data;
  } catch {
    return NextResponse.json({ error: 'Failed to fetch customer' }, { status: 500 });
  }

  // Cohorts table may not exist yet (EP-04 not done) — handle gracefully
  try {
    interface CohortRow {
      id: string;
      name: string;
      description: string | null;
      is_static: boolean;
      rules: Record<string, any> | null;
    }

    // 1. Static cohort memberships
    const { data: staticRows, error: staticError } = await db
      .schema('app')
      .from('cohort_members')
      .select('cohort:cohorts(id, name, description, is_static, rules)')
      .eq('buyer_id', id);

    if (staticError) {
      // Table likely doesn't exist yet
      return NextResponse.json({ cohorts: [] });
    }

    const staticCohorts = ((staticRows ?? []) as Array<{ cohort: CohortRow | null }>)
      .map((row) => row.cohort)
      .filter((c): c is CohortRow => c !== null)
      .map((c) => ({
        id: c.id,
        name: c.name,
        description: c.description,
        is_static: c.is_static,
        matched_by: 'static' as const,
      }));

    const staticCohortIds = new Set(staticCohorts.map((c) => c.id));

    // 2. Dynamic cohorts for this tenant
    const { data: dynamicRows, error: dynamicError } = await db
      .schema('app')
      .from('cohorts')
      .select('id, name, description, is_static, rules')
      .eq('tenant_id', claims.tenant_id)
      .eq('is_static', false)
      .is('deleted_at', null);

    if (dynamicError) {
      // Return only static if dynamic query fails
      return NextResponse.json({ cohorts: staticCohorts });
    }

    // Evaluate dynamic cohort rules against buyer attributes
    const dynamicCohorts = ((dynamicRows ?? []) as CohortRow[])
      .filter((c) => !staticCohortIds.has(c.id))
      .filter((c) => {
        if (!c.rules || !buyer) return false;
        const rules = c.rules as Record<string, any>;

        // Tier matching
        if (rules.tier && buyer.tier !== rules.tier) return false;

        // Geography state matching
        if (rules.geography?.state) {
          const buyerState = (buyer.geography as any)?.state;
          if (buyerState !== rules.geography.state) return false;
        }

        return true;
      })
      .map((c) => ({
        id: c.id,
        name: c.name,
        description: c.description,
        is_static: c.is_static,
        matched_by: 'dynamic' as const,
      }));

    return NextResponse.json({ cohorts: [...staticCohorts, ...dynamicCohorts] });
  } catch {
    // Cohorts feature not implemented yet — return empty gracefully
    return NextResponse.json({ cohorts: [] });
  }
}
