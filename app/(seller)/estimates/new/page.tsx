import { headers } from 'next/headers';

import { FeatureDisabledState } from '@/components/FeatureGate';
import { DocComposerEstimate } from '@/components/seller/estimates/DocComposerEstimate';
import { FLAGS, getFlag } from '@/lib/flags';
import { getInAppCreateFlagsCached } from '@/lib/server/seller-features';

export default async function NewEstimatePage() {
  const h = await headers();
  const tenantId = h.get('x-verified-tenant-id');

  if (!tenantId) {
    return <FeatureDisabledState />;
  }

  const [orderMgmt, estimates, createFlags] = await Promise.all([
    getFlag(FLAGS.ORDER_MANAGEMENT, tenantId),
    getFlag(FLAGS.ESTIMATES, tenantId),
    getInAppCreateFlagsCached(tenantId),
  ]);

  if (!orderMgmt || !estimates || !createFlags.create_enquiries) {
    return <FeatureDisabledState />;
  }

  return <DocComposerEstimate mode="create" />;
}
