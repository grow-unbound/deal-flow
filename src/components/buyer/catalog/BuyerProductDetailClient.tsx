'use client';

import * as React from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { ChevronDown, ChevronUp, Minus, Package, Plus } from 'lucide-react';
import { usePostHog } from 'posthog-js/react';
import { cn, formatNumberValue } from '@/lib/utils';
import { navigateBuyerBack } from '@/hooks/useBuyerNavigationDirection';
import { useCart } from '@/contexts/BuyerCartContext';
import { useBuyerMe } from '@/hooks/useBuyerMe';
import { RecoSection } from '@/components/buyer/catalog/RecoSection';
import { BuyerDetailShell } from '@/components/buyer/layout/BuyerDetailShell';
import { BuyerFixedFooter } from '@/components/buyer/layout/BuyerFixedFooter';
import { BUYER_PREVIEW_MAX_WIDTH } from '@/lib/buyer-preview';
import { BUYER_CARD_RADIUS_CLASS, getBuyerProductPrimaryImageUrl, hasBuyerCampaignPrice } from '@/lib/buyer-ui';
import { useBuyerProductDetail } from '@/hooks/useBuyerProducts';
import { useBuyerAnalyticsIds } from '@/lib/analytics-identity';

interface BuyerProductDetailClientProps {
  tenantProductId: string;
}

