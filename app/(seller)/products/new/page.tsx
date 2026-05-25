'use client';

import { SellerTopbar } from '@/components/layout/SellerTopbar';
import { CreateProductForm } from '@/components/seller/products/CreateProductForm';

export default function NewProductPage() {
  return (
    <>
      <SellerTopbar title="New Product" />
      <div
        className="px-8 max-w-4xl mx-auto"
        style={{ paddingTop: 'calc(var(--topbar-h) + 24px)', paddingBottom: '48px' }}
      >
        <CreateProductForm />
      </div>
    </>
  );
}
