export default function OrderPlacedLoading() {
  return (
    <div className="flex flex-col items-center px-6 pt-12 gap-4 text-center">
      <div className="w-14 h-14 rounded-full animate-pulse" style={{ background: 'var(--cream-100)' }} />
      <div className="h-6 w-40 rounded animate-pulse" style={{ background: 'var(--cream-200)' }} />
      <div className="h-4 w-60 rounded animate-pulse" style={{ background: 'var(--cream-100)' }} />
      <div className="mt-6 w-full rounded-2xl overflow-hidden" style={{ border: '1px solid var(--border-1)' }}>
        <div className="h-10 animate-pulse" style={{ background: 'var(--cream-100)' }} />
        <div className="px-4 py-4 space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="flex justify-between">
              <div className="h-4 w-20 rounded animate-pulse" style={{ background: 'var(--cream-100)' }} />
              <div className="h-4 w-28 rounded animate-pulse" style={{ background: 'var(--cream-100)' }} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
