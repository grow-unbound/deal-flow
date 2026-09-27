import { revalidateTag } from 'next/cache';

export function revalidateTenantSettingsCache(tenantId: string) {
  revalidateTag(`tenant-settings:${tenantId}`);
}
