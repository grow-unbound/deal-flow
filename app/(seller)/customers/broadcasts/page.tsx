import { FeatureForbiddenPage } from '@/components/seller/layout/ForbiddenPage';
import { ManageBroadcastsClient } from '@/components/seller/customers/ManageBroadcastsClient';
import type { BroadcastsPageResponse } from '@/hooks/useWhatsAppBroadcasts';
import { fetchSellerPageBootstrap } from '@/lib/server/seller-page-bootstrap';
import { requireSellerServerTenantId } from '@/lib/server/seller-server-claims';

export default async function ManageBroadcastsPage() {
  await requireSellerServerTenantId();

  const { data: initialData, status } = await fetchSellerPageBootstrap<BroadcastsPageResponse>(
    '/api/whatsapp/broadcasts?limit=50&offset=0&status=all&sort=date_desc',
  );

  if (status === 403) return <FeatureForbiddenPage />;

  return <ManageBroadcastsClient initialData={initialData} />;
}
