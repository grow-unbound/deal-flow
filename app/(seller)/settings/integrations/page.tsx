import { FeatureForbiddenPage } from '@/components/seller/layout/ForbiddenPage';
import { PageWrap } from '@/components/seller/layout';
import { IntegrationsSettingsClient } from '@/components/seller/settings/IntegrationsSettingsClient';
import { getFlag, FLAGS } from '@/lib/flags';
import { loadIntegrationsSettingsPayload } from '@/lib/integrations/server';
import { requireSellerServerTenantId } from '@/lib/server/seller-server-claims';

export default async function SettingsIntegrationsPage() {
  const tenantId = await requireSellerServerTenantId();
  const [flagEnabled, payload] = await Promise.all([
    getFlag(FLAGS.INTEGRATIONS, tenantId),
    loadIntegrationsSettingsPayload(tenantId),
  ]);

  if (!flagEnabled && !payload.catalog.some((integration) => integration.integration !== null)) return <FeatureForbiddenPage />;

  return (
    <PageWrap>
      <IntegrationsSettingsClient initialData={payload} />
    </PageWrap>
  );
}
