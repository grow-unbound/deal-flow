'use client';

import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { ChevronRight } from 'lucide-react';
import {
  useBuyerBrands,
  useBuyerCampaignName,
  useBuyerCampaignShareName,
  useBuyerCategories,
  useBuyerProductDetail,
} from '@/hooks/useBuyerProducts';
import { useBuyerEffectivePathname } from '@/hooks/useBuyerRailPathnameOverride';
import { BUYER_PREVIEW_MAX_WIDTH } from '@/lib/buyer-preview';
import { isBuyerCampaignShareRoute, shouldShowBuyerDesktopBreadcrumbs } from '@/lib/buyer-routes';

interface Crumb {
  label: string;
  href?: string;
}

function buildCrumbs(
  pathname: string,
  hasShareToken: boolean,
  labels: { category?: string; categoryId?: string; brand?: string; product?: string; campaign?: string },
): Crumb[] {
  const crumbs: Crumb[] = [{ label: 'Home', href: '/buy/home' }];

  if (isBuyerCampaignShareRoute(pathname, hasShareToken)) return [...crumbs, { label: labels.campaign ?? 'Campaign browse' }];
  if (pathname === '/buy/orders') return [...crumbs, { label: 'Orders' }];
  if (pathname.startsWith('/buy/orders/')) return [...crumbs, { label: 'Orders', href: '/buy/orders' }, { label: 'Order details' }];
  if (pathname.startsWith('/buy/estimates/')) return [...crumbs, { label: 'Orders', href: '/buy/orders?tab=enquiries' }, { label: 'Enquiry details' }];
  if (pathname.startsWith('/buy/invoices/')) return [...crumbs, { label: 'Orders', href: '/buy/orders?tab=invoices' }, { label: 'Invoice details' }];
  if (pathname === '/buy/profile') return [...crumbs, { label: 'Profile' }];
  if (pathname.startsWith('/buy/home/category/')) return [...crumbs, { label: labels.category ?? 'Category browse' }];
  if (pathname.startsWith('/buy/home/brand/')) return [...crumbs, { label: labels.brand ?? 'Brand browse' }];
  if (pathname.startsWith('/buy/home/list/')) return [...crumbs, { label: labels.campaign ?? 'Campaign browse' }];
  if (pathname.startsWith('/buy/product/')) {
    if (labels.product && labels.category) {
      return [
        ...crumbs,
        { label: labels.category, href: labels.categoryId ? `/buy/home/category/${labels.categoryId}` : undefined },
        { label: labels.product },
      ];
    }
    return [...crumbs, { label: labels.product ?? 'Product details' }];
  }
  if (pathname === '/buy/search') return [...crumbs, { label: 'Search' }];
  if (pathname === '/buy/location') return [...crumbs, { label: 'Select location' }];
  return crumbs;
}

export function BuyerDesktopBreadcrumbs() {
  const pathname = useBuyerEffectivePathname(usePathname());
  const searchParams = useSearchParams();
  const hasShareToken = Boolean(searchParams?.get('share_token'));
  if (!shouldShowBuyerDesktopBreadcrumbs(pathname) && !isBuyerCampaignShareRoute(pathname, hasShareToken)) return null;

  const categoryId = pathname.startsWith('/buy/home/category/') ? pathname.split('/').at(-1) ?? '' : '';
  const brandId = pathname.startsWith('/buy/home/brand/') ? pathname.split('/').at(-1) ?? '' : '';
  const productId = pathname.startsWith('/buy/product/') ? pathname.split('/').at(-1) ?? '' : '';
  const campaignId = pathname.startsWith('/buy/home/list/') ? pathname.split('/').at(-1) ?? '' : '';
  const shareToken = searchParams?.get('share_token') ?? '';
  const { data: categories } = useBuyerCategories();
  const { data: brands } = useBuyerBrands();
  const productDetail = useBuyerProductDetail(productId);
  const { data: campaignName } = useBuyerCampaignName(campaignId);
  const { data: campaignShareName } = useBuyerCampaignShareName(
    isBuyerCampaignShareRoute(pathname, hasShareToken) ? shareToken : '',
  );
  const crumbs = buildCrumbs(pathname, hasShareToken, {
    category:
      categories?.find((category) => category.id === categoryId)?.name
      ?? productDetail.item?.category_name
      ?? undefined,
    categoryId: categoryId || (productDetail.item?.category_id ?? undefined),
    brand: brands?.find((brand) => brand.id === brandId)?.name ?? undefined,
    product: productDetail.item?.display_name ?? undefined,
    campaign: campaignName ?? campaignShareName,
  });

  return (
    <div className="hidden bg-[var(--cream-50)] md:block">
      <div
        className="mx-auto flex w-full items-center gap-3 px-6 pb-2 pt-4"
        style={{ maxWidth: BUYER_PREVIEW_MAX_WIDTH, fontSize: 'var(--b-text-body)' }}
      >
        {crumbs.map((crumb, index) => {
          const isLast = index === crumbs.length - 1;
          return (
            <div key={`${crumb.label}-${index}`} className="flex items-center gap-3">
              {crumb.href && !isLast ? (
                <Link href={crumb.href} className="font-medium text-cream-600 transition-colors hover:text-cream-900">
                  {crumb.label}
                </Link>
              ) : (
                <span className={isLast ? 'font-semibold text-cream-950' : 'font-medium text-cream-600'}>
                  {crumb.label}
                </span>
              )}
              {!isLast ? <ChevronRight className="h-4.5 w-4.5 text-cream-400" /> : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}
