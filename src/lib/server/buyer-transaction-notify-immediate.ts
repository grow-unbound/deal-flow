import {
  type BuyerTransactionKind,
} from '@/lib/server/buyer-transaction-notifications';
import {
  enqueueTransactionAcknowledgement,
  type TransactionAcknowledgementOutcome,
} from '@/lib/server/transactional-whatsapp';

interface SendImmediateTransactionNotificationsInput {
  kind: BuyerTransactionKind;
  tenantId: string;
  buyerId: string;
  locationId: string;
  initiatingBuyerUserId?: string | null;
  documentId: string;
  documentNumber: string;
  totalAmount: number;
  itemCount: number;
  outcome?: TransactionAcknowledgementOutcome;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: any;
  table: 'estimates' | 'orders';
}

export async function sendImmediateTransactionNotifications(
  input: SendImmediateTransactionNotificationsInput,
): Promise<boolean> {
  return enqueueTransactionAcknowledgement({
    ...input,
    outcome: input.outcome ?? 'success',
  });
}
