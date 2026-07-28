'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Search } from 'lucide-react';
import { usePostHog } from 'posthog-js/react';
import { cn } from '@/lib/utils';
import { markBuyerNavigationForward } from '@/hooks/useBuyerNavigationDirection';

export interface BuyerSearchIconButtonProps {
  href?: string;
  className?: string;
}

export function BuyerSearchIconButton({
  href = '/buy/search',
  className,
}: BuyerSearchIconButtonProps): React.ReactNode {
  const router = useRouter();
  const posthog = usePostHog();

  function handleClick(): void {
    posthog?.capture('buyer_search_opened', {
      source_surface: 'search_icon_button',
      destination: href,
    });
    markBuyerNavigationForward();
    router.push(href);
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      className={cn(
        'flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-[var(--border-1)] bg-[var(--cream-200)] text-[var(--cream-700)]',
        className,
      )}
      aria-label="Search"
    >
      <Search className="h-[17px] w-[17px]" strokeWidth={1.75} />
    </button>
  );
}
