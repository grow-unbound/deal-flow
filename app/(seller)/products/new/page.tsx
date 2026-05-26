'use client';

import { SellerTopbar } from '@/components/layout/SellerTopbar';
import { CreateProductForm } from '@/components/seller/products/CreateProductForm';

export default function NewProductPage() {
  return (
    <div className="px-8 py-6">
      <SellerTopbar title="New Product" />
      <div className="mx-auto max-w-4xl pb-12">
        <CreateProductForm />
      </div>
    </div>
  );
}
