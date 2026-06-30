'use client';

import * as React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ChevronDown, MapPin } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useBuyerDeliveryOptional } from '@/contexts/BuyerDeliveryContext';
import { formatBuyerSelectedLocationLabel } from '@/lib/buyer-delivery-location';
import { buildBuyerLocationHref } from '@/lib/buyer-routes';
import { markBuyerNavigationForward } from '@/hooks/useBuyerNavigationDirection';

interface BuyerLocationRowProps {
  className?: string;
}

export function BuyerLocationRow({ className }: BuyerLocationRowProps) {
  const pathname = usePathname();
  const delivery = useBuyerDeliveryOptional();
  const display = formatBuyerSelectedLocationLabel(delivery?.selected, 'Select delivery location');
  const locationHref = React.useMemo(() => buildBuyerLocationHref(pathname || '/buy/catalog'), [pathname]);

  return (
    <Link
      href={locationHref}
      onClick={() => markBuyerNavigationForward()}
      className={cn(
        'flex min-h-[44px] items-center gap-2 px-4 py-2.5 text-left',
        'border-b border-[var(--border-1)] bg-[var(--bg-base)]',
        'active:bg-[var(--bg-recessed)] transition-colors',
        className,
      )}
    >
      <MapPin className="h-4 w-4 shrink-0 text-[var(--teal-500)]" aria-hidden />
      <span className="min-w-0 flex-1 truncate text-sm font-medium text-[var(--fg-1)]">{display}</span>
      <ChevronDown className="h-4 w-4 shrink-0 text-[var(--fg-3)]" aria-hidden />
    </Link>
  );
}
