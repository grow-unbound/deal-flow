import type { TenantSettingsApiPayload, TenantSettingsPatch } from '@/types/tenant-settings';

/** Shallow-deep merge for optimistic PATCH preview (must mirror server merge rules loosely). */
export function applyTenantSettingsPatch(prev: TenantSettingsApiPayload, patch: TenantSettingsPatch): TenantSettingsApiPayload {
  return {
    general: {
      ...prev.general,
      business: patch.business ? { ...prev.general.business, ...patch.business } : prev.general.business,
      notifications: patch.notifications
        ? {
            whatsapp: {
              ...prev.general.notifications.whatsapp,
              ...(patch.notifications.whatsapp ?? {}),
            },
          }
        : prev.general.notifications,
      business_policy: patch.business_policy
        ? { ...prev.general.business_policy, ...patch.business_policy }
        : prev.general.business_policy,
      plan: prev.general.plan,
    },
    modules: {
      ...prev.modules,
      product_defaults:
        patch.product_defaults != null
          ? { ...prev.modules.product_defaults, ...patch.product_defaults }
          : prev.modules.product_defaults,
      orders:
        patch.orders != null
          ? {
              ...prev.modules.orders,
              ...patch.orders,
              features:
                patch.orders.features != null
                  ? { ...prev.modules.orders.features, ...patch.orders.features }
                  : prev.modules.orders.features,
            }
          : prev.modules.orders,
      buyer_app: patch.buyer_app != null ? { ...prev.modules.buyer_app, ...patch.buyer_app } : prev.modules.buyer_app,
      catalog: patch.catalog != null ? { ...prev.modules.catalog, ...patch.catalog } : prev.modules.catalog,
      business_policy: patch.business_policy != null
        ? { ...prev.modules.business_policy, ...patch.business_policy }
        : prev.modules.business_policy,
      plan: prev.modules.plan,
      usage: prev.modules.usage,
      open_counts: prev.modules.open_counts,
    },
  };
}
