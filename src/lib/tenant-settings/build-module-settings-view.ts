import { DEFAULT_TENANT_SETTINGS_STORED } from '@/lib/tenant-settings/defaults';
import type { TenantRowForSettings } from '@/lib/tenant-settings/build-general-view';
import {
  BuyerAppSettingsSchema,
  CatalogSettingsSchema,
  OrdersSettingsSchema,
  ProductDefaultsSchema,
  TenantSettingsStoredSchema,
  type ModuleSettingsView,
} from '@/types/tenant-settings';

function deepMergeObjects<T extends Record<string, unknown>>(base: T, patch: Record<string, unknown>): T {
  const out = { ...base } as T;
  for (const key of Object.keys(patch)) {
    const pv = patch[key];
    const existing = out[key as keyof T] as unknown;
    if (
      pv !== undefined &&
      pv !== null &&
      typeof pv === 'object' &&
      !Array.isArray(pv) &&
      typeof existing === 'object' &&
      existing !== null &&
      !Array.isArray(existing)
    ) {
      (out as Record<string, unknown>)[key] = deepMergeObjects(
        existing as Record<string, unknown>,
        pv as Record<string, unknown>,
      );
    } else if (pv !== undefined) {
      (out as Record<string, unknown>)[key] = pv;
    }
  }
  return out;
}

export interface TenantUsageCounts {
  cohorts: number;
  price_lists: number;
  catalogs: number;
}

export interface TenantOpenCounts {
  enquiries: number;
  sales_orders: number;
  invoices: number;
}

export function buildModuleSettingsView(
  rawSettings: unknown,
  tenant: TenantRowForSettings,
  usage: TenantUsageCounts,
  openCounts: TenantOpenCounts,
): ModuleSettingsView {
  const parsed = TenantSettingsStoredSchema.safeParse(rawSettings ?? {});
  const fromDb = parsed.success ? parsed.data : {};
  const merged = deepMergeObjects(
    DEFAULT_TENANT_SETTINGS_STORED as unknown as Record<string, unknown>,
    fromDb as Record<string, unknown>,
  ) as typeof DEFAULT_TENANT_SETTINGS_STORED;

  const productDefaultsRaw = {
    ...DEFAULT_TENANT_SETTINGS_STORED.product_defaults,
    ...merged.product_defaults,
  };
  const ordersRaw = {
    ...DEFAULT_TENANT_SETTINGS_STORED.orders,
    ...merged.orders,
    features: {
      ...DEFAULT_TENANT_SETTINGS_STORED.orders.features,
      ...merged.orders?.features,
    },
  };
  const buyerAppRaw = {
    ...DEFAULT_TENANT_SETTINGS_STORED.buyer_app,
    ...merged.buyer_app,
  };
  const catalogRaw = {
    ...DEFAULT_TENANT_SETTINGS_STORED.catalog,
    ...merged.catalog,
  };

  const plan =
    tenant.plan === 'growth' || tenant.plan === 'scale' || tenant.plan === 'starter'
      ? tenant.plan
      : 'starter';

  const productParsed = ProductDefaultsSchema.safeParse(productDefaultsRaw);
  const ordersParsed = OrdersSettingsSchema.safeParse(ordersRaw);
  const buyerParsed = BuyerAppSettingsSchema.safeParse(buyerAppRaw);
  const catalogParsed = CatalogSettingsSchema.safeParse(catalogRaw);

  return {
    product_defaults: productParsed.success
      ? productParsed.data
      : DEFAULT_TENANT_SETTINGS_STORED.product_defaults,
    orders: ordersParsed.success ? ordersParsed.data : DEFAULT_TENANT_SETTINGS_STORED.orders,
    buyer_app: buyerParsed.success ? buyerParsed.data : DEFAULT_TENANT_SETTINGS_STORED.buyer_app,
    catalog: catalogParsed.success ? catalogParsed.data : DEFAULT_TENANT_SETTINGS_STORED.catalog,
    plan,
    usage,
    open_counts: openCounts,
  };
}
