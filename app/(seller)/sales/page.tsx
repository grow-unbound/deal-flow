import { redirect } from 'next/navigation';
import { getSellerShellFeatureAvailability } from '@/lib/server/seller-features';
import { requireSellerServerTenantId } from '@/lib/server/seller-server-claims';
import { SELLER_ROUTES } from '@/lib/seller-routes';

export default async function SalesPage() {
  const tenantId = await requireSellerServerTenantId();
  const availability = await getSellerShellFeatureAvailability(tenantId);
  if (availability.invoices) redirect(SELLER_ROUTES.sales.invoices);
  if (availability.salesOrders) redirect(SELLER_ROUTES.sales.orders);
  if (availability.estimates) redirect(SELLER_ROUTES.sales.estimates);
  redirect(SELLER_ROUTES.pulse);
}
