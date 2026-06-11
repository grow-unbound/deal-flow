import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { FeatureForbiddenPage } from '@/components/seller/layout/ForbiddenPage';
import { EstimateDetailPage } from '@/components/seller/estimates/detail/EstimateDetailPage';
import { getFlag, FLAGS } from '@/lib/flags';

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function EstimateDetailRoutePage({ params }: PageProps) {
  const h = await headers();
  const tenantId = h.get('x-verified-tenant-id');
  if (!tenantId) redirect('/dashboard');

  const [orderMgmt, estimates] = await Promise.all([
    getFlag(FLAGS.ORDER_MANAGEMENT, tenantId),
    getFlag(FLAGS.ESTIMATES, tenantId),
  ]);
  if (!orderMgmt || !estimates) return <FeatureForbiddenPage />;

  const { id } = await params;
  return <EstimateDetailPage id={id} />;
}
