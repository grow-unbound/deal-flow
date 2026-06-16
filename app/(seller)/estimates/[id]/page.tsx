import { FeatureForbiddenPage } from '@/components/seller/layout/ForbiddenPage';
import { EstimateDetailPage } from '@/components/seller/estimates/detail/EstimateDetailPage';
import { getFlag, FLAGS } from '@/lib/flags';
import { requireSellerServerTenantId } from '@/lib/server/seller-server-claims';

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function EstimateDetailRoutePage({ params }: PageProps) {
  const tenantId = await requireSellerServerTenantId();

  const [orderMgmt, estimates] = await Promise.all([
    getFlag(FLAGS.ORDER_MANAGEMENT, tenantId),
    getFlag(FLAGS.ESTIMATES, tenantId),
  ]);
  if (!orderMgmt || !estimates) return <FeatureForbiddenPage />;

  const { id } = await params;
  return <EstimateDetailPage id={id} />;
}
