import { FeatureForbiddenPage } from '@/components/seller/layout/ForbiddenPage';
import { SalesOrderDetailClient } from '@/components/seller/sales-orders/detail/SalesOrderDetailClient';
import { getFlag, FLAGS } from '@/lib/flags';
import { requireSellerServerTenantId } from '@/lib/server/seller-server-claims';

interface SalesOrderDetailPageProps {
  params: Promise<{ id: string }>;
}

export default async function SalesOrderDetailPage({ params }: SalesOrderDetailPageProps) {
  const tenantId = await requireSellerServerTenantId();

  const [orderMgmt, salesOrders] = await Promise.all([
    getFlag(FLAGS.ORDER_MANAGEMENT, tenantId),
    getFlag(FLAGS.SALES_ORDERS, tenantId),
  ]);
  if (!orderMgmt || !salesOrders) return <FeatureForbiddenPage />;

  const { id } = await params;
  return <SalesOrderDetailClient id={id} />;
}
