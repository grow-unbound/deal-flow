'use client';

import * as React from 'react';
import { Search } from 'lucide-react';
import { usePostHog } from 'posthog-js/react';
import { cn } from '@/lib/utils';
import { openBuyerSearch } from '@/components/buyer/layout/BuyerSearchOverlay';

interface BuyerSearchTriggerProps {
  placeholder?: string;
  className?: string;
}

export function BuyerSearchTrigger({
  placeholder = 'Search products, SKU, brand…',
  className,
}: BuyerSearchTriggerProps): React.ReactNode {
  const posthog = usePostHog();

  return (
    <button
      type="button"
      onClick={() => {
        posthog?.capture('buyer_search_opened', {
          source_surface: 'search_trigger',
        });
        openBuyerSearch();
      }}
      className={cn(
        'relative flex w-full items-center rounded-[12px] border border-[var(--cream-400)] bg-white py-2.5 pl-9 pr-3 text-left',
        'text-[var(--fg-3)] transition-colors hover:border-[var(--teal-500)]',
        className,
      )}
      style={{ fontSize: 'var(--b-text-body)' }}
      aria-label="Open catalog search"
    >
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--fg-3)]" aria-hidden />
      <span className="truncate">{placeholder}</span>
    </button>
  );
}
