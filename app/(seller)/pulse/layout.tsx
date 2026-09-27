import type { ReactNode } from 'react';
import { redirect } from 'next/navigation';

import { canAccessPulse, sellerHomeRoute } from '@/lib/server/pulse-access';
import { getSellerServerClaims } from '@/lib/server/seller-server-claims';

// Pulse is seller_admin only. Gate in the layout so non-admins are redirected before the
// loading skeleton, the client bundle, or any Pulse query is reached.
export default async function PulseLayout({ children }: { children: ReactNode }) {
  const claims = await getSellerServerClaims();
  if (!claims.tenant_id || !claims.role?.startsWith('seller_')) redirect('/login');
  if (!canAccessPulse(claims.role)) redirect(sellerHomeRoute(claims.role));
  return children;
}
