import { ThemeProvider } from '@/components/providers/ThemeProvider';
import { getSellerServerClaims, requireSellerServerTenantId } from '@/lib/server/seller-server-claims';
import { ROLES } from '@/constants';
import { redirect } from 'next/navigation';

export default async function OnboardingLayout({ children }: { children: React.ReactNode }) {
  await requireSellerServerTenantId();
  const claims = await getSellerServerClaims();
  if (claims.role !== ROLES.SELLER_ADMIN) {
    redirect('/dashboard');
  }

  return (
    <ThemeProvider surface="seller">
      {children}
    </ThemeProvider>
  );
}
