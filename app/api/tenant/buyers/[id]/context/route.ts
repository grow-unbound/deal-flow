import { NextRequest, NextResponse } from 'next/server';

import { FEATURE_FLAGS } from '@/constants';
import { getVerifiedClaims } from '@/lib/auth';
import { getFlag } from '@/lib/flags';
import { loadBuyerCreditSnapshot } from '@/lib/server/buyer-credit';
import { supabaseAdmin } from '@/lib/supabase';

function formatAddress(geography: Record<string, unknown> | null | undefined) {
  const parts = [
    typeof geography?.city === 'string' ? geography.city : null,
    typeof geography?.state === 'string' ? geography.state : null,
    typeof geography?.pincode === 'string' ? geography.pincode : null,
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(', ') : 'Address not available';
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  try {
    const claims = await getVerifiedClaims(request);
    if (!claims.tenant_id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (!claims.role?.startsWith('seller_')) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const [orderMgmt, estimatesFlag, salesOrdersFlag, invoicesFlag] = await Promise.all([
      getFlag(FEATURE_FLAGS.ORDER_MANAGEMENT, claims.tenant_id),
      getFlag(FEATURE_FLAGS.ESTIMATES, claims.tenant_id),
      getFlag(FEATURE_FLAGS.SALES_ORDERS, claims.tenant_id),
      getFlag(FEATURE_FLAGS.INVOICES, claims.tenant_id),
    ]);
    if (!orderMgmt || (!estimatesFlag && !salesOrdersFlag && !invoicesFlag)) {
      return NextResponse.json({ error: 'Feature not enabled' }, { status: 403 });
    }

    if (!supabaseAdmin) {
      return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
    }

    const db = supabaseAdmin as any;
    const tenantId = claims.tenant_id;

    const [buyerRes, tenantRes, cohortRes] = await Promise.all([
      db
        .schema('app')
        .from('buyers')
        .select('id, business_name, contact_name, phone, email, gstin, geography, credit_limit, payment_terms_days')
        .eq('tenant_id', tenantId)
        .eq('id', id)
        .is('deleted_at', null)
        .maybeSingle(),
      db
        .schema('app')
        .from('tenants')
        .select('id, primary_state')
        .eq('id', tenantId)
        .maybeSingle(),
      db
        .schema('app')
        .from('cohort_members')
        .select('cohort_id')
        .eq('buyer_id', id),
    ]);

    if (buyerRes.error || !buyerRes.data) {
      return NextResponse.json({ error: 'Buyer not found' }, { status: 404 });
    }

    const buyer = buyerRes.data as {
      id: string;
      business_name: string;
      contact_name: string | null;
      phone: string | null;
      email: string | null;
      gstin: string | null;
      geography: Record<string, unknown> | null;
      credit_limit: number | null;
      payment_terms_days: number | null;
    };

    const cohortIds = (cohortRes.data ?? []).map((row: { cohort_id: string }) => row.cohort_id);
    const { data: assignmentRows } =
      cohortIds.length > 0
        ? await db
            .schema('app')
            .from('price_list_assignments')
            .select('price_list_id, target_type, target_id')
            .or(`and(target_type.eq.buyer,target_id.eq.${id}),and(target_type.eq.cohort,target_id.in.(${cohortIds.join(',')})),target_type.eq.all_buyers`)
            .is('deleted_at', null)
        : await db
            .schema('app')
            .from('price_list_assignments')
            .select('price_list_id, target_type, target_id')
            .or(`and(target_type.eq.buyer,target_id.eq.${id}),target_type.eq.all_buyers`)
            .is('deleted_at', null);

    const assignmentPriority = ['buyer', 'cohort', 'all_buyers'];
    const sortedAssignments = (assignmentRows ?? [])
      .slice()
      .sort(
        (a: { target_type: string }, b: { target_type: string }) =>
          assignmentPriority.indexOf(a.target_type) - assignmentPriority.indexOf(b.target_type),
      );
    const activePriceListId = sortedAssignments[0]?.price_list_id as string | undefined;

    let activePriceList: { id: string; name: string } | null = null;
    if (activePriceListId) {
      const { data: priceList } = await db
        .schema('app')
        .from('price_lists')
        .select('id, name')
        .eq('id', activePriceListId)
        .eq('tenant_id', tenantId)
        .is('deleted_at', null)
        .maybeSingle();
      if (priceList) {
        activePriceList = {
          id: priceList.id as string,
          name: priceList.name as string,
        };
      }
    }

    const creditLimit = Number(buyer.credit_limit ?? 0);
    const creditSnapshot = await loadBuyerCreditSnapshot(db as any, {
      tenantId,
      buyerId: buyer.id,
      creditLimit,
    });
    const state = typeof buyer.geography?.state === 'string' && buyer.geography.state.trim()
      ? buyer.geography.state.trim()
      : buyer.gstin?.slice(0, 2) ?? '';

    return NextResponse.json({
      data: {
        id: buyer.id,
        business_name: buyer.business_name,
        contact_name: buyer.contact_name ?? null,
        phone: buyer.phone ?? null,
        email: buyer.email ?? null,
        gstin: buyer.gstin ?? null,
        bill_address: formatAddress(buyer.geography),
        city: typeof buyer.geography?.city === 'string' ? buyer.geography.city : null,
        state: typeof buyer.geography?.state === 'string' ? buyer.geography.state : null,
        pincode: typeof buyer.geography?.pincode === 'string' ? buyer.geography.pincode : null,
        place_of_supply: state || 'Unknown',
        seller_state: (tenantRes.data?.primary_state as string | null | undefined) ?? null,
        payment_terms_days: Number(buyer.payment_terms_days ?? 0),
        credit_limit: creditLimit,
        credit_used: creditSnapshot.credit_used,
        credit_available: creditSnapshot.available_credit,
        active_pricelist: activePriceList,
        sales_agent_name: null,
      },
    });
  } catch (error) {
    console.error('[GET /api/tenant/buyers/[id]/context]', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
