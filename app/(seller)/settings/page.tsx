'use client';

import { SellerTopbar } from '@/components/layout/SellerTopbar';
import { GeneralSettingsForm } from '@/components/seller/settings/GeneralSettingsForm';
import { PageWrap } from '@/components/seller/layout';

export default function SettingsPage() {
  return (
    <PageWrap>
      <SellerTopbar
        eyebrow="Settings"
        title="Settings"
        subtitle="Manage your business profile, policies, and feature configuration."
      />
      <GeneralSettingsForm />
    </PageWrap>
  );
}
