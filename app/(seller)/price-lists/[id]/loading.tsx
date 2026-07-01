import { composerPageMinHeightClass, composerThreePanelGridClass } from '@/lib/composer-viewport-classes';

export default function PriceListDetailLoading() {
  return (
    <div
      className={`mx-auto flex w-full max-w-[1920px] flex-col px-8 pt-7 pb-6 ${composerPageMinHeightClass}`}
      role="status"
      aria-label="Loading price list detail"
    >
      <div className="flex min-h-0 flex-1 flex-col gap-4">
        <div className="h-4 w-52 animate-pulse rounded bg-cream-200" />
        <div className="flex items-start justify-between gap-8">
          <div className="space-y-3">
            <div className="h-12 w-96 animate-pulse rounded bg-cream-200" />
            <div className="h-4 w-[42rem] animate-pulse rounded bg-cream-200" />
          </div>
          <div className="h-10 w-56 animate-pulse rounded-[8px] bg-cream-200" />
        </div>
        <div className="grid gap-0 overflow-hidden rounded-[14px] border border-cream-300 bg-white lg:grid-cols-5">
          {Array.from({ length: 5 }).map((_, index) => (
            <div key={index} className="h-[82px] animate-pulse border-r border-cream-300 bg-white last:border-r-0" />
          ))}
        </div>
        <div className={composerThreePanelGridClass}>
          <div className="animate-pulse rounded-[14px] border border-cream-300 bg-white" />
          <div className="animate-pulse rounded-[14px] border border-cream-300 bg-white" />
          <div className="animate-pulse rounded-[14px] border border-cream-300 bg-white" />
        </div>
      </div>
      <div className="sticky bottom-0 z-10 mt-4 h-20 shrink-0 animate-pulse rounded-[14px] border border-cream-300 bg-white" />
    </div>
  );
}
