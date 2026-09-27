import { cn } from '@/lib/utils';
import type { EnquiryVelocity, EnquiryStockStatus } from '@/lib/inbox/enquiry-triage';

/** Shared between InboxEnquiryPanel's dense table and InboxReplyQuoteView's
 * roomier line cards -- same stock/velocity vocabulary, two presentations. */

export function velocityLabel(v: EnquiryVelocity): string {
  if (v.unitsPerWeek <= 0) return 'No recent sales';
  return `~${v.unitsPerWeek}/wk`;
}

export function StockCell({ stock, onHand, align = 'end' }: { stock: EnquiryStockStatus; onHand: number; align?: 'start' | 'end' }) {
  const { tone, label } = stock;
  return (
    <span className={cn('flex flex-col', align === 'end' ? 'items-end' : 'items-start')}>
      <span
        className={cn(
          'text-sm font-semibold',
          tone === 'danger' && 'text-danger-700',
          tone === 'warning' && 'text-warning-700',
          tone === 'ok' && 'text-cream-700',
        )}
      >
        {tone === 'danger' || tone === 'warning' ? '▲ ' : null}
        {label}
      </span>
      <span className="font-mono text-xs tabular-nums text-cream-500">{onHand} on hand</span>
    </span>
  );
}

export function VelocityCell({ velocity, align = 'end' }: { velocity: EnquiryVelocity; align?: 'start' | 'end' }) {
  return (
    <span className={cn('flex flex-col', align === 'end' ? 'items-end' : 'items-start')}>
      <span className="font-mono text-sm tabular-nums text-cream-800">{velocityLabel(velocity)}</span>
      {velocity.daysCover != null ? (
        <span className="font-mono text-xs tabular-nums text-cream-500">{Math.round(velocity.daysCover)}d cover</span>
      ) : null}
    </span>
  );
}
