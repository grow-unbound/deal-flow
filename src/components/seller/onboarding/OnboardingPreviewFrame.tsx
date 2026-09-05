'use client';

import Image from 'next/image';
import {
  ArrowLeft,
  ArrowRight,
  ChevronDown,
  Lock,
  ReceiptText,
  RotateCw,
  Search,
  ShoppingCart,
  Store,
  User,
} from 'lucide-react';
import { BuyerCartProvider } from '@/contexts/BuyerCartContext';
import { DiscoveryThumbTile } from '@/components/buyer/catalog/DiscoveryThumbTile';
import { ProductGrid } from '@/components/buyer/catalog/ProductGrid';
import { BuyerHorizontalScroll } from '@/components/buyer/layout/BuyerHorizontalScroll';
import { BuyerSectionRow } from '@/components/buyer/layout/BuyerSectionRow';
import { TenantLogo } from '@/components/brand/TenantLogo';
import { cn } from '@/lib/utils';
import { guestPriceReveal } from '@/lib/buyer-ui';
import type { CatalogPricingMode } from '@/lib/server/public-catalog';
import type { BuyerBrand, BuyerCatalogItem, BuyerCategory } from '@/types/buyer';

export function OnboardingPreviewFrame({
  slug,
  businessName,
  logoUrl,
  items,
  brands,
  categories,
  pricingMode,
}: {
  slug: string;
  businessName: string;
  logoUrl?: string | null;
  items: BuyerCatalogItem[];
  brands: BuyerBrand[];
  categories: BuyerCategory[];
  pricingMode?: CatalogPricingMode | '' | null;
}): React.ReactNode {
  const host = `${slug || 'your-catalog'}.useyukti.in`;
  const priceReveal = guestPriceReveal(pricingMode);

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-xl border border-cream-300 bg-white shadow-sm">
      <div className="flex shrink-0 items-center gap-2 border-b border-cream-200 bg-cream-100 px-3 py-2">
        <div className="flex items-center gap-1.5 pr-1">
          <span className="h-3 w-3 rounded-full bg-danger-500" aria-hidden />
          <span className="h-3 w-3 rounded-full bg-warning-500" aria-hidden />
          <span className="h-3 w-3 rounded-full bg-success-500" aria-hidden />
        </div>
        <div className="hidden items-center gap-0.5 text-cream-500 sm:flex">
          <span className="inline-flex h-7 w-7 items-center justify-center rounded-md">
            <ArrowLeft className="h-3.5 w-3.5" />
          </span>
          <span className="inline-flex h-7 w-7 items-center justify-center rounded-md">
            <ArrowRight className="h-3.5 w-3.5" />
          </span>
          <span className="inline-flex h-7 w-7 items-center justify-center rounded-md">
            <RotateCw className="h-3.5 w-3.5" />
          </span>
        </div>
        <div className="flex min-w-0 flex-1 items-center gap-2 rounded-full border border-cream-200 bg-white px-3 py-1.5">
          <Lock className="h-3 w-3 shrink-0 text-cream-500" />
          <span className="truncate font-mono text-xs text-cream-800">{host}</span>
        </div>
      </div>

      <BuyerCartProvider>
        <div
          className="min-h-0 flex-1 overflow-y-auto bg-[var(--bg-page,var(--cream-50))]"
          onClickCapture={(event) => {
            const target = event.target as HTMLElement | null;
            if (target?.closest('a,button')) {
              event.preventDefault();
              event.stopPropagation();
            }
          }}
        >
          <PreviewMobileHeader businessName={businessName} logoUrl={logoUrl} />
          <PreviewDesktopHeader businessName={businessName} logoUrl={logoUrl} />
          <div className="mx-auto w-full max-w-[1440px] px-3 pb-8 pt-4 md:px-5">
            {brands.length > 0 ? (
              <section>
                <BuyerSectionRow title="Brands" className="px-1 pb-3" />
                <BuyerHorizontalScroll className="items-stretch gap-2 px-1">
                  {brands.slice(0, 24).map((brand) => (
                    <DiscoveryThumbTile
                      key={brand.id}
                      href="#preview"
                      label={brand.name}
                      imageUrl={brand.logo_url}
                      entityKind="brand"
                      variant="scroll"
                      className="!w-[100px] max-w-[100px] shrink-0"
                    />
                  ))}
                </BuyerHorizontalScroll>
              </section>
            ) : null}
            {categories.length > 0 ? (
              <section className="pt-10">
                <BuyerSectionRow title="Categories" className="px-1 pb-3" />
                <BuyerHorizontalScroll className="items-stretch gap-2 px-1">
                  {categories.slice(0, 24).map((category) => (
                    <DiscoveryThumbTile
                      key={category.id}
                      href="#preview"
                      label={category.name}
                      imageUrl={category.image_url}
                      entityKind="category"
                      className="w-[160px] shrink-0 sm:w-[180px]"
                    />
                  ))}
                </BuyerHorizontalScroll>
              </section>
            ) : null}
            <section className={cn('pb-4', brands.length > 0 || categories.length > 0 ? 'pt-10' : 'pt-1')}>
              <BuyerSectionRow title="All products" className="px-1 pb-3" />
              {items.length > 0 ? (
                <ProductGrid items={items} showPromotionBadge={false} priceReveal={priceReveal} />
              ) : (
                <p className="px-1 text-body-sm text-cream-600">Import products to see them here.</p>
              )}
            </section>
          </div>
        </div>
      </BuyerCartProvider>
    </div>
  );
}

