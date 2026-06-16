import { FeatureForbiddenPage } from '@/components/seller/layout/ForbiddenPage';
import { SellerTopbar } from '@/components/layout/SellerTopbar';
import { PageWrap } from '@/components/seller/layout';
import { IntegrationsSettingsClient } from '@/components/seller/settings/IntegrationsSettingsClient';
import { getFlag, FLAGS } from '@/lib/flags';
import { requireSellerServerTenantId } from '@/lib/server/seller-server-claims';

export default async function SettingsIntegrationsPage() {
  const tenantId = await requireSellerServerTenantId();

  if (!(await getFlag(FLAGS.INTEGRATIONS, tenantId))) return <FeatureForbiddenPage />;

  return (
    <PageWrap>
      <SellerTopbar
        eyebrow="Settings"
        title="Integrations"
        subtitle="Connect accounting and ERP tools behind PostHog-controlled rollout flags."
      />
      <IntegrationsSettingsClient />
    </PageWrap>
  );
}
