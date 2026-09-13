'use client';

import * as React from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { Minus, Package, Plus } from 'lucide-react';
import { usePostHog } from 'posthog-js/react';

import { BuyerDetailShell } from '@/components/buyer/layout/BuyerDetailShell';
import { BuyerFixedFooter } from '@/components/buyer/layout/BuyerFixedFooter';
import { useCart } from '@/contexts/BuyerCartContext';
import { useStorefrontLogin } from '@/contexts/StorefrontLoginContext';
import { navigateBuyerBack } from '@/hooks/useBuyerNavigationDirection';
import { useBuyerMe } from '@/hooks/useBuyerMe';
import { useBuyerProductFamilyDetail } from '@/hooks/useBuyerProducts';
import { useBuyerAnalyticsIds } from '@/lib/analytics-identity';
import { BUYER_CARD_RADIUS_CLASS, getBuyerProductPrimaryImageUrl, guestPriceReveal, hasVisibleBuyerPrice, isHiddenPriceEnquiryMode } from '@/lib/buyer-ui';
import { BUYER_PREVIEW_MAX_WIDTH } from '@/lib/buyer-preview';
import { cn, formatNumberValue } from '@/lib/utils';
import type { BuyerFamilySkuOption } from '@/types/buyer';

interface BuyerProductFamilyDetailClientProps {
  productFamilyId: string;
}

type Selection = Record<string, string>;

