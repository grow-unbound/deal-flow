import { fetchWhatsappNotificationContext } from '@/lib/server/notification-context';
import {
  sendBuyerTransactionNotifications,
  type BuyerTransactionKind,
} from '@/lib/server/buyer-transaction-notifications';

interface SendImmediateTransactionNotificationsInput {
  kind: BuyerTransactionKind;
  tenantId: string;
  buyerId: string;
  locationId: string;
  documentId: string;
  documentNumber: string;
  totalAmount: number;
  itemCount: number;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: any;
  table: 'estimates' | 'orders';
}

export async function sendImmediateTransactionNotifications(
  input: SendImmediateTransactionNotificationsInput,
): Promise<boolean> {
  const notificationType = input.kind === 'order' ? 'order_placed' : 'enquiry_received';
  const ctx = await fetchWhatsappNotificationContext(
    input.tenantId,
    input.buyerId,
    input.locationId,
    notificationType,
  );
  if (!ctx) return false;

  const results = await sendBuyerTransactionNotifications(
    input.kind,
    ctx,
    input.documentId,
    input.documentNumber,
    input.totalAmount,
    input.itemCount,
  );
  const whatsappEnqueued = results.some((result) => result.status === 'fulfilled');
  if (whatsappEnqueued) {
    await input.db
      .schema('app')
      .from(input.table)
      .update({
        sent_at: new Date().toISOString(),
        sent_channel: 'whatsapp',
      })
      .eq('id', input.documentId);
  }
  return whatsappEnqueued;
}
