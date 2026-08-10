export function shouldShowTenantOnboardingBanner(input: {
  isTenantCreator: boolean;
  tenantId: string | null;
  dismissedAt: string | null;
}): boolean {
  if (!input.isTenantCreator || !input.tenantId) return false;
  return input.dismissedAt == null;
}
