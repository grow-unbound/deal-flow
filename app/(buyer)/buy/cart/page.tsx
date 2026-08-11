'use client';

import { formatNumberValue } from '@/lib/utils';
import { useState, useEffect, useMemo } from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { useMutation } from '@tanstack/react-query';
import { ShoppingCart, Trash2, Minus, Plus, Package, ChevronLeft, MapPin, ChevronRight, Check } from 'lucide-react';
import { usePostHog } from 'posthog-js/react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { DialogBody } from '@/components/ui/dialog';
import { useCart, type BuyerCartItem } from '@/contexts/BuyerCartContext';
import { useBuyerDeliveryOptional } from '@/contexts/BuyerDeliveryContext';
import { useBuyerMe } from '@/hooks/useBuyerMe';
import { useCartBundles } from '@/hooks/useCartBundles';
import { useBuyerResolvedProducts } from '@/hooks/useBuyerProducts';
import { markBuyerNavigationForward, navigateBuyerBack } from '@/hooks/useBuyerNavigationDirection';
import { CartGapWidget } from '@/components/buyer/cart/CartGapWidget';
import { apiFetch } from '@/lib/api-fetch';
import { BUYER_PREVIEW_MAX_WIDTH } from '@/lib/buyer-preview';
import { BuyerFixedFooter } from '@/components/buyer/layout/BuyerFixedFooter';
import { getBuyerProductPrimaryImageUrl } from '@/lib/buyer-ui';
import { deriveBuyerPlaceOfSupply } from '@/lib/buyer-routing';
import { formatBuyerSelectedLocationLabel } from '@/lib/buyer-delivery-location';
import { computeBuyerCartTotals } from '@/lib/gst';
import type { BuyerCatalogItem } from '@/types/buyer';

type CartLineItem = {
  tenant_product_id: string;
  qty: number;
  unit_price: number;
  gst_rate?: number | null;
  product_name?: string;
};

type OrderPlaceResponse = {
  success: boolean;
  order_id?: string;
  order_number?: string | null;
  document_status_note?: string | null;
  document_url?: string | null;
  error?: string;
};

type EstimateResponse = {
  success: boolean;
  estimate_id?: string;
  estimate_number?: string | null;
  document_status_note?: string | null;
  document_url?: string | null;
  error?: string;
};

type SubmissionPhase = 'idle' | 'placing_order' | 'requesting_quote';

function WhatsAppIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
    </svg>
  );
}

const BACK_BTN: React.CSSProperties = {
  width: 44,
  height: 44,
  borderRadius: 999,
  background: 'var(--bg-surface)',
  border: '1px solid var(--border-1)',
  color: 'var(--cream-800)',
};

const STICKY_HEADER: React.CSSProperties = {
  height: 'var(--header-h, 56px)',
  background: 'rgba(250, 247, 242, 0.92)',
  backdropFilter: 'blur(14px)',
  WebkitBackdropFilter: 'blur(14px)',
  borderBottom: '1px solid rgba(212, 204, 192, 0.6)',
};

