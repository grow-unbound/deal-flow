'use client';

import * as React from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { ChevronDown, ChevronUp, Minus, Package, Plus } from 'lucide-react';
import { cn, formatNumberValue } from '@/lib/utils';
import { navigateBuyerBack } from '@/hooks/useBuyerNavigationDirection';
import { useCart } from '@/contexts/BuyerCartContext';
import { RecoSection } from '@/components/buyer/catalog/RecoSection';
import { ProductDetailLoadingSkeleton } from '@/components/buyer/catalog/ProductDetailLoadingSkeleton';
import { BuyerDetailShell } from '@/components/buyer/layout/BuyerDetailShell';
import { BuyerFixedFooter } from '@/components/buyer/layout/BuyerFixedFooter';
import { BUYER_PREVIEW_MAX_WIDTH } from '@/lib/buyer-preview';
import { BUYER_CARD_RADIUS_CLASS, getBuyerProductPrimaryImageUrl, hasBuyerCampaignPrice } from '@/lib/buyer-ui';
import { useBuyerProductDetail } from '@/hooks/useBuyerProducts';

interface BuyerProductDetailClientProps {
  tenantProductId: string;
}

export function BuyerProductDetailClient({ tenantProductId }: BuyerProductDetailClientProps): React.ReactNode {
  const router = useRouter();
  const { addItem, updateQty, items: cartItems, campaignId } = useCart();
  const { item, recos, isLoading: loading, isError: error } = useBuyerProductDetail(tenantProductId);
  const [imgError, setImgError] = React.useState(false);
  const [categoryImgError, setCategoryImgError] = React.useState(false);
  const [brandImgError, setBrandImgError] = React.useState(false);
  const [detailsOpen, setDetailsOpen] = React.useState(true);

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
  }

  function handleDecrement(): void {
    if (!item || !cartLine) return;
    updateQty(item.tenant_product_id, cartLine.quantity - 1);
  }

  function handleIncrement(): void {
    if (!item || !cartLine) return;
    updateQty(item.tenant_product_id, cartLine.quantity + 1);
  }

  if (loading) {
    return <ProductDetailLoadingSkeleton />;
  }

  if (error || !item) {
    return (
      <div className="flex min-h-[50dvh] flex-col" style={{ background: 'var(--bg-base)' }}>
        <BuyerDetailShell title="Product" hideSearch>
          <div className="flex flex-col gap-4 px-4 py-8">
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

  const productImage = !imgError && item.image_urls.length > 0 ? item.image_urls[0] : null;
  const categoryImage = !productImage && !categoryImgError && item.category_image_url ? item.category_image_url : null;
  const brandLogo = !productImage && !categoryImage && !brandImgError && item.brand_logo_url ? item.brand_logo_url : null;
  const activeImage = productImage ?? categoryImage ?? brandLogo;
  const showBrandBadge = Boolean(item.brand_logo_url && activeImage !== item.brand_logo_url && !brandImgError);
  const showCampaignPrice = hasBuyerCampaignPrice(item);
  const metaParts = [item.internal_sku, item.category_name].filter(Boolean);
  const stockLabel =
    item.stock_status === 'out_of_stock'
      ? '0 units'
      : item.on_hand > 0
        ? `${item.on_hand} units`
        : item.stock_status === 'limited'
          ? 'Limited'
          : 'Available';
  const taxLabel = item.gst_rate != null ? `${item.gst_rate}% GST` : '—';
  const showStockOverlay = item.stock_status === 'limited' || item.stock_status === 'out_of_stock';

  return (
    <div className="flex min-h-[50dvh] flex-col pb-28" style={{ background: 'var(--bg-base)' }}>
      <BuyerDetailShell title="Product" hideSearch>
        {/* Hero image */}
        <div
          className="relative -mx-3 w-[calc(100%+1.5rem)] bg-[var(--bg-surface)]"
          style={{ paddingTop: '69%' }}
        >
          <div className="absolute inset-0">
            {activeImage ? (
              <Image
                src={activeImage}
                alt={item.display_name}
                fill
                className="object-contain p-6"
                sizes="100vw"
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
            {showBrandBadge && item.brand_logo_url ? (
              <div className="absolute left-3 top-3 z-[2] flex h-10 w-10 items-center justify-center overflow-hidden rounded-lg bg-white/90 p-1 shadow-sm">
                <Image
                  src={item.brand_logo_url}
                  alt={item.brand_name ?? 'Brand'}
                  width={32}
                  height={32}
                  className="object-contain"
                  onError={() => setBrandImgError(true)}
                  unoptimized
                />
              </div>
            ) : null}
            {showStockOverlay ? (
              <ProductHeroStockLabel
                status={item.stock_status === 'limited' ? 'limited' : 'out_of_stock'}
              />
            ) : null}
          </div>
        </div>

        {/* Title block */}
        <div className="space-y-2 px-4 py-4">
          {item.brand_name ? (
            <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--fg-3)' }}>
              {item.brand_name}
            </p>
          ) : null}
          <h2 className="text-xl font-bold leading-tight" style={{ fontFamily: 'var(--font-display)', color: 'var(--fg-1)' }}>
            {item.display_name}
          </h2>
          {metaParts.length > 0 ? (
            <p className="text-sm" style={{ color: 'var(--fg-3)' }}>
              {metaParts.join(' · ')}
            </p>
          ) : null}
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
            <p className="text-xl font-semibold" style={{ fontFamily: 'var(--font-mono)', color: 'var(--fg-1)' }}>
              {formatNumberValue(item.price, 'CURRENCY_EXACT')}
            </p>
            {showCampaignPrice ? (
              <span className="text-sm line-through text-[var(--fg-3)]">
                {formatNumberValue(item.resolved_price, 'CURRENCY_EXACT')}
              </span>
            ) : null}
          </div>
          {item.has_campaign_price && item.campaign_valid_until ? (
            <p className="text-sm text-amber-700">
              Valid until{' '}
              {new Date(item.campaign_valid_until).toLocaleDateString('en-IN', {
                day: '2-digit',
                month: 'short',
                year: 'numeric',
              })}
            </p>
          ) : null}
        </div>

        {/* Product Details accordion */}
        <div className="px-4 pb-4">
          <button
            type="button"
            onClick={() => setDetailsOpen((open) => !open)}
            className="flex w-full items-center justify-between py-2 text-left"
            aria-expanded={detailsOpen}
          >
            <span className="text-base font-semibold" style={{ color: 'var(--fg-1)' }}>
              Product Details
            </span>
            {detailsOpen ? (
              <ChevronUp className="h-5 w-5 shrink-0" style={{ color: 'var(--fg-3)' }} />
            ) : (
              <ChevronDown className="h-5 w-5 shrink-0" style={{ color: 'var(--fg-3)' }} />
            )}
          </button>
          {detailsOpen ? (
            <div className={`overflow-hidden ${BUYER_CARD_RADIUS_CLASS}`} style={{ border: '1px solid var(--border-1)' }}>
              <SpecRow label="SKU" value={item.internal_sku} mono />
              {item.brand_name ? <SpecRow label="Brand" value={item.brand_name} /> : null}
              {item.category_name ? <SpecRow label="Category" value={item.category_name} /> : null}
              <SpecRow label="Tax" value={taxLabel} />
              <SpecRow label="Stock" value={stockLabel} isLast />
            </div>
          ) : null}
        </div>

        <RecoSection
          title="Frequently Bought Together"
          widget="co_order"
          items={recos.co_order}
          sourceProductId={tenantProductId}
          alwaysShow
        />

        <RecoSection
          title={item.category_name ? `More in ${item.category_name}` : 'More in this category'}
          widget="same_category"
          items={recos.same_category}
          sourceProductId={tenantProductId}
          alwaysShow
        />
      </BuyerDetailShell>

      {/* Sticky footer — price + Add / qty stepper */}
      <BuyerFixedFooter
        className="left-1/2 w-full -translate-x-1/2 px-4 py-3"
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
          <div className="flex flex-col items-end">
            <span className="text-xl font-semibold" style={{ fontFamily: 'var(--font-mono)', color: 'var(--fg-1)' }}>
              {formatNumberValue(item.price, 'CURRENCY_EXACT')}
            </span>
            {showCampaignPrice ? (
              <span className="text-sm line-through text-[var(--fg-3)]">
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
              disabled={item.stock_status === 'out_of_stock'}
              onClick={handleAddToCart}
              className={cn(
                'flex min-h-11 min-w-[7rem] items-center justify-center gap-1.5 rounded-xl px-5 text-sm font-semibold text-white',
                item.stock_status === 'out_of_stock' ? 'cursor-not-allowed opacity-50' : '',
              )}
              style={{ background: item.stock_status === 'out_of_stock' ? 'var(--fg-3)' : 'var(--teal-500)' }}
            >
              <Plus className="h-4 w-4" aria-hidden />
              Add
            </button>
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
      className="flex items-center justify-between px-4 py-3"
      style={{ borderBottom: isLast ? undefined : '1px solid var(--border-1)' }}
    >
      <span className="text-sm" style={{ color: 'var(--fg-3)' }}>
        {label}
      </span>
      <span
        className="text-sm font-medium"
        style={{ color: 'var(--fg-1)', fontFamily: mono ? 'var(--font-mono)' : undefined }}
      >
        {value}
      </span>
    </div>
  );
}
