import { Suspense, type ReactNode } from 'react';
import { fetchSellerPageBootstrap } from '@/lib/server/seller-page-bootstrap';

interface SellerBootstrapContentProps<T> {
  path: string;
  render: (data: T | null, status: number | null) => ReactNode;
}

async function SellerBootstrapContent<T>({ path, render }: SellerBootstrapContentProps<T>) {
  const { data, status } = await fetchSellerPageBootstrap<T>(path);
  return <>{render(data, status)}</>;
}

interface SellerBootstrapBoundaryProps<T> {
  path: string;
  fallback: ReactNode;
  render: (data: T | null, status: number | null) => ReactNode;
}

/**
 * Streams a seller landing page's bootstrap fetch behind its own <Suspense>
 * boundary, so the page's static shell (header, banners) renders immediately
 * instead of waiting on fetchSellerPageBootstrap's self-HTTP round trip.
 */
export function SellerBootstrapBoundary<T>({ path, fallback, render }: SellerBootstrapBoundaryProps<T>) {
  return (
    <Suspense fallback={fallback}>
      <SellerBootstrapContent<T> path={path} render={render} />
    </Suspense>
  );
}
