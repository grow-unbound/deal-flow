import type { TenantSettingsApiPayload, TenantSettingsPatch } from '@/types/tenant-settings';

/** Shallow-deep merge for optimistic PATCH preview (must mirror server merge rules loosely). */
export function applyTenantSettingsPatch(prev: TenantSettingsApiPayload, patch: TenantSettingsPatch): TenantSettingsApiPayload {
  const patchedGeneral = {
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
  };

  const patchedModules = {
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
  };

  return {
    general: patchedGeneral,
    modules: patchedModules,
    unified: {
      ...prev.unified,
      business: patchedGeneral.business,
      business_policy: patchedGeneral.business_policy,
      notifications: patchedGeneral.notifications,
      delivery_routing_threshold_km:
        patch.delivery_routing_threshold_km != null
          ? patch.delivery_routing_threshold_km
          : prev.unified.delivery_routing_threshold_km,
      product_defaults: patchedModules.product_defaults,
      orders: patchedModules.orders,
      buyer_app: {
        enabled: patchedModules.buyer_app.enabled,
        whatsapp_number: patchedModules.buyer_app.whatsapp_number,
        whatsapp_display_name: patchedModules.buyer_app.whatsapp_display_name,
      },
      catalog: patchedModules.catalog,
      plan: prev.unified.plan,
      usage: prev.unified.usage,
      open_counts: prev.unified.open_counts,
    },
  };
}
