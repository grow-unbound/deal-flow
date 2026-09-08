import type { InboxGroupedBuyer } from '@/lib/inbox/inbox-types';

export function InboxEntryRow({
  buyer,
  onSelect,
  isActive,
}: {
  buyer: InboxGroupedBuyer;
  onSelect: () => void;
  isActive: boolean;
}) {
  const primary = buyer.entries[0];
  return (
    <button
      type="button"
      onClick={onSelect}
      className={[
        'flex w-full items-start justify-between gap-3 rounded-[12px] px-3 py-3 text-left transition-colors',
        isActive ? 'bg-[rgba(181,100,47,0.10)]' : 'hover:bg-[var(--yk-hover-tint)]',
      ].join(' ')}
    >
      <div className="min-w-0">
        <p className="truncate text-sm font-semibold text-cream-900">{buyer.buyerName}</p>
        <p className="mt-0.5 truncate text-sm text-cream-500">{primary.summary}</p>
      </div>
      {buyer.totalCount > 1 ? (
        <span className="mt-0.5 inline-flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-cream-200 px-1.5 text-xs font-semibold text-cream-700">
          {buyer.totalCount}
        </span>
      ) : null}
    </button>
  );
}
