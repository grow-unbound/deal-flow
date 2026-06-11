import { composerPageMinHeightClass, composerThreePanelGridClass } from '@/lib/composer-viewport-classes';

export default function NewCohortLoading() {
  return (
    <div
      className={`mx-auto flex w-full max-w-[1920px] flex-col px-8 pt-7 pb-6 ${composerPageMinHeightClass}`}
      role="status"
      aria-label="Loading new cohort composer"
    >
      <div className="flex min-h-0 flex-1 flex-col gap-4">
        <div className="h-4 w-44 animate-pulse rounded bg-cream-200" />
        <div className="flex items-start justify-between gap-8">
          <div className="space-y-3">
            <div className="h-12 w-80 animate-pulse rounded bg-cream-200" />
            <div className="h-4 w-[38rem] animate-pulse rounded bg-cream-200" />
          </div>
          <div className="h-9 w-24 animate-pulse rounded-[9px] bg-cream-200" />
        </div>
        <div className="grid gap-0 overflow-hidden rounded-[14px] border border-cream-200 bg-cream-100 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, index) => (
            <div key={index} className="h-[82px] animate-pulse border-r border-cream-200 bg-cream-100 last:border-r-0" />
          ))}
        </div>
        <div className={composerThreePanelGridClass}>
          <div className="animate-pulse rounded-[14px] border border-cream-200 bg-cream-100" />
          <div className="animate-pulse rounded-[14px] border border-cream-200 bg-cream-100" />
          <div className="animate-pulse rounded-[14px] border border-cream-200 bg-cream-100" />
        </div>
      </div>
      <div className="sticky bottom-0 z-10 mt-4 h-20 shrink-0 animate-pulse rounded-[14px] border border-cream-200 bg-cream-100" />
    </div>
  );
}
