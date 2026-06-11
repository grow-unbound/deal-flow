import { SellerTopbar } from '@/components/layout/SellerTopbar';
import { PageWrap } from '@/components/seller/layout';
import { ModuleSettingsForm } from '@/components/seller/settings/ModuleSettingsForm';

export default function SettingsModulesPage() {
  return (
    <PageWrap>
      <SellerTopbar
        title="Feature Modules"
        subtitle="Turn features on or off and configure how they work for your business."
      />
      <ModuleSettingsForm />
    </PageWrap>
  );
}
