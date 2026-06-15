'use client';

import Link from 'next/link';
import { ErrorState } from '@/components/ui/empty-state';
import { Button } from '@/components/ui/button';

export default function ShopSegmentError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="p-4">
      <ErrorState
        heading="Something went wrong"
        description={error.message || "We couldn't load this screen. Please try again."}
        onRetry={reset}
      />
      <div className="mt-4 flex justify-center">
        <Button variant="ghost" size="sm" asChild>
          <Link href="/buy">Back to home</Link>
        </Button>
      </div>
    </div>
  );
}
