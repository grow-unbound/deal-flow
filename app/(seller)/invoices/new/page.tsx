import { headers } from 'next/headers';

import { FeatureDisabledState } from '@/components/FeatureGate';
import { DocComposerInvoice } from '@/components/seller/invoices/DocComposerInvoice';
import { FLAGS, getFlag } from '@/lib/flags';
import { getInAppCreateFlags } from '@/lib/server/seller-features';

export default async function NewInvoicePage() {
  const h = await headers();
  const tenantId = h.get('x-verified-tenant-id');

  if (!tenantId) {
    return <FeatureDisabledState />;
  }

  const [orderMgmt, invoices, createFlags] = await Promise.all([
    getFlag(FLAGS.ORDER_MANAGEMENT, tenantId),
    getFlag(FLAGS.INVOICES, tenantId),
    getInAppCreateFlags(tenantId),
  ]);

  if (!orderMgmt || !invoices || !createFlags.create_invoices) {
    return <FeatureDisabledState />;
  }

  return <DocComposerInvoice mode="create" />;
}
