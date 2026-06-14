import { ROLES } from '@/constants';
import type { JWTClaims } from '@/lib/auth';
import type { ComposerLocationOption } from '@/types/estimate-composer';

const NO_ACCESS_LOCATION_ID = '00000000-0000-0000-0000-000000000000';

export type SellerLocationScope =
  | { mode: 'all'; locationIds: null }
  | { mode: 'subset'; locationIds: string[] }
  | { mode: 'none'; locationIds: [] };

export function normalizeLocationIds(value: unknown): string[] | null {
  if (!Array.isArray(value)) return null;

  const ids = value
    .filter((entry): entry is string => typeof entry === 'string')
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);

  return ids.length > 0 ? ids : [];
}

export function getSellerLocationScope(
  claims: Pick<JWTClaims, 'role' | 'location_ids'>,
): SellerLocationScope {
  if (claims.role === ROLES.SELLER_ADMIN) {
    return { mode: 'all', locationIds: null };
  }

  if (claims.role === ROLES.SELLER_ASSISTANT) {
    if (claims.location_ids && claims.location_ids.length > 0) {
      return { mode: 'subset', locationIds: claims.location_ids };
    }

    return { mode: 'none', locationIds: [] };
  }

  return { mode: 'none', locationIds: [] };
}

export function canAccessDocumentLocation(
  claims: Pick<JWTClaims, 'role' | 'location_ids'>,
  locationId: unknown,
): boolean {
  const scope = getSellerLocationScope(claims);
  if (scope.mode === 'all') return true;
  if (scope.mode === 'none') return false;
  return typeof locationId === 'string' && scope.locationIds.includes(locationId);
}

export function locationScopeCacheKey(claims: Pick<JWTClaims, 'role' | 'location_ids'>): string {
  const scope = getSellerLocationScope(claims);
  if (scope.mode === 'all') return 'all';
  if (scope.mode === 'none') return 'none';
  return scope.locationIds.slice().sort().join(',');
}

export function applySellerLocationScope<T extends {
  in: (column: string, values: string[]) => T;
  eq: (column: string, value: string) => T;
}>(
  query: T,
  claims: Pick<JWTClaims, 'role' | 'location_ids'>,
  column = 'location_id',
): T {
  const scope = getSellerLocationScope(claims);
  if (scope.mode === 'all') return query;
  if (scope.mode === 'none') return query.eq(column, NO_ACCESS_LOCATION_ID);
  return query.in(column, scope.locationIds);
}

export async function loadAccessibleSellerLocations(
  db: {
    schema: (schema: string) => {
      from: (table: string) => {
        select: (columns: string) => {
          eq: (column: string, value: string) => any;
          in: (column: string, values: string[]) => any;
          is: (column: string, value: null) => any;
          order: (column: string, options?: { ascending?: boolean }) => any;
        };
      };
    };
  },
  tenantId: string,
  claims: Pick<JWTClaims, 'role' | 'location_ids'>,
): Promise<ComposerLocationOption[]> {
  const scope = getSellerLocationScope(claims);

  let query = db
    .schema('app')
    .from('locations')
    .select('id, name, is_default')
    .eq('tenant_id', tenantId)
    .is('deleted_at', null);

  if (scope.mode === 'subset') {
    query = query.in('id', scope.locationIds);
  } else if (scope.mode === 'none') {
    return [];
  }

  const { data, error } = await query.order('is_default', { ascending: false }).order('name', { ascending: true });
  if (error) {
    throw error;
  }

  return ((data ?? []) as Array<{ id: string; name: string; is_default: boolean | null }>).map((row) => ({
    id: row.id,
    name: row.name,
    is_default: row.is_default === true,
  }));
}

export function resolveDefaultSellerLocationId(
  claims: Pick<JWTClaims, 'role' | 'location_ids'>,
  locations: ComposerLocationOption[],
): string | null {
  if (locations.length === 0) return null;

  if (claims.role === ROLES.SELLER_ASSISTANT && claims.location_ids && claims.location_ids.length > 0) {
    return locations.find((location) => claims.location_ids?.includes(location.id))?.id ?? locations[0]?.id ?? null;
  }

  return locations.find((location) => location.is_default)?.id ?? locations[0]?.id ?? null;
}

export function isSellerLocationSelectionAllowed(
  claims: Pick<JWTClaims, 'role' | 'location_ids'>,
  locationId: string | null | undefined,
): boolean {
  if (!locationId) return false;
  return canAccessDocumentLocation(claims, locationId);
}
