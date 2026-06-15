import { SellerTopbar } from '@/components/layout/SellerTopbar';
import { CategoriesSettingsClient } from '@/components/seller/settings/CategoriesSettingsClient';
import { PageWrap } from '@/components/seller/layout';

export default function SettingsCategoriesPage() {
  return (
    <PageWrap>
      <SellerTopbar
        title="Categories"
        subtitle="Organise products and guide buyers through a structured purchase journey."
      />
      <CategoriesSettingsClient />
    </PageWrap>
  );
}
