import { BillingSettingsClient } from '@/components/seller/settings/BillingSettingsClient';
import { sellerPageTitle, SELLER_PAGE_TITLES } from '@/lib/page-titles';

export const metadata = sellerPageTitle(SELLER_PAGE_TITLES.settingsBilling);

export default function SettingsBillingPage() {
  return <BillingSettingsClient />;
}
