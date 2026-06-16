import { FeatureForbiddenPage } from '@/components/seller/layout/ForbiddenPage';

import { InvoiceDetailPage } from '@/components/seller/invoices/detail/InvoiceDetailPage';
import { getFlag, FLAGS } from '@/lib/flags';
import { requireSellerServerTenantId } from '@/lib/server/seller-server-claims';

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function InvoiceDetailRoutePage({ params }: PageProps) {
  const tenantId = await requireSellerServerTenantId();

  const [orderMgmt, invoices] = await Promise.all([
    getFlag(FLAGS.ORDER_MANAGEMENT, tenantId),
    getFlag(FLAGS.INVOICES, tenantId),
  ]);
  if (!orderMgmt || !invoices) return <FeatureForbiddenPage />;

  const { id } = await params;
  return <InvoiceDetailPage id={id} />;
}
