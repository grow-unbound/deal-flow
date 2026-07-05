export default function Loading() {
  return <div className="min-h-screen bg-cream-50 p-4"><div className="h-56 animate-pulse rounded-lg border border-cream-200 bg-cream-100" /><div className="mt-4 grid grid-cols-2 gap-3">{Array.from({ length: 6 }).map((_, i) => <div key={i} className="h-40 animate-pulse rounded-lg border border-cream-200 bg-cream-100" />)}</div></div>;
}
