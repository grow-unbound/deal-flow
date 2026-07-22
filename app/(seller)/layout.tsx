import { ReactNode } from 'react';
import { ThemeProvider } from '@/components/providers/ThemeProvider';
import { SellerShell } from '@/components/layout/SellerShell';
import { getSellerShellFeatureAvailability } from '@/lib/server/seller-features';
import { loadSellerShellBranding } from '@/lib/server/seller-shell-branding';
import { requireSellerServerTenantId } from '@/lib/server/seller-server-claims';

export default async function SellerLayout({ children }: { children: ReactNode }) {
  const tenantId = await requireSellerServerTenantId();

  // Not awaited — SellerShell streams these into SellerSidebar/SellerGlobalHeader
  // via use(), each behind its own <Suspense>, so the shell frame paints
  // immediately instead of waiting on these two Supabase queries.
  const featureAvailabilityPromise = getSellerShellFeatureAvailability(tenantId);
  const tenantBrandingPromise = loadSellerShellBranding(tenantId);

  return (
    <ThemeProvider surface="seller">
      <SellerShell featureAvailabilityPromise={featureAvailabilityPromise} tenantBrandingPromise={tenantBrandingPromise}>
        {children}
      </SellerShell>
    </ThemeProvider>
  );
}
