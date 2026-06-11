'use client';

import type { ReactNode } from 'react';

import { EmptyState } from '@/components/ui/empty-state';

interface BuyerEmptyStateProps {
  icon: ReactNode;
  heading: string;
  description: string;
  action?: ReactNode;
}

/** Buyer shell: same `EmptyState` as seller landings, with mobile-friendly outer padding. */
export function BuyerEmptyState({ icon, heading, description, action }: BuyerEmptyStateProps) {
  return (
    <div className="px-4 py-6">
      <EmptyState icon={icon} heading={heading} description={description} action={action} />
    </div>
  );
}
