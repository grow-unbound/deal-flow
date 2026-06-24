import { PageWrap } from '@/components/seller/layout';
import { Skeleton } from '@/components/ui/skeleton';

export default function LocationDetailLoading() {
  return (
    <PageWrap className="pt-7">
      <div className="space-y-6">
        <Skeleton className="h-4 w-40" />
        <div className="flex items-center gap-3">
          <Skeleton className="h-12 w-12 rounded-[14px]" />
          <div className="space-y-2">
            <Skeleton className="h-6 w-48" />
            <Skeleton className="h-4 w-64" />
          </div>
        </div>
        <div className="grid grid-cols-4 gap-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-[112px] rounded-[14px]" />
          ))}
        </div>
        <Skeleton className="h-10 rounded-[10px]" />
        <div className="grid grid-cols-2 gap-6">
          <Skeleton className="h-64 rounded-[14px]" />
          <Skeleton className="h-64 rounded-[14px]" />
        </div>
      </div>
    </PageWrap>
  );
}
