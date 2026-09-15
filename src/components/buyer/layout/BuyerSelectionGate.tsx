'use client';

import * as React from 'react';
import { useBuyerDelivery } from '@/contexts/BuyerDeliveryContext';
import { BuyerLocationDialog } from '@/components/buyer/layout/BuyerLocationDialog';

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
  const delivery = useBuyerDelivery();
  const [dialogOpen, setDialogOpen] = React.useState(false);
  const openedRef = React.useRef(false);

  React.useEffect(() => {
    if (!required || !delivery.hydrated || delivery.selected || openedRef.current) return;
    openedRef.current = true;
    setDialogOpen(true);
  }, [required, delivery.hydrated, delivery.selected]);

  if (!required) return <>{children}</>;
  if (!delivery.hydrated) return null;

  return (
    <>
      <BuyerLocationDialog open={dialogOpen} onOpenChange={setDialogOpen} returnTo={returnTo} />
      {delivery.selected ? <>{children}</> : null}
    </>
  );
}
