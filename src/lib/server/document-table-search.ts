type SearchQueryBuilder<T> = {
  ilike: (column: string, value: string) => T;
  in: (column: string, values: string[]) => T;
  or: (filter: string) => T;
};

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

export function applyTransactionTableSearch<T extends SearchQueryBuilder<T>>(
  query: T,
  searchColumn: string,
  searchValue: string,
  buyerIds: string[],
  locationIds: string[],
): T {
  const normalized = normalizeSearchValue(searchValue);
  if (!normalized) {
    return query;
  }

  const clauses = [`${searchColumn}.ilike.*${normalized}*`];
  if (buyerIds.length > 0) {
    clauses.push(`buyer_id.in.(${buyerIds.join(',')})`);
  }
  if (locationIds.length > 0) {
    clauses.push(`location_id.in.(${locationIds.join(',')})`);
  }
  return query.or(clauses.join(','));
}
