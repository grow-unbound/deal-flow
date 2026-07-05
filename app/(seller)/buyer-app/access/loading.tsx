export default function Loading() {
  return <div className="mx-auto w-full max-w-[1920px] px-8 py-6"><div className="h-20 animate-pulse rounded-lg border border-cream-200 bg-cream-100" /><div className="mt-4 grid grid-cols-4 gap-3">{Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-24 animate-pulse rounded-lg border border-cream-200 bg-cream-100" />)}</div><div className="mt-4 h-96 animate-pulse rounded-lg border border-cream-200 bg-cream-100" /></div>;
}
