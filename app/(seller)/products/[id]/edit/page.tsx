'use client';

import { use } from 'react';
import { SellerTopbar } from '@/components/layout/SellerTopbar';
import { EditProductForm } from '@/components/seller/products/EditProductForm';
import { useProduct } from '@/hooks/useProducts';
import { Package } from 'lucide-react';

interface EditProductPageProps {
  params: Promise<{ id: string }>;
}

function EditProductContent({ id }: { id: string }) {
  const { data, isLoading, isError } = useProduct(id);

  if (isLoading) {
    return (
      <div className="mx-auto max-w-3xl space-y-4 px-8 py-6">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="h-12 bg-cream-200 rounded animate-pulse" />
        ))}
      </div>
    );
  }

  if (isError || !data?.product) {
    return (
      <div className="flex min-h-[40vh] flex-col items-center justify-center px-8">
        <span className="w-14 h-14 rounded-full bg-cream-200 flex items-center justify-center mb-4">
          <Package size={24} className="text-cream-500" />
        </span>
        <p className="text-cream-900 font-medium">Product not found</p>
        <p className="text-cream-600 text-sm mt-1">
          This product does not exist or you do not have access to it.
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl px-8 py-6">
      <EditProductForm product={data.product as Parameters<typeof EditProductForm>[0]['product']} />
    </div>
  );
}

export default function EditProductPage({ params }: EditProductPageProps) {
  const { id } = use(params);

  return (
    <>
      <SellerTopbar title="Edit product" />
      <EditProductContent id={id} />
    </>
  );
}
