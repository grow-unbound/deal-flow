import { cache } from 'react';
import { FEATURE_FLAGS } from '@/constants';
import { getFlag } from '@/lib/flags';

export const SELLER_SHELL_FLAGS = {
  brandProductMaster: FEATURE_FLAGS.BRAND_PRODUCT_MASTER,
  customerMaster: FEATURE_FLAGS.CUSTOMER_MASTER,
  cohorts: FEATURE_FLAGS.COHORTS,
  pricingEngine: FEATURE_FLAGS.PRICING_ENGINE,
  catalogPublishing: FEATURE_FLAGS.CATALOG_PUBLISHING,
  estimates: FEATURE_FLAGS.ESTIMATES,
  salesOrders: FEATURE_FLAGS.SALES_ORDERS,
  invoices: FEATURE_FLAGS.INVOICES,
  tallyExport: FEATURE_FLAGS.TALLY_EXPORT,
  integrations: FEATURE_FLAGS.INTEGRATIONS,
} as const;

export type SellerShellFeatureAvailability = Record<keyof typeof SELLER_SHELL_FLAGS, boolean>;

const getFlagCached = cache(async (flagName: string, tenantId: string) => getFlag(flagName, tenantId));

export const getSellerShellFeatureAvailability = cache(async (tenantId: string): Promise<SellerShellFeatureAvailability> => {
  const entries = await Promise.all(
    Object.entries(SELLER_SHELL_FLAGS).map(async ([key, flagName]) => {
      const value = await getFlagCached(flagName, tenantId);
      return [key, value] as const;
    }),
  );

  return Object.fromEntries(entries) as SellerShellFeatureAvailability;
});

export function hasSellerShellFeature(
  availability: SellerShellFeatureAvailability,
  key: keyof SellerShellFeatureAvailability,
) {
  return availability[key] === true;
}
