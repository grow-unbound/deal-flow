import { ReactNode } from 'react';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { ThemeProvider } from '@/components/providers/ThemeProvider';
import { SellerShell } from '@/components/layout/SellerShell';

export default async function SellerLayout({ children }: { children: ReactNode }) {
  const h = await headers();
  const role = h.get('x-verified-role');
  const tenantId = h.get('x-verified-tenant-id');

  if (!tenantId || !role?.startsWith('seller_')) {
    redirect('/login');
  }

  return (
    <ThemeProvider surface="seller">
      <SellerShell>{children}</SellerShell>
    </ThemeProvider>
  );
}
