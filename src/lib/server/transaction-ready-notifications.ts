import { supabaseAdmin, supabase } from '@/lib/supabase';
import { fetchWhatsappNotificationContext } from '@/lib/server/notification-context';
import {
  sendBuyerTransactionNotifications,
  type BuyerTransactionKind,
} from '@/lib/server/buyer-transaction-notifications';

interface EstimateReadyRow {
  id: string;
  tenant_id: string;
  buyer_id: string;
  location_id: string | null;
  estimate_number: string | null;
  total_amount: number;
  source: string;
  sent_at: string | null;
}

interface OrderReadyRow {
  id: string;
  tenant_id: string;
  buyer_id: string;
  location_id: string | null;
  order_number: string | null;
  total_amount: number;
  source: string;
  sent_at: string | null;
}

function verifyInternalNotifySecret(request: Request): boolean {
  const secret = process.env.INTEGRATIONS_PUSH_SECRET?.trim()
    ?? process.env.INTEGRATIONS_DISPATCH_SECRET?.trim();
  if (!secret) return process.env.NODE_ENV !== 'production';
  const provided = request.headers.get('x-push-secret')?.trim() ?? '';
  if (provided.length !== secret.length) return false;
  let diff = 0;
  for (let i = 0; i < secret.length; i++) {
    diff |= provided.charCodeAt(i) ^ secret.charCodeAt(i);
  }
  return diff === 0;
}

export { verifyInternalNotifySecret };

async function countEstimateItems(db: typeof supabaseAdmin, estimateId: string): Promise<number> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { count } = await (db as any)
    .schema('app')
    .from('estimate_items')
    .select('id', { count: 'exact', head: true })
    .eq('estimate_id', estimateId)
    .is('deleted_at', null);
  return count ?? 0;
}

async function countOrderItems(db: typeof supabaseAdmin, orderId: string): Promise<number> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { count } = await (db as any)
    .schema('app')
    .from('order_items')
    .select('id', { count: 'exact', head: true })
    .eq('order_id', orderId);
  return count ?? 0;
}

export interface TransactionReadyResult {
  enqueued: boolean;
  skipped?: string;
}

export async function enqueueTransactionReadyNotifications(
  kind: BuyerTransactionKind,
  entityId: string,
): Promise<TransactionReadyResult> {
  const db = supabaseAdmin ?? supabase;
  if (!db) return { enqueued: false, skipped: 'no_db' };

  if (kind === 'estimate') {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (db as any)
      .schema('app')
      .from('estimates')
      .select('id, tenant_id, buyer_id, location_id, estimate_number, total_amount, source, sent_at')
      .eq('id', entityId)
      .is('deleted_at', null)
      .maybeSingle();

    if (error || !data) return { enqueued: false, skipped: 'not_found' };
    const row = data as EstimateReadyRow;
    if (row.source !== 'buyer_app') return { enqueued: false, skipped: 'not_buyer_app' };
    if (row.sent_at) return { enqueued: false, skipped: 'already_sent' };
    if (!row.estimate_number?.trim()) return { enqueued: false, skipped: 'number_pending' };
    if (!row.location_id) return { enqueued: false, skipped: 'missing_location' };

    const ctx = await fetchWhatsappNotificationContext(
      row.tenant_id,
      row.buyer_id,
      row.location_id,
      'enquiry_received',
    );
    if (!ctx) return { enqueued: false, skipped: 'notification_disabled' };

    const itemCount = await countEstimateItems(db, row.id);
    const results = await sendBuyerTransactionNotifications(
      'estimate',
      ctx,
      row.id,
      row.estimate_number,
      Number(row.total_amount ?? 0),
      itemCount,
    );
    const whatsappEnqueued = results.some((result) => result.status === 'fulfilled');
    if (whatsappEnqueued) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (db as any)
        .schema('app')
        .from('estimates')
        .update({ sent_at: new Date().toISOString(), sent_channel: 'whatsapp' })
        .eq('id', row.id)
        .is('sent_at', null);
    }
    return { enqueued: whatsappEnqueued };
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (db as any)
    .schema('app')
    .from('orders')
    .select('id, tenant_id, buyer_id, location_id, order_number, total_amount, source, sent_at')
    .eq('id', entityId)
    .is('deleted_at', null)
    .maybeSingle();

  if (error || !data) return { enqueued: false, skipped: 'not_found' };
  const row = data as OrderReadyRow;
  if (row.source !== 'buyer_app') return { enqueued: false, skipped: 'not_buyer_app' };
  if (row.sent_at) return { enqueued: false, skipped: 'already_sent' };
  if (!row.order_number?.trim()) return { enqueued: false, skipped: 'number_pending' };
  if (!row.location_id) return { enqueued: false, skipped: 'missing_location' };

  const ctx = await fetchWhatsappNotificationContext(
    row.tenant_id,
    row.buyer_id,
    row.location_id,
    'order_placed',
  );
  if (!ctx) return { enqueued: false, skipped: 'notification_disabled' };

  const itemCount = await countOrderItems(db, row.id);
  const results = await sendBuyerTransactionNotifications(
    'order',
    ctx,
    row.id,
    row.order_number,
    Number(row.total_amount ?? 0),
    itemCount,
  );
  const whatsappEnqueued = results.some((result) => result.status === 'fulfilled');
  if (whatsappEnqueued) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (db as any)
      .schema('app')
      .from('orders')
      .update({ sent_at: new Date().toISOString(), sent_channel: 'whatsapp' })
      .eq('id', row.id)
      .is('sent_at', null);
  }
  return { enqueued: whatsappEnqueued };
}