export function BuyerProductFamilyDetailClient({ productFamilyId }: BuyerProductFamilyDetailClientProps): React.ReactNode {
  const router = useRouter();
  const posthog = usePostHog();
  const analyticsIds = useBuyerAnalyticsIds();
  const { detail, family, isLoading, isError } = useBuyerProductFamilyDetail(productFamilyId);
  const { addItem, updateQty, items: cartItems, campaignId } = useCart();
  const { data: meData } = useBuyerMe();
  const { openLogin } = useStorefrontLogin();
  const isGuest = meData?.mode !== 'buyer' && meData?.mode !== 'preview';
  const priceReveal = isGuest ? guestPriceReveal(meData?.guest_pricing_mode) : 'amount';
  const stockVisible = meData?.stock_visibility?.enabled ?? false;
  const [selection, setSelection] = React.useState<Selection>({});
  const [imgError, setImgError] = React.useState(false);
  const [targetMin, setTargetMin] = React.useState('');
  const [targetMax, setTargetMax] = React.useState('');

  const axes = detail?.variant_axes ?? [];
  const skus = detail?.skus ?? [];
  const selectedSku = React.useMemo(() => resolveSelectedSku(skus, axes.map((axis) => axis.key), selection), [skus, axes, selection]);
  const cartLine = selectedSku ? cartItems.find((item) => item.tenant_product_id === selectedSku.tenant_product_id) : undefined;
  const hiddenPriceEnquiry = family ? isHiddenPriceEnquiryMode(family.catalog_pricing_mode) : false;
  const collectTargetRange = hiddenPriceEnquiry && family?.collect_target_unit_price_range === true;
  const activeImage = family && !imgError ? (family.image_url_large ?? getBuyerProductPrimaryImageUrl(family)) : null;
  const hasRequiredSelection = axes.length === 0 || axes.every((axis) => selection[axis.key]);
  const canAddResolvedSku = Boolean(selectedSku && (hiddenPriceEnquiry || hasVisibleBuyerPrice(selectedSku.price)));
  const canClickResolvedSku = Boolean(selectedSku && (canAddResolvedSku || isGuest || priceReveal === 'login_cta'));
  const displayedPrice = selectedSku?.price ?? family?.price_summary?.min_price ?? family?.price ?? null;

  React.useEffect(() => {
    if (!family) return;
    posthog?.capture('product_family_viewed', {
      ...analyticsIds,
      product_family_id: family.product_family_id ?? family.id,
      child_sku_count: family.child_sku_count ?? skus.length,
      brand: family.brand_name ?? null,
      category: family.category_name ?? null,
    });
  }, [analyticsIds, family, posthog, skus.length]);

  function handleBack(): void {
    navigateBuyerBack(router);
  }

  function optionPossible(axisKey: string, value: string): boolean {
    const candidate = { ...selection, [axisKey]: value };
    return skus.some((sku) => Object.entries(candidate).every(([key, selectedValue]) => !selectedValue || sku.attributes[key] === selectedValue));
  }

  function handleSelect(axisKey: string, value: string): void {
    setSelection((current) => {
      const next = { ...current, [axisKey]: current[axisKey] === value ? '' : value };
      for (const key of Object.keys(next)) {
        if (!next[key]) continue;
        const candidate = { ...next };
        if (!skus.some((sku) => Object.entries(candidate).every(([candidateKey, selectedValue]) => !selectedValue || sku.attributes[candidateKey] === selectedValue))) {
          next[key] = '';
        }
      }
      return next;
    });
  }

  function handleAdd(): void {
    if (!family || !selectedSku) return;
    if (isGuest || !canAddResolvedSku) {
      openLogin();
      return;
    }
    const quantity = 1;
    addItem({
      tenant_product_id: selectedSku.tenant_product_id,
      name: family.display_name,
      brand: family.brand_name ?? undefined,
      internal_sku: selectedSku.internal_sku,
      image_url: getBuyerProductPrimaryImageUrl(family) ?? undefined,
      unit_price: hiddenPriceEnquiry ? null : (selectedSku.price ?? 0),
      resolved_price: selectedSku.resolved_price,
      has_campaign_price: selectedSku.has_campaign_price,
      gst_rate: selectedSku.gst_rate ?? null,
      unit: selectedSku.default_uom ?? undefined,
      quantity,
      line_total: hiddenPriceEnquiry ? 0 : (selectedSku.price ?? 0) * quantity,
      cart_mode: hiddenPriceEnquiry ? 'hidden_price_enquiry' : 'priced',
      collect_target_unit_price_range: family.collect_target_unit_price_range === true,
      buyer_target_unit_price_min: targetMin.trim() ? Number(targetMin) : null,
      buyer_target_unit_price_max: targetMax.trim() ? Number(targetMax) : null,
      tenant_category_id: family.category_id ?? undefined,
      stock_status: selectedSku.stock_status,
      on_hand: selectedSku.on_hand,
    }, family.campaign_id ?? campaignId, { source_surface: 'product_family_detail' });
    posthog?.capture('reco_add_to_cart', {
      ...analyticsIds,
      widget: 'product_family_detail',
      product_id: selectedSku.tenant_product_id,
      product_family_id: family.product_family_id ?? family.id,
      source_product_id: null,
    });
  }

  function handleDecrement(): void {
    if (!selectedSku || !cartLine) return;
    updateQty(selectedSku.tenant_product_id, cartLine.quantity - 1);
  }

  function handleIncrement(): void {
    if (!selectedSku || !cartLine) return;
    updateQty(selectedSku.tenant_product_id, cartLine.quantity + 1);
  }

  if (isError && !isLoading) {
    return (
      <div className="flex min-h-[50dvh] flex-col" style={{ background: 'var(--bg-base)' }}>
        <BuyerDetailShell title="Product" hideSearchOnDesktop>
          <div className="flex flex-col gap-4 px-3 py-8">
            <p className="text-sm" style={{ color: 'var(--fg-2)' }}>Product family not found or unavailable.</p>
            <button type="button" onClick={handleBack} className="w-fit rounded-full border px-4 py-2 text-sm font-semibold" style={{ borderColor: 'var(--border-1)', color: 'var(--fg-2)' }}>
              Go back
            </button>
          </div>
        </BuyerDetailShell>
      </div>
    );
  }

  return (
    <div className="flex min-h-[50dvh] flex-col pb-28 md:pb-10" style={{ background: 'var(--bg-base)' }}>
      <BuyerDetailShell title="Product" hideDesktopHeader>
        <div className="px-3 pb-4 md:px-6 md:pb-6 md:pt-6">
          <div className="grid gap-5 md:grid-cols-[minmax(340px,0.95fr)_minmax(0,1.05fr)] md:items-start">
            <div className={cn('relative aspect-square w-full overflow-hidden border border-[var(--border-1)] bg-[var(--bg-surface)] md:sticky md:top-6', BUYER_CARD_RADIUS_CLASS)}>
              {isLoading ? (
                <div className="absolute inset-0 animate-pulse bg-cream-100" />
              ) : activeImage ? (
                <Image
                  src={activeImage}
                  alt={family?.display_name ?? 'Product'}
                  fill
                  className="object-contain p-3.5 md:p-5"
                  sizes="(min-width: 768px) 42vw, 100vw"
                  onError={() => setImgError(true)}
                  unoptimized
                />
              ) : (
                <div className="flex h-full items-center justify-center">
                  <Package className="h-16 w-16" style={{ color: 'var(--fg-3)' }} />
                </div>
              )}
            </div>

            <div className="min-w-0 space-y-4 md:space-y-5">
              <div className="space-y-4 py-4 md:rounded-[12px] md:border md:border-[var(--border-1)] md:bg-[var(--bg-surface)] md:px-5 md:py-5">
                {isLoading || !family ? (
                  <>
                    <div className="h-3 w-20 animate-pulse rounded bg-cream-200" />
                    <div className="min-h-[2.5rem] w-full animate-pulse rounded bg-cream-200" />
                    <div className="h-7 w-28 animate-pulse rounded bg-cream-200" />
                  </>
                ) : (
                  <>
                    {family.brand_name ? <p className="font-semibold uppercase tracking-wide" style={{ fontSize: 'var(--b-text-eyebrow)', color: 'var(--fg-3)' }}>{family.brand_name}</p> : null}
                    <h2 className="w-full font-semibold leading-snug [text-wrap:wrap]" style={{ fontFamily: 'var(--font-display)', fontSize: 'var(--b-text-section)', color: 'var(--fg-1)' }}>
                      {family.display_name}
                    </h2>
                    <FamilyPrice
                      hiddenPriceEnquiry={hiddenPriceEnquiry}
                      priceReveal={priceReveal}
                      price={displayedPrice}
                      summaryDisplay={family.price_summary?.display}
                      openLogin={openLogin}
                    />
                    <div className="space-y-3">
                      {axes.map((axis) => (
                        <div key={axis.key} className="space-y-2">
                          <p className="font-semibold" style={{ fontSize: 'var(--b-text-label)', color: 'var(--fg-1)' }}>{axis.label}</p>
                          <div className="flex flex-wrap gap-2">
                            {axis.values.map((value) => {
                              const active = selection[axis.key] === value;
                              const disabled = !active && !optionPossible(axis.key, value);
                              return (
                                <button
                                  key={value}
                                  type="button"
                                  disabled={disabled}
                                  onClick={() => handleSelect(axis.key, value)}
                                  className={cn(
                                    'min-h-10 rounded-[8px] border px-3 py-2 text-sm font-semibold transition-colors',
                                    active ? 'border-[var(--teal-500)] bg-[var(--teal-50)] text-[var(--teal-700)]' : 'border-[var(--border-1)] bg-white text-[var(--fg-2)]',
                                    disabled && 'cursor-not-allowed opacity-40',
                                  )}
                                >
                                  {value}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      ))}
                    </div>
                    {collectTargetRange ? (
                      <TargetRangeInputs targetMin={targetMin} targetMax={targetMax} setTargetMin={setTargetMin} setTargetMax={setTargetMax} unit={selectedSku?.default_uom ?? family.default_uom} />
                    ) : null}
                    <div className="rounded-[10px] border border-[var(--border-1)] bg-[var(--bg-base)] p-3">
                      <p className="font-semibold" style={{ fontSize: 'var(--b-text-label)', color: 'var(--fg-1)' }}>
                        {selectedSku ? 'Variant selected' : hasRequiredSelection ? 'Combination unavailable' : 'Select options'}
                      </p>
                      <p className="mt-1" style={{ fontSize: 'var(--b-text-sub)', color: 'var(--fg-3)' }}>
                        {selectedSku
                          ? `${stockVisible ? stockLabel(selectedSku) : 'Ready to add'}${selectedSku.default_uom ? ` · ${selectedSku.default_uom}` : ''}`
                          : 'Choose one value from each option to resolve the final SKU.'}
                      </p>
                    </div>
                    <div className="hidden pt-1 md:block">
                      <FamilyActionButton
                        cartLineQty={cartLine?.quantity}
                        hiddenPriceEnquiry={hiddenPriceEnquiry}
                        disabled={!canClickResolvedSku}
                        onAdd={handleAdd}
                        onIncrement={handleIncrement}
                        onDecrement={handleDecrement}
                      />
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      </BuyerDetailShell>

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
          <div className="flex min-w-0 flex-col">
            {hiddenPriceEnquiry ? (
              <span className="font-semibold" style={{ fontSize: 'var(--b-text-label)', color: 'var(--fg-1)' }}>Price on enquiry</span>
            ) : displayedPrice == null ? (
              <span className="inline-block h-5 w-20 rounded-md bg-cream-300" aria-label="Price hidden" />
            ) : (
              <span className="font-semibold" style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--b-text-price)', color: 'var(--fg-1)' }}>{formatNumberValue(displayedPrice, 'CURRENCY_EXACT')}</span>
            )}
          </div>
          <FamilyActionButton
            cartLineQty={cartLine?.quantity}
            hiddenPriceEnquiry={hiddenPriceEnquiry}
            disabled={!canClickResolvedSku}
            onAdd={handleAdd}
            onIncrement={handleIncrement}
            onDecrement={handleDecrement}
          />
        </div>
      </BuyerFixedFooter>
    </div>
  );
}

function resolveSelectedSku(skus: BuyerFamilySkuOption[], axisKeys: string[], selection: Selection): BuyerFamilySkuOption | null {
  if (skus.length === 1 && axisKeys.length === 0) return skus[0] ?? null;
  if (!axisKeys.every((key) => selection[key])) return null;
  return skus.find((sku) => axisKeys.every((key) => sku.attributes[key] === selection[key])) ?? null;
}

function stockLabel(sku: BuyerFamilySkuOption): string {
  if (sku.stock_status === 'out_of_stock') return '0 units';
  if (sku.on_hand > 0) return `${sku.on_hand} units`;
  return sku.stock_status === 'limited' ? 'Limited stock' : 'Available';
}

function FamilyPrice({ hiddenPriceEnquiry, priceReveal, price, summaryDisplay, openLogin }: { hiddenPriceEnquiry: boolean; priceReveal: string; price: number | null; summaryDisplay?: string; openLogin: () => void }) {
  if (hiddenPriceEnquiry) {
    return <p className="font-semibold" style={{ fontSize: 'var(--b-text-label)', color: 'var(--fg-1)' }}>Price on enquiry</p>;
  }
  if (price == null) {
    if (priceReveal === 'login_cta') {
      return (
        <button type="button" onClick={openLogin} className="inline-flex w-fit rounded-xs border border-cream-300 bg-white px-3 py-1.5 font-medium text-cream-600" style={{ fontSize: 'var(--b-text-label)' }}>
          Login for Price
        </button>
      );
    }
    return <span className="inline-block h-7 w-28 rounded-md bg-cream-300" aria-label="Price hidden" />;
  }
  return (
    <p className="font-semibold" style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--b-text-price-lg)', color: 'var(--fg-1)' }}>
      {summaryDisplay === 'from' ? 'From ' : null}{formatNumberValue(price, 'CURRENCY_EXACT')}
    </p>
  );
}

function TargetRangeInputs({ targetMin, targetMax, setTargetMin, setTargetMax, unit }: { targetMin: string; targetMax: string; setTargetMin: (value: string) => void; setTargetMax: (value: string) => void; unit?: string | null }) {
  return (
    <div className="space-y-2 rounded-[10px] border border-[var(--border-1)] bg-[var(--bg-base)] p-3">
      <p className="font-semibold" style={{ fontSize: 'var(--b-text-label)', color: 'var(--fg-1)' }}>Target buying price per unit</p>
      <div className="grid grid-cols-2 gap-2">
        <input value={targetMin} onChange={(event) => setTargetMin(event.target.value)} type="number" min="0" inputMode="decimal" className="h-10 w-full rounded-[8px] border border-[var(--border-1)] bg-white px-3 text-sm outline-none focus:border-[var(--teal-500)]" placeholder="Min" />
        <input value={targetMax} onChange={(event) => setTargetMax(event.target.value)} type="number" min="0" inputMode="decimal" className="h-10 w-full rounded-[8px] border border-[var(--border-1)] bg-white px-3 text-sm outline-none focus:border-[var(--teal-500)]" placeholder="Max" />
      </div>
      {unit ? <p style={{ fontSize: 'var(--b-text-sub)', color: 'var(--fg-3)' }}>Per {unit}</p> : null}
    </div>
  );
}

function FamilyActionButton({ cartLineQty, hiddenPriceEnquiry, disabled, onAdd, onIncrement, onDecrement }: { cartLineQty?: number; hiddenPriceEnquiry: boolean; disabled: boolean; onAdd: () => void; onIncrement: () => void; onDecrement: () => void }) {
  if (cartLineQty != null) {
    return (
      <div className="flex min-h-11 items-center overflow-hidden rounded-xl" style={{ background: 'var(--teal-500)' }}>
        <button type="button" className="flex h-11 w-11 items-center justify-center text-white" aria-label="Decrease quantity" onClick={onDecrement}><Minus className="h-4 w-4" /></button>
        <span className="min-w-[2rem] text-center text-sm font-semibold text-white" style={{ fontFamily: 'var(--font-mono)' }}>{cartLineQty}</span>
        <button type="button" className="flex h-11 w-11 items-center justify-center text-white" aria-label="Increase quantity" onClick={onIncrement}><Plus className="h-4 w-4" /></button>
      </div>
    );
  }
  return (
    <button type="button" disabled={disabled} onClick={onAdd} className="flex min-h-11 min-w-[7rem] items-center justify-center gap-1.5 rounded-xl px-5 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50" style={{ background: 'var(--teal-500)' }}>
      <Plus className="h-4 w-4" aria-hidden />
      {hiddenPriceEnquiry ? 'Enquire' : 'Add'}
    </button>
  );
}
