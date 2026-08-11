import { buildGeneralSettingsView } from '@/lib/tenant-settings/build-general-view';
import type { TenantRowForSettings } from '@/lib/tenant-settings/build-general-view';
import { buildModuleSettingsView } from '@/lib/tenant-settings/build-module-settings-view';
import type { TenantUsageCounts, TenantOpenCounts } from '@/lib/tenant-settings/build-module-settings-view';
import type { UnifiedSettingsView } from '@/types/tenant-settings';

export function buildUnifiedSettingsView(
  rawSettings: unknown,
  tenant: TenantRowForSettings,
  usage: TenantUsageCounts,
  openCounts: TenantOpenCounts,
): UnifiedSettingsView {
  const general = buildGeneralSettingsView(rawSettings, tenant);
  const modules = buildModuleSettingsView(rawSettings, tenant, usage, openCounts);
  return {
    business: general.business,
    business_policy: general.business_policy,
    buyer_app: {
      enabled: modules.buyer_app.enabled,
      whatsapp_number: modules.buyer_app.whatsapp_number,
      whatsapp_display_name: modules.buyer_app.whatsapp_display_name,
      stock_visibility_enabled: modules.buyer_app.stock_visibility_enabled,
      block_order_on_oos: modules.buyer_app.block_order_on_oos,
    },
    notifications: general.notifications,
    orders: modules.orders,
    catalog: modules.catalog,
    product_defaults: modules.product_defaults,
    delivery_routing_threshold_km: general.delivery_routing_threshold_km,
    plan: general.plan,
    usage: modules.usage,
    open_counts: modules.open_counts,
  };
}
