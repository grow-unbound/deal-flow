import { PageWrap } from '@/components/seller/layout';

export default function TeamLoading() {
  return (
    <PageWrap className="space-y-6">
      <div className="space-y-6" role="status" aria-label="Loading team page">
        <div className="space-y-2">
          <div className="h-4 w-24 animate-pulse rounded bg-cream-200" />
          <div className="h-8 w-64 animate-pulse rounded bg-cream-200" />
          <div className="h-4 w-[32rem] max-w-full animate-pulse rounded bg-cream-200" />
        </div>

        <div className="max-w-5xl rounded-xl border border-cream-200 bg-cream-50 p-5">
          <div className="mb-4 flex gap-3">
            <div className="h-9 w-48 animate-pulse rounded bg-cream-200" />
            <div className="h-9 w-28 animate-pulse rounded bg-cream-200" />
          </div>
          <div className="space-y-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-12 animate-pulse rounded bg-cream-200" />
            ))}
          </div>
        </div>
      </div>
    </PageWrap>
  );
}
