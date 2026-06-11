'use client';

import { ErrorState } from '@/components/ui/empty-state';

interface RouteErrorFallbackProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export function RouteErrorFallback({ error, reset }: RouteErrorFallbackProps) {
  return (
    <div className="mx-auto w-full max-w-[1920px] px-8 py-10">
      <ErrorState
        heading="Something went wrong"
        description={error.message || "We couldn't load this page. Please try again."}
        onRetry={reset}
      />
    </div>
  );
}