export function BuyerProductDetailClient({ tenantProductId }: BuyerProductDetailClientProps): React.ReactNode {
  const router = useRouter();
  const posthog = usePostHog();
  const analyticsIds = useBuyerAnalyticsIds();
  const { addItem, updateQty, items: cartItems, campaignId } = useCart();
  const { data: meData } = useBuyerMe();
  const stockVisible = meData?.stock_visibility?.enabled ?? false;
  const {
    item,
    recos,
    isLoading: productLoading,
    isError: productError,
    isRecosLoading,
  } = useBuyerProductDetail(tenantProductId);
  const [imgError, setImgError] = React.useState(false);
  const [categoryImgError, setCategoryImgError] = React.useState(false);
  const [brandImgError, setBrandImgError] = React.useState(false);
  const [detailsOpen, setDetailsOpen] = React.useState(true);
  const viewedKeyRef = React.useRef<string | null>(null);

  React.useEffect(() => {
    if (!item || viewedKeyRef.current === item.tenant_product_id) return;
    viewedKeyRef.current = item.tenant_product_id;
    posthog?.capture('product_viewed', {
      ...analyticsIds,
      tenant_product_id: item.tenant_product_id,
      internal_sku: item.internal_sku ?? null,
      brand: item.brand_name ?? null,
      has_campaign_price: item.has_campaign_price === true,
      campaign_id: item.campaign_id ?? null,
      stock_status: item.stock_status ?? null,
    });
  }, [item, posthog, analyticsIds]);

  const cartLine = item ? cartItems.find((i) => i.tenant_product_id === item.tenant_product_id) : undefined;

  function handleBack(): void {
    navigateBuyerBack(router);
  }

  function handleAddToCart(): void {
    if (!item) return;
    addItem({
      tenant_product_id: item.tenant_product_id,
      name: item.display_name,
      brand: item.brand_name ?? undefined,
      internal_sku: item.internal_sku,
      image_url: getBuyerProductPrimaryImageUrl(item) ?? undefined,
      unit_price: item.price,
      resolved_price: item.resolved_price,
      has_campaign_price: item.has_campaign_price,
      gst_rate: item.gst_rate ?? null,
      unit: item.default_uom ?? undefined,
      quantity: 1,
      line_total: item.price,
      tenant_category_id: item.category_id ?? undefined,
    }, item.campaign_id ?? campaignId, {
      source_surface: 'product_detail',
    });
    // Same event name/shape as the reco-widget add-to-cart captures
    // (ProductCard.tsx, CartGapWidget.tsx) so the existing "products added
    // to cart" PostHog endpoint picks this up too -- previously only the
    // two narrow recommendation-widget paths fired this event, so the main
    // add-to-cart flow (this one) was invisible to that dashboard card.
    posthog?.capture('reco_add_to_cart', {
      ...analyticsIds,
      widget: 'product_detail',
      product_id: item.tenant_product_id,
      source_product_id: null,
    });
  }

  function handleDecrement(): void {
    if (!item || !cartLine) return;
    updateQty(item.tenant_product_id, cartLine.quantity - 1);
  }

  function handleIncrement(): void {
    if (!item || !cartLine) return;
    updateQty(item.tenant_product_id, cartLine.quantity + 1);
  }

  if (productError && !productLoading) {
    return (
      <div className="flex min-h-[50dvh] flex-col" style={{ background: 'var(--bg-base)' }}>
        <BuyerDetailShell title="Product" hideSearchOnDesktop>
          <div className="flex flex-col gap-4 px-3 py-8">
            <p className="text-sm" style={{ color: 'var(--fg-2)' }}>Product not found or unavailable.</p>
            <button
              type="button"
              onClick={handleBack}
              className="w-fit rounded-full border px-4 py-2 text-sm font-semibold"
              style={{ borderColor: 'var(--border-1)', color: 'var(--fg-2)' }}
            >
              Go back
            </button>
          </div>
        </BuyerDetailShell>
      </div>
    );
  }

  const showCampaignPrice = item ? hasBuyerCampaignPrice(item) : false;
  const metaParts = item ? [item.internal_sku, item.category_name].filter(Boolean) : [];
  const stockLabel = item
    ? item.stock_status === 'out_of_stock'
      ? '0 units'
      : item.on_hand > 0
        ? `${item.on_hand} units`
        : item.stock_status === 'limited'
          ? 'Limited'
          : 'Available'
    : '';
  const taxLabel = item ? (item.gst_rate != null ? `${item.gst_rate}% GST` : '—') : '';
  const productImage = item && !imgError && item.image_urls.length > 0
    ? (item.image_url_large ?? item.image_urls[0])
    : null;
  const categoryImage = item && !productImage && !categoryImgError && item.category_image_url
    ? item.category_image_url
    : null;
  const brandLogo = item && !productImage && !categoryImage && !brandImgError && item.brand_logo_url
    ? item.brand_logo_url
    : null;
  const activeImage = productImage ?? categoryImage ?? brandLogo;
  const showStockOverlay = stockVisible && (item?.stock_status === 'limited' || item?.stock_status === 'out_of_stock');
  const categoryRecoTitle = item?.category_name
    ? `More in ${item.category_name}`
    : 'More in this category';

  return (
    <div className="flex min-h-[50dvh] flex-col pb-28 md:pb-10" style={{ background: 'var(--bg-base)' }}>
      <BuyerDetailShell title="Product" hideDesktopHeader>
        {/* Hero — square, card-like padding, aligned to header px-3 */}
        <div className="px-3 pb-4 md:px-6 md:pb-6 md:pt-6">
          <div className="grid gap-5 md:grid-cols-[minmax(340px,0.95fr)_minmax(0,1.05fr)] md:items-start">
            <div className={cn('relative aspect-square w-full overflow-hidden border border-[var(--border-1)] bg-[var(--bg-surface)] md:sticky md:top-6', BUYER_CARD_RADIUS_CLASS)}>
            {productLoading ? (
              <div className="absolute inset-0 animate-pulse bg-cream-100" />
            ) : activeImage ? (
              <Image
                src={activeImage}
                alt={item?.display_name ?? 'Product'}
                fill
                className="object-contain p-3.5 md:p-5"
                sizes="(min-width: 768px) 42vw, 100vw"
                onError={() => {
                  if (productImage) setImgError(true);
                  else if (categoryImage) setCategoryImgError(true);
                  else setBrandImgError(true);
                }}
                unoptimized
              />
            ) : (
              <div className="flex h-full items-center justify-center">
                <Package className="h-16 w-16" style={{ color: 'var(--fg-3)' }} />
              </div>
            )}
            {!productLoading && showStockOverlay && item ? (
              <ProductHeroStockLabel
                status={item.stock_status === 'limited' ? 'limited' : 'out_of_stock'}
              />
            ) : null}
            </div>

            <div className="min-w-0 space-y-4 md:space-y-5">
        <div className="space-y-1.5 py-4 md:rounded-[12px] md:border md:border-[var(--border-1)] md:bg-[var(--bg-surface)] md:px-5 md:py-5">
          {productLoading ? (
            <>
              <div className="h-3 w-16 animate-pulse rounded bg-cream-200" />
              <div className="min-h-[2.5rem] w-full animate-pulse rounded bg-cream-200" />
              <div className="h-4 w-40 animate-pulse rounded bg-cream-200" />
              <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                <div className="h-7 w-24 animate-pulse rounded bg-cream-200" />
                <div className="h-4 w-16 animate-pulse rounded bg-cream-200" />
              </div>
              <div className="h-4 w-36 animate-pulse rounded bg-cream-200" />
            </>
          ) : item ? (
            <>
              {item.brand_name ? (
                <p
                  className="font-semibold uppercase tracking-wide"
                  style={{ fontSize: 'var(--b-text-eyebrow)', color: 'var(--fg-3)' }}
                >
                  {item.brand_name}
                </p>
              ) : null}
              <h2
                className="w-full font-semibold leading-snug [text-wrap:wrap]"
                style={{ fontFamily: 'var(--font-display)', fontSize: 'var(--b-text-section)', color: 'var(--fg-1)' }}
              >
                {item.display_name}
              </h2>
              {metaParts.length > 0 ? (
                <p style={{ fontSize: 'var(--b-text-sub)', color: 'var(--fg-3)' }}>
                  {metaParts.join(' · ')}
                </p>
              ) : null}
              <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1 pt-1">
                <p className="font-semibold" style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--b-text-price-lg)', color: 'var(--fg-1)' }}>
                  {formatNumberValue(item.price, 'CURRENCY_EXACT')}
                </p>
                {showCampaignPrice ? (
                  <span className="line-through text-[var(--fg-3)]" style={{ fontSize: 'var(--b-text-sub)' }}>
                    {formatNumberValue(item.resolved_price, 'CURRENCY_EXACT')}
                  </span>
                ) : null}
              </div>
              {item.has_campaign_price && item.campaign_valid_until ? (
                <p className="text-amber-700" style={{ fontSize: 'var(--b-text-sub)' }}>
                  Valid until{' '}
                  {new Date(item.campaign_valid_until).toLocaleDateString('en-IN', {
                    day: '2-digit',
                    month: 'short',
                    year: 'numeric',
                  })}
                </p>
              ) : null}

              {/* Desktop-only CTA — replaces the mobile sticky footer */}
              <div className="hidden pt-2 md:block">
                {cartLine ? (
                  <div
                    className="flex min-h-11 w-fit items-center overflow-hidden rounded-[10px]"
                    style={{ background: 'var(--teal-500)' }}
                  >
                    <button
                      type="button"
                      className="flex h-11 w-11 items-center justify-center text-white"
                      aria-label="Decrease quantity"
                      onClick={handleDecrement}
                    >
                      <Minus className="h-4 w-4" />
                    </button>
                    <span
                      className="min-w-[2rem] text-center font-semibold text-white"
                      style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--b-text-sub)' }}
                    >
                      {cartLine.quantity}
                    </span>
                    <button
                      type="button"
                      className="flex h-11 w-11 items-center justify-center text-white"
                      aria-label="Increase quantity"
                      onClick={handleIncrement}
                    >
                      <Plus className="h-4 w-4" />
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={handleAddToCart}
                    className="flex min-h-11 items-center justify-center gap-2 rounded-[10px] px-5 font-semibold text-white"
                    style={{ background: 'var(--teal-500)', fontSize: 'var(--b-text-label)' }}
                  >
                    <Plus className="h-4 w-4" aria-hidden />
                    Add to Cart
                  </button>
                )}
              </div>
            </>
          ) : null}
        </div>

        {/* Product Details accordion */}
        <div className="pb-4 md:pb-0">
          <div className="md:hidden">
            <button
              type="button"
              onClick={() => setDetailsOpen((open) => !open)}
              className="flex w-full items-center justify-between py-2 text-left"
              aria-expanded={detailsOpen}
              disabled={productLoading}
            >
              <span className="font-semibold" style={{ fontSize: 'var(--b-text-label)', color: 'var(--fg-1)' }}>
                Product Details
              </span>
              {detailsOpen ? (
                <ChevronUp className="h-5 w-5 shrink-0" style={{ color: 'var(--fg-3)' }} />
              ) : (
                <ChevronDown className="h-5 w-5 shrink-0" style={{ color: 'var(--fg-3)' }} />
              )}
            </button>
          </div>
          {(detailsOpen || productLoading) ? (
            <div className={`overflow-hidden md:border md:border-[var(--border-1)] md:bg-[var(--bg-surface)] ${BUYER_CARD_RADIUS_CLASS}`}>
              <div className="border-b border-[var(--border-1)] px-4 py-2.5 md:px-5 md:py-3">
                <span className="font-semibold" style={{ fontSize: 'var(--b-text-label)', color: 'var(--fg-1)' }}>
                  Product Details
                </span>
              </div>
              {productLoading || !item ? (
                <>
                  <SpecRowSkeleton />
                  <SpecRowSkeleton />
                  <SpecRowSkeleton />
                  <SpecRowSkeleton />
                  <SpecRowSkeleton isLast />
                </>
              ) : (
                <>
                  <SpecRow label="SKU" value={item.internal_sku} mono />
                  {item.brand_name ? <SpecRow label="Brand" value={item.brand_name} /> : null}
                  {item.category_name ? <SpecRow label="Category" value={item.category_name} /> : null}
                  <SpecRow label="Tax" value={taxLabel} isLast={!stockVisible} />
                  {stockVisible ? <SpecRow label="Stock" value={stockLabel} isLast /> : null}
                </>
              )}
            </div>
          ) : null}
        </div>
            </div>
          </div>
        </div>

        {/* Reco rails — title + skeleton while loading; hide after settle if empty */}
        <RecoSection
          title="Frequently Bought Together"
          widget="co_order"
          items={recos.co_order}
          sourceProductId={tenantProductId}
          isLoading={isRecosLoading}
          sectionClassName="px-3 pb-3 md:px-6"
          scrollClassName="gap-3 px-3 md:px-6"
        />

        <RecoSection
          title={categoryRecoTitle}
          widget="same_category"
          items={recos.same_category}
          sourceProductId={tenantProductId}
          isLoading={isRecosLoading}
          sectionClassName="px-3 pb-3"
          scrollClassName="gap-3 px-3"
        />
      </BuyerDetailShell>

      {/* Sticky footer — price + Add / qty stepper (mobile only; desktop uses inline CTA above) */}
      <BuyerFixedFooter
        className="left-1/2 w-full -translate-x-1/2 px-3 py-3 md:hidden"
        style={{
          maxWidth: BUYER_PREVIEW_MAX_WIDTH,
          paddingBottom: 'calc(0.75rem + env(safe-area-inset-bottom, 0px))',
          background: 'rgba(253,251,247,0.96)',
          backdropFilter: 'blur(12px)',
          WebkitBackdropFilter: 'blur(12px)',
          borderTop: '1px solid var(--border-1)',
        }}
      >
        <div className="flex items-center justify-between gap-4">
          {productLoading || !item ? (
            <>
              <div className="flex flex-col items-end gap-1">
                <div className="h-7 w-20 animate-pulse rounded bg-cream-200" />
                <div className="h-4 w-14 animate-pulse rounded bg-cream-200" />
              </div>
              <div className="h-11 min-w-[7rem] animate-pulse rounded-xl bg-cream-200" />
            </>
          ) : (
            <>
              <div className="flex flex-col items-end">
                <span className="font-semibold" style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--b-text-price)', color: 'var(--fg-1)' }}>
                  {formatNumberValue(item.price, 'CURRENCY_EXACT')}
                </span>
                {showCampaignPrice ? (
                  <span className="line-through text-[var(--fg-3)]" style={{ fontSize: 'var(--b-text-eyebrow)' }}>
                    {formatNumberValue(item.resolved_price, 'CURRENCY_EXACT')}
                  </span>
                ) : null}
              </div>
              {cartLine ? (
                <div
                  className="flex min-h-11 items-center overflow-hidden rounded-xl"
                  style={{ background: 'var(--teal-500)' }}
                >
                  <button
                    type="button"
                    className="flex h-11 w-11 items-center justify-center text-white"
                    aria-label="Decrease quantity"
                    onClick={handleDecrement}
                  >
                    <Minus className="h-4 w-4" />
                  </button>
                  <span
                    className="min-w-[2rem] text-center text-sm font-semibold text-white"
                    style={{ fontFamily: 'var(--font-mono)' }}
                  >
                    {cartLine.quantity}
                  </span>
                  <button
                    type="button"
                    className="flex h-11 w-11 items-center justify-center text-white"
                    aria-label="Increase quantity"
                    onClick={handleIncrement}
                  >
                    <Plus className="h-4 w-4" />
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={handleAddToCart}
                  className="flex min-h-11 min-w-[7rem] items-center justify-center gap-1.5 rounded-xl px-5 text-sm font-semibold text-white"
                  style={{ background: 'var(--teal-500)' }}
                >
                  <Plus className="h-4 w-4" aria-hidden />
                  Add
                </button>
              )}
            </>
          )}
        </div>
      </BuyerFixedFooter>
    </div>
  );
}

