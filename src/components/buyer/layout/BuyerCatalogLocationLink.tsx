'use client';

import * as React from 'react';
import Link from 'next/link';
import { MapPin } from 'lucide-react';
import { usePathname, useSearchParams } from 'next/navigation';
import { formatBuyerCompactLocationLabel } from '@/lib/buyer-delivery-location';
import { buildBuyerLocationHref } from '@/lib/buyer-routes';
import { useBuyerDeliveryOptional } from '@/contexts/BuyerDeliveryContext';
import { markBuyerNavigationForward } from '@/hooks/useBuyerNavigationDirection';
import { cn } from '@/lib/utils';

interface BuyerCatalogLocationLinkProps {
  className?: string;
}

export function BuyerCatalogLocationLink({ className }: BuyerCatalogLocationLinkProps): React.ReactNode {
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
        'inline-flex max-w-full items-center justify-end gap-1.5 text-[var(--fg-2)] transition-colors hover:text-[var(--fg-1)]',
        className,
      )}
      aria-label={`Selected location: ${formatBuyerCompactLocationLabel(selected)}`}
    >
      <span
        className="truncate font-medium text-[var(--fg-1)]"
        style={{ fontSize: 'var(--b-text-body)' }}
      >
        {formatBuyerCompactLocationLabel(selected)}
      </span>
      <MapPin className="h-4 w-4 shrink-0 text-[var(--teal-500)]" aria-hidden />
    </Link>
  );
}
