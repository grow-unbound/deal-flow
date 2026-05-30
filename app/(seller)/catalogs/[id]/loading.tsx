import { PageWrap } from '@/components/seller/layout';

export default function CatalogDetailLoading() {
  return (
    <PageWrap className="pt-7" role="status" aria-label="Loading catalog detail page">
      <div className="space-y-6">
        <div className="h-6 w-56 animate-pulse rounded bg-cream-100" />
        <div className="h-20 animate-pulse rounded-[14px] bg-cream-100" />
        <div className="grid grid-cols-4 gap-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-28 animate-pulse rounded-[14px] border border-cream-200 bg-cream-100" />
          ))}
        </div>
        <div className="flex gap-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-10 w-28 animate-pulse rounded-[10px] bg-cream-100" />
          ))}
        </div>
        <div className="h-[30rem] animate-pulse rounded-[14px] border border-cream-200 bg-cream-100" />
      </div>
    </PageWrap>
  );
}
