import { toast } from 'sonner';

import type { BuyerAppAccessPatchResponse } from '@/types/buyer-app-enable';

interface AccessChangeToastOptions {
  buyerCount: number;
  enabled: boolean;
  data: BuyerAppAccessPatchResponse;
  onUndo: () => void;
}

export function showBuyerAppAccessChangeToasts({
  buyerCount,
  enabled,
  data,
  onUndo,
}: AccessChangeToastOptions): void {
  const label = enabled ? 'enabled' : 'disabled';
  const baseMessage = buyerCount === 1
    ? `Buyer app access ${label}`
    : `${buyerCount} buyers ${label}`;

  const undoAction = {
    action: {
      label: 'Undo',
      onClick: onUndo,
    },
  };

  if (enabled && data.whatsapp_eligible_count > 0) {
    if (data.whatsapp_sent_count > 0) {
      toast.success(
        `${baseMessage} · ${data.whatsapp_sent_count} WhatsApp message${data.whatsapp_sent_count === 1 ? '' : 's'} sent`,
        undoAction,
      );
      return;
    }

    toast.warning(`${baseMessage}, but WhatsApp message failed to send`, undoAction);
    return;
  }

  toast.success(baseMessage, undoAction);
}
