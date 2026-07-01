import { ReactNode } from 'react';
import { ThemeProvider } from '@/components/providers/ThemeProvider';
import { SellerShell } from '@/components/layout/SellerShell';
import { getSellerShellFeatureAvailability } from '@/lib/server/seller-features';
import { requireSellerServerTenantId } from '@/lib/server/seller-server-claims';
import { supabaseAdmin } from '@/lib/supabase';

async function loadSellerShellBranding(tenantId: string) {
  if (!supabaseAdmin) {
    return { tenantName: 'Tenant', tenantLogoUrl: null as string | null };
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

export default async function SellerLayout({ children }: { children: ReactNode }) {
  const tenantId = await requireSellerServerTenantId();

  const [featureAvailability, tenantBranding] = await Promise.all([
    getSellerShellFeatureAvailability(tenantId),
    loadSellerShellBranding(tenantId),
  ]);

  return (
    <ThemeProvider surface="seller">
      <SellerShell featureAvailability={featureAvailability} tenantBranding={tenantBranding}>
        {children}
      </SellerShell>
    </ThemeProvider>
  );
}
