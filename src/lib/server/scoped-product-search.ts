import type { SupabaseClient } from '@supabase/supabase-js';
import { createProductQueryEmbedding } from '@/lib/server/product-search';

export type ScopedProductAvailability =
  | 'show_all'
  | 'show_everything'
  | 'in_stock'
  | 'in_stock_only'
  | 'low_stock'
  | 'low_stock_only'
  | 'out_of_stock'
  | 'new_in_stock_today'
  | 'old_stock';

export interface ScopedProductSearchParams {
  db: SupabaseClient;
  tenantId: string;
  query?: string | null;
  buyerId?: string | null;
  priceListId?: string | null;
  campaignId?: string | null;
  limit: number;
  offset?: number;
  ids?: string[] | null;
  brandIds?: string[] | null;
  categoryIds?: string[] | null;
  categoryScopeId?: string | null;
  allowedBrandIds?: string[] | null;
  warehouseIds?: string[] | null;
  availability?: ScopedProductAvailability;
  sort?: 'relevance' | 'name_asc' | 'created_desc';
}

export interface ScopedProductSearchRow {
  tenant_product_id: string;
  product_name: string;
  sku: string | null;
  brand_id: string | null;
  brand_name: string;
  category_id: string | null;
  category_name: string;
  hsn_code: string | null;
  tax_pct: number | null;
  on_hand: number | null;
  reorder_point: number | null;
  unit_price: number | null;
  mrp: number | null;
  base_selling_price: number | null;
  cost_price: number | null;
  default_uom: string | null;
  pack_size: number | null;
  created_at: string;
  search_rank: number;
  total_count: number;
}

function normalizeUuidArray(values?: string[] | null): string[] | null {
  if (!values) return null;
  const normalized = Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
  return normalized.length > 0 ? normalized : null;
}

export async function searchScopedProducts(
  params: ScopedProductSearchParams,
): Promise<{ rows: ScopedProductSearchRow[]; total: number }> {
  // An explicitly resolved empty visibility scope means the caller is allowed
  // to see no brands. It must not collapse to NULL, which means no SQL filter.
  if (params.allowedBrandIds && params.allowedBrandIds.length === 0) {
    return { rows: [], total: 0 };
  }

  const trimmedQuery = params.query?.trim() ?? '';
  const queryEmbedding = trimmedQuery ? await createProductQueryEmbedding(trimmedQuery) : null;
  const db = params.db as any;

  const rpcArgs = {
    p_tenant_id: params.tenantId,
    p_query: trimmedQuery || null,
    p_buyer_id: params.buyerId ?? null,
    p_price_list_id: params.priceListId ?? null,
    p_campaign_id: params.campaignId ?? null,
    p_category_scope_id: params.categoryScopeId?.trim() || null,
    p_limit: Math.max(1, params.limit),
    p_offset: Math.max(0, params.offset ?? 0),
    p_query_embedding: queryEmbedding,
    p_ids: normalizeUuidArray(params.ids),
    p_brand_ids: normalizeUuidArray(params.brandIds),
    p_category_ids: normalizeUuidArray(params.categoryIds),
    p_allowed_brand_ids: normalizeUuidArray(params.allowedBrandIds),
    p_warehouse_ids: normalizeUuidArray(params.warehouseIds),
    p_availability: params.availability ?? 'show_all',
    p_sort: params.sort ?? 'relevance',
  };
  const { data, error } = await db.schema('app').rpc('search_products_scoped', rpcArgs);

  if (error) {
    throw new Error(error.message);
  }

  const rows = (data ?? []) as ScopedProductSearchRow[];
  let total = rows[0]?.total_count ?? 0;
  if (rows.length === 0 && (params.offset ?? 0) > 0) {
    // Window counts disappear on an out-of-range page. Recover the stable total
    // with one bounded probe instead of misreporting an existing scope as empty.
    const { data: probeData, error: probeError } = await db.schema('app').rpc('search_products_scoped', {
      ...rpcArgs,
      p_limit: 1,
      p_offset: 0,
    });
    if (probeError) throw new Error(probeError.message);
    total = Number((probeData as ScopedProductSearchRow[] | null)?.[0]?.total_count ?? 0);
  }
  return {
    rows,
    total,
  };
}
