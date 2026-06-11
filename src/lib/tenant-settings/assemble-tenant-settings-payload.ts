import type { SupabaseClient } from '@/lib/supabase';
import { buildGeneralSettingsView } from '@/lib/tenant-settings/build-general-view';
import type { TenantRowForSettings } from '@/lib/tenant-settings/build-general-view';
import { buildModuleSettingsView } from '@/lib/tenant-settings/build-module-settings-view';
import { loadTenantSettingsCounts } from '@/lib/tenant-settings/load-tenant-settings-counts';
import type { TenantSettingsApiPayload } from '@/types/tenant-settings';

export async function assembleTenantSettingsPayload(
  db: SupabaseClient,
  tenantId: string,
  rawSettings: unknown,
  tenantRow: TenantRowForSettings,
): Promise<TenantSettingsApiPayload> {
  const { usage, open_counts } = await loadTenantSettingsCounts(db, tenantId);
  const general = buildGeneralSettingsView(rawSettings, tenantRow);
  const modules = buildModuleSettingsView(rawSettings, tenantRow, usage, open_counts);
  return { general, modules };
}