/** @deprecated Use enqueueTransactionReadyNotifications */
export const sendTransactionReadyNotifications = enqueueTransactionReadyNotifications;

export function parseTransactionNotifyWebhook(body: unknown): {
  kind: BuyerTransactionKind;
  entityId: string;
  numberField: 'estimate_number' | 'order_number';
  oldNumber: string | null;
  newNumber: string | null;
} | null {
  if (!body || typeof body !== 'object') return null;
  const record = body as Record<string, unknown>;
  const eventType = record.type as string | undefined;
  if (eventType && eventType !== 'UPDATE') return null;

  const table = (record.table as string | undefined)
    ?? ((record.record as Record<string, unknown> | undefined) ? undefined : undefined);
  const schema = record.schema as string | undefined;
  if (schema && schema !== 'app') return null;

  const newRecord = (record.record ?? record.new) as Record<string, unknown> | undefined;
  const oldRecord = (record.old_record ?? record.old) as Record<string, unknown> | undefined;
  if (!newRecord?.id) return null;

  const entityId = newRecord.id as string;
  const tableName = table ?? inferTableFromRecord(newRecord);

  if (tableName === 'estimates' || newRecord.estimate_number !== undefined) {
    return {
      kind: 'estimate',
      entityId,
      numberField: 'estimate_number',
      oldNumber: (oldRecord?.estimate_number as string | null | undefined) ?? null,
      newNumber: (newRecord.estimate_number as string | null | undefined) ?? null,
    };
  }

  if (tableName === 'orders' || newRecord.order_number !== undefined) {
    return {
      kind: 'order',
      entityId,
      numberField: 'order_number',
      oldNumber: (oldRecord?.order_number as string | null | undefined) ?? null,
      newNumber: (newRecord.order_number as string | null | undefined) ?? null,
    };
  }

  return null;
}

function inferTableFromRecord(record: Record<string, unknown>): string | null {
  if ('estimate_number' in record) return 'estimates';
  if ('order_number' in record) return 'orders';
  return null;
}

export function shouldNotifyTransactionReady(
  parsed: NonNullable<ReturnType<typeof parseTransactionNotifyWebhook>>,
): boolean {
  const oldTrimmed = parsed.oldNumber?.trim() ?? '';
  const newTrimmed = parsed.newNumber?.trim() ?? '';
  if (!newTrimmed) return false;
  if (oldTrimmed === newTrimmed) return false;
  return !oldTrimmed;
}
