import { ReactNode } from 'react';
import { ThemeProvider } from '@/components/providers/ThemeProvider';
import { SellerShell } from '@/components/layout/SellerShell';
import { getSellerShellFeatureAvailability } from '@/lib/server/seller-features';
import { requireSellerServerTenantId } from '@/lib/server/seller-server-claims';

export default async function SellerLayout({ children }: { children: ReactNode }) {
  const tenantId = await requireSellerServerTenantId();

  const featureAvailability = await getSellerShellFeatureAvailability(tenantId);

  return (
    <ThemeProvider surface="seller">
      <SellerShell featureAvailability={featureAvailability}>{children}</SellerShell>
    </ThemeProvider>
  );
}
