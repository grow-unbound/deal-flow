import { headers } from 'next/headers';

import { FeatureDisabledState } from '@/components/FeatureGate';
import { DocComposerSalesOrder } from '@/components/seller/sales-orders/DocComposerSalesOrder';
import { FLAGS, getFlag } from '@/lib/flags';

export default async function NewSalesOrderPage({
  searchParams,
}: {
  searchParams: Promise<{ fromEstimate?: string }>;
}) {
  const h = await headers();
  const params = await searchParams;
  const tenantId = h.get('x-verified-tenant-id');

  if (!tenantId) {
    return <FeatureDisabledState />;
  }

  const [orderMgmt, salesOrders] = await Promise.all([
    getFlag(FLAGS.ORDER_MANAGEMENT, tenantId),
    getFlag(FLAGS.SALES_ORDERS, tenantId),
  ]);

  if (!orderMgmt || !salesOrders) {
    return <FeatureDisabledState />;
  }

  return <DocComposerSalesOrder mode="create" fromEstimateId={params.fromEstimate} />;
}
