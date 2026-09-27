'use client';

import { ReactNode, Suspense, useState } from 'react';
import { CatalogAuthChrome } from '@/components/buyer/auth/CatalogAuthPageChrome';
import { parseRequestHost } from '@/lib/storefront-host';

function detectCatalogHost(): boolean {
  if (typeof window === 'undefined') return false;
  const hostKind = parseRequestHost(window.location.hostname);
  return hostKind.kind === 'reserved' && hostKind.label === 'catalog';
}

function CatalogVerifyChromeInner({ children }: { children: ReactNode }) {
  const [isCatalogHost] = useState(detectCatalogHost);

  if (!isCatalogHost) {
    return <>{children}</>;
  }

  return <CatalogAuthChrome>{children}</CatalogAuthChrome>;
}

export function CatalogVerifyChrome({ children }: { children: ReactNode }) {
  return (
    <Suspense fallback={<>{children}</>}>
      <CatalogVerifyChromeInner>{children}</CatalogVerifyChromeInner>
    </Suspense>
  );
}
