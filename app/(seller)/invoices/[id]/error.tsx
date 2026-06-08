'use client';

export default function InvoiceDetailError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="mx-auto max-w-[1440px] px-8 py-10">
      <h2 className="font-display text-lg font-semibold text-cream-950">Something went wrong</h2>
      <p className="mt-2 text-[13px] text-cream-700">{error.message}</p>
      <button type="button" className="cockpit-btn cockpit-btn-primary cockpit-btn-sm mt-4" onClick={() => reset()}>
        Try again
      </button>
    </div>
  );
}
