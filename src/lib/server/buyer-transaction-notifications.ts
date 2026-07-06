import { sendOrderReceivedBuyer, sendOrderReceivedSeller, sendRequestReceivedBuyer, sendRequestReceivedSeller, type WhatsappNotificationContext } from '@/lib/server/whatsapp';

export type BuyerTransactionKind = 'estimate' | 'order';

export function sendBuyerTransactionNotifications(
  kind: BuyerTransactionKind,
  ctx: WhatsappNotificationContext,
  documentId: string,
  documentNumber: string,
  totalAmount: number,
  itemCount: number,
): Promise<PromiseSettledResult<unknown>[]> {
  if (kind === 'order') {
    return Promise.allSettled([
      sendOrderReceivedBuyer(ctx, documentId, documentNumber, totalAmount, itemCount),
      sendOrderReceivedSeller(ctx, documentId, documentNumber, totalAmount, itemCount),
    ]);
  }

  return Promise.allSettled([
    sendRequestReceivedBuyer(ctx, documentId, documentNumber, totalAmount, itemCount),
    sendRequestReceivedSeller(ctx, documentId, documentNumber, totalAmount, itemCount),
  ]);
}
