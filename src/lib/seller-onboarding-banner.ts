export function tenantFirstRunStorageKey(tenantId: string): string {
  return `df_first_run:${tenantId}`;
}

export function shouldShowTenantOnboardingBanner(input: {
  isTenantCreator: boolean;
  tenantId: string | null;
  firstRunParam: string | null;
  storageSeen: boolean;
}): boolean {
  if (!input.isTenantCreator || !input.tenantId) return false;
  if (input.firstRunParam === '1') return true;
  return !input.storageSeen;
}
