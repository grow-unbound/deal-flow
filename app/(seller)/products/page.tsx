'use client';

import Link from 'next/link';
import { SellerTopbar } from '@/components/layout/SellerTopbar';
import { FeatureGate } from '@/components/FeatureGate';
import { AddProductSheet } from '@/components/seller/products/AddProductSheet';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Package, Plus, Upload } from 'lucide-react';
import { useTenantProducts } from '@/hooks/useProducts';
import type { TenantProduct } from '@/hooks/useProducts';
import { EmptyState, ErrorState } from '@/components/ui/empty-state';

function ProductRow({ product }: { product: TenantProduct }) {
  return (
    <TableRow>
      <TableCell>
        <Link href={`/products/${product.id}`} className="flex items-center gap-3 hover:underline">
          {product.master_product?.image_urls?.[0] ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={product.master_product.image_urls[0]}
              alt={product.display_name}
              className="w-9 h-9 rounded-md object-cover shrink-0"
            />
          ) : (
            <span className="w-9 h-9 rounded-md bg-cream-200 flex items-center justify-center shrink-0">
              <Package size={16} className="text-cream-500" />
            </span>
          )}
          <div className="min-w-0">
            <p className="text-sm font-medium text-cream-900 truncate">{product.display_name}</p>
            {product.master_product?.master_sku && (
              <p className="text-xs text-cream-500 font-mono">{product.master_product.master_sku}</p>
            )}
          </div>
        </Link>
      </TableCell>
      <TableCell className="text-sm text-cream-700">{product.brand_name ?? '—'}</TableCell>
      <TableCell className="font-mono text-sm text-cream-800">{product.internal_sku}</TableCell>
      <TableCell className="font-mono text-sm text-right text-cream-800">
        {product.mrp !== null ? `₹${product.mrp.toLocaleString('en-IN')}` : '—'}
      </TableCell>
      <TableCell className="font-mono text-sm text-right text-cream-800">
        {product.base_selling_price !== null
          ? `₹${product.base_selling_price.toLocaleString('en-IN')}`
          : '—'}
      </TableCell>
      <TableCell>
        {product.is_active ? (
          <span className="inline-flex items-center rounded-full bg-success-50 text-success-700 px-2 py-0.5 text-xs font-medium">
            Active
          </span>
        ) : (
          <span className="inline-flex items-center rounded-full bg-cream-200 text-cream-600 px-2 py-0.5 text-xs font-medium">
            Inactive
          </span>
        )}
      </TableCell>
    </TableRow>
  );
}

function ProductsTable() {
  const { data, isLoading, isError, refetch } = useTenantProducts();
  const products = data?.products ?? [];

  if (isLoading) {
    return (
      <div className="border border-cream-200 rounded-lg overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Product</TableHead>
              <TableHead>Brand</TableHead>
              <TableHead>Internal SKU</TableHead>
              <TableHead className="text-right">MRP</TableHead>
              <TableHead className="text-right">Base Price</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {[1, 2, 3, 4].map((i) => (
              <TableRow key={i}>
                {[1, 2, 3, 4, 5, 6].map((j) => (
                  <TableCell key={j}>
                    <div className="h-4 bg-cream-200 rounded animate-pulse" />
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    );
  }

  if (isError) {
    return (
      <ErrorState
        heading="Couldn't load products"
        description="There was a problem fetching your product list. Please try again."
        onRetry={() => refetch()}
      />
    );
  }

  if (products.length === 0) {
    return (
      <EmptyState
        icon={<Package size={28} strokeWidth={1.5} />}
        heading="No products yet"
        description="Search the master catalog and add products to your tenant inventory."
      />
    );
  }

  return (
    <div className="border border-cream-200 rounded-lg overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Product</TableHead>
            <TableHead>Brand</TableHead>
            <TableHead>Internal SKU</TableHead>
            <TableHead className="text-right">MRP</TableHead>
            <TableHead className="text-right">Base Price</TableHead>
            <TableHead>Status</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {products.map((product) => (
            <ProductRow key={product.id} product={product} />
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function ProductsTopbarActions() {
  return (
    <div className="flex items-center gap-2">
      <Button asChild variant="outline" size="sm" className="gap-1.5">
        <Link href="/products/import">
          <Upload size={14} />
          Import CSV
        </Link>
      </Button>
      <Button asChild variant="outline" size="sm" className="gap-1.5">
        <Link href="/products/new">
          <Plus size={14} />
          Create custom product
        </Link>
      </Button>
      <AddProductSheet />
    </div>
  );
}

export default function ProductsPage() {
  return (
    <>
      <SellerTopbar title="Products" action={<ProductsTopbarActions />} />
      <div className="px-8 py-6" style={{ paddingTop: 'calc(var(--topbar-h) + 24px)' }}>
        <FeatureGate flag="BRAND_PRODUCT_MASTER">
          <ProductsTable />
        </FeatureGate>
      </div>
    </>
  );
}
