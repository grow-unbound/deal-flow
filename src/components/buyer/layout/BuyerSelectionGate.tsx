'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { useBuyerDelivery } from '@/contexts/BuyerDeliveryContext';
import { buildBuyerLocationHref } from '@/lib/buyer-routes';

interface BuyerSelectionGateProps {
  returnTo: string;
  children: React.ReactNode;
}

export function BuyerSelectionGate({ returnTo, children }: BuyerSelectionGateProps): React.ReactNode {
  const router = useRouter();
  const delivery = useBuyerDelivery();
  const redirectedRef = React.useRef(false);

  React.useEffect(() => {
    if (!delivery.hydrated || delivery.selected || redirectedRef.current) return;
    redirectedRef.current = true;
    router.replace(buildBuyerLocationHref(returnTo));
  }, [delivery.hydrated, delivery.selected, returnTo, router]);

  if (!delivery.hydrated) return null;
  if (!delivery.selected) return null;
  return <>{children}</>;
}
