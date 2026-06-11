'use client';

import { SellerTopbar } from '@/components/layout/SellerTopbar';
import { GeneralSettingsForm } from '@/components/seller/settings/GeneralSettingsForm';
import { PageWrap } from '@/components/seller/layout';

export default function SettingsPage() {
  return (
    <PageWrap>
      <SellerTopbar
        title="General"
        subtitle="Your business identity and WhatsApp notification preferences."
      />
      <GeneralSettingsForm />
    </PageWrap>
  );
}
