// Mirrors buyer orders page: header + sub-tabs + status filter chips + order cards
export default function OrdersLoading() {
  return (
    <div className="flex flex-col" role="status" aria-label="Loading orders">
      {/* Page header */}
      <div className="flex items-center justify-between px-[18px] pt-4 pb-0">
        <div className="h-7 w-28 animate-pulse rounded-md bg-cream-200" />
        <div className="h-9 w-9 animate-pulse rounded-[8px] bg-cream-200" />
      </div>

      {/* Sub-tabs (Orders / Enquiries / Invoices) */}
      <div className="flex border-b border-cream-200 mt-[14px] px-4 gap-5">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className={`h-8 animate-pulse rounded-t-md bg-cream-200 ${i === 0 ? 'w-16' : 'w-20'}`} />
        ))}
      </div>

      {/* Status filter chips */}
      <div className="flex gap-2 px-4 pt-3 pb-1 overflow-hidden">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className={`h-7 shrink-0 animate-pulse rounded-full bg-cream-200 ${i === 0 ? 'w-14' : 'w-20'}`} />
        ))}
      </div>

      {/* Order cards */}
      <div className="px-4 pt-3 space-y-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-[88px] animate-pulse rounded-[12px] border border-cream-200 bg-cream-100" />
        ))}
      </div>
    </div>
  );
}
