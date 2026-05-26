'use client';

import { SellerTopbar } from '@/components/layout/SellerTopbar';
import { CreateBrandForm } from '@/components/seller/brands/CreateBrandForm';

export default function NewBrandPage() {
  return (
    <div className="px-8 py-6">
      <SellerTopbar title="New Brand" />
      <div className="mx-auto max-w-2xl">
        <CreateBrandForm />
      </div>
    </div>
  );
}
