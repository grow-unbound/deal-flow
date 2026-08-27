'use client';

import { Smartphone } from 'lucide-react';
import { cn, formatNumberValue } from '@/lib/utils';
import type { CohortComposerBuyer } from '@/hooks/useCohorts';

function formatLastOrderLabel(value: string | null) {
  if (!value) return 'Never ordered';
  const diffDays = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / (1000 * 60 * 60 * 24)));
  if (diffDays === 0) return 'Ordered today';
  if (diffDays <= 30) return `Ordered ${diffDays}d ago`;
  return `Ordered ${new Date(value).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}`;
}

export function BuyerAppAvatar({
  initials,
  enabled,
  size,
}: {
  initials: string;
  enabled: boolean;
  size: number;
}) {
  const label = enabled ? 'Buyer App enabled' : 'Buyer App disabled';
  if (enabled) {
    return (
      <div
        title={label}
        aria-label={label}
        className="inline-flex shrink-0 items-center justify-center rounded-[10px] border border-teal-200 bg-teal-100 text-teal-700"
        style={{ width: size, height: size }}
      >
        <Smartphone size={Math.max(14, Math.floor(size * 0.48))} strokeWidth={2} />
      </div>
    );
  }
  return (
    <div
      title={label}
      aria-label={label}
      className="inline-flex shrink-0 items-center justify-center rounded-[10px] border border-dashed border-cream-400 bg-cream-100 font-display font-medium uppercase leading-none text-cream-500"
      style={{ width: size, height: size, fontSize: Math.max(10, Math.floor(size * 0.34)) }}
    >
      {initials}
    </div>
  );
}

/**
 * Row content only (avatar + name + metrics line) — no interactive wrapper. Use this
 * directly when embedding inside an already-interactive container (e.g. cmdk's
 * CommandItem) to avoid nesting a <button> inside another interactive element.
 */
export function BuyerRowContent({
  buyer,
  size = 'default',
}: {
  buyer: CohortComposerBuyer;
  size?: 'default' | 'compact';
}) {
  const avatarSize = size === 'compact' ? 30 : 38;
  const overdue = (buyer.overdue_amount ?? 0) > 0;

  return (
    <div className="flex min-w-0 items-center gap-3">
      <BuyerAppAvatar
        initials={buyer.initials}
        enabled={Boolean(buyer.buyer_app_enabled)}
        size={avatarSize}
      />
      <div className="min-w-0">
        <p className="truncate text-base font-medium text-cream-900">{buyer.business_name}</p>
        <p className="mt-0.5 truncate text-sm text-cream-700">
          {formatLastOrderLabel(buyer.last_order_at)}
          {' · '}
          {formatNumberValue(buyer.gmv_90d, 'CURRENCY_THRESHOLD')} spend QTD
          {' · '}
          {formatNumberValue(buyer.invoice_count ?? 0, 'COUNT')} invoices QTD
        </p>
        {overdue ? (
          <p className="mt-0.5 truncate text-sm text-danger-600">
            {formatNumberValue(buyer.overdue_amount ?? 0, 'CURRENCY_THRESHOLD')} overdue
          </p>
        ) : buyer.credit_used > 0 ? (
          <p className="mt-0.5 truncate text-sm text-cream-700">
            {formatNumberValue(buyer.credit_used, 'CURRENCY_THRESHOLD')} due
          </p>
        ) : null}
      </div>
    </div>
  );
}

export function BuyerPickerRow({
  buyer,
  selected,
  onClick,
  size = 'default',
  readOnly = false,
}: {
  buyer: CohortComposerBuyer;
  selected: boolean;
  onClick?: () => void;
  size?: 'default' | 'compact';
  readOnly?: boolean;
}) {
  if (readOnly) {
    return (
      <div
        className={cn(
          'flex w-full items-center justify-between gap-3 rounded-[8px] px-3',
          size === 'compact' ? 'py-2' : 'py-[10px]',
        )}
      >
        <BuyerRowContent buyer={buyer} size={size} />
        <span className="shrink-0 text-xs font-semibold uppercase tracking-[0.06em] text-cream-500">
          Matches
        </span>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex w-full items-center justify-between gap-3 rounded-[8px] px-3 text-left transition-colors',
        size === 'compact' ? 'py-2' : 'py-[10px]',
        selected ? 'border border-ember-100 bg-ember-50' : 'hover:bg-cream-100',
      )}
    >
      <BuyerRowContent buyer={buyer} size={size} />
      <span className="shrink-0 text-xs font-semibold uppercase tracking-[0.06em] text-cream-500">
        {selected ? 'Selected' : 'Add'}
      </span>
    </button>
  );
}
