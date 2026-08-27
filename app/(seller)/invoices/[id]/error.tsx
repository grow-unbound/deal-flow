'use client';

import * as Sentry from '@sentry/nextjs';
import { useEffect } from 'react';
import { RouteErrorFallback } from '@/components/seller/layout/RouteErrorFallback';

export default function InvoiceDetailError(props: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    Sentry.captureException(props.error);
  }, [props.error]);

  return <RouteErrorFallback {...props} />;
}
