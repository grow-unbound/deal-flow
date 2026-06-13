import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { FeatureForbiddenPage } from '@/components/seller/layout/ForbiddenPage';
import { SellerTopbar } from '@/components/layout/SellerTopbar';
import { PageWrap } from '@/components/seller/layout';
import { IntegrationsSettingsClient } from '@/components/seller/settings/IntegrationsSettingsClient';
import { getFlag, FLAGS } from '@/lib/flags';

export default async function SettingsIntegrationsPage() {
  const h = await headers();
  const tenantId = h.get('x-verified-tenant-id');
  if (!tenantId) redirect('/dashboard');

  if (!(await getFlag(FLAGS.INTEGRATIONS, tenantId))) return <FeatureForbiddenPage />;

  return (
    <PageWrap>
      <SellerTopbar
        title="Integrations"
        subtitle="Connect accounting and ERP tools behind PostHog-controlled rollout flags."
      />
      <IntegrationsSettingsClient />
    </PageWrap>
  );
}
