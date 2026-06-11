'use client';

import { RouteErrorFallback } from '@/components/seller/layout/RouteErrorFallback';

export default function InvoiceDetailError(props: { error: Error & { digest?: string }; reset: () => void }) {
  return <RouteErrorFallback {...props} />;
}