export default function CartPage() {
  const router = useRouter();
  const posthog = usePostHog();
  const { items, removeItem, updateQty, clearCart, addItem, replaceItems, resolvedCampaignId } = useCart();
  const delivery = useBuyerDeliveryOptional();
  const { data: meData } = useBuyerMe();
  const { data: cartBundlesData, isLoading: cartBundlesLoading } = useCartBundles();
  const tenantId = meData?.tenant.id ?? '';
  const selectedDelivery = delivery?.selected ?? null;
  const deliveryHydrated = delivery?.hydrated ?? true;
  const gstInclusive = meData?.business_policy.gst_inclusive ?? false;
  const gstRate = meData?.business_policy.gst_rate ?? 18;
  const allowPlaceOrder = meData?.order_features.create_sales_orders ?? false;
  const allowRequestQuote = meData?.order_features.create_enquiries ?? false;
  const [submissionPhase, setSubmissionPhase] = useState<SubmissionPhase>('idle');
  const [error, setError] = useState('');
  const [oosConfirmOpen, setOosConfirmOpen] = useState(false);

  useEffect(() => {
    router.prefetch('/buy/order-placed');
    router.prefetch('/buy/estimate-placed');
  }, [router]);

  useEffect(() => {
    if (!deliveryHydrated || selectedDelivery) return;
    router.replace('/buy/location?returnTo=' + encodeURIComponent('/buy/cart'));
  }, [deliveryHydrated, router, selectedDelivery]);

  const reconcileQuery = useBuyerResolvedProducts(
    items.map((item) => ({
      tenant_product_id: item.tenant_product_id,
      qty: item.quantity,
    })),
  );

  useEffect(() => {
    if (!reconcileQuery.data) return;
    const nextItems = reconcileQuery.data.items.map((product) => {
      const existing = items.find((item) => item.tenant_product_id === product.tenant_product_id);
      const quantity = existing?.quantity ?? 1;
      return {
        tenant_product_id: product.tenant_product_id,
        name: product.display_name,
        brand: product.brand_name ?? undefined,
        internal_sku: product.internal_sku,
        image_url: getBuyerProductPrimaryImageUrl(product) ?? undefined,
        unit_price: product.price,
        resolved_price: product.resolved_price,
        has_campaign_price: product.has_campaign_price,
        gst_rate: product.gst_rate ?? gstRate,
        unit: product.default_uom ?? undefined,
        quantity,
        line_total: product.price * quantity,
        tenant_category_id: product.category_id ?? undefined,
        campaign_id: existing?.campaign_id ?? resolvedCampaignId ?? undefined,
        stock_status: product.stock_status,
        on_hand: product.on_hand,
      } satisfies BuyerCartItem;
    });

    const currentSignature = JSON.stringify(items);
    const nextSignature = JSON.stringify(nextItems);
    if (currentSignature !== nextSignature) {
      replaceItems(nextItems);
    }
  }, [gstRate, items, reconcileQuery.data, replaceItems, resolvedCampaignId]);

  const stockVisible = meData?.stock_visibility?.enabled ?? false;
  const blockOnOos = meData?.stock_visibility?.block_order_on_oos ?? false;
  const blockingActive = stockVisible && blockOnOos;
  const oosItems = useMemo(
    () => items.filter((item) => item.stock_status === 'out_of_stock'),
    [items],
  );
  const inStockItems = useMemo(
    () => items.filter((item) => item.stock_status !== 'out_of_stock'),
    [items],
  );
  const hasOos = oosItems.length > 0;
  const itemCount = items.reduce((sum, item) => sum + item.quantity, 0);

  const deliveryFee = 0;
  const totals = useMemo(
    () => computeBuyerCartTotals(
      items.map((item) => ({
        quantity: item.quantity,
        unit_price: item.unit_price,
        disc_pct: 0,
        gst_rate: item.gst_rate ?? gstRate,
      })),
      gstInclusive,
      gstRate,
    ),
    [items, gstInclusive, gstRate],
  );
  const total = totals.total + deliveryFee;
  const ctaCount = (allowRequestQuote ? 1 : 0) + (allowPlaceOrder ? 1 : 0);
  const isBusy = submissionPhase !== 'idle';
  const placingOrder = submissionPhase === 'placing_order';
  const requestingQuote = submissionPhase === 'requesting_quote';
  const missingOutletSelection = !selectedDelivery;
  const missingRoutedLocation = Boolean(selectedDelivery && !selectedDelivery.routed_location_id);
  const ctaBlockedByLocation = missingOutletSelection || missingRoutedLocation;
  const cartLocationWarning = missingOutletSelection
    ? 'Choose an outlet to continue with your quote or order.'
    : missingRoutedLocation
      ? 'Choose an outlet that can be routed to a warehouse before you continue.'
      : null;

  function openOutletSelector(): void {
    markBuyerNavigationForward();
    router.push('/buy/location?returnTo=' + encodeURIComponent('/buy/cart'));
  }

  function buildLineItems(sourceItems: BuyerCartItem[] = items): CartLineItem[] {
    return sourceItems.map((i) => ({
      tenant_product_id: i.tenant_product_id,
      qty: i.quantity,
      unit_price: i.unit_price,
      gst_rate: i.gst_rate ?? gstRate,
      product_name: i.name,
    }));
  }

  function buildAnalyticsLineItems() {
    return items.map((item) => ({
      tenant_product_id: item.tenant_product_id,
      internal_sku: item.internal_sku ?? null,
      quantity: item.quantity,
      unit_price: item.unit_price,
      line_total: item.line_total,
      campaign_id: item.campaign_id ?? null,
      has_campaign_price: item.has_campaign_price === true,
      stock_status: item.stock_status ?? null,
    }));
  }

  function captureCartSubmitIntent(documentType: 'order' | 'estimate'): void {
    posthog?.capture('buyer_cart_submit_clicked', {
      document_type: documentType,
      tenant_id: tenantId || null,
      buyer_id: meData?.buyer_id ?? null,
      line_count: items.length,
      item_count: itemCount,
      unavailable_line_count: oosItems.length,
      subtotal: totals.subtotal,
      tax_amount: totals.tax_amount,
      total,
      line_items: buildAnalyticsLineItems(),
      gst_inclusive: gstInclusive,
      has_campaign_items: items.some((item) => item.has_campaign_price === true),
      campaign_id: resolvedCampaignId ?? null,
      has_delivery_location: Boolean(selectedDelivery),
      routed_location_id: selectedDelivery?.routed_location_id ?? null,
      delivery_source: selectedDelivery?.selection_source ?? null,
    });
  }

  function captureCartSubmitFailed(documentType: 'order' | 'estimate', message: string): void {
    posthog?.capture('buyer_cart_submit_failed', {
      document_type: documentType,
      tenant_id: tenantId || null,
      buyer_id: meData?.buyer_id ?? null,
      line_count: items.length,
      item_count: itemCount,
      subtotal: totals.subtotal,
      tax_amount: totals.tax_amount,
      total,
      line_items: buildAnalyticsLineItems(),
      error_reason: message,
    });
  }

  async function resolveFulfillmentPayload(): Promise<{
    location_id: string | null;
    place_of_supply: string | null;
  }> {
    if (!selectedDelivery) {
      return { location_id: null, place_of_supply: null };
    }
    return {
      location_id: selectedDelivery.routed_location_id ?? null,
      place_of_supply: selectedDelivery.place_of_supply ?? deriveBuyerPlaceOfSupply(selectedDelivery),
    };
  }

  const placeOrderMutation = useMutation({
    mutationFn: async (): Promise<string> => {
      if (!selectedDelivery) {
        throw new Error('Choose an outlet before placing an order.');
      }
      const { location_id, place_of_supply } = await resolveFulfillmentPayload();
      if (!location_id) {
        throw new Error('Choose an outlet that can be routed to a warehouse.');
      }
      const raw = await apiFetch('/api/buyer/orders', {
        method: 'POST',
        body: JSON.stringify({
          items: buildLineItems(),
          location_id,
          place_of_supply,
          campaign_id: resolvedCampaignId ?? undefined,
        }),
      });
      const res: OrderPlaceResponse = await raw.json();
      if (!raw.ok || !res.success) {
        throw new Error(res.error ?? 'Could not place order. Please try again.');
      }
      const params = new URLSearchParams({
        order_id: res.order_id ?? '',
        order_number: res.order_number ?? '',
        total: String(total),
      });
      if (res.document_url) {
        params.set('document_url', res.document_url);
      }
      if (res.document_status_note) {
        params.set('document_status_note', res.document_status_note);
      }
      return `/buy/order-placed?${params.toString()}`;
    },
    onMutate: () => {
      setError('');
      setSubmissionPhase('placing_order');
    },
    onSuccess: (href) => {
      router.replace(href);
    },
    onError: (mutationError) => {
      const message = mutationError instanceof Error
        ? mutationError.message
        : 'Network error. Please check your connection and try again.';
      captureCartSubmitFailed('order', message);
      setSubmissionPhase('idle');
      setError(message);
    },
  });

  const requestQuoteMutation = useMutation({
    mutationFn: async (): Promise<string> => {
      if (!selectedDelivery) {
        throw new Error('Choose an outlet before requesting a quote.');
      }
      const { location_id, place_of_supply } = await resolveFulfillmentPayload();
      if (!location_id) {
        throw new Error('Choose an outlet that can be routed to a warehouse.');
      }
      const raw = await apiFetch('/api/buyer/estimates', {
        method: 'POST',
        body: JSON.stringify({
          items: buildLineItems(),
          location_id,
          place_of_supply,
          campaign_id: resolvedCampaignId ?? undefined,
        }),
      });
      const res: EstimateResponse = await raw.json();
      if (!raw.ok || !res.success) {
        throw new Error(res.error ?? 'Could not request quote. Please try again.');
      }
      const params = new URLSearchParams({
        estimate_id: res.estimate_id ?? '',
        estimate_number: res.estimate_number ?? '',
        total: String(total),
      });
      if (res.document_url) {
        params.set('document_url', res.document_url);
      }
      if (res.document_status_note) {
        params.set('document_status_note', res.document_status_note);
      }
      return `/buy/estimate-placed?${params.toString()}`;
    },
    onMutate: () => {
      setError('');
      setSubmissionPhase('requesting_quote');
    },
    onSuccess: (href) => {
      router.replace(href);
    },
    onError: (mutationError) => {
      const message = mutationError instanceof Error
        ? mutationError.message
        : 'Network error. Please check your connection and try again.';
      captureCartSubmitFailed('estimate', message);
      setSubmissionPhase('idle');
      setError(message);
    },
  });

  const placeOrderWithSplitMutation = useMutation({
    mutationFn: async (): Promise<string> => {
      if (!selectedDelivery) {
        throw new Error('Choose an outlet before placing an order.');
      }
      const { location_id, place_of_supply } = await resolveFulfillmentPayload();
      if (!location_id) {
        throw new Error('Choose an outlet that can be routed to a warehouse.');
      }
      const estRaw = await apiFetch('/api/buyer/estimates', {
        method: 'POST',
        body: JSON.stringify({
          items: buildLineItems(oosItems),
          location_id,
          place_of_supply,
          campaign_id: resolvedCampaignId ?? undefined,
        }),
      });
      const estRes: EstimateResponse = await estRaw.json();
      if (!estRaw.ok || !estRes.success) {
        throw new Error(estRes.error ?? 'Could not submit an enquiry for the out-of-stock items.');
      }

      const orderRaw = await apiFetch('/api/buyer/orders', {
        method: 'POST',
        body: JSON.stringify({
          items: buildLineItems(inStockItems),
          location_id,
          place_of_supply,
          campaign_id: resolvedCampaignId ?? undefined,
        }),
      });
      const orderRes: OrderPlaceResponse = await orderRaw.json();
      if (!orderRaw.ok || !orderRes.success) {
        throw new Error(orderRes.error ?? 'Could not place order. Please try again.');
      }

      const inStockTotal = computeBuyerCartTotals(
        inStockItems.map((item) => ({
          quantity: item.quantity,
          unit_price: item.unit_price,
          disc_pct: 0,
          gst_rate: item.gst_rate ?? gstRate,
        })),
        gstInclusive,
        gstRate,
      ).total;

      const params = new URLSearchParams({
        order_id: orderRes.order_id ?? '',
        order_number: orderRes.order_number ?? '',
        total: String(inStockTotal),
      });
      if (orderRes.document_url) {
        params.set('document_url', orderRes.document_url);
      }
      if (orderRes.document_status_note) {
        params.set('document_status_note', orderRes.document_status_note);
      }
      if (estRes.estimate_number) {
        params.set('linked_estimate_number', estRes.estimate_number);
      }
      if (estRes.estimate_id) {
        params.set('linked_estimate_id', estRes.estimate_id);
      }
      return `/buy/order-placed?${params.toString()}`;
    },
    onMutate: () => {
      setError('');
      setSubmissionPhase('placing_order');
    },
    onSuccess: (href) => {
      setOosConfirmOpen(false);
      router.replace(href);
    },
    onError: (mutationError) => {
      const message = mutationError instanceof Error
        ? mutationError.message
        : 'Network error. Please check your connection and try again.';
      captureCartSubmitFailed('order', message);
      setSubmissionPhase('idle');
      setOosConfirmOpen(false);
      setError(message);
    },
  });

  function handlePlaceOrder() {
    if (isBusy || items.length === 0) return;
    if (!selectedDelivery) {
      openOutletSelector();
      setError('Choose an outlet before placing an order.');
      return;
    }
    if (!selectedDelivery.routed_location_id) {
      openOutletSelector();
      setError('Choose an outlet that can be routed to a warehouse.');
      return;
    }
    if (blockingActive && hasOos) {
      setOosConfirmOpen(true);
      return;
    }
    captureCartSubmitIntent('order');
    placeOrderMutation.mutate();
  }

  function handleConfirmPlaceOrderWithSplit() {
    if (isBusy) return;
    captureCartSubmitIntent('order');
    placeOrderWithSplitMutation.mutate();
  }

  function handleRequestQuote() {
    if (isBusy || items.length === 0) return;
    if (!selectedDelivery) {
      openOutletSelector();
      setError('Choose an outlet before requesting a quote.');
      return;
    }
    if (!selectedDelivery.routed_location_id) {
      openOutletSelector();
      setError('Choose an outlet that can be routed to a warehouse.');
      return;
    }
    captureCartSubmitIntent('estimate');
    requestQuoteMutation.mutate();
  }


  if (items.length === 0) {
    return (
      <>
        <header className="sticky top-0 z-20 flex items-center px-4" style={STICKY_HEADER}>
          <button onClick={() => navigateBuyerBack(router)} className="flex items-center justify-center shrink-0 p-0" style={BACK_BTN} aria-label="Go back">
            <ChevronLeft className="h-5 w-5" />
          </button>
          <h1 className="flex-1 text-center font-semibold" style={{ fontSize: 'var(--b-text-header)', fontFamily: 'var(--font-display)', color: 'var(--fg-1, var(--cream-900))' }}>
            Cart
          </h1>
          <div style={{ width: 36 }} />
        </header>

        <div className="flex flex-col items-center justify-center px-6 py-24 gap-4 text-center">
          <div className="flex items-center justify-center w-16 h-16 rounded-2xl" style={{ background: 'var(--cream-100)' }}>
            <ShoppingCart className="w-8 h-8" style={{ color: 'var(--cream-400)' }} />
          </div>
          <div>
            <h2 className="font-semibold mb-1" style={{ fontSize: 'var(--b-text-section)', fontFamily: 'var(--font-display)', fontWeight: 500, color: 'var(--fg-1, var(--cream-900))' }}>
              Your cart is empty
            </h2>
            <p style={{ fontSize: 'var(--b-text-body)', color: 'var(--fg-3, var(--cream-600))' }}>
              Add products from the catalog to get started.
            </p>
          </div>
          <button
            onClick={() => {
              posthog?.capture('buyer_empty_cart_browse_clicked', {
                source_surface: 'cart_empty_state',
              });
              router.push('/buy/catalog');
            }}
            className="mt-2 inline-flex items-center gap-2 px-5 py-2.5 font-semibold text-white"
            style={{ fontSize: 'var(--b-text-label)', background: 'var(--teal-500)', borderRadius: 10 }}
          >
            Browse Catalog
          </button>
        </div>
      </>
    );
  }

  return (
    <>
      {/* Sticky header */}
      <header className="sticky top-0 z-20 flex items-center px-4" style={STICKY_HEADER}>
        <button onClick={() => navigateBuyerBack(router)} className="flex items-center justify-center shrink-0 p-0" style={BACK_BTN} aria-label="Go back">
          <ChevronLeft className="h-5 w-5" />
        </button>
        <h1 className="flex-1 text-center font-semibold" style={{ fontSize: 'var(--b-text-header)', fontFamily: 'var(--font-display)', color: 'var(--fg-1, var(--cream-900))' }}>
          Cart
        </h1>
        <button
          onClick={() => clearCart()}
          disabled={isBusy}
          className="font-medium disabled:opacity-50"
          style={{ fontSize: 'var(--b-text-label)', color: 'var(--danger-500)' }}
        >
          Clear
        </button>
      </header>

      {/* Scrollable content */}
      <div className="px-4 pt-4 space-y-3" style={{ paddingBottom: '7rem' }}>
        {/* Inline page head */}
        <div className="pb-1">
          <p className="font-semibold uppercase mb-0.5" style={{ fontSize: 'var(--b-text-eyebrow)', letterSpacing: '0.14em', color: 'var(--cream-600)' }}>
            {items.length} items · {itemCount} {itemCount === 1 ? 'unit' : 'units'}
          </p>
          <h2 className="font-semibold" style={{ fontFamily: 'var(--font-display)', fontSize: 'var(--b-text-section)', fontWeight: 500, letterSpacing: '-0.005em', color: 'var(--fg-1, var(--cream-900))' }}>
            Review &amp; place
          </h2>
        </div>

        {/* All items in one card, in cart order, separated by dividers. Qty/price stay
            editable for every line — out-of-stock lines just gray out for visibility.
            Manual removal is always available; blocking (when the tenant enforces it)
            is handled at submit time via the confirmation dialog below. */}
        <div className="rounded-[12px] overflow-hidden" style={{ border: '1px solid var(--border-1)', background: 'var(--bg-surface, #fff)' }}>
          {items.map((item, idx) => (
            <CartPageItem
              key={item.tenant_product_id}
              item={item}
              onQtyChange={updateQty}
              onRemove={removeItem}
              showDivider={idx > 0}
              stockBadgeVisible={stockVisible && item.stock_status !== 'available'}
              grayedOut={stockVisible && item.stock_status === 'out_of_stock'}
            />
          ))}
        </div>

        {/* W6: Complete Your Cart — gap widget. Reserves a stable single-row height
            while the recommendation query is loading, so the totals/delivery cards
            below don't jump once it resolves. Still collapses to nothing once we know
            for certain there's no bundle gap to show — that's a real content absence,
            not a loading state, so there's no space left to reserve for it. */}
        {cartBundlesLoading ? (
          <div
            className="overflow-hidden rounded-[12px]"
            style={{ border: '1px solid var(--teal-100, #ccfbf1)', background: 'var(--teal-50, #f0fdfa)' }}
            aria-hidden
          >
            <div
              className="flex animate-pulse items-center gap-2 px-3 py-2"
              style={{ borderBottom: '1px solid var(--teal-100, #ccfbf1)' }}
            >
              <div className="h-3.5 w-3.5 shrink-0 rounded-full" style={{ background: 'var(--teal-200, #99f6e4)' }} />
              <div className="h-3.5 w-40 rounded-full" style={{ background: 'var(--teal-200, #99f6e4)' }} />
            </div>
            <div className="px-3 py-2">
              {Array.from({ length: 2 }).map((_, index) => (
                <div key={index}>
                  {index > 0 ? (
                    <div className="border-t border-teal-100" style={{ borderColor: 'var(--teal-100, #ccfbf1)' }} />
                  ) : null}
                  <div className="flex animate-pulse gap-3 py-3">
                    <div className="h-14 w-14 shrink-0 rounded-lg bg-teal-200/80" />
                    <div className="flex flex-1 flex-col justify-center gap-1.5">
                      <div className="h-3.5 w-3/4 rounded-full bg-teal-200/80" />
                      <div className="h-3 w-1/2 rounded-full bg-teal-200/60" />
                    </div>
                    <div className="h-9 w-9 shrink-0 self-center rounded-lg bg-teal-200/80" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : cartBundlesData && tenantId ? (
          <CartGapWidget
            bundles={cartBundlesData.bundles}
            items={items}
            tenantId={tenantId}
          />
        ) : null}

        {/* Totals card */}
        <div className="rounded-[12px] overflow-hidden" style={{ border: '1px solid var(--border-1)', background: 'var(--bg-surface, #fff)' }}>
          <div className="px-4 py-3.5 space-y-2.5">
            <TotalsRow label="Subtotal" value={formatNumberValue(totals.subtotal, 'CURRENCY_EXACT')} />
            <TotalsRow label="GST" value={gstInclusive ? 'Included in Prices' : formatNumberValue(totals.tax_amount, 'CURRENCY_EXACT')} isText={gstInclusive} />
            <TotalsRow label="Delivery" value={deliveryFee === 0 ? 'Included' : formatNumberValue(deliveryFee, 'CURRENCY_EXACT')} isText />
          </div>
          <div className="px-4 py-3 flex items-center justify-between" style={{ borderTop: '1px solid var(--border-1)' }}>
            <span style={{ fontSize: 'var(--b-text-label)', fontWeight: 600, color: 'var(--fg-1, var(--cream-900))' }}>
              Total
            </span>
            <span style={{ fontSize: 'var(--b-text-header)', fontFamily: 'var(--font-mono)', fontWeight: 600, letterSpacing: '-0.02em', color: 'var(--fg-1, var(--cream-900))' }}>
              {formatNumberValue(total, 'CURRENCY_EXACT')}
            </span>
          </div>
        </div>

        {/* Delivery row */}
        <button
          onClick={openOutletSelector}
          className="w-full rounded-[12px] px-4 py-3 flex items-center gap-3 text-left"
          style={{
            border: `1px solid ${cartLocationWarning ? 'var(--danger-200, #fecaca)' : 'var(--border-1)'}`,
            background: cartLocationWarning ? 'var(--danger-50, #fef2f2)' : 'var(--bg-surface, #fff)',
          }}
        >
          <div className="flex items-center justify-center shrink-0" style={{ width: 32, height: 32, borderRadius: 8, background: 'var(--ember-50)' }}>
            <MapPin className="w-3.5 h-3.5" style={{ color: 'var(--ember-400)' }} />
          </div>
          <div className="flex-1 min-w-0">
            {delivery?.selected ? (
              <>
                <p className="uppercase" style={{ fontSize: 'var(--b-text-eyebrow)', letterSpacing: '0.14em', color: 'var(--cream-600)' }}>
                  {delivery.selected.selection_source === 'outlet' ? `${meData?.tenant.name ?? 'Seller'} outlet` : 'Deliver to'}
                </p>
                <p className="font-semibold truncate" style={{ fontSize: 'var(--b-text-label)', color: 'var(--fg-1, var(--cream-900))' }}>
                  {formatBuyerSelectedLocationLabel(delivery.selected)}
                </p>
                <p className="truncate" style={{ fontSize: 'var(--b-text-sub)', color: 'var(--fg-3, var(--cream-600))' }}>
                  {delivery.selected.selection_source === 'maps'
                    ? [delivery.selected.label, delivery.selected.city].filter(Boolean).join(' · ')
                    : [delivery.selected.city, delivery.selected.pincode].filter(Boolean).join(' · ')}
                </p>
              </>
            ) : (
              <>
                <p className="uppercase" style={{ fontSize: 'var(--b-text-eyebrow)', letterSpacing: '0.14em', color: 'var(--cream-600)' }}>Choose seller outlet</p>
                <p className="font-semibold" style={{ fontSize: 'var(--b-text-label)', color: 'var(--fg-1, var(--cream-900))' }}>
                  Choose outlet
                </p>
              </>
            )}
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <span className="font-medium" style={{ fontSize: 'var(--b-text-sub)', color: 'var(--teal-500)' }}>Change</span>
            <ChevronRight className="w-3 h-3" style={{ color: 'var(--teal-500)' }} />
          </div>
        </button>

        {cartLocationWarning ? (
          <div
            className="rounded-[12px] px-4 py-3"
            style={{ background: 'var(--danger-50, #fef2f2)', border: '1px solid var(--danger-200, #fecaca)' }}
          >
            <p style={{ fontSize: 'var(--b-text-sub)', color: 'var(--danger-600, #dc2626)', lineHeight: '1.45' }}>
              {cartLocationWarning}
            </p>
          </div>
        ) : null}

        {/* Manual-location pickup note */}
        {delivery?.selected?.selection_source === 'maps' && delivery.selected.routed_location_name ? (
          <div className="rounded-[12px] px-4 py-3 flex items-start gap-2.5" style={{ background: 'var(--teal-50, #f0fdfa)', border: '1px solid var(--teal-100, #ccfbf1)' }}>
            <MapPin className="w-3.5 h-3.5 mt-0.5 shrink-0" style={{ color: 'var(--teal-500)' }} />
            <p style={{ fontSize: 'var(--b-text-sub)', color: 'var(--teal-700, #0f766e)', lineHeight: '1.45' }}>
              {`You can pick up your order from the ${delivery.selected.routed_location_name} outlet.`}
            </p>
          </div>
        ) : null}

        {/* Error */}
        {error && (
          <div className="rounded-[12px] px-4 py-3" style={{ background: '#FEE2E2', color: '#B91C1C', fontSize: 'var(--b-text-label)' }}>
            {error}
          </div>
        )}
      </div>

      {/* Sticky footer */}
      <BuyerFixedFooter
        className="left-1/2 w-full px-4 pt-2.5"
        style={{
          transform: 'translateX(-50%)',
          maxWidth: BUYER_PREVIEW_MAX_WIDTH,
          paddingBottom: 'calc(0.875rem + env(safe-area-inset-bottom, 0px))',
          background: 'rgba(250, 247, 242, 0.94)',
          backdropFilter: 'blur(12px)',
          WebkitBackdropFilter: 'blur(12px)',
          borderTop: '1px solid var(--border-1)',
        }}
      >
        {/* Total is always visible above the CTAs — inline next to the single CTA
            when only one of estimates/orders is enabled for this tenant, or on its
            own row above both when both are enabled. `ctaCount` reflects a tenant-level
            setting (order_features), so this layout doesn't change cart-to-cart. */}
        {ctaCount === 2 && (
          <div className="flex items-center justify-between pb-2">
            <span style={{ fontSize: 'var(--b-text-label)', fontWeight: 600, color: 'var(--fg-1, var(--cream-900))' }}>
              Total
            </span>
            <span
              className="tabular-nums"
              style={{ fontSize: 'var(--b-text-label)', fontFamily: 'var(--font-mono)', fontWeight: 600, color: 'var(--fg-1, var(--cream-900))' }}
            >
              {formatNumberValue(total, 'CURRENCY_EXACT')}
            </span>
          </div>
        )}
        <div className="flex items-center gap-2">
          {ctaCount === 1 && (
            <div className="flex shrink-0 flex-col">
              <span className="uppercase" style={{ fontSize: 'var(--b-text-eyebrow)', letterSpacing: '0.1em', color: 'var(--fg-3, var(--cream-600))' }}>
                Total
              </span>
              <span
                className="tabular-nums"
                style={{ fontSize: 'var(--b-text-label)', fontFamily: 'var(--font-mono)', fontWeight: 600, color: 'var(--fg-1, var(--cream-900))' }}
              >
                {formatNumberValue(total, 'CURRENCY_EXACT')}
              </span>
            </div>
          )}
          {allowRequestQuote && (
            <button
              onClick={handleRequestQuote}
              disabled={isBusy || items.length === 0 || ctaBlockedByLocation}
              className="flex h-12 flex-1 items-center justify-center gap-1.5 font-semibold text-white transition-opacity disabled:opacity-60"
              style={{ fontSize: 'var(--b-text-label)', background: 'var(--teal-500)', borderRadius: 10 }}
            >
              <WhatsAppIcon className="w-4 h-4 shrink-0" />
              {requestingQuote ? 'Requesting...' : 'Get WhatsApp quote'}
            </button>
          )}
          {allowPlaceOrder && (
            <button
              onClick={handlePlaceOrder}
              disabled={isBusy || items.length === 0 || ctaBlockedByLocation}
              className="flex h-12 flex-1 items-center justify-center gap-1.5 font-semibold text-white transition-opacity disabled:opacity-60"
              style={{ fontSize: 'var(--b-text-label)', background: 'var(--ember-400)', borderRadius: 10 }}
            >
              <Check className="w-4 h-4 shrink-0" />
              {placingOrder ? 'Placing…' : 'Place order'}
            </button>
          )}
        </div>
      </BuyerFixedFooter>

      <AlertDialog open={oosConfirmOpen} onOpenChange={(open) => !isBusy && setOosConfirmOpen(open)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Some items are out of stock</AlertDialogTitle>
            <AlertDialogDescription>
              {oosItems.length} out-of-stock item{oosItems.length > 1 ? 's' : ''} will be submitted as an Enquiry.
              Your Order will include only the {inStockItems.length} in-stock item{inStockItems.length === 1 ? '' : 's'}.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <DialogBody className="space-y-1">
            {oosItems.map((item) => (
              <p
                key={item.tenant_product_id}
                className="truncate"
                style={{ fontSize: 'var(--b-text-sub)', color: 'var(--fg-3, var(--cream-600))' }}
              >
                {item.name}
              </p>
            ))}
          </DialogBody>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isBusy}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmPlaceOrderWithSplit} disabled={isBusy}>
              {placingOrder ? 'Submitting…' : 'Submit order & enquiry'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function TotalsRow({ label, value, isText }: { label: string; value: string; isText?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <span style={{ fontSize: 'var(--b-text-label)', color: 'var(--fg-3, var(--cream-700))' }}>{label}</span>
      <span style={{ fontSize: 'var(--b-text-label)', fontWeight: 500, color: 'var(--fg-1, var(--cream-900))', fontFamily: isText ? undefined : 'var(--font-mono)' }}>
        {value}
      </span>
    </div>
  );
}

function CartPageItem({
  item,
  onQtyChange,
  onRemove,
  showDivider,
  stockBadgeVisible = false,
  grayedOut = false,
}: {
  item: BuyerCartItem;
  onQtyChange: (tenant_product_id: string, qty: number) => void;
  onRemove: (tenant_product_id: string) => void;
  showDivider: boolean;
  stockBadgeVisible?: boolean;
  grayedOut?: boolean;
}) {
  const subline = [item.brand, item.internal_sku].filter(Boolean).join(' · ');
  const showCampaignPrice = Boolean(
    item.has_campaign_price
    && item.resolved_price != null
    && Math.abs(item.resolved_price - item.unit_price) > 0.004,
  );
  const stockBadgeLabel = item.stock_status === 'out_of_stock' ? 'Out of stock' : 'Low stock';

  return (
    <>
      {showDivider && <div style={{ borderTop: '1px solid var(--border-1)' }} />}
      <div className="flex gap-3 px-4 py-3.5" style={grayedOut ? { opacity: 0.55 } : undefined}>
        {/* Thumbnail 56×56 */}
        <div
          className="relative rounded-lg flex items-center justify-center overflow-hidden shrink-0"
          style={{ width: 56, height: 56, background: 'var(--cream-100)' }}
        >
          {item.image_url ? (
            <Image
              src={item.image_url}
              alt={item.name}
              fill
              className="object-cover"
              sizes="56px"
              unoptimized
            />
          ) : (
            <Package className="h-6 w-6" style={{ color: 'var(--cream-400)' }} />
          )}
        </div>

        {/* Left: name + sku + delete */}
        <div className="flex flex-1 min-w-0 flex-col justify-between py-0.5">
          <div className="min-w-0">
            <p className="font-semibold leading-snug truncate" style={{ fontSize: 'var(--b-text-label)', color: 'var(--fg-1, var(--cream-900))' }}>
              {item.name}
            </p>
            {subline ? (
              <p className="mt-0.5 truncate" style={{ fontSize: 'var(--b-text-sub)', color: 'var(--fg-3, var(--cream-600))' }}>
                {subline}
              </p>
            ) : null}
            <div className="mt-1 flex flex-wrap items-baseline gap-x-2 gap-y-1" style={{ color: 'var(--fg-3, var(--cream-600))' }}>
              <span className="tabular-nums" style={{ fontSize: 'var(--b-text-sub)', fontFamily: 'var(--font-mono)' }}>
                {formatNumberValue(item.unit_price, 'CURRENCY_EXACT')}
                {item.unit ? ` / ${item.unit}` : ''}
              </span>
              {showCampaignPrice ? (
                <span className="tabular-nums line-through" style={{ fontSize: 'var(--b-text-eyebrow)', fontFamily: 'var(--font-mono)' }}>
                  {formatNumberValue(item.resolved_price, 'CURRENCY_EXACT')}
                </span>
              ) : null}
            </div>
            {stockBadgeVisible ? (
              <p className="mt-1 font-semibold" style={{ fontSize: 'var(--b-text-sub)', color: 'var(--danger-500)' }}>
                {stockBadgeLabel}
              </p>
            ) : null}
          </div>
          <button
            onClick={() => onRemove(item.tenant_product_id)}
            className="self-start mt-1.5"
            style={{ color: 'var(--cream-400)' }}
            aria-label="Remove item"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>

        {/* Right: qty stepper + item total */}
        <div className="flex flex-col items-end justify-between shrink-0 py-0.5">
          {/* Pill stepper — no input, just buttons */}
          <div className="flex items-center" style={{ borderRadius: 999, overflow: 'hidden', background: 'var(--teal-500)' }}>
            <button
              onClick={() => onQtyChange(item.tenant_product_id, item.quantity - 1)}
              className="flex items-center justify-center"
              style={{ width: 24, height: 24, color: '#fff' }}
              aria-label="Decrease"
            >
              <Minus className="h-2.5 w-2.5" />
            </button>
            <span
              className="tabular-nums font-semibold text-center"
              style={{ minWidth: '1.25rem', fontSize: 'var(--b-text-sub)', fontFamily: 'var(--font-mono)', color: '#fff' }}
            >
              {item.quantity}
            </span>
            <button
              onClick={() => onQtyChange(item.tenant_product_id, item.quantity + 1)}
              className="flex items-center justify-center"
              style={{ width: 24, height: 24, color: '#fff' }}
              aria-label="Increase"
            >
              <Plus className="h-2.5 w-2.5" />
            </button>
          </div>
          {/* Item total */}
          <span
            className="tabular-nums font-semibold"
            style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--b-text-body)', color: 'var(--fg-1, var(--cream-900))', letterSpacing: '-0.01em' }}
          >
            {formatNumberValue(item.line_total, 'CURRENCY_EXACT')}
          </span>
        </div>
      </div>
    </>
  );
}
