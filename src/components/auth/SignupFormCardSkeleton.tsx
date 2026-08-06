/** Layout-faithful skeleton for SignupFormCard — keep in sync with SignupFormCard.tsx */
export function SignupFormCardSkeleton() {
  return (
    <div className="rounded-lg border border-cream-300 bg-cream-50 p-8 shadow-md">
      <div className="mb-7 flex justify-center">
        <div className="h-14 w-[76px] animate-pulse rounded-xl bg-cream-200" />
      </div>

      <div className="mb-1 h-8 w-64 max-w-full animate-pulse rounded bg-cream-200" />
      <div className="mb-2 h-4 w-full max-w-sm animate-pulse rounded bg-cream-200" />
      <div className="mb-6 h-4 w-3/4 animate-pulse rounded bg-cream-200" />

      <div className="space-y-4">
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className="space-y-1.5">
            <div className="h-3 w-24 animate-pulse rounded bg-cream-200" />
            <div className="h-10 w-full animate-pulse rounded-md border border-cream-200 bg-cream-100" />
          </div>
        ))}
        <div className="h-10 w-full animate-pulse rounded-md border border-cream-200 bg-cream-100" />
      </div>

      <div className="mx-auto mt-5 h-4 w-48 animate-pulse rounded bg-cream-200" />
    </div>
  );
}
