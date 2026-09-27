import { redirect } from 'next/navigation';

import { sellerHomeRoute } from '@/lib/server/pulse-access';
import { getSellerServerClaims } from '@/lib/server/seller-server-claims';

export default async function DashboardRedirectPage() {
  const claims = await getSellerServerClaims();
  redirect(sellerHomeRoute(claims.role));
}
