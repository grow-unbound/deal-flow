import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { FeatureForbiddenPage } from '@/components/seller/layout/ForbiddenPage';

import { InvoiceDetailPage } from '@/components/seller/invoices/detail/InvoiceDetailPage';
import { getFlag, FLAGS } from '@/lib/flags';

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function InvoiceDetailRoutePage({ params }: PageProps) {
  const h = await headers();
  const tenantId = h.get('x-verified-tenant-id');
  if (!tenantId) redirect('/dashboard');

  const [orderMgmt, invoices] = await Promise.all([
    getFlag(FLAGS.ORDER_MANAGEMENT, tenantId),
    getFlag(FLAGS.INVOICES, tenantId),
  ]);
  if (!orderMgmt || !invoices) return <FeatureForbiddenPage />;

  const { id } = await params;
  return <InvoiceDetailPage id={id} />;
}
