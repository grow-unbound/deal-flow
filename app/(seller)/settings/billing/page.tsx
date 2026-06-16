import { SellerTopbar } from '@/components/layout/SellerTopbar';
import { BillingSettingsClient } from '@/components/seller/settings/BillingSettingsClient';
import { PageWrap } from '@/components/seller/layout';

export default function SettingsBillingPage() {
  return (
    <PageWrap>
      <SellerTopbar
        eyebrow="Settings"
        title="Billing & Plan"
        subtitle="Your current plan, usage against limits, and WhatsApp credit balance."
      />
      <BillingSettingsClient />
    </PageWrap>
  );
}
