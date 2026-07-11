import {
  sendOrderReceivedBuyer,
  sendOrderReceivedSeller,
  sendRequestReceivedBuyer,
  sendRequestReceivedSeller,
  type WhatsappNotificationContext,
} from '@/lib/server/whatsapp';

export type BuyerTransactionKind = 'estimate' | 'order';

export async function sendBuyerTransactionNotifications(
  kind: BuyerTransactionKind,
  ctx: WhatsappNotificationContext,
  documentId: string,
  documentNumber: string,
  totalAmount: number,
  itemCount: number,
): Promise<boolean> {
  const results =
    kind === 'order'
      ? await Promise.allSettled([
          sendOrderReceivedBuyer(ctx, documentId, documentNumber, totalAmount, itemCount),
          sendOrderReceivedSeller(ctx, documentId, documentNumber, totalAmount, itemCount),
        ])
      : await Promise.allSettled([
          sendRequestReceivedBuyer(ctx, documentId, documentNumber, totalAmount, itemCount),
          sendRequestReceivedSeller(ctx, documentId, documentNumber, totalAmount, itemCount),
        ]);

  return results.some((result) => result.status === 'fulfilled' && result.value === true);
}
