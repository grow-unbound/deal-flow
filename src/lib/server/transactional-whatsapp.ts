import { fetchWhatsappNotificationContext } from '@/lib/server/notification-context';
import {
  sendBuyerTransactionNotifications,
  type BuyerTransactionKind,
} from '@/lib/server/buyer-transaction-notifications';
import { TRANSACTION_PENDING_NOTE } from '@/lib/transaction-notes';

export type TransactionAcknowledgementOutcome = 'success' | 'pending';

interface EnqueueTransactionAcknowledgementInput {
  kind: BuyerTransactionKind;
  tenantId: string;
  buyerId: string;
  locationId: string;
  documentId: string;
  documentNumber?: string | null;
  totalAmount: number;
  itemCount: number;
  outcome: TransactionAcknowledgementOutcome;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: any;
  table: 'estimates' | 'orders';
}

function documentTextForOutcome(
  outcome: TransactionAcknowledgementOutcome,
  documentNumber?: string | null,
): string {
  if (outcome === 'success' && documentNumber?.trim()) {
    return documentNumber.trim();
  }
  return TRANSACTION_PENDING_NOTE;
}

export async function enqueueTransactionAcknowledgement(
  input: EnqueueTransactionAcknowledgementInput,
): Promise<boolean> {
  const notificationType = input.kind === 'order' ? 'order_placed' : 'enquiry_received';
  const ctx = await fetchWhatsappNotificationContext(
    input.tenantId,
    input.buyerId,
    input.locationId,
    notificationType,
  );
  if (!ctx) {
    return false;
  }

  const whatsappEnqueued = await sendBuyerTransactionNotifications(
    input.kind,
    ctx,
    input.documentId,
    documentTextForOutcome(input.outcome, input.documentNumber),
    input.totalAmount,
    input.itemCount,
  );

  if (whatsappEnqueued) {
    const { error } = await input.db
      .schema('app')
      .from(input.table)
      .update({
        sent_at: new Date().toISOString(),
        sent_channel: 'whatsapp',
      })
      .eq('id', input.documentId)
      .is('sent_at', null);
    if (error) {
      console.error('[transactional-whatsapp] sent stamp failed', {
        kind: input.kind,
        document_id: input.documentId,
        error: error.message,
      });
    }
  }

  return whatsappEnqueued;
}
