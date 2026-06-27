'use client';

import * as React from 'react';
import Link from 'next/link';
import { MapPin } from 'lucide-react';
import { usePathname, useSearchParams } from 'next/navigation';
import { formatBuyerSelectedLocationLabel } from '@/lib/buyer-delivery-location';
import { buildBuyerLocationHref } from '@/lib/buyer-routes';
import { useBuyerDeliveryOptional } from '@/contexts/BuyerDeliveryContext';
import { markBuyerNavigationForward } from '@/hooks/useBuyerNavigationDirection';
import { cn } from '@/lib/utils';

interface BuyerLocationControlProps {
  className?: string;
}

export function BuyerLocationControl({ className }: BuyerLocationControlProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const delivery = useBuyerDeliveryOptional();
  const selected = delivery?.selected ?? null;
  const query = searchParams?.toString();
  const returnTo = React.useMemo(() => {
    const base = pathname || '/buy/catalog';
    return query ? `${base}?${query}` : base;
  }, [pathname, query]);

  return (
    <Link
      href={buildBuyerLocationHref(returnTo)}
      onClick={() => markBuyerNavigationForward()}
      className={cn(
        'inline-flex max-w-[11rem] items-center gap-1.5 rounded-full border border-[var(--border-1)] bg-[var(--bg-surface)] px-2.5 py-2 text-[var(--fg-2)] transition-colors hover:bg-[var(--bg-recessed)]',
        className,
      )}
      aria-label={`Selected location: ${formatBuyerSelectedLocationLabel(selected)}`}
    >
      <MapPin className="h-3.5 w-3.5 shrink-0 text-[var(--teal-500)]" aria-hidden />
      <span className="truncate text-sm font-medium text-[var(--fg-1)]">
        {formatBuyerSelectedLocationLabel(selected)}
      </span>
    </Link>
  );
}
