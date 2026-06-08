import { headers } from 'next/headers';

import { FeatureDisabledState } from '@/components/FeatureGate';
import { DocComposerEstimate } from '@/components/seller/estimates/DocComposerEstimate';
import { FLAGS, getFlag } from '@/lib/flags';

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function EditEstimatePage({ params }: PageProps) {
  const h = await headers();
  const tenantId = h.get('x-verified-tenant-id');

  if (!tenantId) {
    return <FeatureDisabledState />;
  }

  const [orderMgmt, estimates] = await Promise.all([
    getFlag(FLAGS.ORDER_MANAGEMENT, tenantId),
    getFlag(FLAGS.ESTIMATES, tenantId),
  ]);

  if (!orderMgmt || !estimates) {
    return <FeatureDisabledState />;
  }

  const { id } = await params;
  return <DocComposerEstimate mode="edit" estimateId={id} />;
}
