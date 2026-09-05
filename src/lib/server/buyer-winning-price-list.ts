import { supabaseAdmin } from '@/lib/supabase';

export interface WinningPriceList {
  price_list_id: string | null;
  price_list_name: string | null;
}

const TARGET_ORDER = ['buyer', 'cohort', 'all_buyers'] as const;

/**
 * Resolves the winning assigned price list for a buyer (resolve_price steps 2–4),
 * not per-SKU overrides. Null id/name means base selling rate applies.
 */
export async function resolveWinningPriceListForBuyer(
  tenantId: string,
  buyerId: string,
): Promise<WinningPriceList> {
  if (!supabaseAdmin) {
    throw new Error('Server configuration error');
  }

  const db = supabaseAdmin;

  const { data: cohortRows, error: cohortError } = await db
    .schema('app')
    .from('cohort_members_active')
    .select('cohort_id')
    .eq('buyer_id', buyerId);
  if (cohortError) {
    throw new Error(cohortError.message);
  }

  const cohortIds = (cohortRows ?? []).map((row) => row.cohort_id as string);
  const nowIso = new Date().toISOString();

  for (const targetType of TARGET_ORDER) {
    let query = db
      .schema('app')
      .from('price_list_assignments')
      .select('price_list_id, price_lists!inner(id, name, priority, is_active, valid_from, valid_to)')
      .eq('target_type', targetType)
      .is('deleted_at', null);

    if (targetType === 'buyer') {
      query = query.eq('target_id', buyerId);
    } else if (targetType === 'cohort') {
      if (cohortIds.length === 0) continue;
      query = query.in('target_id', cohortIds);
    }

    const { data: rows, error } = await query;
    if (error) {
      throw new Error(error.message);
    }

    type AssignmentRow = {
      price_list_id: string;
      price_lists: {
        id: string;
        name: string | null;
        priority: number | null;
        is_active: boolean;
        valid_from: string;
        valid_to: string | null;
      };
    };

    const valid = ((rows ?? []) as unknown as AssignmentRow[])
      .filter((row) => {
        const pl = row.price_lists;
        if (!pl?.is_active) return false;
        if (pl.valid_from > nowIso) return false;
        if (pl.valid_to && pl.valid_to <= nowIso) return false;
        return true;
      })
      .sort((a, b) => (b.price_lists.priority ?? 0) - (a.price_lists.priority ?? 0));

    const winner = valid[0];
    if (winner) {
      return {
        price_list_id: winner.price_lists.id,
        price_list_name: winner.price_lists.name ?? null,
      };
    }
  }

  return { price_list_id: null, price_list_name: null };
}
