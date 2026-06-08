import { headers } from 'next/headers';

import { FeatureDisabledState } from '@/components/FeatureGate';
import { DocComposerInvoice } from '@/components/seller/invoices/DocComposerInvoice';
import { FLAGS, getFlag } from '@/lib/flags';

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function EditInvoicePage({ params }: PageProps) {
  const h = await headers();
  const tenantId = h.get('x-verified-tenant-id');

  if (!tenantId) {
    return <FeatureDisabledState />;
  }

  const [orderMgmt, invoices] = await Promise.all([
    getFlag(FLAGS.ORDER_MANAGEMENT, tenantId),
    getFlag(FLAGS.INVOICES, tenantId),
  ]);

  if (!orderMgmt || !invoices) {
    return <FeatureDisabledState />;
  }

  const { id } = await params;
  return <DocComposerInvoice mode="edit" invoiceId={id} />;
}
