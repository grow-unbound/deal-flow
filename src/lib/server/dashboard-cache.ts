import { revalidateTag } from 'next/cache';

export function revalidateSellerDashboardCache(tenantId: string) {
  revalidateTag(`seller-dashboard:${tenantId}`);
}

