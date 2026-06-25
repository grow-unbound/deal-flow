import { cache } from 'react';
import { FEATURE_FLAGS } from '@/constants';
import { getFlag } from '@/lib/flags';
import { supabaseAdmin } from '@/lib/supabase';

export const SELLER_SHELL_FLAGS = {
  brandProductMaster: FEATURE_FLAGS.BRAND_PRODUCT_MASTER,
  customerMaster: FEATURE_FLAGS.CUSTOMER_MASTER,
  cohorts: FEATURE_FLAGS.COHORTS,
  pricingEngine: FEATURE_FLAGS.PRICING_ENGINE,
  catalogPublishing: FEATURE_FLAGS.CATALOG_PUBLISHING,
  buyerApp: FEATURE_FLAGS.BUYER_APP,
  estimates: FEATURE_FLAGS.ESTIMATES,
  salesOrders: FEATURE_FLAGS.SALES_ORDERS,
  invoices: FEATURE_FLAGS.INVOICES,
  tallyExport: FEATURE_FLAGS.TALLY_EXPORT,
  integrations: FEATURE_FLAGS.INTEGRATIONS,
} as const;

export type SellerShellFeatureAvailability = Record<keyof typeof SELLER_SHELL_FLAGS, boolean>;

const getFlagCached = cache(async (flagName: string, tenantId: string) => getFlag(flagName, tenantId));

/** Fetch in-app feature toggles from tenant_settings. Returns defaults when not set. */
async function getInAppFeatureToggles(tenantId: string): Promise<{
  estimates: boolean;
  salesOrders: boolean;
  invoices: boolean;
  pricingEngine: boolean;
  cohorts: boolean;
  catalogPublishing: boolean;
  buyerApp: boolean;
}> {
  if (!supabaseAdmin) {
    return { estimates: true, salesOrders: true, invoices: true, pricingEngine: true, cohorts: true, catalogPublishing: true, buyerApp: true };
  }
  const { data } = await (supabaseAdmin as any)
    .schema('app')
    .from('tenant_settings')
    .select('settings')
    .eq('tenant_id', tenantId)
    .maybeSingle();

  if (!data?.settings) {
    return { estimates: true, salesOrders: true, invoices: true, pricingEngine: true, cohorts: true, catalogPublishing: true, buyerApp: true };
  }

  const s = data.settings as Record<string, unknown>;
  const orders = (s.orders as Record<string, unknown> | undefined) ?? {};
  const features = (orders.features as Record<string, unknown> | undefined) ?? {};
  const catalog = (s.catalog as Record<string, unknown> | undefined) ?? {};
  const buyerApp = (s.buyer_app as Record<string, unknown> | undefined) ?? {};

  return {
    estimates: features.enquiries !== false,
    salesOrders: features.sales_orders !== false,
    invoices: features.invoices !== false,
    pricingEngine: catalog.price_lists_enabled !== false,
    cohorts: catalog.cohort_pricing_enabled !== false,
    catalogPublishing: catalog.catalog_publishing_enabled === true,
    buyerApp: buyerApp.enabled === true,
  };
}

export const getSellerShellFeatureAvailability = cache(async (tenantId: string): Promise<SellerShellFeatureAvailability> => {
  const [posthogEntries, inApp] = await Promise.all([
    Promise.all(
      Object.entries(SELLER_SHELL_FLAGS).map(async ([key, flagName]) => {
        const value = await getFlagCached(flagName, tenantId);
        return [key, value] as const;
      }),
    ),
    getInAppFeatureToggles(tenantId),
  ]);

  const posthog = Object.fromEntries(posthogEntries) as SellerShellFeatureAvailability;

  // For toggles that have in-app controls, require BOTH PostHog flag AND in-app setting
  return {
    ...posthog,
    estimates: posthog.estimates && inApp.estimates,
    salesOrders: posthog.salesOrders && inApp.salesOrders,
    invoices: posthog.invoices && inApp.invoices,
    pricingEngine: posthog.pricingEngine && inApp.pricingEngine,
    cohorts: posthog.cohorts && inApp.cohorts,
    catalogPublishing: posthog.catalogPublishing && inApp.catalogPublishing,
    buyerApp: posthog.buyerApp && inApp.buyerApp,
  };
});

/** Fetch create_* flags. Returns true (allow creation) when not explicitly disabled. */
export async function getInAppCreateFlags(tenantId: string): Promise<{
  create_enquiries: boolean;
  create_sales_orders: boolean;
  create_invoices: boolean;
}> {
  if (!supabaseAdmin) {
    return { create_enquiries: true, create_sales_orders: true, create_invoices: true };
  }
  const { data } = await (supabaseAdmin as any)
    .schema('app')
    .from('tenant_settings')
    .select('settings')
    .eq('tenant_id', tenantId)
    .maybeSingle();

  if (!data?.settings) {
    return { create_enquiries: true, create_sales_orders: true, create_invoices: true };
  }
  const s = data.settings as Record<string, unknown>;
  const orders = (s.orders as Record<string, unknown> | undefined) ?? {};
  const features = (orders.features as Record<string, unknown> | undefined) ?? {};
  return {
    create_enquiries: features.create_enquiries !== false,
    create_sales_orders: features.create_sales_orders !== false,
    create_invoices: features.create_invoices !== false,
  };
}

export function hasSellerShellFeature(
  availability: SellerShellFeatureAvailability,
  key: keyof SellerShellFeatureAvailability,
) {
  return availability[key] === true;
}
