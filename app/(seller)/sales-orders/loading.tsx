// Mirrors SalesOrdersLoadingSkeleton in src/components/seller/sales-orders/SalesOrdersLandingClient.tsx
export default function SalesOrdersLoading() {
  return (
    <div
      className="max-w-[1920px] mx-auto w-full px-8 py-6"
      role="status"
      aria-label="Loading sales orders"
    >
      <div className="h-24 animate-pulse rounded-[12px] bg-cream-100 border border-cream-200" />
      <div className="mt-5 grid grid-cols-4 gap-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-[108px] animate-pulse rounded-[12px] border border-cream-200 bg-cream-100" />
        ))}
      </div>
      <div className="mt-5 grid grid-cols-3 gap-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="h-[190px] animate-pulse rounded-[14px] border border-cream-200 bg-cream-100" />
        ))}
      </div>
      <div className="mt-5 h-[46px] animate-pulse rounded-[12px] border border-cream-200 bg-cream-100" />
      <div className="overflow-hidden rounded-b-[14px] border border-cream-300 border-t-0 bg-white">
        <div className="h-[420px] animate-pulse bg-cream-50" />
      </div>
    </div>
  );
}
