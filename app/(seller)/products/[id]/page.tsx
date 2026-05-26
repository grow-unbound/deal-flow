'use client';

import { use } from 'react';
import Link from 'next/link';
import { Pencil } from 'lucide-react';
import { SellerTopbar } from '@/components/layout/SellerTopbar';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { InventoryTab } from '@/components/seller/products/InventoryTab';
import { useProduct } from '@/hooks/useProducts';

export default function ProductDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { data, isLoading } = useProduct(id);
  const product = data?.product;

  return (
    <div className="px-8 py-6">
      <SellerTopbar
        title={product?.name_override ?? product?.internal_sku ?? 'Product'}
        action={
          <Link href={`/products/${id}/edit`}>
            <Button size="sm" className="bg-teal-500 text-cream-50 gap-1.5">
              <Pencil size={14} />
              Edit product
            </Button>
          </Link>
        }
      />
      <div className="max-w-5xl">
        {isLoading && (
          <div className="h-40 bg-cream-200 animate-pulse rounded-lg" />
        )}

        {product && (
          <Tabs defaultValue="details">
            <TabsList className="mb-6">
              <TabsTrigger value="details">Details</TabsTrigger>
              <TabsTrigger value="inventory">Inventory</TabsTrigger>
            </TabsList>

            <TabsContent value="details">
              <div className="bg-cream-100 rounded-lg p-6 border border-cream-200 space-y-4">
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="text-cream-600">SKU:</span>{' '}
                    <span className="font-mono">{product.internal_sku}</span>
                  </div>
                  <div>
                    <span className="text-cream-600">MRP:</span>{' '}
                    <span className="font-mono">
                      {product.mrp !== null ? `₹${product.mrp.toLocaleString('en-IN')}` : '—'}
                    </span>
                  </div>
                  <div>
                    <span className="text-cream-600">Selling Price:</span>{' '}
                    <span className="font-mono">
                      {product.base_selling_price !== null
                        ? `₹${product.base_selling_price.toLocaleString('en-IN')}`
                        : '—'}
                    </span>
                  </div>
                  <div>
                    <span className="text-cream-600">GST:</span>{' '}
                    {product.gst_rate != null ? `${product.gst_rate}%` : '—'}
                  </div>
                  <div>
                    <span className="text-cream-600">HSN:</span>{' '}
                    {product.hsn_code ?? '—'}
                  </div>
                  <div>
                    <span className="text-cream-600">UOM:</span>{' '}
                    {product.default_uom ?? '—'}
                  </div>
                  <div>
                    <span className="text-cream-600">Pack size:</span>{' '}
                    {product.pack_size ?? '—'}
                  </div>
                  <div>
                    <span className="text-cream-600">Status:</span>{' '}
                    {product.is_active ? (
                      <span className="inline-flex items-center rounded-full bg-success-50 text-success-700 px-2 py-0.5 text-xs font-medium">
                        Active
                      </span>
                    ) : (
                      <span className="inline-flex items-center rounded-full bg-cream-200 text-cream-600 px-2 py-0.5 text-xs font-medium">
                        Inactive
                      </span>
                    )}
                  </div>
                </div>

                {product.description && (
                  <div className="pt-2 border-t border-cream-200">
                    <p className="text-xs text-cream-600 mb-1">Description</p>
                    <p className="text-sm text-cream-800">{product.description}</p>
                  </div>
                )}

                {product.image_urls && product.image_urls.length > 0 && (
                  <div className="flex gap-2 flex-wrap pt-2 border-t border-cream-200">
                    {product.image_urls.map((url: string, i: number) => (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        key={i}
                        src={url}
                        alt=""
                        className="w-16 h-16 rounded-md object-cover border border-cream-200"
                      />
                    ))}
                  </div>
                )}
              </div>
            </TabsContent>

            <TabsContent value="inventory">
              <InventoryTab productId={id} />
            </TabsContent>
          </Tabs>
        )}
      </div>
    </div>
  );
}
