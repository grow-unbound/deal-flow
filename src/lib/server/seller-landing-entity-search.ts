import { supabaseAdmin } from '@/lib/supabase';

export type SellerLandingSearchEntity = 'cohorts' | 'campaigns' | 'price_lists';

interface SellerLandingSearchParams {
  tenantId: string;
  entity: SellerLandingSearchEntity;
  query?: string;
  statuses?: string[];
  brandIds?: string[];
  limit: number;
  offset?: number;
}

export async function searchSellerLandingEntityIds(params: SellerLandingSearchParams) {
  const db = supabaseAdmin as any;
  const { data, error } = await db.schema('app').rpc('search_seller_landing_entities', {
    p_tenant_id: params.tenantId,
    p_entity: params.entity,
    p_query: params.query?.trim() || null,
    p_statuses: params.statuses?.length ? params.statuses : null,
    p_brand_ids: params.brandIds?.length ? params.brandIds : null,
    p_limit: params.limit,
    p_offset: params.offset ?? 0,
  });

  if (error) throw error;

  const rows = (data ?? []) as Array<{ id: string | null; total_count: number | string }>;
  return {
    ids: rows.flatMap((row) => (row.id ? [row.id] : [])),
    total: rows.length > 0 ? Number(rows[0]?.total_count ?? 0) : 0,
  };
}
