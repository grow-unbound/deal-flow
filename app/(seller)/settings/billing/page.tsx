import { SellerTopbar } from '@/components/layout/SellerTopbar';
import { BillingSettingsClient } from '@/components/seller/settings/BillingSettingsClient';
import { PageWrap } from '@/components/seller/layout';
import { sellerPageTitle, SELLER_PAGE_TITLES } from '@/lib/page-titles';

export const metadata = sellerPageTitle(SELLER_PAGE_TITLES.settingsBilling);

export default function SettingsBillingPage() {
  return (
    <PageWrap>
      <SellerTopbar
        eyebrow="Settings"
        title="Billing & Plan"
        subtitle="WhatsApp credit balance and message usage."
      />
      <BillingSettingsClient />
    </PageWrap>
  );
}
