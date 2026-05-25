'use client';

import Link from 'next/link';
import { Plus } from 'lucide-react';

import { SellerTopbar } from '@/components/layout/SellerTopbar';
import { FeatureGate } from '@/components/FeatureGate';
import { AddBrandCommand } from '@/components/seller/brands/AddBrandCommand';
import { Button } from '@/components/ui/button';
import { useTenantBrands } from '@/hooks/useBrands';
import type { TenantBrand } from '@/hooks/useBrands';

function BrandAvatar({ brand }: { brand: TenantBrand }) {
  const masterBrand = brand.master_brand;
  const displayName = brand.display_name_override ?? masterBrand?.name ?? 'Unknown';
  if (masterBrand?.logo_url) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={masterBrand.logo_url}
        alt={displayName}
        className="w-10 h-10 rounded object-contain"
      />
    );
  }
  const initials = displayName
    .split(' ')
    .map((w: string) => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
  return (
    <span className="w-10 h-10 rounded bg-teal-100 text-teal-700 font-display text-sm font-semibold flex items-center justify-center">
      {initials}
    </span>
  );
}

function BrandCard({ brand }: { brand: TenantBrand }) {
  const displayName = brand.display_name_override ?? brand.master_brand?.name ?? 'Unknown Brand';
  const slug = brand.master_brand?.slug ?? '';

  return (
    <div className="bg-cream-100 rounded-lg shadow-xs border border-cream-200 p-4 flex items-center gap-4">
      <BrandAvatar brand={brand} />
      <div className="flex-1 min-w-0">
        <p className="font-display font-medium text-cream-900 truncate">{displayName}</p>
        {slug && (
          <p className="text-sm text-cream-600 truncate">{slug}</p>
        )}
      </div>
    </div>
  );
}

function BrandsContent() {
  const { data, isLoading, isError } = useTenantBrands();
  const brands = data?.brands ?? [];

  if (isLoading) {
    return (
      <div className="px-8 py-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {[1, 2, 3].map((i) => (
          <div key={i} className="bg-cream-100 rounded-lg border border-cream-200 p-4 h-20 animate-pulse" />
        ))}
      </div>
    );
  }

  if (isError) {
    return (
      <div className="px-8 py-6">
        <p className="text-red-600 text-sm">Failed to load brands. Please refresh.</p>
      </div>
    );
  }

  if (brands.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[40vh] px-6 text-center">
        <p className="font-display text-xl text-cream-900 mb-2">No brands yet</p>
        <p className="text-cream-600 text-sm">
          Click &ldquo;Add Brand&rdquo; to link brands from the master catalog to your account.
        </p>
      </div>
    );
  }

  return (
    <div className="px-8 py-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      {brands.map((brand) => (
        <BrandCard key={brand.id} brand={brand} />
      ))}
    </div>
  );
}

function BrandsActions() {
  return (
    <>
      <Button asChild variant="ghost" size="sm">
        <Link href="/brands/new">
          <Plus className="w-4 h-4 mr-1" />
          Create custom brand
        </Link>
      </Button>
      <AddBrandCommand />
    </>
  );
}

export default function BrandsPage() {
  return (
    <>
      <SellerTopbar title="Brands" action={<BrandsActions />} />
      <div style={{ paddingTop: 'calc(var(--topbar-h) + 24px)' }}>
        <FeatureGate flag="BRAND_PRODUCT_MASTER">
          <BrandsContent />
        </FeatureGate>
      </div>
    </>
  );
}
