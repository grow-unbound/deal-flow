type SearchQueryBuilder<T> = {
  ilike: (column: string, value: string) => T;
  in: (column: string, values: string[]) => T;
  or: (filter: string) => T;
};

type RpcClient = {
  schema: (schemaName: string) => { rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }> };
};

/** Sentinel id that never matches a real row — used to force a zero-row result
 * when a search term matched nothing, instead of accidentally matching everything. */
const NO_MATCH_ID = '00000000-0000-0000-0000-000000000000';

const NUMBER_SEARCH_RPC = {
  order_number: 'search_orders_number_ids',
  invoice_number: 'search_invoices_number_ids',
  estimate_number: 'search_estimates_number_ids',
} as const;

function normalizeSearchValue(value: string): string {
  return value.replace(/[*(),]/g, ' ').replace(/\s+/g, ' ').trim();
}

export async function loadTransactionSearchScopeIds(
  db: any,
  tenantId: string,
  query: string,
): Promise<{ buyerIds: string[]; locationIds: string[] }> {
  const normalized = normalizeSearchValue(query);
  if (!normalized) {
    return { buyerIds: [], locationIds: [] };
  }

  const likeValue = `%${normalized}%`;
  const [buyersRes, locationsRes] = await Promise.all([
    db
      .schema('app')
      .from('buyers')
      .select('id')
      .eq('tenant_id', tenantId)
      .is('deleted_at', null)
      .ilike('business_name', likeValue)
      .limit(200),
    db
      .schema('app')
      .from('locations')
      .select('id')
      .eq('tenant_id', tenantId)
      .is('deleted_at', null)
      .ilike('name', likeValue)
      .limit(200),
  ]);

  return {
    buyerIds: (buyersRes.data ?? []).map((row: { id: string }) => row.id).filter(Boolean),
    locationIds: (locationsRes.data ?? []).map((row: { id: string }) => row.id).filter(Boolean),
  };
}

/**
 * Resolves matching document ids via the indexed lower(number) trigram RPC
 * (idx_{orders,invoices,estimates}_number_trgm is built on the lower()
 * expression — a raw-column ILIKE never matches that index, so this exists
 * as a separate indexed lookup rather than a query-builder filter).
 */
export async function loadTransactionNumberMatchIds(
  db: RpcClient,
  tenantId: string,
  searchColumn: keyof typeof NUMBER_SEARCH_RPC,
  query: string,
  limit = 500,
): Promise<string[]> {
  const normalized = normalizeSearchValue(query);
  if (!normalized) return [];

  const { data, error } = await db.schema('app').rpc(NUMBER_SEARCH_RPC[searchColumn], {
    p_tenant_id: tenantId,
    p_query: normalized,
    p_limit: limit,
  });
  if (error) throw new Error((error as { message?: string })?.message ?? 'Failed to search document numbers');
  return ((data ?? []) as Array<{ id: string }>).map((row) => row.id).filter(Boolean);
}

export function applyTransactionTableSearch<T extends SearchQueryBuilder<T>>(
  query: T,
  searchColumn: string,
  searchValue: string,
  buyerIds: string[],
  locationIds: string[],
  numberMatchIds: string[],
): T {
  const normalized = normalizeSearchValue(searchValue);
  if (!normalized) {
    return query;
  }

  const clauses: string[] = [];
  if (numberMatchIds.length > 0) clauses.push(`id.in.(${numberMatchIds.join(',')})`);
  if (buyerIds.length > 0) clauses.push(`buyer_id.in.(${buyerIds.join(',')})`);
  if (locationIds.length > 0) clauses.push(`location_id.in.(${locationIds.join(',')})`);
  if (clauses.length === 0) clauses.push(`id.in.(${NO_MATCH_ID})`);
  return query.or(clauses.join(','));
}
