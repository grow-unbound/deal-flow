import type { ReactNode } from 'react';
import { headers } from 'next/headers';

import { RoleForbiddenPage } from '@/components/seller/layout/ForbiddenPage';

export default async function SettingsLayout({ children }: { children: ReactNode }) {
  const h = await headers();
  if (h.get('x-verified-role') !== 'seller_admin') {
    return <RoleForbiddenPage />;
  }
  return children;
}
