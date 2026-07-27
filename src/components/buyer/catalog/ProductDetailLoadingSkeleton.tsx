import { BUYER_PREVIEW_MAX_WIDTH } from '@/lib/buyer-preview';
import { BuyerFixedFooter } from '@/components/buyer/layout/BuyerFixedFooter';

export function ProductDetailLoadingSkeleton() {
  return (
    <div className="flex min-h-dvh flex-col bg-cream-100 pb-28" role="status" aria-label="Loading product">
      <div className="sticky top-0 z-[15] min-h-14 border-b border-cream-200 bg-cream-100/95 px-3 py-2 backdrop-blur-sm">
        <div className="flex min-h-10 items-center gap-2">
          <div className="h-10 w-10 animate-pulse bg-cream-200" />
          <div className="h-5 w-20 animate-pulse rounded bg-cream-200" />
          <div className="ml-auto h-10 w-10 shrink-0 animate-pulse rounded-lg border border-cream-200 bg-cream-100" />
        </div>
      </div>
      <div className="pt-3">
        <div className="relative -mx-0 w-full bg-cream-100" style={{ paddingTop: '69%' }}>
          <div className="absolute inset-0 animate-pulse border-b border-cream-200 bg-cream-100" />
        </div>
        <div className="space-y-2 px-4 py-4">
          <div className="h-3 w-16 animate-pulse rounded bg-cream-200" />
          <div className="h-6 max-w-xs animate-pulse rounded bg-cream-200" />
          <div className="h-4 w-40 animate-pulse rounded bg-cream-200" />
          <div className="h-7 w-24 animate-pulse rounded bg-cream-200" />
        </div>
        <div className="px-4 pb-4">
          <div className="mb-2 h-5 w-32 animate-pulse rounded bg-cream-200" />
          <div className="h-40 animate-pulse rounded-[12px] border border-cream-200 bg-cream-100" />
        </div>
        {['Frequently Bought Together', 'More in category', 'Other similar'].map((key) => (
          <div key={key} className="px-4 pb-4">
            <div className="mb-3 h-5 w-48 animate-pulse rounded bg-cream-200" />
            <div className="flex gap-3 overflow-hidden">
              {Array.from({ length: 3 }).map((_, i) => (
                <div
                  key={`${key}-${i}`}
                  className="h-44 w-40 shrink-0 animate-pulse rounded-[12px] border border-cream-200 bg-cream-100"
                />
              ))}
            </div>
          </div>
        ))}
      </div>
      <BuyerFixedFooter
        className="left-1/2 w-full -translate-x-1/2 border-t border-cream-200 bg-cream-100/95 px-4 py-3"
        style={{ maxWidth: BUYER_PREVIEW_MAX_WIDTH }}
      >
        <div className="flex items-center justify-between">
          <div className="h-7 w-20 animate-pulse rounded bg-cream-200" />
          <div className="h-11 w-28 animate-pulse rounded-xl bg-cream-200" />
        </div>
      </BuyerFixedFooter>
    </div>
  );
}
