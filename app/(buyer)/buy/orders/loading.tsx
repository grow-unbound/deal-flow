// Mirrors buyer orders page: sticky header + segmented tabs + search + filter chips + transaction cards
export default function OrdersLoading() {
  return (
    <div className="flex flex-col" role="status" aria-label="Loading orders">
      <div className="px-5 pb-2 pt-4">
        <div className="h-3 w-20 animate-pulse rounded bg-cream-200" />
        <div className="mt-1.5 h-9 w-40 animate-pulse rounded bg-cream-200" />
      </div>

      <div className="mx-[22px] mt-3.5 flex gap-1 rounded-[10px] bg-cream-100 p-[3px]">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className={`h-8 flex-1 animate-pulse rounded-lg bg-cream-200 ${i === 0 ? 'opacity-100' : 'opacity-70'}`} />
        ))}
      </div>

      <div className="px-4 pt-3">
        <div className="h-11 animate-pulse rounded-[10px] border border-cream-200 bg-cream-100" />
      </div>

      <div className="flex gap-2 overflow-hidden px-4 pt-3 pb-1">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className={`h-8 shrink-0 animate-pulse rounded-full bg-cream-200 ${i === 0 ? 'w-14' : 'w-20'}`} />
        ))}
      </div>

      <div className="space-y-2 px-4 pt-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-[88px] animate-pulse rounded-[12px] border border-cream-200 bg-cream-100" />
        ))}
      </div>
    </div>
  );
}
