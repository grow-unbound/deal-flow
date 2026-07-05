export default function Loading() {
  return <div className="mx-auto w-full max-w-[1920px] px-8 py-6"><div className="h-20 animate-pulse rounded-lg border border-cream-200 bg-cream-100" /><div className="mt-4 grid grid-cols-3 gap-3">{Array.from({ length: 6 }).map((_, i) => <div key={i} className="h-40 animate-pulse rounded-lg border border-cream-200 bg-cream-100" />)}</div></div>;
}
