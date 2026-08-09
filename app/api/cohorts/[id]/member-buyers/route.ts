import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { getVerifiedClaims } from '@/lib/auth';
import { getFlag } from '@/lib/flags';
import { SELLER_CACHE_PERSONAL } from '@/lib/server/bounded-get';
import { buildCohortMemberBuyerRows } from '@/lib/server/cohort-composer';

type DbClient = NonNullable<typeof supabaseAdmin>;

// On-demand only: fetched when the manual-membership edit dialog or the rule-based
// composer's edit mode opens, not on every cohort detail page load. Backs
// CustomerGroupFormSheet's selected_buyer_ids default and CohortComposer's edit-mode
// member table (business_name/mtd_spend/orders_mtd/credit_used/last_order_at).
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const claims = await getVerifiedClaims(request);
  if (!claims.tenant_id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!claims.role?.startsWith('seller_')) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const flagEnabled = await getFlag('df_cohorts', claims.tenant_id);
  if (!flagEnabled) return NextResponse.json({ error: 'Feature not enabled' }, { status: 403 });
  if (!supabaseAdmin) return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });

  const db = supabaseAdmin as DbClient as any;

  const { data: cohort, error: cohortError } = await db
    .schema('app')
    .from('cohorts')
    .select('id, tenant_id')
    .eq('id', id)
    .eq('tenant_id', claims.tenant_id)
    .is('deleted_at', null)
    .maybeSingle();

  if (cohortError) return NextResponse.json({ error: 'Failed to fetch cohort' }, { status: 500 });
  if (!cohort) return NextResponse.json({ error: 'Cohort not found' }, { status: 404 });

  const { data: members, error: membersError } = await db
    .schema('app')
    .from('cohort_members_active')
    .select('buyer_id')
    .eq('cohort_id', id);

  if (membersError) return NextResponse.json({ error: 'Failed to fetch cohort members' }, { status: 500 });

  const memberBuyerIds = Array.from(new Set(((members ?? []) as Array<{ buyer_id: string }>).map((row) => row.buyer_id)));

  let buyers: Array<{
    buyer_id: string;
    business_name: string;
    contact_name: string | null;
    external_ref: string | null;
    geography_label: string;
    tier: 'A' | 'B' | 'C' | null;
    mtd_spend: number;
    orders_mtd: number;
    aov: number;
    credit_used: number;
    last_order_at: string | null;
    initials: string;
    hue: 'teal' | 'ember' | 'cream';
  }> = [];

  try {
    const memberRowsDetail = await buildCohortMemberBuyerRows(db, claims.tenant_id, memberBuyerIds);
    buyers = memberRowsDetail.map((row) => ({
      buyer_id: row.id,
      business_name: row.business_name,
      contact_name: row.contact_name,
      external_ref: row.external_ref,
      geography_label: row.geography_label,
      tier: row.tier,
      mtd_spend: row.mtd_spend,
      orders_mtd: row.orders_mtd,
      aov: row.orders_mtd > 0 ? Number((row.mtd_spend / row.orders_mtd).toFixed(2)) : 0,
      credit_used: row.credit_used,
      last_order_at: row.last_order_at,
      initials: row.initials,
      hue: row.hue,
    }));
  } catch (e) {
    console.error('[GET /api/cohorts/[id]/member-buyers] buildCohortMemberBuyerRows', (e as Error)?.message);
    return NextResponse.json({ error: 'Failed to fetch cohort member buyers' }, { status: 500 });
  }

  return NextResponse.json({ buyers }, { headers: SELLER_CACHE_PERSONAL });
}