function PreviewMobileHeader({
  businessName,
  logoUrl,
}: {
  businessName: string;
  logoUrl?: string | null;
}): React.ReactNode {
  return (
    <header className="sticky top-0 z-[15] border-b border-cream-200 bg-[var(--cream-50)] md:hidden">
      <div className="flex items-center justify-between gap-3 px-4 pb-2 pt-4">
        <div className="flex min-w-0 items-center gap-3">
          <TenantLogo name={businessName} logoUrl={logoUrl} size={44} className="rounded-[10px]" />
          <div className="min-w-0">
            <p className="truncate text-base font-semibold text-cream-900">{businessName}</p>
            <p className="text-xs font-medium uppercase tracking-[0.14em] text-cream-500">Catalog</p>
          </div>
        </div>
      </div>
      <div className="px-4 pb-3">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-cream-500" />
          <div className="h-11 rounded-[12px] border border-cream-300 bg-white pl-10 pr-3 text-body-sm leading-[2.75rem] text-cream-500">
            Search products, SKU, brand…
          </div>
        </div>
      </div>
    </header>
  );
}

function PreviewDesktopHeader({
  businessName,
  logoUrl,
}: {
  businessName: string;
  logoUrl?: string | null;
}): React.ReactNode {
  return (
    <header className="sticky top-0 z-[15] hidden border-b border-cream-200 bg-[var(--cream-50)] md:block">
      <div className="flex min-h-[64px] w-full items-center gap-4 px-5 py-2.5">
        <div className="flex min-w-0 shrink-0 items-center gap-1.5">
          {logoUrl ? (
            <Image
              src={logoUrl}
              alt={businessName}
              width={64}
              height={52}
              className="h-[3.25rem] w-auto max-w-16 object-contain object-left"
              unoptimized
            />
          ) : (
            <span className="shrink-0 text-[length:var(--b-text-label)] font-semibold text-cream-950">
              {businessName}
            </span>
          )}
          <span className="h-5 w-px shrink-0 bg-cream-200" aria-hidden />
          <span className="inline-flex items-center gap-2 rounded-[12px] px-2 py-1.5 text-cream-800">
            <Store className="h-4 w-4" />
            <span className="flex flex-col leading-none">
              <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-cream-500">Store</span>
              <span className="mt-0.5 text-body-sm font-medium">Main</span>
            </span>
            <ChevronDown className="h-3.5 w-3.5 text-cream-500" />
          </span>
        </div>

        <div className="flex min-w-[200px] flex-1 justify-center">
          <div className="relative w-full min-w-0 max-w-[760px]">
            <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-cream-500" />
            <div className="h-11 w-full rounded-[12px] border border-cream-300 bg-[var(--cream-50)] pl-11 pr-20 text-[length:var(--b-text-sub)] leading-[2.75rem] text-cream-500">
              Search products, SKU, brand…
            </div>
            <span className="pointer-events-none absolute right-3 top-1/2 hidden -translate-y-1/2 rounded-[8px] border border-cream-200 bg-cream-50 px-2 py-0.5 text-[length:var(--b-text-eyebrow)] font-medium text-cream-600 lg:inline-flex">
              Ctrl/Cmd+K
            </span>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-1.5">
          <span className="inline-flex h-10 items-center gap-2 rounded-[12px] px-3 text-[length:var(--b-text-body)] font-medium text-cream-800">
            <ReceiptText className="h-5 w-5" />
            Orders
          </span>
          <span className="inline-flex h-10 w-10 items-center justify-center rounded-[12px] text-cream-800">
            <span className="flex h-8 w-8 items-center justify-center rounded-full border border-cream-300">
              <User className="h-4 w-4" />
            </span>
          </span>
          <span className="inline-flex h-10 w-10 items-center justify-center rounded-[12px] text-cream-800">
            <ShoppingCart className="h-5 w-5" />
          </span>
        </div>
      </div>
    </header>
  );
}
