export default function EstimatePlacedLoading() {
  return (
    <div className="flex min-h-screen flex-col bg-[var(--bg-base)]">
      <header
        className="sticky top-0 z-20 flex items-center gap-3 px-4"
        style={{
          height: 'var(--header-h, 56px)',
          background: 'rgba(253, 251, 247, 0.92)',
          backdropFilter: 'blur(12px)',
          WebkitBackdropFilter: 'blur(12px)',
          borderBottom: '1px solid var(--border-1)',
        }}
      >
        <div className="h-8 w-8 animate-pulse rounded-full bg-cream-200" />
        <div className="h-4 w-36 animate-pulse rounded bg-cream-200" />
      </header>

      <main className="flex flex-1 flex-col px-4 py-6">
        <div className="mx-auto flex w-full max-w-[520px] flex-1 flex-col items-center justify-center text-center">
          <div className="mb-6 h-20 w-20 animate-pulse rounded-full border border-cream-200 bg-cream-100" />
          <div className="h-8 w-72 animate-pulse rounded bg-cream-200" />
          <div className="mt-3 h-4 w-full max-w-md animate-pulse rounded bg-cream-100" />

          <div className="mt-8 w-full rounded-[12px] border border-cream-200 bg-white text-left">
            <div className="border-b border-cream-200 px-4 py-3">
              <div className="h-3 w-32 animate-pulse rounded bg-cream-200" />
            </div>
            <div className="space-y-3 px-4 py-4">
              <Row />
              <Row />
              <Row />
              <div className="h-4 w-36 animate-pulse rounded bg-cream-100" />
            </div>
          </div>

          <div className="mt-6 grid w-full gap-3 sm:grid-cols-2">
            <div className="h-12 animate-pulse rounded-xl bg-cream-200" />
            <div className="h-12 animate-pulse rounded-xl bg-cream-200" />
          </div>
        </div>
      </main>
    </div>
  );
}

function Row() {
  return (
    <div className="flex items-center justify-between gap-4">
      <div className="h-4 w-24 animate-pulse rounded bg-cream-100" />
      <div className="h-4 w-32 animate-pulse rounded bg-cream-100" />
    </div>
  );
}
