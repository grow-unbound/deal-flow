import { composerPageMinHeightClass, composerThreePanelGridClass } from '@/lib/composer-viewport-classes';

export default function NewPriceListLoading() {
  return (
    <div
      className={`mx-auto flex w-full max-w-[1920px] flex-col px-8 py-6 ${composerPageMinHeightClass}`}
      role="status"
      aria-label="Loading new price list composer"
    >
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-[22px] border border-cream-200 bg-white">
        <div className="h-16 shrink-0 animate-pulse border-b border-cream-200 bg-cream-100" />
        <div className="shrink-0 space-y-5 border-b border-cream-200 px-6 py-5">
          <div className="h-10 w-64 animate-pulse rounded bg-cream-200" />
          <div className="h-4 w-[42rem] animate-pulse rounded bg-cream-200" />
          <div className="grid gap-3 lg:grid-cols-4">
            {Array.from({ length: 4 }).map((_, index) => (
              <div key={index} className="h-[108px] animate-pulse rounded-[16px] border border-cream-200 bg-cream-100" />
            ))}
          </div>
        </div>
        <div className={composerThreePanelGridClass}>
          <div className="animate-pulse border-r border-cream-200 bg-cream-100" />
          <div className="animate-pulse bg-white" />
          <div className="animate-pulse border-l border-cream-200 bg-cream-100" />
        </div>
        <div className="h-20 shrink-0 animate-pulse border-t border-cream-200 bg-cream-50" />
      </div>
    </div>
  );
}
