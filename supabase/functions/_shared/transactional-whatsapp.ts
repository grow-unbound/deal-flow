import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';

const TRANSACTION_PENDING_NOTE = 'will be created soon';

type BuyerTransactionKind = 'estimate' | 'order';
type TransactionOutcome = 'success' | 'pending';

type SendPayload = {
  meta_template_name: string;
  locale: string;
  body_params: Array<{ text: string; parameter_name?: string }>;
  button_params: Array<{ type: 'url'; index: string; text: string }>;
};

type AdminClient = SupabaseClient;

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function readString(record: Record<string, unknown>, key: string): string | null {
  const value = record[key];
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function normalizeIndianPhone(input: string): string {
  const digits = input.replace(/\D/g, '');
  if (digits.startsWith('91') && digits.length > 10) return digits.slice(-10);
  if (digits.startsWith('0') && digits.length > 10) return digits.slice(-10);
  return digits;
}

function formatWhatsappDestination(phone: string): string {
  return `91${normalizeIndianPhone(phone)}`;
}

function firstNameFromValue(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  if (!trimmed) return null;
  const [first] = trimmed.split(/\s+/);
  return first || null;
}

function composeSellerDisplayName(
  sellerName: string,
  locationName: string | null,
  hasMultipleLocations: boolean,
): string {
  if (!hasMultipleLocations || !locationName?.trim()) return sellerName;
  return `${sellerName} (${locationName.trim()})`;
}

function buildSellerContextFromTenant(tenant: {
  business_name?: string | null;
  settings?: unknown;
} | null | undefined) {
  const settings = asRecord(tenant?.settings);
  const businessSettings = asRecord(settings.business);
  const buyerAppSettings = asRecord(settings.buyer_app);

  return {
    sellerName:
      readString(buyerAppSettings, 'whatsapp_display_name')
      ?? readString(businessSettings, 'company_name')
      ?? tenant?.business_name?.trim()
      ?? 'Your business',
    sellerPhone: normalizeIndianPhone(
      readString(buyerAppSettings, 'whatsapp_number')
      ?? readString(businessSettings, 'phone')
      ?? Deno.env.get('WHATSAPP_ADMIN_NUMBER')
      ?? '',
    ),
  };
}

function documentTextForOutcome(
  outcome: TransactionOutcome,
  documentNumber?: string | null,
): string {
  if (outcome === 'success' && documentNumber?.trim()) {
    return documentNumber.trim();
  }
  return TRANSACTION_PENDING_NOTE;
}

async function enqueueWhatsAppMessage(
  admin: AdminClient,
  input: {
    tenantId: string;
    buyerId: string;
    recipientPhone: string;
    metaCategory: 'utility';
    triggerSource: 'order_placed' | 'enquiry_received';
    sendPayload: SendPayload;
    relatedEntityType: 'estimates' | 'orders';
    relatedEntityId: string;
  },
): Promise<{ messageId: string | null; enqueued: boolean; skipped?: string }> {
  const { data, error } = await admin.schema('app').rpc('enqueue_whatsapp_message', {
    p_tenant_id: input.tenantId,
    p_buyer_id: input.buyerId,
    p_recipient_phone: input.recipientPhone,
    p_meta_category: input.metaCategory,
    p_trigger_source: input.triggerSource,
    p_send_payload: input.sendPayload,
    p_related_entity_type: input.relatedEntityType,
    p_related_entity_id: input.relatedEntityId,
  });

  if (error) {
    console.error('[transactional-whatsapp] enqueue failed:', error.message);
    return { messageId: null, enqueued: false };
  }

  const result = (data ?? null) as { message_id?: string | null; enqueued?: boolean; skipped?: string } | null;
  return {
    messageId: result?.message_id ?? null,
    enqueued: result?.enqueued === true,
    skipped: result?.skipped,
  };
}

async function dispatchWhatsAppMessages(messageIds: Array<string | null | undefined>): Promise<boolean> {
  const ids = [...new Set(messageIds.filter((id): id is string => Boolean(id)))];
  if (ids.length === 0) return false;

  const supabaseUrl = Deno.env.get('SUPABASE_URL')?.replace(/\/$/, '');
  if (!supabaseUrl) {
    console.error('[transactional-whatsapp] missing SUPABASE_URL for dispatch');
    return false;
  }

  try {
    const res = await fetch(`${supabaseUrl}/functions/v1/whatsapp-dispatch-worker`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message_ids: ids }),
    });

    const text = await res.text();
    if (!res.ok) {
      console.error('[transactional-whatsapp] dispatch failed:', res.status, text);
      return false;
    }

    const result = text ? JSON.parse(text) as { dispatched?: number } : null;
    return (result?.dispatched ?? 0) > 0;
  } catch (err) {
    console.error('[transactional-whatsapp] dispatch errored:', err);
    return false;
  }
}