function ProductHeroStockLabel({ status }: { status: 'limited' | 'out_of_stock' }) {
  const isLimited = status === 'limited';
  return (
    <span
      className={cn(
        'absolute right-3 top-3 z-[2] rounded-full border px-3 py-1 font-semibold uppercase tracking-[0.08em] shadow-sm',
        isLimited
          ? 'border-[var(--warning-50)] bg-[var(--warning-50)] text-[var(--warning-500)]'
          : 'border-[var(--danger-50)] bg-[var(--danger-50)] text-[var(--danger-500)]',
      )}
      style={{ fontSize: 'var(--b-text-label)' }}
    >
      {isLimited ? 'Low stock' : 'Out of stock'}
    </span>
  );
}

function SpecRow({
  label,
  value,
  mono,
  isLast,
}: {
  label: string;
  value: string;
  mono?: boolean;
  isLast?: boolean;
}) {
  return (
    <div
      className="grid grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] items-start gap-4 px-4 py-2.5 md:px-5 md:py-3"
      style={{ borderBottom: isLast ? undefined : '1px solid var(--border-1)' }}
    >
      <span style={{ fontSize: 'var(--b-text-sub)', color: 'var(--fg-3)' }}>
        {label}
      </span>
      <span
        className="text-right font-medium md:text-left"
        style={{ fontSize: 'var(--b-text-sub)', color: 'var(--fg-1)', fontFamily: mono ? 'var(--font-mono)' : undefined }}
      >
        {value}
      </span>
    </div>
  );
}

function SpecRowSkeleton({ isLast }: { isLast?: boolean }) {
  return (
    <div
      className="grid grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] items-start gap-4 px-4 py-2.5 md:px-5 md:py-3"
      style={{ borderBottom: isLast ? undefined : '1px solid var(--border-1)' }}
    >
      <div className="h-4 w-16 animate-pulse rounded bg-cream-200" />
      <div className="ml-auto h-4 w-24 animate-pulse rounded bg-cream-200 md:ml-0" />
    </div>
  );
}
