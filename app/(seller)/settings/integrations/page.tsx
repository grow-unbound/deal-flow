import { SellerTopbar } from '@/components/layout/SellerTopbar';
import { PageWrap } from '@/components/seller/layout';

export default function SettingsIntegrationsPage() {
  return (
    <PageWrap>
      <SellerTopbar title="Integrations" subtitle="Connect Zoho, WhatsApp, and other services. Coming soon." />
      <div className="rounded-lg border border-cream-300 bg-white p-8 shadow-xs">
        <p className="text-body text-cream-600">This section is under construction.</p>
      </div>
    </PageWrap>
  );
}
