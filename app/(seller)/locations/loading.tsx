import { PageWrap } from '@/components/seller/layout';
import { Skeleton } from '@/components/ui/skeleton';

export default function LocationsLoading() {
  return (
    <PageWrap>
      <div className="space-y-5">
        <Skeleton className="h-7 w-36" />
        <Skeleton className="h-4 w-[32rem]" />
        <div className="grid grid-cols-4 gap-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-[112px] rounded-[14px]" />
          ))}
        </div>
        <div className="grid grid-cols-3 gap-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-52 rounded-[14px]" />
          ))}
        </div>
        <Skeleton className="h-14 rounded-[14px]" />
        <Skeleton className="h-[320px] rounded-[14px]" />
      </div>
    </PageWrap>
  );
}
