import { supabaseAdmin, supabase } from '@/lib/supabase';
import { DEFAULT_TENANT_SETTINGS_STORED } from '@/lib/tenant-settings/defaults';
import type { WhatsappNotificationContext } from '@/lib/server/whatsapp';

type NotificationType = 'order_placed' | 'enquiry_received';

interface TenantRow {
  settings: Record<string, unknown> | null;
}

interface BuyerRow {
  phone: string | null;
  contact_name: string | null;
  business_name: string;
}

interface LocationRow {
  name: string;
}

/**
 * Fetches all context needed to send WhatsApp order/estimate notifications.
 * Returns null when:
 *  - seller or buyer data cannot be loaded
 *  - the relevant notification flag is disabled in tenant settings
 *  - seller or buyer phone is missing
 */
export async function fetchWhatsappNotificationContext(
  tenantId: string,
  buyerId: string,
  locationId: string | null,
  notificationType: NotificationType,
): Promise<WhatsappNotificationContext | null> {
  const db = supabaseAdmin ?? supabase;

  // Parallel fetch: tenant settings + buyer info + optional location
  const [tenantResult, buyerResult, locationResult] = await Promise.all([
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (db as any)
      .schema('app')
      .from('tenants')
      .select('settings')
      .eq('id', tenantId)
      .single() as Promise<{ data: TenantRow | null; error: unknown }>,

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (db as any)
      .schema('app')
      .from('buyers')
      .select('phone, contact_name, business_name')
      .eq('id', buyerId)
      .single() as Promise<{ data: BuyerRow | null; error: unknown }>,

    locationId
      ? // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ((db as any)
          .schema('app')
          .from('locations')
          .select('name')
          .eq('id', locationId)
          .single() as Promise<{ data: LocationRow | null; error: unknown }>)
      : Promise.resolve({ data: null, error: null }),
  ]);

  if (!tenantResult.data || !buyerResult.data) return null;

  // Read notification preferences from JSONB settings, falling back to defaults
  const settings = tenantResult.data.settings ?? {};
  const notifSettings =
    (settings.notifications as Record<string, unknown> | undefined)?.whatsapp ?? {};

  const isEnabled =
    notificationType === 'order_placed'
      ? ((notifSettings as Record<string, unknown>).order_placed ??
          DEFAULT_TENANT_SETTINGS_STORED.notifications.whatsapp.order_placed)
      : ((notifSettings as Record<string, unknown>).enquiry_received ??
          DEFAULT_TENANT_SETTINGS_STORED.notifications.whatsapp.enquiry_received);

  if (!isEnabled) return null;

  const etaHours =
    typeof (notifSettings as Record<string, unknown>).response_eta_hours === 'number'
      ? ((notifSettings as Record<string, unknown>).response_eta_hours as number)
      : DEFAULT_TENANT_SETTINGS_STORED.notifications.whatsapp.response_eta_hours;

  const businessSettings =
    (settings.business as Record<string, unknown> | undefined) ?? {};
  const sellerPhone = (businessSettings.phone as string | undefined) ?? '';
  const sellerName =
    (businessSettings.company_name as string | undefined) ?? '';

  const buyer = buyerResult.data;
  const buyerPhone = buyer.phone ?? '';
  const buyerName = buyer.contact_name ?? buyer.business_name;

  // Location name falls back to seller business name so the template is still coherent
  const sellerLocation =
    locationResult.data?.name ?? sellerName;

  // Don't send if either phone is missing — messages would bounce
  if (!sellerPhone || !buyerPhone) return null;

  return {
    sellerPhone,
    sellerName,
    sellerLocation,
    buyerPhone,
    buyerName,
    etaHours,
    tenantId,
    buyerId,
  };
}
