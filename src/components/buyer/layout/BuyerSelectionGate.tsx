'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { useBuyerDelivery } from '@/contexts/BuyerDeliveryContext';
import { buildBuyerLocationHref } from '@/lib/buyer-routes';

interface BuyerSelectionGateProps {
  returnTo: string;
  /** Guests have no outlet list to pick from (outlets are resolved off the
   *  authenticated buyer's account) — the intercept would strand them on an
   *  empty "no outlets available" screen. Pass false to skip it and render
   *  the catalog directly. Defaults to true (authenticated buyer flow). */
  required?: boolean;
  children: React.ReactNode;
}

export function BuyerSelectionGate({ returnTo, required = true, children }: BuyerSelectionGateProps): React.ReactNode {
  const router = useRouter();
  const delivery = useBuyerDelivery();
  const redirectedRef = React.useRef(false);

  React.useEffect(() => {
    if (!required || !delivery.hydrated || delivery.selected || redirectedRef.current) return;
    redirectedRef.current = true;
    router.replace(buildBuyerLocationHref(returnTo));
  }, [required, delivery.hydrated, delivery.selected, returnTo, router]);

  if (!required) return <>{children}</>;
  if (!delivery.hydrated) return null;
  if (!delivery.selected) return null;
  return <>{children}</>;
}