export async function sendTransactionalAcknowledgement(
  admin: AdminClient,
  input: {
    kind: BuyerTransactionKind;
    outcome: TransactionOutcome;
    entityId: string;
    tenantId: string;
    buyerId: string;
    documentNumber?: string | null;
  },
): Promise<void> {
  const table = input.kind === 'order' ? 'orders' : 'estimates';
  const numberField = input.kind === 'order' ? 'order_number' : 'estimate_number';
  const entityType = input.kind === 'order' ? 'orders' : 'estimates';
  const triggerSource = input.kind === 'order' ? 'order_placed' : 'enquiry_received';
  const notificationEnabledField = input.kind === 'order' ? 'order_placed' : 'enquiry_received';

  const { data: record, error: recordError } = await admin
    .schema('app')
    .from(table)
    .select(`id, tenant_id, buyer_id, location_id, total_amount, source, sent_at, ${numberField}`)
    .eq('id', input.entityId)
    .is('deleted_at', null)
    .maybeSingle();

  if (recordError || !record) return;
  if (record.source !== 'buyer_app') return;
  if (record.sent_at) return;
  if (!record.location_id) return;

  const [tenantResult, buyerResult, locationResult, warehouseResult, locationCountResult, itemCountResult] = await Promise.all([
    admin.schema('app').from('tenants').select('business_name, settings').eq('id', input.tenantId).single(),
    admin.schema('app').from('buyers').select('phone, contact_name, business_name').eq('id', input.buyerId).single(),
    admin.schema('app').from('locations').select('name, phone_number').eq('id', record.location_id).single(),
    admin.schema('app').from('warehouses').select('name, phone_number').eq('location_id', record.location_id).is('deleted_at', null).limit(1).maybeSingle(),
    admin.schema('app').from('locations').select('id', { count: 'exact', head: true }).eq('tenant_id', input.tenantId).is('deleted_at', null),
    admin.schema('app').from(input.kind === 'order' ? 'order_items' : 'estimate_items').select('id', { count: 'exact', head: true }).eq(input.kind === 'order' ? 'order_id' : 'estimate_id', input.entityId).is('deleted_at', null),
  ]);

  if (!tenantResult.data || !buyerResult.data || !locationResult.data) return;

  const settings = asRecord(tenantResult.data.settings);
  const notifSettings = asRecord(asRecord(settings.notifications).whatsapp);
  const isEnabled = notifSettings[notificationEnabledField];
  if (isEnabled === false) return;

  const etaHours = typeof notifSettings.response_eta_hours === 'number'
    ? notifSettings.response_eta_hours
    : 24;

  const { sellerName, sellerPhone: tenantSellerPhone } = buildSellerContextFromTenant(tenantResult.data);
  const businessSettings = asRecord(settings.business);
  const sellerPhone =
    warehouseResult.data?.phone_number
    ?? locationResult.data?.phone_number
    ?? readString(businessSettings, 'phone')
    ?? tenantSellerPhone
    ?? '';

  const buyerPhone = buyerResult.data.phone ?? '';
  if (!sellerPhone || !buyerPhone) return;

  const sellerLocation = warehouseResult.data?.name ?? locationResult.data.name ?? sellerName;
  const hasMultipleLocations = (locationCountResult.count ?? 0) > 1;
  const buyerFacingSellerName = composeSellerDisplayName(sellerName, sellerLocation, hasMultipleLocations);
  const buyerName = buyerResult.data.contact_name ?? buyerResult.data.business_name;
  const itemCount = itemCountResult.count ?? 0;
  const totalAmount = Math.round(Number(record.total_amount ?? 0));
  const numberText = documentTextForOutcome(input.outcome, input.documentNumber ?? record[numberField] as string | null | undefined);
  const buyerDestination = formatWhatsappDestination(buyerPhone);
  const sellerDestination = formatWhatsappDestination(sellerPhone);

  const sellerPayload: SendPayload = input.kind === 'order'
    ? {
        meta_template_name: 'order_received_seller',
        locale: 'en_IN',
        body_params: [
          { text: sellerLocation, parameter_name: 'seller_location' },
          { text: buyerName, parameter_name: 'buyer_name' },
          { text: buyerPhone, parameter_name: 'buyer_phone_number' },
          { text: numberText, parameter_name: 'order_number' },
          { text: String(totalAmount), parameter_name: 'total_amount' },
          { text: String(itemCount), parameter_name: 'item_count' },
          { text: String(etaHours), parameter_name: 'eta' },
        ],
        button_params: [{ type: 'url', index: '0', text: input.entityId }],
      }
    : {
        meta_template_name: 'request_received_seller',
        locale: 'en',
        body_params: [
          { text: sellerLocation, parameter_name: 'seller_location' },
          { text: buyerName, parameter_name: 'buyer_name' },
          { text: buyerPhone, parameter_name: 'buyer_phone_number' },
          { text: numberText, parameter_name: 'request_number' },
          { text: String(totalAmount), parameter_name: 'total_amount' },
          { text: String(itemCount), parameter_name: 'item_count' },
          { text: String(etaHours), parameter_name: 'eta' },
        ],
        button_params: [{ type: 'url', index: '0', text: input.entityId }],
      };

  const buyerPayload: SendPayload = input.kind === 'order'
    ? {
        meta_template_name: 'order_received_buyer',
        locale: 'en_IN',
        body_params: [
          { text: buyerName, parameter_name: 'buyer_name' },
          { text: String(itemCount), parameter_name: 'item_count' },
          { text: numberText, parameter_name: 'order_number' },
          { text: String(totalAmount), parameter_name: 'total_amount' },
          { text: buyerFacingSellerName, parameter_name: 'seller_team' },
          { text: String(etaHours), parameter_name: 'eta' },
        ],
        button_params: [{ type: 'url', index: '0', text: input.entityId }],
      }
    : {
        meta_template_name: 'request_received_buyer',
        locale: 'en',
        body_params: [
          { text: buyerName, parameter_name: 'buyer_name' },
          { text: String(itemCount), parameter_name: 'item_count' },
          { text: numberText, parameter_name: 'estimate_number' },
          { text: String(totalAmount), parameter_name: 'total_amount' },
          { text: buyerFacingSellerName, parameter_name: 'seller_name' },
          { text: String(etaHours), parameter_name: 'eta' },
        ],
        button_params: [{ type: 'url', index: '0', text: input.entityId }],
      };

  const [buyerEnqueue, sellerEnqueue] = await Promise.all([
    enqueueWhatsAppMessage(admin, {
      tenantId: input.tenantId,
      buyerId: input.buyerId,
      recipientPhone: buyerDestination,
      metaCategory: 'utility',
      triggerSource,
      sendPayload: buyerPayload,
      relatedEntityType: entityType,
      relatedEntityId: input.entityId,
    }),
    enqueueWhatsAppMessage(admin, {
      tenantId: input.tenantId,
      buyerId: input.buyerId,
      recipientPhone: sellerDestination,
      metaCategory: 'utility',
      triggerSource,
      sendPayload: sellerPayload,
      relatedEntityType: entityType,
      relatedEntityId: input.entityId,
    }),
  ]);

  const dispatched = await dispatchWhatsAppMessages([
    buyerEnqueue.messageId,
    sellerEnqueue.messageId,
  ]);
  const acknowledged = dispatched
    || [buyerEnqueue, sellerEnqueue].some((result) => result.skipped === 'duplicate');
  if (!acknowledged) return;

  await admin
    .schema('app')
    .from(table)
    .update({
      sent_at: new Date().toISOString(),
      sent_channel: 'whatsapp',
    })
    .eq('id', input.entityId)
    .is('sent_at', null);
}
