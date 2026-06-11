import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { FeatureForbiddenPage } from '@/components/seller/layout/ForbiddenPage';
import { SalesOrderDetailClient } from '@/components/seller/sales-orders/detail/SalesOrderDetailClient';
import { getFlag, FLAGS } from '@/lib/flags';

interface SalesOrderDetailPageProps {
  params: Promise<{ id: string }>;
}

export default async function SalesOrderDetailPage({ params }: SalesOrderDetailPageProps) {
  const h = await headers();
  const tenantId = h.get('x-verified-tenant-id');
  if (!tenantId) redirect('/dashboard');

  const [orderMgmt, salesOrders] = await Promise.all([
    getFlag(FLAGS.ORDER_MANAGEMENT, tenantId),
    getFlag(FLAGS.SALES_ORDERS, tenantId),
  ]);
  if (!orderMgmt || !salesOrders) return <FeatureForbiddenPage />;

  const { id } = await params;
  return <SalesOrderDetailClient id={id} />;
}
