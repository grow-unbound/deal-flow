import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { getVerifiedClaims } from '@/lib/auth';
import { parseRowsLimit, SELLER_CACHE_PERSONAL } from '@/lib/server/bounded-get';
import { supabaseAdmin } from '@/lib/supabase';

const ParamsSchema = z.object({ id: z.string().uuid() });

type PriceListAssignmentRow = {
  price_list_id: string;
  target_type: 'buyer' | 'cohort' | 'all_buyers';
  target_id: string | null;
  created_at: string | null;
};

type PriceListRow = {
  id: string;
  name: string;
  valid_from: string | null;
  valid_to: string | null;
  is_active: boolean;
  priority: number | null;
};

type AssignedPriceListRow = {
  id: string;
  name: string;
  priority: number | null;
  target_type: 'buyer' | 'cohort' | 'all_buyers';
  target_label: string;
  valid_from: string | null;
  valid_to: string | null;
  status: 'active' | 'draft' | 'expired';
  created_at: string | null;
};

function derivePriceListStatus(validFrom: string | null, validTo: string | null, isActive: boolean): 'active' | 'draft' | 'expired' {
  const now = Date.now();
  const fromTs = validFrom ? new Date(validFrom).getTime() : Number.NEGATIVE_INFINITY;
  const toTs = validTo ? new Date(validTo).getTime() : Number.POSITIVE_INFINITY;
  if (toTs < now) return 'expired';
  if (!isActive) return 'draft';
  if (fromTs > now) return 'draft';
  return 'active';
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const parsedParams = ParamsSchema.safeParse(await params);
  const claims = await getVerifiedClaims(request);

  if (!parsedParams.success) return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  if (!claims.tenant_id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!claims.role?.startsWith('seller_')) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  if (!supabaseAdmin) return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });

  const db = supabaseAdmin as any;
  const limit = parseRowsLimit(request.nextUrl.searchParams.get('limit'), 50);
  const offset = Math.max(0, Number(request.nextUrl.searchParams.get('offset') ?? 0) || 0);
  const buyerId = parsedParams.data.id;

  const buyerRes = await db
    .schema('app')
    .from('buyers')
    .select('id, business_name')
    .eq('tenant_id', claims.tenant_id)
    .eq('id', buyerId)
    .is('deleted_at', null)
    .maybeSingle();

  if (buyerRes.error || !buyerRes.data) {
    return NextResponse.json({ error: 'Buyer not found' }, { status: 404 });
  }

  const cohortRes = await db
    .schema('app')
    .from('cohort_members_active')
    .select('cohort_id')
    .eq('buyer_id', buyerId)

  if (cohortRes.error) {
    return NextResponse.json({ error: 'Failed to load price lists' }, { status: 500 });
  }

  const memberCohortIds = ((cohortRes.data ?? []) as Array<{ cohort_id: string }>).map((row) => row.cohort_id);
  const cohortIds: string[] = [];
  const cohortNames = new Map<string, string>();
  if (memberCohortIds.length > 0) {
    const { data: cohortNameRows } = await db
      .schema('app')
      .from('cohorts')
      .select('id, name')
      .in('id', memberCohortIds)
      .is('deleted_at', null);
    for (const row of (cohortNameRows ?? []) as Array<{ id: string; name: string }>) {
      cohortIds.push(row.id);
      cohortNames.set(row.id, row.name ?? 'Customer group');
    }
  }

  const assignmentsRes =
    cohortIds.length > 0
      ? await db
          .schema('app')
          .from('price_list_assignments')
          .select('price_list_id, target_type, target_id, created_at')
          .or(`and(target_type.eq.buyer,target_id.eq.${buyerId}),and(target_type.eq.cohort,target_id.in.(${cohortIds.join(',')})),target_type.eq.all_buyers`)
          .is('deleted_at', null)
      : await db
          .schema('app')
          .from('price_list_assignments')
          .select('price_list_id, target_type, target_id, created_at')
          .or(`and(target_type.eq.buyer,target_id.eq.${buyerId}),target_type.eq.all_buyers`)
          .is('deleted_at', null);

  if (assignmentsRes.error) {
    return NextResponse.json({ error: 'Failed to load price lists' }, { status: 500 });
  }

  const assignmentRows = (assignmentsRes.data ?? []) as PriceListAssignmentRow[];
  const priceListIds = [...new Set(assignmentRows.map((row) => row.price_list_id).filter(Boolean))];

  const priceListsRes =
    priceListIds.length > 0
      ? await db
          .schema('app')
          .from('price_lists')
          .select('id, name, valid_from, valid_to, is_active, priority')
          .eq('tenant_id', claims.tenant_id)
          .in('id', priceListIds)
          .is('deleted_at', null)
      : { data: [], error: null };

  if (priceListsRes.error) {
    return NextResponse.json({ error: 'Failed to load price lists' }, { status: 500 });
  }

  const priceListById = new Map<string, PriceListRow>(((priceListsRes.data ?? []) as PriceListRow[]).map((row) => [row.id, row]));
  const targetOrder = ['buyer', 'cohort', 'all_buyers'];
  const assigned: AssignedPriceListRow[] = assignmentRows
    .map((assignment) => {
      const priceList = priceListById.get(String(assignment.price_list_id));
      if (!priceList) return null;

      const targetType = assignment.target_type as 'buyer' | 'cohort' | 'all_buyers';
      const targetLabel =
        targetType === 'buyer'
          ? `Buyer specific · ${buyerRes.data.business_name}`
          : targetType === 'cohort'
            ? `Cohort · ${cohortNames.get(String(assignment.target_id)) ?? 'Customer group'}`
            : 'All buyers';

      return {
        id: priceList.id,
        name: priceList.name,
        priority: priceList.priority == null ? null : Number(priceList.priority),
        target_type: targetType,
        target_label: targetLabel,
        valid_from: priceList.valid_from ?? null,
        valid_to: priceList.valid_to ?? null,
        status: derivePriceListStatus(
          priceList.valid_from ?? null,
          priceList.valid_to ?? null,
          Boolean(priceList.is_active),
        ),
        created_at: assignment.created_at as string | null,
      };
    })
    .filter((row): row is AssignedPriceListRow => row != null)
    .sort((a, b) => {
      const targetDelta = targetOrder.indexOf(a.target_type) - targetOrder.indexOf(b.target_type);
      if (targetDelta !== 0) return targetDelta;
      const priorityDelta = Number(b.priority ?? -Infinity) - Number(a.priority ?? -Infinity);
      if (priorityDelta !== 0) return priorityDelta;
      return new Date(b.created_at ?? 0).getTime() - new Date(a.created_at ?? 0).getTime();
    });

  return NextResponse.json(
    {
      assigned: assigned.slice(offset, offset + limit).map(({ created_at: _createdAt, ...row }) => row),
      total: assigned.length,
    },
    { headers: SELLER_CACHE_PERSONAL },
  );
}
