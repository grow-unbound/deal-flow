'use client';

import { Smartphone, Store } from 'lucide-react';

export type TransactionOriginKind = 'estimate' | 'order' | 'invoice';

const TRANSACTION_TYPE_LABEL: Record<TransactionOriginKind, string> = {
  estimate: 'Estimate',
  order: 'Sales Order',
  invoice: 'Invoice',
};

function originAriaLabel(isBuyerApp: boolean, transactionType: TransactionOriginKind): string {
  const typeLabel = TRANSACTION_TYPE_LABEL[transactionType];
  return isBuyerApp ? `Buyer App ${typeLabel}` : `Store ${typeLabel}`;
}

export function TransactionOriginMark({
  isBuyerApp,
  transactionType,
  size = 22,
}: {
  isBuyerApp: boolean;
  transactionType: TransactionOriginKind;
  size?: number;
}) {
  const label = originAriaLabel(isBuyerApp, transactionType);
  const iconSize = Math.max(12, Math.floor(size * 0.48));

  if (isBuyerApp) {
    return (
      <div
        title={label}
        aria-label={label}
        className="inline-flex shrink-0 items-center justify-center rounded-[10px] border border-teal-200 bg-teal-100 text-teal-700"
        style={{ width: size, height: size }}
      >
        <Smartphone size={iconSize} strokeWidth={2} />
      </div>
    );
  }

  return (
    <div
      title={label}
      aria-label={label}
      className="inline-flex shrink-0 items-center justify-center rounded-[10px] border border-dashed border-cream-400 bg-cream-100 text-cream-500"
      style={{ width: size, height: size }}
    >
      <Store size={iconSize} strokeWidth={2} />
    </div>
  );
}
