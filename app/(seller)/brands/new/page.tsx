'use client';

import { SellerTopbar } from '@/components/layout/SellerTopbar';
import { CreateBrandForm } from '@/components/seller/brands/CreateBrandForm';

export default function NewBrandPage() {
  return (
    <>
      <SellerTopbar title="New Brand" />
      <div style={{ paddingTop: 'calc(var(--topbar-h) + 24px)' }}>
        <div className="max-w-2xl mx-auto px-8 py-6">
          <CreateBrandForm />
        </div>
      </div>
    </>
  );
}
