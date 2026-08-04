export type BuyerOrdersTabId = 'orders' | 'enquiries' | 'invoices';

/** Tri-state PostHog flag: undefined while loading. */
export type BuyerOrdersFlagState = boolean | undefined;

export interface BuyerOrderFeatureFlags {
  enquiries: boolean;
  sales_orders: boolean;
  invoices: boolean;
}

export interface BuyerOrdersTabVisibility {
  orders: boolean;
  enquiries: boolean;
  invoices: boolean;
  ready: boolean;
}

/** Default open tab for /buy/orders — invoices first, then orders, then enquiries. */
export const BUYER_ORDERS_DEFAULT_TAB: BuyerOrdersTabId = 'invoices';

const TAB_FALLBACK_ORDER: BuyerOrdersTabId[] = ['invoices', 'orders', 'enquiries'];

/**
 * AND of PostHog flag + tenant `orders.features`.
 * Mirrors seller customers landing: wait until both sides resolve before showing tabs.
 */
export function resolveBuyerOrdersTabVisibility(input: {
  orderFeatures: BuyerOrderFeatureFlags | null | undefined;
  salesOrdersFlag: BuyerOrdersFlagState;
  estimatesFlag: BuyerOrdersFlagState;
  invoicesFlag: BuyerOrdersFlagState;
}): BuyerOrdersTabVisibility {
  const { orderFeatures, salesOrdersFlag, estimatesFlag, invoicesFlag } = input;
  const ready =
    orderFeatures != null
    && salesOrdersFlag !== undefined
    && estimatesFlag !== undefined
    && invoicesFlag !== undefined;

  if (!ready || !orderFeatures) {
    return { orders: false, enquiries: false, invoices: false, ready: false };
  }

  return {
    ready: true,
    orders: salesOrdersFlag !== false && orderFeatures.sales_orders,
    enquiries: estimatesFlag !== false && orderFeatures.enquiries,
    invoices: invoicesFlag !== false && orderFeatures.invoices,
  };
}

export function resolveBuyerOrdersDefaultTab(
  visibility: BuyerOrdersTabVisibility,
  preferred: BuyerOrdersTabId = BUYER_ORDERS_DEFAULT_TAB,
): BuyerOrdersTabId | null {
  if (!visibility.ready) return null;
  if (visibility[preferred]) return preferred;
  return TAB_FALLBACK_ORDER.find((tab) => visibility[tab]) ?? null;
}

export function isBuyerOrdersTabId(value: string | null | undefined): value is BuyerOrdersTabId {
  return value === 'orders' || value === 'enquiries' || value === 'invoices';
}
