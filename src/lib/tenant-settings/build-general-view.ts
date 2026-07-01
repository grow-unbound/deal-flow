import { DEFAULT_TENANT_SETTINGS_STORED } from '@/lib/tenant-settings/defaults';
import {
  BusinessPolicySchema,
  TenantSettingsBusinessSchema,
  TenantSettingsNotificationsSchema,
  TenantSettingsStoredSchema,
  type GeneralSettingsView,
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

export interface TenantRowForSettings {
  business_name: string;
  gstin: string | null;
  primary_state: string | null;
  plan: string;
}

export function buildGeneralSettingsView(
  rawSettings: unknown,
  tenant: TenantRowForSettings,
): GeneralSettingsView {
  const parsed = TenantSettingsStoredSchema.safeParse(rawSettings ?? {});
  const fromDb = parsed.success ? parsed.data : {};
  const merged = deepMergeObjects(
    DEFAULT_TENANT_SETTINGS_STORED as unknown as Record<string, unknown>,
    fromDb as Record<string, unknown>,
  ) as typeof DEFAULT_TENANT_SETTINGS_STORED;

  const business = {
    ...merged.business,
    company_name: merged.business?.company_name?.trim()
      ? merged.business.company_name
      : tenant.business_name?.trim() || 'My Business',
    gstin: merged.business?.gstin?.trim()
      ? merged.business.gstin
      : (tenant.gstin ?? ''),
    address: {
      ...DEFAULT_TENANT_SETTINGS_STORED.business.address,
      ...merged.business?.address,
    },
  };

  const notifications = {
    whatsapp: {
      ...DEFAULT_TENANT_SETTINGS_STORED.notifications.whatsapp,
      ...merged.notifications?.whatsapp,
    },
  };

  const fromDbBp = ((merged as { business_policy?: Record<string, unknown> }).business_policy ??
    {}) as Record<string, unknown>;
  const legacyGst = (merged as { product_defaults?: { gst_rate?: number } }).product_defaults?.gst_rate;
  const businessPolicyRaw = {
    ...DEFAULT_TENANT_SETTINGS_STORED.business_policy,
    ...fromDbBp,
    gst_rate:
      typeof fromDbBp.gst_rate === 'number'
        ? fromDbBp.gst_rate
        : legacyGst ?? DEFAULT_TENANT_SETTINGS_STORED.business_policy.gst_rate,
  };

  const businessParsed = TenantSettingsBusinessSchema.safeParse(business);
  const notifParsed = TenantSettingsNotificationsSchema.safeParse(notifications);
  const policyParsed = BusinessPolicySchema.safeParse(businessPolicyRaw);

  const plan =
    tenant.plan === 'growth' || tenant.plan === 'scale' || tenant.plan === 'starter'
      ? tenant.plan
      : 'starter';

  const rawThreshold = (fromDb as { delivery_routing_threshold_km?: unknown }).delivery_routing_threshold_km;
  const delivery_routing_threshold_km =
    typeof rawThreshold === 'number' && rawThreshold >= 1 && rawThreshold <= 5000
      ? rawThreshold
      : DEFAULT_TENANT_SETTINGS_STORED.delivery_routing_threshold_km;

  return {
    business: businessParsed.success
      ? businessParsed.data
      : TenantSettingsBusinessSchema.parse({
          ...DEFAULT_TENANT_SETTINGS_STORED.business,
          company_name: tenant.business_name,
          gstin: tenant.gstin ?? '',
        }),
    notifications: notifParsed.success
      ? notifParsed.data
      : DEFAULT_TENANT_SETTINGS_STORED.notifications,
    business_policy: policyParsed.success
      ? policyParsed.data
      : DEFAULT_TENANT_SETTINGS_STORED.business_policy,
    delivery_routing_threshold_km,
    plan,
  };
}
