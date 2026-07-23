import { supabaseAdmin, supabase } from '@/lib/supabase';
import { DEFAULT_TENANT_SETTINGS_STORED } from '@/lib/tenant-settings/defaults';
import { buildSellerContextFromTenant, composeSellerDisplayName } from '@/lib/server/whatsapp-seller-context';
import type { WhatsappNotificationContext } from '@/lib/server/whatsapp';

type NotificationType = 'order_placed' | 'enquiry_received';

interface TenantRow {
  business_name: string;
  settings: Record<string, unknown> | null;
}

interface BuyerRow {
  phone: string | null;
  contact_name: string | null;
  business_name: string;
}

interface BuyerUserRow {
  phone: string | null;
}

interface LocationRow {
  name: string;
  phone_number: string | null;
}

interface WarehouseRow {
  name: string;
  phone_number: string | null;
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
  initiatingBuyerUserId?: string | null,
): Promise<WhatsappNotificationContext | null> {
  const db = supabaseAdmin ?? supabase;

  const [tenantResult, buyerResult, buyerUserResult, locationResult, warehouseResult, locationCountResult] = await Promise.all([
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (db as any)
      .schema('app')
      .from('tenants')
      .select('business_name, settings')
      .eq('id', tenantId)
      .single() as Promise<{ data: TenantRow | null; error: unknown }>,

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (db as any)
      .schema('app')
      .from('buyers')
      .select('phone, contact_name, business_name')
      .eq('id', buyerId)
      .single() as Promise<{ data: BuyerRow | null; error: unknown }>,

    initiatingBuyerUserId
      ? // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ((db as any)
          .schema('app')
          .from('buyer_users')
          .select('phone')
          .eq('buyer_id', buyerId)
          .eq('user_id', initiatingBuyerUserId)
          .eq('is_active', true)
          .is('deleted_at', null)
          .limit(1)
          .maybeSingle() as Promise<{ data: BuyerUserRow | null; error: unknown }>)
      : Promise.resolve({ data: null, error: null }),

    locationId
      ? // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ((db as any)
          .schema('app')
          .from('locations')
          .select('name, phone_number')
          .eq('id', locationId)
          .single() as Promise<{ data: LocationRow | null; error: unknown }>)
      : Promise.resolve({ data: null, error: null }),

    locationId
      ? // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ((db as any)
          .schema('app')
          .from('warehouses')
          .select('name, phone_number')
          .eq('location_id', locationId)
          .is('deleted_at', null)
          .limit(1)
          .maybeSingle() as Promise<{ data: WarehouseRow | null; error: unknown }>)
      : Promise.resolve({ data: null, error: null }),

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (db as any)
      .schema('app')
      .from('locations')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', tenantId)
      .is('deleted_at', null) as Promise<{ count: number | null; error: unknown }>,
  ]);

  if (!tenantResult.data || !buyerResult.data) return null;

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
  const sellerPhone =
    warehouseResult.data?.phone_number
    ?? locationResult.data?.phone_number
    ?? (businessSettings.phone as string | undefined)
    ?? '';

  const { sellerName } = buildSellerContextFromTenant(tenantResult.data);

  const buyer = buyerResult.data;
  const buyerPhone = buyerUserResult.data?.phone ?? buyer.phone ?? '';
  const buyerName = buyer.contact_name ?? buyer.business_name;

  const sellerLocation =
    warehouseResult.data?.name ?? locationResult.data?.name ?? sellerName;

  const hasMultipleLocations = (locationCountResult.count ?? 0) > 1;
  const buyerFacingSellerName = composeSellerDisplayName(
    sellerName,
    sellerLocation,
    hasMultipleLocations,
  );

  if (!sellerPhone || !buyerPhone) return null;

  return {
    sellerPhone,
    sellerName,
    sellerLocation,
    buyerFacingSellerName,
    buyerPhone,
    buyerName,
    etaHours,
    tenantId,
    buyerId,
  };
}
