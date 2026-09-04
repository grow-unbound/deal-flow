import { revalidateTag } from 'next/cache';

export function revalidatePublicCatalogCache(tenantId: string) {
  revalidateTag(`public-catalog:${tenantId}`);
}
