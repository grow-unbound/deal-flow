import { supabaseAdmin } from '@/lib/supabase';

export interface SellerShellTenantBranding {
  tenantName: string;
  tenantLogoUrl: string | null;
}

export async function loadSellerShellBranding(tenantId: string): Promise<SellerShellTenantBranding> {
  if (!supabaseAdmin) {
    return { tenantName: 'Tenant', tenantLogoUrl: null };
  }

  const [tenantResult, settingsResult] = await Promise.all([
    supabaseAdmin
      .schema('app')
      .from('tenants')
      .select('business_name')
      .eq('id', tenantId)
      .maybeSingle(),
    supabaseAdmin
      .schema('app')
      .from('tenant_settings')
      .select('settings')
      .eq('tenant_id', tenantId)
      .maybeSingle(),
  ]);

  const tenantName = tenantResult.data?.business_name ?? 'Tenant';
  const settings = settingsResult.data?.settings as Record<string, unknown> | null | undefined;
  const business = (settings?.business as Record<string, unknown> | undefined) ?? {};
  const tenantLogoUrl = typeof business.logo_url === 'string' && business.logo_url.trim().length > 0
    ? business.logo_url
    : null;

  return { tenantName, tenantLogoUrl };
}
