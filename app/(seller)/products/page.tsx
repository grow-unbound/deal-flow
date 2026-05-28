'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { SellerTopbar } from '@/components/layout/SellerTopbar';
import { FeatureGate } from '@/components/FeatureGate';
import { AddProductSheet } from '@/components/seller/products/AddProductSheet';
import { DataTable } from '@/components/seller/DataTable';
import { Button } from '@/components/ui/button';
import { Package, Plus, Upload } from 'lucide-react';
import { useTenantProducts } from '@/hooks/useProducts';
import type { TenantProduct } from '@/hooks/useProducts';
import { EmptyState, ErrorState } from '@/components/ui/empty-state';

function ProductsTable() {
  const router = useRouter();
  const { data, isLoading, isError, refetch } = useTenantProducts();
  const products = data?.products ?? [];

  if (isLoading) {
    return <DataTable data={[]} loading loadingMessage="Loading products..." columns={[]} />;
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
    <DataTable
      data={products}
      columns={[
        {
          key: 'product',
          header: 'Product',
          accessor: (product) => (
            <div className="flex items-center gap-3">
              {product.master_product?.image_urls?.[0] ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={product.master_product.image_urls[0]}
                  alt={product.display_name}
                  className="h-9 w-9 rounded-md object-cover shrink-0"
                />
              ) : (
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-cream-200">
                  <Package size={16} className="text-cream-500" />
                </span>
              )}
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-cream-900">{product.display_name}</p>
                {product.master_product?.master_sku ? (
                  <p className="mt-0.5 font-mono text-[11px] text-cream-700">{product.master_product.master_sku}</p>
                ) : null}
              </div>
            </div>
          ),
        },
        {
          key: 'brand_name',
          header: 'Brand',
          accessor: (product) => <span className="text-cream-700">{product.brand_name ?? '—'}</span>,
        },
        {
          key: 'internal_sku',
          header: 'Internal SKU',
          accessor: (product) => <span className="font-mono text-sm text-cream-800">{product.internal_sku}</span>,
        },
        {
          key: 'mrp',
          header: 'MRP',
          align: 'right',
          accessor: (product) => (
            <span className="font-mono text-sm text-cream-800">
              {product.mrp !== null ? `₹${product.mrp.toLocaleString('en-IN')}` : '—'}
            </span>
          ),
        },
        {
          key: 'base_selling_price',
          header: 'Base Price',
          align: 'right',
          accessor: (product) => (
            <span className="font-mono text-sm text-cream-800">
              {product.base_selling_price !== null
                ? `₹${product.base_selling_price.toLocaleString('en-IN')}`
                : '—'}
            </span>
          ),
        },
        {
          key: 'cost_price',
          header: 'Cost Price',
          align: 'right',
          accessor: (product) => (
            <span className="font-mono text-sm text-cream-800">
              {product.cost_price !== null ? `₹${product.cost_price.toLocaleString('en-IN')}` : '—'}
            </span>
          ),
        },
        {
          key: 'status',
          header: 'Status',
          accessor: (product) => (
            <span
              className={[
                'inline-flex items-center rounded-full px-2.5 py-1 text-[10.5px] font-semibold uppercase tracking-[0.1em]',
                product.is_active ? 'bg-emerald-50 text-success-700' : 'bg-cream-200 text-cream-600',
              ].join(' ')}
            >
              {product.is_active ? 'Active' : 'Inactive'}
            </span>
          ),
        },
      ]}
      onRowClick={(product) => router.push(`/products/${product.id}`)}
    />
  );
}

function ProductsTopbarActions() {
  return (
    <div className="flex items-center gap-2">
      <Button asChild variant="outline" className="gap-1.5">
        <Link href="/products/import">
          <Upload size={14} />
          Import CSV
        </Link>
      </Button>
      <Button asChild variant="outline" className="gap-1.5">
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
    <div className="px-8 py-6">
      <SellerTopbar
        title="Products"
        subtitle="Track every SKU, pricing baseline, and activation status in a single seller catalog."
        action={<ProductsTopbarActions />}
      />
      <FeatureGate flag="BRAND_PRODUCT_MASTER">
        <ProductsTable />
      </FeatureGate>
    </div>
  );
}
