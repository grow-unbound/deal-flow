import { PageWrap } from '@/components/seller/layout';
import { Skeleton } from '@/components/ui/skeleton';

export default function CategoryDetailLoading() {
  return (
    <PageWrap className="pt-7">
      <div className="space-y-6">
        <Skeleton className="h-4 w-52" />
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Skeleton className="h-12 w-12 rounded-[14px]" />
            <div className="space-y-2">
              <Skeleton className="h-7 w-56" />
              <Skeleton className="h-4 w-80" />
            </div>
          </div>
        </div>
        <div className="border-b border-cream-300" />
        <div className="grid grid-cols-4 gap-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-28 rounded-[14px]" />
          ))}
        </div>
        <div className="flex items-center gap-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-9 w-24 rounded-full" />
          ))}
        </div>
        <Skeleton className="h-[24rem] rounded-[14px]" />
      </div>
    </PageWrap>
  );
}
