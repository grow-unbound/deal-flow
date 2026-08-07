import { supabaseAdmin } from '@/lib/supabase';

export interface TenantOnboardingBannerState {
  isTenantCreator: boolean;
  onboardingBannerDismissedAt: string | null;
}

/** True when the user created the tenant (signup RPC sets tenants.created_by). */
export async function isTenantCreatorUser(
  tenantId: string,
  userId: string | null | undefined,
): Promise<boolean> {
  const state = await getTenantOnboardingBannerState(tenantId, userId);
  return state.isTenantCreator;
}

/** Creator check + banner dismiss stamp in one tenants read. */
export async function getTenantOnboardingBannerState(
  tenantId: string,
  userId: string | null | undefined,
): Promise<TenantOnboardingBannerState> {
  if (!tenantId || !userId || !supabaseAdmin) {
    return { isTenantCreator: false, onboardingBannerDismissedAt: null };
  }

  const { data, error } = await supabaseAdmin
    .schema('app')
    .from('tenants')
    .select('created_by, onboarding_banner_dismissed_at')
    .eq('id', tenantId)
    .maybeSingle();

  if (error || !data?.created_by) {
    return { isTenantCreator: false, onboardingBannerDismissedAt: null };
  }

  return {
    isTenantCreator: data.created_by === userId,
    onboardingBannerDismissedAt:
      (data.onboarding_banner_dismissed_at as string | null | undefined) ?? null,
  };
}

/** Stamp dismiss for the tenant creator. Idempotent if already set. */
export async function dismissTenantOnboardingBanner(
  tenantId: string,
  userId: string,
): Promise<{ ok: true; dismissedAt: string } | { ok: false; status: 403 | 404 | 500; message: string }> {
  if (!supabaseAdmin) {
    return { ok: false, status: 500, message: 'Server configuration error' };
  }

  const { data, error } = await supabaseAdmin
    .schema('app')
    .from('tenants')
    .select('created_by, onboarding_banner_dismissed_at')
    .eq('id', tenantId)
    .maybeSingle();

  if (error) {
    console.error('[dismissTenantOnboardingBanner]', error);
    return { ok: false, status: 500, message: 'Failed to load tenant' };
  }
  if (!data) {
    return { ok: false, status: 404, message: 'Tenant not found' };
  }
  if (data.created_by !== userId) {
    return { ok: false, status: 403, message: 'Only the tenant creator can dismiss this banner' };
  }

  const existing = data.onboarding_banner_dismissed_at as string | null | undefined;
  if (existing) {
    return { ok: true, dismissedAt: existing };
  }

  const dismissedAt = new Date().toISOString();
  const { error: updateError } = await supabaseAdmin
    .schema('app')
    .from('tenants')
    .update({
      onboarding_banner_dismissed_at: dismissedAt,
      updated_at: dismissedAt,
      updated_by: userId,
    })
    .eq('id', tenantId)
    .is('onboarding_banner_dismissed_at', null);

  if (updateError) {
    console.error('[dismissTenantOnboardingBanner] update', updateError);
    return { ok: false, status: 500, message: 'Failed to dismiss banner' };
  }

  return { ok: true, dismissedAt };
}
